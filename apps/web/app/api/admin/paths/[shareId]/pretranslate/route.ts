// POST /api/admin/paths/[shareId]/pretranslate — Phase 11 of the path-
// publishing plan. The admin manual pre-translation trigger (P0 §4.10).
//
// Two use cases:
//   (a) editorial curator promotes a high-quality path before it
//       accumulates POPULARITY_THRESHOLD clones;
//   (b) one-off backfill after the P11 deploy for paths sitting above
//       the threshold with no fan-out yet.
//
// Contract (P0 §4.10):
//   - Auth: admin only. Non-admin → 403 (forbiddenResponse), matching the
//     sibling admin/paths route. No existence-leak concern here: community
//     paths are already publicly viewable via /api/community/paths/[shareId].
//   - Precondition: SharedPath.moderationStatus === 'approved'.
//       missing row → 404; exists-but-not-approved → 409.
//   - Effects: atomically set `popularityTriggeredAt = NOW()` iff
//     currently null; on the winning flip, write
//     `AdminAuditLog{action:'shared_path.pretranslate_force'}` and fire
//     the popular-language fan-out fire-and-forget.
//   - Idempotent: if `popularityTriggeredAt` was already set, return 200
//     WITHOUT firing a duplicate fan-out and WITHOUT writing an audit
//     row (the PathTranslation unique constraint would no-op the fan-out
//     anyway; suppressing the audit row avoids log noise).
//   - Response 200: `{ shareId, popularityTriggeredAt }`.

import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { logAdminAction } from '@/lib/admin-audit';
import { runPretranslationFanOut } from '@/lib/translation/pretranslate';
import {
  successResponse,
  notFoundResponse,
  forbiddenResponse,
  conflictResponse,
  internalErrorResponse,
} from '@/lib/api-response';

type Params = { params: Promise<{ shareId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return forbiddenResponse('Admin access required');

    const { shareId } = await params;

    const sharedPath = await db.sharedPath.findUnique({
      where: { id: shareId },
      select: { id: true, moderationStatus: true, popularityTriggeredAt: true },
    });

    if (!sharedPath) return notFoundResponse('Path not found');
    if (sharedPath.moderationStatus !== 'approved') {
      // Admins are allowed to know a path exists but isn't approvable
      // yet (they moderate it), so this is a state conflict, not a leak.
      return conflictResponse('path_not_approved');
    }

    // Atomic flip — set popularityTriggeredAt only if still null. The
    // count tells us whether WE won the first trigger; a concurrent
    // clone-trigger or a prior admin trigger collapses to count === 0.
    const flip = await db.sharedPath.updateMany({
      where: { id: { equals: shareId }, popularityTriggeredAt: null },
      data: { popularityTriggeredAt: new Date() },
    });
    const firstTrigger = flip.count === 1;

    if (firstTrigger) {
      // Audit + fan-out only on the winning flip (idempotency per §4.10).
      await logAdminAction(adminId, 'shared_path.pretranslate_force', shareId);
      void runPretranslationFanOut(shareId).catch((err) => {
        console.error('[admin/paths/[shareId]/pretranslate fan-out]', err);
      });
    }

    // Re-read the canonical timestamp (the just-set value on a winning
    // flip, or the pre-existing one on an idempotent no-op).
    const after = await db.sharedPath.findUnique({
      where: { id: shareId },
      select: { popularityTriggeredAt: true },
    });

    return successResponse({
      shareId,
      popularityTriggeredAt: after?.popularityTriggeredAt ?? null,
    });
  } catch (error) {
    console.error('[admin/paths/[shareId]/pretranslate POST]', error);
    return internalErrorResponse();
  }
}
