// POST /api/admin/tickets/[id]/reject — Phase 7 of the path-publishing
// plan. Admin clicks "Reject" on a `flagged_pending_human` SharedPath
// via the ticket detail page; this route gates auth, validates the
// reason code + optional note, and hands off to `rejectSharedPath()`.
//
// Body shape:
//   { reasonCode: "l5.<category>"; note?: string }
//
// `reasonCode` is required (the path is being terminated — the author
// needs to know why). `note` is optional but recommended; when present
// it fronts `rejectionReason` as the human qualifier after the canned
// category phrase.
//
// Contracts (mirror `/approve`):
//   - AC-Admin-1: non-admin → 404.
//   - AC-Auditability: every successful reject writes exactly one
//     `AdminAuditLog{action:'shared_path.reject'}` row via the runner.
//   - Idempotency: re-rejecting an already-rejected ticket is a 200
//     no-op (not 409).
//   - 400 on bad reasonCode (not in the L5 allow-list) or note > cap.
//   - 409 on state conflict (path no longer in the queue).

import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import {
  successResponse,
  notFoundResponse,
  badRequestResponse,
  conflictResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { rejectSharedPath } from '@/lib/moderation/layer5-runner';
import {
  L5_NOTE_MAX_CHARS,
  parseL5Note,
  parseL5RejectReasonCode,
} from '@/lib/moderation/layer5';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return notFoundResponse();

    const { id: ticketId } = await params;

    const body = (await safeJson(request)) as
      | { reasonCode?: unknown; note?: unknown }
      | null;
    if (!body || typeof body !== 'object') {
      return badRequestResponse('body required');
    }

    const reasonCode = parseL5RejectReasonCode(body.reasonCode);
    if (!reasonCode) {
      return badRequestResponse(
        'reasonCode must be one of l5.{adult,hateful,spam,copyright,offtopic,low_quality,other}',
      );
    }

    let note: string | null;
    try {
      note = parseL5Note(body.note);
    } catch (parseErr) {
      const msg =
        parseErr instanceof Error
          ? parseErr.message
          : `note must be ≤ ${L5_NOTE_MAX_CHARS} characters`;
      return badRequestResponse(msg);
    }

    const result = await rejectSharedPath({
      ticketId,
      adminId,
      reasonCode,
      note,
    });

    switch (result.outcome) {
      case 'applied':
      case 'noop_already_terminal':
        return successResponse({
          ticketId: result.ticketId,
          sharedPathId: result.sharedPathId,
          moderationStatus: result.status,
          ticketStatus: 'resolved',
          noop: result.outcome === 'noop_already_terminal',
        });
      case 'not_found':
        return notFoundResponse();
      case 'conflict_state':
        return conflictResponse(
          `path is in state ${result.status}, not flagged_pending_human`,
        );
    }
  } catch {
    return internalErrorResponse();
  }
}

async function safeJson(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
