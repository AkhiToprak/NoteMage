import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { downloadFromStorage, validateStoragePath } from '@/lib/storage';
import { BUCKET_PUBLIC } from '@/lib/supabase';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

const MAX_CONTENT_LENGTH = 2000;
const MAX_IMAGES = 4;
const MAX_POLL_OPTIONS = 4;
const MIN_POLL_OPTIONS = 2;

const VALID_VISIBILITIES = ['public', 'friends', 'specific'] as const;

const MAGIC_BYTES: { ext: string; bytes: number[] }[] = [
  { ext: 'png', bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: 'jpg', bytes: [0xff, 0xd8, 0xff] },
  { ext: 'webp', bytes: [0x52, 0x49, 0x46, 0x46] },
];

function detectImageType(buffer: Buffer): string | null {
  for (const { ext, bytes } of MAGIC_BYTES) {
    if (bytes.every((b, i) => buffer[i] === b)) return ext;
  }
  return null;
}

// POST — create a new post (JSON body with pre-uploaded image paths)
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { content, visibility: rawVisibility, imagePaths, poll, notebookRef, specificFriendIds } = body;

    // Validate content
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return badRequestResponse('Content is required');
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return badRequestResponse(`Content must be ${MAX_CONTENT_LENGTH} characters or less`);
    }

    const visibility = rawVisibility || 'public';
    if (!VALID_VISIBILITIES.includes(visibility as (typeof VALID_VISIBILITIES)[number])) {
      return badRequestResponse('visibility must be "public", "friends", or "specific"');
    }

    // Validate notebookRef if provided — must be user's own notebook
    if (notebookRef) {
      const notebook = await db.notebook.findUnique({
        where: { id: notebookRef },
        select: { userId: true },
      });
      if (!notebook || notebook.userId !== userId) {
        return badRequestResponse('Invalid notebook reference');
      }
    }

    // Parse poll data if provided (already a parsed object from JSON body)
    let pollData: { question: string; options: string[] } | null = null;
    if (poll) {
      pollData = poll;
      if (!pollData || !pollData.question || typeof pollData.question !== 'string' || pollData.question.trim().length === 0) {
        return badRequestResponse('Poll question is required');
      }
      if (pollData.question.length > 200) {
        return badRequestResponse('Poll question must be 200 characters or less');
      }
      if (!Array.isArray(pollData.options) || pollData.options.length < MIN_POLL_OPTIONS || pollData.options.length > MAX_POLL_OPTIONS) {
        return badRequestResponse(`Poll must have ${MIN_POLL_OPTIONS}-${MAX_POLL_OPTIONS} options`);
      }
      for (const opt of pollData.options) {
        if (typeof opt !== 'string' || opt.trim().length === 0) {
          return badRequestResponse('All poll options must be non-empty strings');
        }
        if (opt.length > 100) {
          return badRequestResponse('Poll options must be 100 characters or less');
        }
      }
    }

    // Parse specific visibility user IDs
    let visibleToIds: string[] = [];
    if (visibility === 'specific') {
      visibleToIds = specificFriendIds;
      if (!Array.isArray(visibleToIds) || visibleToIds.length === 0) {
        return badRequestResponse('specificFriendIds is required for specific visibility');
      }
      if (visibleToIds.length > 50) {
        return badRequestResponse('Cannot share with more than 50 users');
      }
      // Validate all IDs are non-empty strings
      if (visibleToIds.some((id: string) => typeof id !== 'string' || id.length === 0)) {
        return badRequestResponse('All specificFriendIds must be non-empty strings');
      }
      // Deduplicate and remove self
      visibleToIds = [...new Set(visibleToIds)].filter((id) => id !== userId);
      if (visibleToIds.length === 0) {
        return badRequestResponse('specificFriendIds must contain at least one other user');
      }
      // Verify all users exist
      const validUsers = await db.user.findMany({
        where: { id: { in: visibleToIds } },
        select: { id: true },
      });
      if (validUsers.length !== visibleToIds.length) {
        return badRequestResponse('One or more user IDs are invalid');
      }
      // Verify all visibleTo users are friends
      const friendships = await db.friendship.findMany({
        where: {
          status: 'accepted',
          OR: [
            { requesterId: userId, addresseeId: { in: visibleToIds } },
            { requesterId: { in: visibleToIds }, addresseeId: userId },
          ],
        },
      });
      const friendIds = new Set(
        friendships.map((f) => f.requesterId === userId ? f.addresseeId : f.requesterId)
      );
      const nonFriends = visibleToIds.filter((id) => !friendIds.has(id));
      if (nonFriends.length > 0) {
        return badRequestResponse('You can only make posts visible to your friends');
      }
    }

    // Validate image paths
    const paths: string[] = Array.isArray(imagePaths) ? imagePaths : [];
    if (paths.length > MAX_IMAGES) {
      return badRequestResponse(`Maximum ${MAX_IMAGES} images allowed`);
    }

    // Validate and verify uploaded images
    const savedImages: { url: string; sortOrder: number }[] = [];
    for (let i = 0; i < paths.length; i++) {
      const path = paths[i];
      if (!validateStoragePath(path, 'posts/')) {
        return badRequestResponse(`Image ${i + 1} has an invalid storage path`);
      }
      const buffer = await downloadFromStorage(path, BUCKET_PUBLIC);
      if (!buffer) {
        return badRequestResponse(`Image ${i + 1} could not be found in storage`);
      }
      const ext = detectImageType(buffer);
      if (!ext) {
        return badRequestResponse(`Image ${i + 1} is not a valid image (PNG, JPEG, or WebP)`);
      }
      const publicUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/${BUCKET_PUBLIC}/${path}`;
      savedImages.push({ url: publicUrl, sortOrder: i });
    }

    // Create post with all related data in a transaction
    const post = await db.$transaction(async (tx) => {
      const newPost = await tx.post.create({
        data: {
          authorId: userId,
          content: content.trim(),
          visibility,
          notebookRef: notebookRef || null,
        },
      });

      // Create images
      if (savedImages.length > 0) {
        await tx.postImage.createMany({
          data: savedImages.map((img) => ({
            postId: newPost.id,
            url: img.url,
            sortOrder: img.sortOrder,
          })),
        });
      }

      // Create poll
      if (pollData) {
        const poll = await tx.poll.create({
          data: {
            postId: newPost.id,
            question: pollData.question.trim(),
          },
        });
        await tx.pollOption.createMany({
          data: pollData.options.map((opt, idx) => ({
            pollId: poll.id,
            text: opt.trim(),
            sortOrder: idx,
          })),
        });
      }

      // Create visibility records
      if (visibility === 'specific' && visibleToIds.length > 0) {
        await tx.postVisibility.createMany({
          data: visibleToIds.map((uid) => ({
            postId: newPost.id,
            userId: uid,
          })),
        });
      }

      // Return full post with relations
      return tx.post.findUnique({
        where: { id: newPost.id },
        include: {
          author: { select: { id: true, username: true, avatarUrl: true } },
          images: { orderBy: { sortOrder: 'asc' } },
          poll: {
            include: {
              options: {
                orderBy: { sortOrder: 'asc' },
                include: { _count: { select: { votes: true } } },
              },
            },
          },
          _count: { select: { comments: true } },
        },
      });
    });

    if (!post) return internalErrorResponse();

    return createdResponse({
      ...formatPost(post, userId),
    });
  } catch {
    return internalErrorResponse();
  }
}

// GET — get post feed with cursor pagination
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);
    const feed = searchParams.get('feed') || 'foryou';
    const cursor = searchParams.get('cursor') || undefined;
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

    // Build visibility filter based on feed type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let where: any = {};

    if (feed === 'friends') {
      // Only friends' posts
      const friendIds = await getFriendIds(userId);
      where = {
        OR: [
          { authorId: { in: friendIds }, visibility: 'public' },
          { authorId: { in: friendIds }, visibility: 'friends' },
          {
            authorId: { in: friendIds },
            visibility: 'specific',
            visibleTo: { some: { userId } },
          },
          { authorId: userId }, // Always see own posts
        ],
      };
    } else if (feed === 'trending') {
      // Public posts sorted by engagement (likes + comments)
      // For trending, we'll get public posts and sort by like count
      where = {
        OR: [
          { visibility: 'public' },
          { authorId: userId },
        ],
      };
    } else {
      // 'foryou' — public + friends' posts visible to user
      const friendIds = await getFriendIds(userId);
      where = {
        OR: [
          { visibility: 'public' },
          { authorId: { in: friendIds }, visibility: 'friends' },
          { visibility: 'specific', visibleTo: { some: { userId } } },
          { authorId: userId },
        ],
      };
    }

    // Add cursor condition
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (isNaN(cursorDate.getTime())) {
        return badRequestResponse('Invalid cursor format');
      }
      where.createdAt = { lt: cursorDate };
    }

    const posts = await db.post.findMany({
      where,
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        images: { orderBy: { sortOrder: 'asc' } },
        poll: {
          include: {
            options: {
              orderBy: { sortOrder: 'asc' },
              include: { _count: { select: { votes: true } } },
            },
          },
        },
        _count: { select: { comments: true } },
        votes: {
          where: { userId },
          select: { value: true },
          take: 1,
        },
      },
      orderBy: feed === 'trending'
        ? [{ votes: { _count: 'desc' } }, { createdAt: 'desc' }]
        : { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra to determine if there's a next page
    });

    const hasMore = posts.length > limit;
    const sliced = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? sliced[sliced.length - 1].createdAt.toISOString() : null;

    // Fetch vote scores for all posts in batch
    const postIds = sliced.map((p) => p.id);
    const voteScores = postIds.length > 0
      ? await db.postVote.groupBy({
          by: ['postId'],
          where: { postId: { in: postIds } },
          _sum: { value: true },
        })
      : [];
    const voteScoreMap = new Map(
      voteScores.map((v) => [v.postId, v._sum.value ?? 0])
    );

    // For polls, check if user has voted
    const pollIds = sliced
      .filter((p) => p.poll)
      .map((p) => p.poll!.id);

    const userVotes = pollIds.length > 0
      ? await db.pollVote.findMany({
          where: {
            userId,
            option: { pollId: { in: pollIds } },
          },
          select: { optionId: true },
        })
      : [];
    const votedOptionIds = new Set(userVotes.map((v) => v.optionId));

    const formatted = sliced.map((post) => formatPostWithVotes(post, votedOptionIds, voteScoreMap));

    return successResponse({
      posts: formatted,
      nextCursor,
    });
  } catch {
    return internalErrorResponse();
  }
}

// Helper: get friend IDs for a user
async function getFriendIds(userId: string): Promise<string[]> {
  const friendships = await db.friendship.findMany({
    where: {
      status: 'accepted',
      OR: [{ requesterId: userId }, { addresseeId: userId }],
    },
    select: { requesterId: true, addresseeId: true },
  });
  return friendships.map((f) =>
    f.requesterId === userId ? f.addresseeId : f.requesterId
  );
}

// Helper: format a post for the response (used for create)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatPost(post: any, userId: string) {
  return {
    id: post.id,
    content: post.content,
    visibility: post.visibility,
    notebookRef: post.notebookRef,
    createdAt: post.createdAt,
    author: post.author,
    images: post.images.map((img: { id: string; url: string; sortOrder: number }) => ({
      id: img.id,
      url: img.url,
      sortOrder: img.sortOrder,
    })),
    poll: post.poll
      ? {
          id: post.poll.id,
          question: post.poll.question,
          options: post.poll.options.map((opt: { id: string; text: string; sortOrder: number; _count: { votes: number } }) => ({
            id: opt.id,
            text: opt.text,
            sortOrder: opt.sortOrder,
            voteCount: opt._count.votes,
            userVoted: false, // Just created, user hasn't voted
          })),
        }
      : null,
    voteScore: 0,
    commentCount: post._count.comments,
    userVote: 0, // Just created
  };
}

// Helper: format a post with vote info (used for feed)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatPostWithVotes(post: any, votedOptionIds: Set<string>, voteScoreMap: Map<string, number>) {
  return {
    id: post.id,
    content: post.content,
    visibility: post.visibility,
    notebookRef: post.notebookRef,
    createdAt: post.createdAt,
    author: post.author,
    images: post.images.map((img: { id: string; url: string; sortOrder: number }) => ({
      id: img.id,
      url: img.url,
      sortOrder: img.sortOrder,
    })),
    poll: post.poll
      ? {
          id: post.poll.id,
          question: post.poll.question,
          options: post.poll.options.map((opt: { id: string; text: string; sortOrder: number; _count: { votes: number } }) => ({
            id: opt.id,
            text: opt.text,
            sortOrder: opt.sortOrder,
            voteCount: opt._count.votes,
            userVoted: votedOptionIds.has(opt.id),
          })),
        }
      : null,
    voteScore: voteScoreMap.get(post.id) ?? 0,
    commentCount: post._count.comments,
    userVote: post.votes?.[0]?.value ?? 0,
  };
}
