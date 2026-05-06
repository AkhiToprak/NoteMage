import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { logAdminAction } from '@/lib/admin-audit';

// PATCH — ban/unban a user, or update role (admin only)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return forbiddenResponse('Admin access required');

    const { id: targetId } = await params;

    // Prevent admin from modifying their own account
    if (targetId === adminId) {
      return badRequestResponse('Cannot modify your own admin account');
    }

    const target = await db.user.findUnique({
      where: { id: targetId },
      select: { id: true, role: true },
    });
    if (!target) return notFoundResponse('User not found');

    // Prevent modifying other admins
    if (target.role === 'admin') {
      return forbiddenResponse('Cannot modify another admin');
    }

    const body = await request.json().catch(() => ({}));
    const { action, reason } = body as { action?: string; reason?: string };

    if (!action) return badRequestResponse('Action is required');

    switch (action) {
      case 'ban': {
        await db.user.update({
          where: { id: targetId },
          data: {
            banned: true,
            banReason: reason?.trim().slice(0, 500) || null,
          },
        });
        await logAdminAction(adminId, 'user.ban', targetId, {
          reason: reason?.trim().slice(0, 500) || null,
        });
        return successResponse({ banned: true, userId: targetId });
      }

      case 'unban': {
        await db.user.update({
          where: { id: targetId },
          data: {
            banned: false,
            banReason: null,
          },
        });
        await logAdminAction(adminId, 'user.unban', targetId);
        return successResponse({ banned: false, userId: targetId });
      }

      default:
        return badRequestResponse('Invalid action. Use: ban, unban');
    }
  } catch {
    return internalErrorResponse();
  }
}

// DELETE — delete a user and all their data (admin only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return forbiddenResponse('Admin access required');

    const { id: targetId } = await params;

    // Prevent admin from deleting themselves
    if (targetId === adminId) {
      return badRequestResponse('Cannot delete your own admin account');
    }

    const target = await db.user.findUnique({
      where: { id: targetId },
      select: { id: true, username: true, role: true },
    });
    if (!target) return notFoundResponse('User not found');

    // Prevent deleting other admins
    if (target.role === 'admin') {
      return forbiddenResponse('Cannot delete another admin');
    }

    // Cascade delete handles all related records
    await db.user.delete({ where: { id: targetId } });

    await logAdminAction(adminId, 'user.delete', targetId, { username: target.username });

    return successResponse({
      deleted: true,
      userId: targetId,
      username: target.username,
    });
  } catch {
    return internalErrorResponse();
  }
}
