import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { canUserSeePost } from '@/lib/post-visibility';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  unauthorizedResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';

const MAX_COMMENT_LENGTH = 500;

interface CommentRow {
  id: string;
  content: string;
  createdAt: Date;
  parentCommentId: string | null;
  author: { id: string; name: string | null; username: string; avatarUrl: string | null };
  _count?: { replies: number };
  replies?: CommentRow[];
}

function formatComment(c: CommentRow, voteScoreMap: Map<string, number>, userVoteMap: Map<string, number>) {
  return {
    id: c.id,
    content: c.content,
    createdAt: c.createdAt,
    parentCommentId: c.parentCommentId ?? null,
    author: c.author,
    voteScore: voteScoreMap.get(c.id) ?? 0,
    userVote: userVoteMap.get(c.id) ?? 0,
    replyCount: c._count?.replies ?? 0,
    replies: (c.replies ?? []).map((r: CommentRow) => formatComment(r, voteScoreMap, userVoteMap)),
  };
}

// GET — get comments for a post (cursor-paginated)
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
      select: { id: true, authorId: true, visibility: true },
    });
    if (!post) return notFoundResponse('Post not found');
    if (!(await canUserSeePost(post, userId))) {
      return notFoundResponse('Post not found');
    }

    const { searchParams } = new URL(request.url);
    const cursor = searchParams.get('cursor') || undefined;
    const parentId = searchParams.get('parentId') || undefined;
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { postId, parentCommentId: parentId ?? null };
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (isNaN(cursorDate.getTime())) {
        return badRequestResponse('Invalid cursor format');
      }
      where.createdAt = { lt: cursorDate };
    }

    const comments = await db.postComment.findMany({
      where,
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
        _count: { select: { replies: true } },
        replies: {
          take: 3,
          orderBy: { createdAt: 'asc' },
          include: {
            author: { select: { id: true, username: true, avatarUrl: true } },
            _count: { select: { replies: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = comments.length > limit;
    const sliced = hasMore ? comments.slice(0, limit) : comments;
    const nextCursor = hasMore ? sliced[sliced.length - 1].createdAt.toISOString() : null;

    // Collect all comment IDs (top-level + nested replies) for vote data
    const allCommentIds: string[] = [];
    for (const c of sliced) {
      allCommentIds.push(c.id);
      for (const r of c.replies) {
        allCommentIds.push(r.id);
      }
    }

    // Batch fetch vote scores
    const voteScores = allCommentIds.length > 0
      ? await db.commentVote.groupBy({
          by: ['commentId'],
          where: { commentId: { in: allCommentIds } },
          _sum: { value: true },
        })
      : [];
    const voteScoreMap = new Map(voteScores.map((v) => [v.commentId, v._sum.value ?? 0]));

    // Batch fetch user's votes
    const userVotes = allCommentIds.length > 0
      ? await db.commentVote.findMany({
          where: { commentId: { in: allCommentIds }, userId },
          select: { commentId: true, value: true },
        })
      : [];
    const userVoteMap = new Map(userVotes.map((v) => [v.commentId, v.value]));

    return successResponse({
      comments: sliced.map((c) => formatComment(c, voteScoreMap, userVoteMap)),
      nextCursor,
    });
  } catch {
    return internalErrorResponse();
  }
}

// POST — create a comment on a post
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id: postId } = await params;

    const post = await db.post.findUnique({
      where: { id: postId },
      select: { id: true, authorId: true, visibility: true },
    });
    if (!post) return notFoundResponse('Post not found');
    if (!(await canUserSeePost(post, userId))) {
      return notFoundResponse('Post not found');
    }

    // Rate limit: max 5 comments per minute
    const recentCount = await db.postComment.count({
      where: {
        authorId: userId,
        createdAt: { gte: new Date(Date.now() - 60000) },
      },
    });
    if (recentCount >= 5) {
      return badRequestResponse('Too many comments. Please wait before posting again.');
    }

    const body = await request.json().catch(() => ({}));
    const { content, parentCommentId } = body as { content?: string; parentCommentId?: string };

    if (!content || typeof content !== 'string' || content.trim().length === 0) {
      return badRequestResponse('Comment content is required');
    }
    if (content.length > MAX_COMMENT_LENGTH) {
      return badRequestResponse(`Comment must be ${MAX_COMMENT_LENGTH} characters or less`);
    }

    // Validate parent comment if replying
    if (parentCommentId) {
      const parent = await db.postComment.findUnique({
        where: { id: parentCommentId },
        select: { id: true, postId: true },
      });
      if (!parent || parent.postId !== postId) {
        return badRequestResponse('Invalid parent comment');
      }
    }

    const comment = await db.postComment.create({
      data: {
        postId,
        authorId: userId,
        parentCommentId: parentCommentId ?? null,
        content: content.trim(),
      },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true } },
      },
    });

    // Notify post author or parent comment author
    const notifyUserId = parentCommentId
      ? (await db.postComment.findUnique({ where: { id: parentCommentId }, select: { authorId: true } }))?.authorId
      : post.authorId;

    if (notifyUserId && notifyUserId !== userId) {
      const commenter = await db.user.findUnique({
        where: { id: userId },
        select: { username: true },
      });
      await db.notification.create({
        data: {
          userId: notifyUserId,
          type: parentCommentId ? 'comment_reply' : 'post_comment',
          data: {
            fromUserId: userId,
            fromUsername: commenter?.username,
            postId,
            commentPreview: content.trim().slice(0, 100),
          },
        },
      });
    }

    return createdResponse({
      id: comment.id,
      content: comment.content,
      createdAt: comment.createdAt,
      parentCommentId: comment.parentCommentId,
      author: comment.author,
      voteScore: 0,
      userVote: 0,
      replyCount: 0,
      replies: [],
    });
  } catch {
    return internalErrorResponse();
  }
}
