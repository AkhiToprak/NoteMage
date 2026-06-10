// DB-bound runner for Moderation Layer 4 (P13 — post-publish reports).
//
// Pure helpers (reason taxonomy, thresholds, breakdown composer) live in
// `./layer4.ts`. This file owns the one DB-bound action of the report
// flow: aggregating open reports and, when they cross the threshold,
// pulling an approved path back into the human queue for re-moderation.
//
//   1. Gate: the path must still exist, be `approved`, and NOT be
//      `seeded`. Seeded/curated paths are brigade-proof — their report
//      rows accumulate for forensics but never auto-takedown.
//   2. Count distinct OPEN reports (one report per user via the unique
//      constraint, so count == distinct reporters). Below threshold →
//      no-op.
//   3. Atomic transition `approved → flagged_pending_human` via a
//      status-gated `updateMany` (only one concurrent report wins the
//      crossing; the rest see count=0 and skip), plus the `layer:4`
//      audit row, exactly-one `moderation_review` Ticket (same
//      findFirst idempotency as L3), and a `path_flagged_for_review`
//      Notification. The existing P7 L5 flow is the terminal.
//
// Trust is intentionally NOT mutated here: a community report is an
// un-authoritative signal, so a brigade of false reports must not tank an
// innocent author's score. The trust adjustment happens only at the human
// outcome — see layer5-runner.ts (approve +1, reject -penalty).
//
// Pure DB — no model client imported, so the report path costs zero AI.
// The runner never throws to its caller (the report route calls it inline
// after writing the report); every failure path returns a structured
// outcome or is swallowed with a log, so a flaky aggregation can't 500 a
// successful report submission.

import { db } from '@/lib/db';
import {
  composeReportBreakdown,
  L4_REPORTS_REASON_CODE,
  reportRemoderationThreshold,
} from './layer4';

export type ReportAggregationOutcome =
  /** Crossed the threshold — path pulled to the human queue. */
  | 'remoderation_triggered'
  /** Open-report count is still below the threshold — nothing to do. */
  | 'below_threshold'
  /** Path isn't `approved` (already under review / down / never approved). */
  | 'skipped_not_approved'
  /** Seeded/curated path — exempt from auto-takedown. */
  | 'skipped_seeded'
  /** SharedPath row is gone (deleted between report write and aggregation). */
  | 'not_found'
  /** Lost the status-gated race (a concurrent report won the transition). */
  | 'race_lost';

export interface ReportAggregationResult {
  outcome: ReportAggregationOutcome;
  /** Distinct open-report count observed (0 on not_found). */
  openReports: number;
  /** Ticket opened by this run, or the existing open ticket's id when one
   *  already covered the path. Null on every non-triggering outcome. */
  ticketId: string | null;
}

/**
 * Aggregate open reports for a SharedPath and, if they cross the
 * threshold, re-moderate it (pull to the human queue). Idempotent and
 * race-safe — calling it again after a crossing is a no-op because the
 * status gate only matches an `approved` row.
 */
export async function runReportAggregation(
  sharedPathId: string,
): Promise<ReportAggregationResult> {
  // 1) Load the shell — author + title + status + seeded flag for the
  //    gate and the downstream notification/ticket.
  const sharedPath = await db.sharedPath.findUnique({
    where: { id: sharedPathId },
    select: {
      id: true,
      sharedById: true,
      title: true,
      moderationStatus: true,
      seeded: true,
    },
  });
  if (!sharedPath) {
    return { outcome: 'not_found', openReports: 0, ticketId: null };
  }

  // 2) Only an approved, non-seeded path can be auto-pulled. A path
  //    already in `flagged_pending_human` / `rejected` / mid-pipeline
  //    needs no action; seeded content is exempt by policy.
  if (sharedPath.moderationStatus !== 'approved') {
    return { outcome: 'skipped_not_approved', openReports: 0, ticketId: null };
  }
  if (sharedPath.seeded) {
    return { outcome: 'skipped_seeded', openReports: 0, ticketId: null };
  }

  // 3) Count distinct open reports. The (sharedPathId, reporterId)
  //    unique constraint means one row per reporter, so the row count is
  //    the distinct-reporter count.
  const openReports = await db.report.count({
    where: { sharedPathId, status: 'open' },
  });
  const threshold = reportRemoderationThreshold();
  if (openReports < threshold) {
    return { outcome: 'below_threshold', openReports, ticketId: null };
  }

  // 4) Crossed the threshold. Pull the open reasons for the audit
  //    breakdown the admin reads on the ticket.
  const openRows = await db.report.findMany({
    where: { sharedPathId, status: 'open' },
    select: { reason: true },
  });
  const breakdown = composeReportBreakdown(openRows.map((r) => r.reason));

  // 5) Atomic re-moderation. The status-gated updateMany is the race
  //    guard: two reports crossing the threshold in the same microtask
  //    both reach here, but only the first flips `approved →
  //    flagged_pending_human` (count=1); the second sees count=0 and
  //    skips the audit/ticket/notification so we don't double-flag.
  let createdTicketId: string | null = null;
  let raceLost = false;
  try {
    await db.$transaction(async (tx) => {
      const updated = await tx.sharedPath.updateMany({
        where: { id: { equals: sharedPathId }, moderationStatus: 'approved' },
        data: { moderationStatus: 'flagged_pending_human' },
      });
      if (updated.count === 0) {
        raceLost = true;
        return;
      }

      await tx.moderationAudit.create({
        data: {
          sharedPathId,
          layer: 4,
          verdict: 'flag',
          reasonCode: L4_REPORTS_REASON_CODE,
          reasoning: breakdown,
          // No model, no cost — L4 report aggregation is pure DB.
        },
      });

      // Exactly one open ticket per (refType, refId) — same invariant as
      // L3 escalation (AC-Moderate-7). A path could already carry an
      // open ticket from a prior L3 escalation that an admin hasn't
      // closed; reuse it rather than stacking a duplicate.
      const existingOpen = await tx.ticket.findFirst({
        where: { refType: 'SharedPath', refId: sharedPathId, status: 'open' },
        select: { id: true },
      });
      if (existingOpen) {
        createdTicketId = existingOpen.id;
      } else {
        const ticket = await tx.ticket.create({
          data: {
            type: 'moderation_review',
            refType: 'SharedPath',
            refId: sharedPathId,
            status: 'open',
          },
          select: { id: true },
        });
        createdTicketId = ticket.id;
      }

      // Tell the author their path is back under review. Reuse
      // `path_flagged_for_review` — the author doesn't need to know it
      // was reported (avoids inviting retaliation), just that it's
      // queued. layer:4 distinguishes it in the data payload.
      await tx.notification.create({
        data: {
          userId: sharedPath.sharedById,
          type: 'path_flagged_for_review',
          data: {
            shareId: sharedPathId,
            title: sharedPath.title,
            layer: 4,
          },
        },
      });
    });
  } catch (txErr) {
    // DB failure mid-transition — log and report a no-op-ish outcome. The
    // path stays `approved`; a later report (or an admin) re-triggers.
    // We deliberately do NOT throw: the user's report already committed
    // and shouldn't 500 because the aggregation hiccuped.
    console.error(
      `[layer4-runner] report aggregation transaction failed for ${sharedPathId}`,
      txErr,
    );
    return { outcome: 'below_threshold', openReports, ticketId: null };
  }

  if (raceLost) {
    return { outcome: 'race_lost', openReports, ticketId: null };
  }

  return {
    outcome: 'remoderation_triggered',
    openReports,
    ticketId: createdTicketId,
  };
}
