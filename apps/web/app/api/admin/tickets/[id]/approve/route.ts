// POST /api/admin/tickets/[id]/approve — Phase 7 of the path-publishing
// plan. Admin clicks "Approve" on a `flagged_pending_human` SharedPath
// via the ticket detail page; this route gates auth, parses the
// optional admin note, and hands off to `approveSharedPath()`.
//
// Contracts:
//   - AC-Admin-1 (existence-leak guard): non-admin → 404. Same taxonomy
//     as the other path-publishing admin endpoints (NOT 403).
//   - AC-Auditability: every successful approve writes exactly one
//     `AdminAuditLog{action:'shared_path.approve'}` with admin ID +
//     target — orchestrated by the runner, not duplicated here.
//   - Idempotency: a second approve on an already-approved ticket
//     returns 200 (not 409, not 400) per the P7V "approving an already-
//     approved ticket is a no-op" gate. The runner distinguishes
//     `noop_already_terminal` from `applied` so analytics can still
//     count fresh approvals separately.
//   - 409 on state conflict — if the row moved out of
//     `flagged_pending_human` (other admin acted first, author
//     unpublished, L3 re-judge raced), the UI refetches.

import { NextRequest } from 'next/server';
import { getAdminUserId } from '@/lib/auth';
import {
  successResponse,
  notFoundResponse,
  badRequestResponse,
  conflictResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { approveSharedPath } from '@/lib/moderation/layer5-runner';
import { parseL5Note } from '@/lib/moderation/layer5';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const adminId = await getAdminUserId(request);
    if (!adminId) return notFoundResponse();

    const { id: ticketId } = await params;

    // Body is optional — admin can approve without leaving a note. The
    // runner accepts `note: null` and skips the audit-row reasoning.
    let note: string | null = null;
    try {
      const body = (await safeJson(request)) as { note?: unknown } | null;
      note = parseL5Note(body?.note);
    } catch (parseErr) {
      // Only `parseL5Note` throws on >cap; bubble that as a 400.
      const msg =
        parseErr instanceof Error ? parseErr.message : 'invalid body';
      return badRequestResponse(msg);
    }

    const result = await approveSharedPath({ ticketId, adminId, note });

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
    // Empty body is allowed — return null so the caller knows there's
    // no `note` to parse without a 400.
    return null;
  }
}
