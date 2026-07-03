import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  forbiddenResponse,
  notFoundResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { logAdminAction } from '@/lib/admin-audit';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import { cancelLemonSqueezySubscription } from '@/lib/lemonsqueezy';

// PATCH — ban/unban a user, or update role (admin only)
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return forbiddenResponse('Admin access required');

    // Defense-in-depth: cap the rate of admin moderation actions per admin, so
    // a compromised admin session / misconfigured internal tool can't rapidly
    // ban/unban accounts. Admin auth remains the primary gate (fail-open).
    const rl = await rateLimit(rateLimitKey('admin-user-moderate', request, adminId), 30, 60_000);
    if (!rl.success) {
      return tooManyRequestsResponse(
        'Too many admin actions. Slow down a moment.',
        rl.retryAfterMs
      );
    }

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
            authVersion: { increment: 1 },
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
            authVersion: { increment: 1 },
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

    // Deletes are destructive and cascade (plus a Lemon Squeezy cancel call),
    // so cap them tighter than moderation. Per-admin, fail-open.
    const rl = await rateLimit(rateLimitKey('admin-user-delete', request, adminId), 15, 60_000);
    if (!rl.success) {
      return tooManyRequestsResponse(
        'Too many delete actions. Slow down a moment.',
        rl.retryAfterMs
      );
    }

    const { id: targetId } = await params;

    // Prevent admin from deleting themselves
    if (targetId === adminId) {
      return badRequestResponse('Cannot delete your own admin account');
    }

    const target = await db.user.findUnique({
      where: { id: targetId },
      select: {
        id: true,
        username: true,
        role: true,
        entitlementSource: true,
        lemonSqueezySubscriptionId: true,
      },
    });
    if (!target) return notFoundResponse('User not found');

    // Prevent deleting other admins
    if (target.role === 'admin') {
      return forbiddenResponse('Cannot delete another admin');
    }

    // Cancel any active Lemon Squeezy subscription BEFORE deleting the row.
    // The User row holds the only handle to the subscription; once it's gone
    // the billing webhook can't resolve the user, so renewals would keep
    // charging with nothing left to cancel against. (Apple/RevenueCat subs
    // can only be cancelled by the user in the App Store.)
    if (target.entitlementSource === 'LEMON_SQUEEZY' && target.lemonSqueezySubscriptionId) {
      try {
        await cancelLemonSqueezySubscription(target.lemonSqueezySubscriptionId);
      } catch (err) {
        console.error('[admin delete-user] Lemon Squeezy cancel failed', err);
        // Continue — don't block the admin deletion over a provider hiccup.
      }
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
