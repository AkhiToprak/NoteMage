// DB-bound runner for Moderation Layer 5 (P7 of the path-publishing
// plan — human review wired to the admin dashboard).
//
// L5 has no model call, no parser, no projection — the verdict IS the
// admin's click. This file owns the orchestration around that click:
//
//   1. Gating on the canonical state (`flagged_pending_human`) so an
//      L5 action can't quietly overwrite a path that already moved
//      (e.g. another admin acted first, author unpublished, L3 racer).
//   2. Atomically transitioning the SharedPath + writing the audit row
//      + resolving the Ticket + posting the Notification in one
//      transaction (per the plan's "Audit log contains every admin
//      action with admin ID and target" gate — every L5 action leaves
//      a chain that ends with both a `ModerationAudit{layer:5}` row
//      and an `AdminAuditLog{action:'shared_path.approve'|'shared_path.reject'}`).
//   3. Post-commit fan-out to `logAdminAction()` + the moderation email
//      — both fire-and-forget so a flaky SMTP or audit-log write can't
//      roll back the state machine.
//   4. Idempotency: re-acting on a path that already reached terminal
//      state is a no-op, not an error. The P7V gate requires this so a
//      double-click or a stale UI session can't error-out an admin.
//
// Mirrors the L2/L3 runner shape — transaction-first, post-commit
// side-effects, status-gated `updateMany` for race recovery — so the
// human-review path uses the same primitives as the AI layers.

import { db } from '@/lib/db';
import { logAdminAction } from '@/lib/admin-audit';
import {
  sendPathApprovedEmail,
  sendPathRejectedEmail,
} from './moderation-email';
import {
  composeL5RejectionReason,
  type L5RejectReasonCode,
} from './layer5';

// ── shared types ──────────────────────────────────────────────────────────

export type L5Outcome =
  /** Transaction ran — state, audit, ticket, notification all wrote. */
  | 'applied'
  /** State already at the requested terminal — no writes, no email. */
  | 'noop_already_terminal'
  /** SharedPath wasn't in `flagged_pending_human` — caller should treat
   *  as a 409 (someone moved it under us). */
  | 'conflict_state'
  /** Ticket no longer exists / not on a SharedPath — 404. */
  | 'not_found';

export interface L5Result {
  outcome: L5Outcome;
  /** Post-action SharedPath.moderationStatus. Useful for the route
   *  response so the admin UI doesn't have to refetch to get the chip. */
  status: string;
  /** ID of the ticket that was resolved (or already resolved). */
  ticketId: string;
  /** ID of the SharedPath the action targeted. */
  sharedPathId: string;
}

// ── approve ───────────────────────────────────────────────────────────────

export interface ApproveSharedPathInput {
  ticketId: string;
  adminId: string;
  /** Free-text admin note. Already trimmed + length-validated by the
   *  route handler via `parseL5Note()`. */
  note: string | null;
}

/**
 * Approve a SharedPath out of the human queue.
 *
 * State transition: `flagged_pending_human → approved`. Also sets
 * `approvedAt = now()` so list endpoints' newest-first ordering treats
 * the approval timestamp (not the original publish time) as the
 * "appears in the library" instant — matches the L2 auto-pass shape.
 *
 * Idempotency: re-calling on a path that already reached `approved`
 * with a `resolved` ticket is a no-op (returns `noop_already_terminal`).
 * That handles the "admin double-clicks the approve button" race and
 * the "two admins acted simultaneously" race without erroring either.
 */
