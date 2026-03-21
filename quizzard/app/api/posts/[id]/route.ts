import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { canUserSeePost } from '@/lib/post-visibility';

const MAX_CONTENT_LENGTH = 2000;

// GET — get a single post
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: postId } = await params;

    const post = await db.post.findUnique({
      where: { id: postId },
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
        likes: { where: { userId }, select: { id: true }, take: 1 },
        visibleTo: { where: { userId }, select: { id: true }, take: 1 },
      },
    });

    if (!post) return notFoundResponse('Post not found');

    // Check visibility
    if (!(await canUserSeePost(post, userId))) {
      return notFoundResponse('Post not found');
    }

    // Get user's poll votes
    let votedOptionIds = new Set<string>();
    if (post.poll) {
      const userVotes = await db.pollVote.findMany({
        where: {
          userId,
          option: { pollId: post.poll.id },
        },
        select: { optionId: true },
      });
      votedOptionIds = new Set(userVotes.map((v) => v.optionId));
    }

    return successResponse(formatPost(post, votedOptionIds));
  } catch {
    return internalErrorResponse();
  }
}

// PUT — edit a post (content only)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: postId } = await params;

    const post = await db.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });

    if (!post) return notFoundResponse('Post not found');
    if (post.authorId !== userId) return forbiddenResponse('You can only edit your own posts');

    const body = await request.json().catch(() => ({}));
    const { content } = body as { content?: string };

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return badRequestResponse('Content is required');
    }
    if (content.length > MAX_CONTENT_LENGTH) {
      return badRequestResponse(`Content must be ${MAX_CONTENT_LENGTH} characters or less`);
    }

    const updated = await db.post.update({
      where: { id: postId },
      data: { content: content.trim() },
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
        likes: { where: { userId }, select: { id: true }, take: 1 },
      },
    });

    // Get user's poll votes
    let votedOptionIds = new Set<string>();
    if (updated.poll) {
      const userVotes = await db.pollVote.findMany({
        where: {
          userId,
          option: { pollId: updated.poll.id },
        },
        select: { optionId: true },
      });
      votedOptionIds = new Set(userVotes.map((v) => v.optionId));
    }

    return successResponse(formatPost(updated, votedOptionIds));
  } catch {
    return internalErrorResponse();
  }
}

// DELETE — delete a post
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: postId } = await params;

    const post = await db.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true },
    });

    if (!post) return notFoundResponse('Post not found');
    if (post.authorId !== userId) return forbiddenResponse('You can only delete your own posts');

    // Cascade delete handles all related records (images, poll, likes, comments, visibility)
    await db.post.delete({ where: { id: postId } });

    return successResponse({ deleted: true });
  } catch {
    return internalErrorResponse();
  }
}

// Helper: format a post for response
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function formatPost(post: any, votedOptionIds: Set<string>) {
  return {
    id: post.id,
    content: post.content,
    visibility: post.visibility,
    notebookRef: post.notebookRef,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
    author: post.author,
    images: post.images?.map((img: { id: string; url: string; sortOrder: number }) => ({
      id: img.id,
      url: img.url,
      sortOrder: img.sortOrder,
    })) || [],
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
