// Phase 13 of plans/path-publishing-community-library.md — Layer 4
// post-publish reports.
//
// POST /api/community/paths/[shareId]/report — a community member flags
// an approved path as bad content. One report per (user, path) via the
// `Report` unique constraint (the spam upper-bound). After the report is
// recorded, `runReportAggregation` checks whether the distinct open-report
// count crossed REPORT_REMODERATION_THRESHOLD and, if so, pulls the path
// back into the human queue (`approved → flagged_pending_human`).
//
// Per the P13 design:
//   - Auth required (user) → 401 otherwise.
//   - Path must be `moderationStatus === 'approved'` → 404 otherwise
//     (existence-leak guard, same shape as the rest of the public surface
//     — you can only report what's actually live in the library).
//   - You cannot report your own path → 400 (a self-report is meaningless
//     and would be an obvious abuse vector for self-takedown games).
//   - `reason` must be in the allow-list (mirror of the moderation
//     category taxonomy) → 400 otherwise.
//   - `detail` is optional, capped → 400 if over the cap.
//   - Idempotent per (user, path): re-reporting upserts the existing row
//     (updates reason/detail) rather than stacking duplicates, and never
//     re-opens a report an admin already resolved.
//
// Cost: pure DB. No model client imported — the report path costs zero
// AI. The only AI in the wider L4 story is the *reused* L3 audit the
// trust gate fires (already budgeted in P5V), not anything here.

import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  badRequestResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { parseReportReason, parseReportDetail } from '@/lib/moderation/layer4';
import { runReportAggregation } from '@/lib/moderation/layer4-runner';

type Params = { params: Promise<{ shareId: string }> };

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { shareId } = await params;

    // Parse + validate the body before any DB work so a malformed report
    // never touches the database.
    const body = (await request.json().catch(() => null)) as
      | { reason?: unknown; detail?: unknown }
      | null;

    const reason = parseReportReason(body?.reason);
    if (!reason) {
      return badRequestResponse('Pick a valid reason for reporting this path.');
    }

    let detail: string | null;
    try {
      detail = parseReportDetail(body?.detail);
    } catch (err) {
      return badRequestResponse(
        err instanceof Error ? err.message : 'Invalid report detail.',
      );
    }

    // Existence + approved gate. Non-approved (or missing) paths 404 —
    // the library only ever surfaces approved paths, so there's nothing
    // legitimate to report otherwise, and we don't leak the existence of
    // pending/rejected rows.
    const sharedPath = await db.sharedPath.findUnique({
      where: { id: shareId },
      select: { id: true, moderationStatus: true, sharedById: true },
    });
    if (!sharedPath || sharedPath.moderationStatus !== 'approved') {
      return notFoundResponse('Path not found');
    }

    // Can't report your own path.
    if (sharedPath.sharedById === userId) {
      return badRequestResponse('You cannot report your own path.');
    }

    // Idempotent upsert per (user, path). On a repeat report we update the
    // reason/detail but deliberately do NOT touch `status` — a report an
    // admin already dismissed/actioned stays resolved, so re-clicking
    // can't single-handedly re-arm the re-moderation trigger.
    await db.report.upsert({
      where: {
        sharedPathId_reporterId: { sharedPathId: shareId, reporterId: userId },
      },
      create: {
        sharedPathId: shareId,
        reporterId: userId,
        reason,
        detail,
        status: 'open',
      },
      update: {
        reason,
        detail,
      },
    });

    // Aggregate inline (cheap, pure DB — count + maybe one transaction).
    // Awaiting it keeps the behaviour deterministic + testable; the
    // outcome doesn't change the user-facing response (they just learn
    // their report was recorded). Idempotent + race-safe inside.
    await runReportAggregation(shareId);

    return successResponse({ reported: true });
  } catch (error) {
    console.error('[community/paths/[shareId]/report POST]', error);
    return internalErrorResponse();
  }
}