export async function approveSharedPath(
  input: ApproveSharedPathInput,
): Promise<L5Result> {
  const { ticketId, adminId, note } = input;

  // 1) Load the ticket + the SharedPath behind it. Both must exist; the
  //    ticket must reference a SharedPath (v1 only); the SharedPath
  //    must be in the queue or already terminal-approved (idempotency).
  const gate = await loadTicketAndPath(ticketId);
  if (!gate) {
    return {
      outcome: 'not_found',
      status: '',
      ticketId,
      sharedPathId: '',
    };
  }
  const { ticket, sharedPath } = gate;

  // 2) Idempotency: already approved + ticket already resolved → no-op.
  //    No fresh audit, no duplicate email. The plan's "approving an
  //    already-approved ticket is a no-op, not an error" gate.
  if (
    sharedPath.moderationStatus === 'approved' &&
    ticket.status === 'resolved'
  ) {
    return {
      outcome: 'noop_already_terminal',
      status: 'approved',
      ticketId,
      sharedPathId: sharedPath.id,
    };
  }

  // 3) Anything other than the queue state is a 409 — the row moved
  //    under us (race with another admin / L3 re-judge / author
  //    unpublish). The caller surfaces this as a conflict so the UI
  //    can refetch and show the new state.
  if (sharedPath.moderationStatus !== 'flagged_pending_human') {
    return {
      outcome: 'conflict_state',
      status: sharedPath.moderationStatus,
      ticketId,
      sharedPathId: sharedPath.id,
    };
  }

  // 4) Transaction — every write or none. The status-gated updateMany
  //    catches the race where another admin's approve commits between
  //    our load and our write.
  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.sharedPath.updateMany({
        where: { id: sharedPath.id, moderationStatus: 'flagged_pending_human' },
        data: {
          moderationStatus: 'approved',
          approvedAt: new Date(),
          rejectionReason: null, // clear any prior reject reason
        },
      });
      // Race: the row moved. Skip downstream writes — we don't want a
      // stale audit row claiming we approved a rejected path.
      if (updated.count === 0) return;

      await tx.moderationAudit.create({
        data: {
          sharedPathId: sharedPath.id,
          layer: 5,
          verdict: 'pass',
          reasonCode: null,
          reasoning: note,
          actorId: adminId,
        },
      });

      await tx.ticket.updateMany({
        where: { id: ticket.id, status: { in: ['open', 'assigned'] } },
        data: {
          status: 'resolved',
          resolvedById: adminId,
          resolvedAt: new Date(),
          resolutionNote: note,
        },
      });

      await tx.notification.create({
        data: {
          userId: sharedPath.sharedById,
          type: 'path_published',
          data: {
            shareId: sharedPath.id,
            title: sharedPath.title,
            layer: 5,
          },
        },
      });
    });
  } catch (txErr) {
    // DB failure mid-transition — log and bail. The SharedPath stays
    // in `flagged_pending_human`; the admin can retry. We return
    // `conflict_state` rather than throwing so the route can 500 with
    // a clean error envelope.
    console.error(
      `[layer5-runner] approve transaction failed for ${sharedPath.id}`,
      txErr,
    );
    throw txErr;
  }

  // 5) Post-commit side-effects: admin audit + email. Both are
  //    fire-and-forget — a failure here must not roll back state. The
  //    admin audit log entry IS the forensic trail for AC-Auditability;
  //    it's intentionally wrapped in `logAdminAction`'s own try/catch
  //    so a transient write failure doesn't propagate.
  void logAdminAction(adminId, 'shared_path.approve', sharedPath.id, {
    ticketId: ticket.id,
    via: 'admin_dashboard',
  });

  const to = sharedPath.sharedBy.email;
  if (to) {
    const title = sharedPath.title;
    void (async () => {
      try {
        await sendPathApprovedEmail({ to, title, shareId: sharedPath.id });
      } catch (mailErr) {
        console.error('[layer5-runner] approve email dispatch failed', mailErr);
      }
    })();
  }

  return {
    outcome: 'applied',
    status: 'approved',
    ticketId: ticket.id,
    sharedPathId: sharedPath.id,
  };
}

// ── reject ────────────────────────────────────────────────────────────────

export interface RejectSharedPathInput {
  ticketId: string;
  adminId: string;
  reasonCode: L5RejectReasonCode;
  /** Free-text admin note. Optional but recommended — fronts the
   *  author's rejection-reason copy when present. */
  note: string | null;
}

/**
 * Reject a SharedPath out of the human queue.
 *
 * State transition: `flagged_pending_human → rejected`. Writes the
 * composed `rejectionReason` so the author's publication-status page
 * surfaces it without a second round trip.
 *
 * Same idempotency contract as approve: re-rejecting an already-
 * rejected ticket is a no-op.
 */
