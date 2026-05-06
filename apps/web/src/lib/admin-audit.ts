import { db } from '@/lib/db';

export type AdminAction =
  | 'user.ban'
  | 'user.unban'
  | 'user.delete'
  | 'post.delete'
  | 'comment.delete'
  | 'community_notebook.delete'
  | 'cosmetic.grant'
  | 'cosmetic.revoke';

/**
 * Log an admin action for auditing purposes.
 * Fire-and-forget — errors are caught so they never break the main request.
 */
export async function logAdminAction(
  adminId: string,
  action: AdminAction,
  targetId: string,
  details?: Record<string, unknown>
): Promise<void> {
  try {
    await db.adminAuditLog.create({
      data: {
        adminId,
        action,
        targetId,
        details: details ? JSON.stringify(details) : null,
      },
    });
  } catch (error) {
    console.error('Failed to write admin audit log:', error);
  }
}
