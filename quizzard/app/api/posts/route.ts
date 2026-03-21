import fs from 'fs/promises';
import path from 'path';
import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

const MAX_CONTENT_LENGTH = 2000;
const MAX_IMAGES = 4;
const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB per image
const MAX_POLL_OPTIONS = 4;
const MIN_POLL_OPTIONS = 2;
const POSTS_DIR = path.join(process.cwd(), 'public', 'uploads', 'posts');

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

// POST — create a new post (multipart/form-data)
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const formData = await request.formData();

    // Extract fields
    const content = formData.get('content');
    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return badRequestResponse('Content is required');
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return badRequestResponse(`Content must be ${MAX_CONTENT_LENGTH} characters or less`);
    }

    const visibility = (formData.get('visibility') as string) || 'public';
    if (!VALID_VISIBILITIES.includes(visibility as (typeof VALID_VISIBILITIES)[number])) {
      return badRequestResponse('visibility must be "public", "friends", or "specific"');
    }

    const notebookRef = formData.get('notebookRef') as string | null;

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

    // Parse poll data if provided
    const pollJson = formData.get('poll') as string | null;
    let pollData: { question: string; options: string[] } | null = null;
    if (pollJson) {
      try {
        pollData = JSON.parse(pollJson);
      } catch {
        return badRequestResponse('Invalid poll data');
      }
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
    const visibleToJson = formData.get('visibleTo') as string | null;
    let visibleToIds: string[] = [];
    if (visibility === 'specific') {
      if (!visibleToJson) {
        return badRequestResponse('visibleTo is required for specific visibility');
      }
      try {
        visibleToIds = JSON.parse(visibleToJson);
      } catch {
        return badRequestResponse('Invalid visibleTo data');
      }
      if (!Array.isArray(visibleToIds) || visibleToIds.length === 0) {
        return badRequestResponse('visibleTo must be a non-empty array of user IDs');
      }
      if (visibleToIds.length > 50) {
        return badRequestResponse('Cannot share with more than 50 users');
      }
      // Validate all IDs are non-empty strings
      if (visibleToIds.some((id) => typeof id !== 'string' || id.length === 0)) {
        return badRequestResponse('All visibleTo IDs must be non-empty strings');
      }
      // Deduplicate and remove self
      visibleToIds = [...new Set(visibleToIds)].filter((id) => id !== userId);
      if (visibleToIds.length === 0) {
        return badRequestResponse('visibleTo must contain at least one other user');
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

    // Process images
    const imageFiles: File[] = [];
    for (const [key, value] of formData.entries()) {
      if (key === 'images' && value instanceof File && value.size > 0) {
        imageFiles.push(value);
      }
    }
    if (imageFiles.length > MAX_IMAGES) {
      return badRequestResponse(`Maximum ${MAX_IMAGES} images allowed`);
    }

    // Validate and save images
    const savedImages: { url: string; sortOrder: number }[] = [];
    if (imageFiles.length > 0) {
      await fs.mkdir(POSTS_DIR, { recursive: true });

      for (let i = 0; i < imageFiles.length; i++) {
        const file = imageFiles[i];
        if (file.size > MAX_IMAGE_SIZE) {
          return badRequestResponse(`Image ${i + 1} exceeds 5MB limit`);
        }
        const buffer = Buffer.from(await file.arrayBuffer());
        const ext = detectImageType(buffer);
        if (!ext) {
          return badRequestResponse(`Image ${i + 1} is not a valid image (PNG, JPEG, or WebP)`);
        }
        const fileName = `${userId}-${Date.now()}-${i}.${ext}`;
        await fs.writeFile(path.join(POSTS_DIR, fileName), buffer);
        savedImages.push({ url: `/uploads/posts/${fileName}`, sortOrder: i });
      }
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
          _count: { select: { likes: true, comments: true } },
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
        _count: { select: { likes: true, comments: true } },
        likes: {
          where: { userId },
          select: { id: true },
          take: 1,
        },
      },
      orderBy: feed === 'trending'
        ? [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }]
        : { createdAt: 'desc' },
      take: limit + 1, // Fetch one extra to determine if there's a next page
    });

    const hasMore = posts.length > limit;
    const sliced = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore ? sliced[sliced.length - 1].createdAt.toISOString() : null;

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

    const formatted = sliced.map((post) => formatPostWithVotes(post, votedOptionIds));

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
    likeCount: post._count.likes,
    commentCount: post._count.comments,
    isLiked: false, // Just created
  };
}

// Helper: format a post with vote info (used for feed)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatPostWithVotes(post: any, votedOptionIds: Set<string>) {
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
    likeCount: post._count.likes,
    commentCount: post._count.comments,
    isLiked: post.likes?.length > 0,
  };
}
