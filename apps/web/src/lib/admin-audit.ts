import { db } from '@/lib/db';

export type AdminAction =
  | 'user.ban'
  | 'user.unban'
  | 'user.delete'
  | 'user.list'
  | 'post.delete'
  | 'comment.delete'
  | 'community_notebook.delete'
  | 'cosmetic.grant'
  | 'cosmetic.revoke'
  // Path publishing (P1 plan, P7+ surfaces) — moderation outcomes,
  // unpublish, manual popularity-trigger override, and ticket workflow.
  | 'shared_path.approve'
  | 'shared_path.reject'
  | 'shared_path.unpublish'
  | 'shared_path.pretranslate_force'
  | 'ticket.resolve'
  | 'ticket.assign';

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
