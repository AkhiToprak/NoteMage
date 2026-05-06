import { NextRequest } from 'next/server';
import { getAuthUserId, getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  forbiddenResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { logAdminAction } from '@/lib/admin-audit';

// DELETE — delete a comment (admin or comment author)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const adminId = await getAdminUserId(request);
    const { id: commentId } = await params;

    const comment = await db.postComment.findUnique({
      where: { id: commentId },
      select: { id: true, authorId: true },
    });
    if (!comment) return notFoundResponse('Comment not found');

    // Allow admin or comment author
    const isAdmin = !!adminId;
    if (!isAdmin && comment.authorId !== userId) {
      return forbiddenResponse('You can only delete your own comments');
    }

    await db.postComment.delete({ where: { id: commentId } });

    if (isAdmin && comment.authorId !== userId) {
      await logAdminAction(adminId!, 'comment.delete', commentId, { authorId: comment.authorId });
    }

    return successResponse({ deleted: true, commentId });
  } catch {
    return internalErrorResponse();
  }
}