export async function rejectSharedPath(
  input: RejectSharedPathInput,
): Promise<L5Result> {
  const { ticketId, adminId, reasonCode, note } = input;

  const gate = await loadTicketAndPath(ticketId);
  if (!gate) {
    return {
      outcome: 'not_found',
      status: '',
      ticketId,
      sharedPathId: '',
    };
  }
  const { ticket, sharedPath } = gate;

  if (
    sharedPath.moderationStatus === 'rejected' &&
    ticket.status === 'resolved'
  ) {
    return {
      outcome: 'noop_already_terminal',
      status: 'rejected',
      ticketId,
      sharedPathId: sharedPath.id,
    };
  }

  if (sharedPath.moderationStatus !== 'flagged_pending_human') {
    return {
      outcome: 'conflict_state',
      status: sharedPath.moderationStatus,
      ticketId,
      sharedPathId: sharedPath.id,
    };
  }

  const rejectionReason = composeL5RejectionReason(reasonCode, note);

  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.sharedPath.updateMany({
        where: { id: sharedPath.id, moderationStatus: 'flagged_pending_human' },
        data: {
          moderationStatus: 'rejected',
          rejectionReason,
        },
      });
      if (updated.count === 0) return;

      await tx.moderationAudit.create({
        data: {
          sharedPathId: sharedPath.id,
          layer: 5,
          verdict: 'reject',
          reasonCode,
          reasoning: note,
          actorId: adminId,
        },
      });

      await tx.ticket.updateMany({
        where: { id: ticket.id, status: { in: ['open', 'assigned'] } },
        data: {
          status: 'resolved',
          resolvedById: adminId,
          resolvedAt: new Date(),
          resolutionNote: note,
        },
      });

      await tx.notification.create({
        data: {
          userId: sharedPath.sharedById,
          type: 'path_rejected',
          data: {
            shareId: sharedPath.id,
            title: sharedPath.title,
            reasonCode,
            layer: 5,
          },
        },
      });
    });
  } catch (txErr) {
    console.error(
      `[layer5-runner] reject transaction failed for ${sharedPath.id}`,
      txErr,
    );
    throw txErr;
  }

  void logAdminAction(adminId, 'shared_path.reject', sharedPath.id, {
    ticketId: ticket.id,
    reasonCode,
    via: 'admin_dashboard',
  });

  const to = sharedPath.sharedBy.email;
  if (to) {
    const title = sharedPath.title;
    void (async () => {
      try {
        await sendPathRejectedEmail({
          to,
          title,
          shareId: sharedPath.id,
          reasonCode,
        });
      } catch (mailErr) {
        console.error('[layer5-runner] reject email dispatch failed', mailErr);
      }
    })();
  }

  return {
    outcome: 'applied',
    status: 'rejected',
    ticketId: ticket.id,
    sharedPathId: sharedPath.id,
  };
}

// ── shared helpers ────────────────────────────────────────────────────────

interface TicketAndPath {
  ticket: {
    id: string;
    status: string;
    refType: string;
    refId: string;
  };
  sharedPath: {
    id: string;
    sharedById: string;
    title: string;
    moderationStatus: string;
    sharedBy: { email: string | null };
  };
}

/**
 * Single-query gate that both approve + reject reach for. Returns null
 * for any of the "no ticket / no path / wrong ticket type" branches so
 * the caller can collapse them to a uniform `not_found` response.
 */
async function loadTicketAndPath(ticketId: string): Promise<TicketAndPath | null> {
  const ticket = await db.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true, refType: true, refId: true },
  });
  if (!ticket) return null;
  if (ticket.refType !== 'SharedPath') return null;

  const sharedPath = await db.sharedPath.findUnique({
    where: { id: ticket.refId },
    select: {
      id: true,
      sharedById: true,
      title: true,
      moderationStatus: true,
      sharedBy: { select: { email: true } },
    },
  });
  if (!sharedPath) return null;

  return { ticket, sharedPath };
}
