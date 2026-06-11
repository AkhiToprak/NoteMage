// DB-bound runner for Moderation Layer 3 (P5 of the path-publishing plan).
//
// Pure decision logic + prompt assembly lives in `./layer3.ts`. The model
// dispatcher lives in `./model-call.ts`. This file owns:
//
//   1. Loading the SharedPath snapshot via L1's `loadSharedPathSnapshot`
//      (same surface area as L1 + L2 — single source of truth).
//   2. Loading the L2 ModerationAudit row as context for the prompt
//      (per the plan: "Prompt reuses cached rubric block; adds the L2
//      reasoning as context").
//   3. Calling the model via `moderationStructuredCall` with the cached
//      L3_RUBRIC block + per-path payload (which embeds the L2 context).
//   4. Translating the L3Judgement into the canonical state machine
//      transition (`rejected` / `flagged_pending_human`).
//   5. Persisting one `ModerationAudit{layer:3}` row with model + cost +
//      token usage (per AC-Moderate-1 / P0 §7.3 cost gate ≤ $0.05).
//   6. On `escalate_to_human`: creating exactly one `Ticket{type:
//      'moderation_review', refType:'SharedPath', refId, status:'open'}`
//      per AC-Moderate-7. Idempotency: if an open ticket for this path
//      already exists (seeded fixture, prior escalation race), no new
//      ticket is inserted.
//   7. Posting Notification + email on terminal transitions per
//      AC-Moderate-8. On escalate the author was already notified at L2
//      that the path is queued for human review, so no fresh
//      notification fires here — duplicating "we're reviewing" copy is
//      worse UX than staying silent on the L2→L3→queue handoff.
//
// Fail-closed: per AC-Moderate-5 / AC-Moderate-7 any thrown error inside
// the model call or the parser collapses to verdict=escalate_to_human
// with reasoning carrying the failure mode. The path lands on the
// admin queue instead of silently going public or being auto-rejected.
//
// The runner does NOT throw on DB-side failures inside the transaction
// either — it logs and lets the SharedPath sit in `auditing_l3`. A
// background re-judge job (future work) can pick stuck rows up.

import { db } from '@/lib/db';
import { computeCost, type ModelUsage } from '@/lib/path-generator-cost';
import { loadSharedPathSnapshot } from './layer1-runner';
import {
  buildL3PathPayload,
  failClosedL3,
  L3_ANTHROPIC_TOOL,
  L3_GEMINI_SCHEMA,
  L3_RUBRIC,
  parseL3Response,
  projectL3Output,
  type L3Judgement,
  type L3ModelOutput,
} from './layer3';
import {
  moderationStructuredCall,
  type ModerationUsage,
} from './model-call';
import { sendPathRejectedEmail } from './moderation-email';

export interface L3Result {
  /** Post-L3 SharedPath.moderationStatus. */
  status: 'rejected' | 'flagged_pending_human';
  /** Decision projected onto L3Judgement. */
  judgement: L3Judgement;
  /** Total USD cost of this L3 audit — for the P5V cost gate. */
  costUsd: number;
  /** Resolved model id — useful for cost-gate sliced reporting. */
  model: string;
  /** Usage from the last attempt (not aggregated across retries; see usageMeter for the aggregate). */
  usage: ModerationUsage | null;
  /** Set when an `escalate_to_human` opened a new Ticket. Null on a
   *  ticket-already-existed idempotency hit, or on auto_reject. */
  ticketId: string | null;
}

/**
 * Run Layer 3 on a SharedPath that L2 flagged (state = `auditing_l3`).
 * Atomically transitions the row + writes the audit row + opens the
 * Ticket (on escalate) + posts Notification on terminal transitions.
 * Emails fire after the transaction commits — best-effort, never blocks.
 *
 * NOTE: same call shape as `runLayer2` — the L2 runner kicks this off
 * fire-and-forget. It should NEVER throw to its caller; every error
 * path collapses into an escalate-to-human verdict so the state machine
 * progresses. The caller's only obligation is to not await the returned
 * promise blocking the request.
 */
export async function runLayer3(sharedPathId: string): Promise<L3Result> {
  // 1) Load the SharedPath shell first so we have author + title for
  //    notifications + emails regardless of which branch we end up on.
  const sharedPath = await db.sharedPath.findUnique({
    where: { id: sharedPathId },
    select: {
      id: true,
      sharedById: true,
      title: true,
      moderationStatus: true,
      sharedBy: { select: { email: true } },
    },
  });
  if (!sharedPath) {
    // No row to audit — most likely the author unpublished between L2
    // finishing and this fire-and-forget kicking in. Treat as a hard
    // signal so the caller (L2 runner) logs it.
    throw new Error(`SharedPath ${sharedPathId} not found at L3 entry`);
  }

  // Idempotency guard — if a racer already pushed the path past
  // `auditing_l3` (L5 admin override, or a re-judge that re-ran L3),
  // don't redo the work. Returning the already-final status keeps the
  // runner reentrant.
  if (sharedPath.moderationStatus !== 'auditing_l3') {
    return {
      status: (sharedPath.moderationStatus === 'rejected'
        ? 'rejected'
        : 'flagged_pending_human') as L3Result['status'],
      judgement: {
        verdict: 'escalate_to_human',
        reasonCode: 'l3.other',
        reasoning: `[skipped] SharedPath already in state ${sharedPath.moderationStatus}`,
        rejectionReason: null,
        failedClosed: false,
      },
      costUsd: 0,
      model: '',
      usage: null,
      ticketId: null,
    };
  }

  // 2) Load the scannable surface (same as L1 + L2). Reused via the L1
  //    runner so the surface area never drifts between layers.
  const snapshot = await loadSharedPathSnapshot(sharedPathId);

  // 3) Pull the most recent L2 audit row so the prompt can include
  //    what L2 said. L3's distinguishing context is "the cheaper model
  //    was uncertain" — that uncertainty is the L2 reasoning string.
  const l2Audit = await db.moderationAudit.findFirst({
    where: { sharedPathId, layer: 2 },
    orderBy: { createdAt: 'desc' },
    select: { reasonCode: true, reasoning: true },
  });

  // 4) Build the per-path payload (variable part of the prompt). The
  //    rubric stays as the cached leading block.
  const payload = buildL3PathPayload({
    language: snapshot.language,
    fields: snapshot.fields,
    l2Context: {
      reasonCode: l2Audit?.reasonCode ?? null,
      reasoning: l2Audit?.reasoning ?? null,
    },
  });

  // 5) Call the model. Accumulate usage so the cost-row write below
  //    captures every attempt's tokens (retries included).
  const usageMeter: Record<string, ModelUsage> = {};
  let lastUsage: ModerationUsage | null = null;
  let modelId = '';

  let judgement: L3Judgement;
  try {
    const { result, model } = await moderationStructuredCall<L3ModelOutput>({
      layer: 'l3',
      rubric: L3_RUBRIC,
      payload,
      anthropicTool: L3_ANTHROPIC_TOOL,
      geminiSchema: L3_GEMINI_SCHEMA,
      onUsage: (u) => {
        lastUsage = u;
        modelId = u.model;
        const slot = usageMeter[u.model] ?? {
          model: u.model,
          calls: 0,
          inputTokens: 0,
          outputTokens: 0,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        };
        slot.calls += 1;
        slot.inputTokens += u.inputTokens;
        slot.outputTokens += u.outputTokens;
        slot.cacheReadTokens += u.cacheReadTokens;
        slot.cacheWriteTokens += u.cacheWriteTokens;
        usageMeter[u.model] = slot;
      },
    });
    modelId = model;

    // 6) Parse + project. Either throw → fail-closed below.
    const parsed = parseL3Response(result);
    judgement = projectL3Output(parsed);
  } catch (err) {
    // Fail-closed branch — model error, timeout, or parser throw.
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[layer3-runner] failing closed for ${sharedPathId}: ${reason}`);
    judgement = failClosedL3(reason);
  }

  // 7) Compute cost from accumulated usage. Empty meter → 0 USD (a
  //    failed first attempt that never got a usage callback still
  //    produces a valid audit row with cost=0).
  const cost = computeCost(usageMeter);
  const aggregateUsage = aggregateMeter(usageMeter);

  // 8) Apply the state transition + write the audit row + open the
  //    Ticket (on escalate) in one transaction. Email goes out
  //    post-commit so a flaky SMTP doesn't roll back the state machine.
  const targetStatus = statusFor(judgement.verdict);
  let createdTicketId: string | null = null;
  try {
    await db.$transaction(async (tx) => {
      // 8a) State transition — gate on the current status so we don't
      // overwrite a concurrent L5 manual override.
      const updated = await tx.sharedPath.updateMany({
        where: { id: sharedPathId, moderationStatus: 'auditing_l3' },
        data: {
          moderationStatus: targetStatus,
          // rejectionReason captured on terminal reject so the author
          // UI has something to surface immediately.
          ...(targetStatus === 'rejected'
            ? { rejectionReason: judgement.rejectionReason }
            : {}),
        },
      });
      // If the state had already moved (count 0), don't write a stale
      // audit row that would misrepresent the chain.
      if (updated.count === 0) return;

      // 8b) Audit row — always written with the resolved model + cost.
      await tx.moderationAudit.create({
        data: {
          sharedPathId,
          layer: 3,
          verdict: judgement.verdict,
          reasonCode: judgement.reasonCode,
          reasoning: judgement.reasoning,
          model: modelId || null,
          costUsd: cost.usd,
          tokensIn: aggregateUsage?.inputTokens ?? 0,
          tokensOut: aggregateUsage?.outputTokens ?? 0,
          cacheReadTokens: aggregateUsage?.cacheReadTokens ?? 0,
          cacheWriteTokens: aggregateUsage?.cacheWriteTokens ?? 0,
        },
      });

      // 8c) On escalate — open a Ticket. AC-Moderate-7 invariant:
      // *exactly one* open ticket per (refType, refId). P0 decision
      // was code-side check (not a partial unique index) — so we look
      // for an existing open ticket first and only insert if absent.
      // The outer `updated.count === 0` short-circuit already prevents
      // most races; the in-transaction findFirst tightens it further.
      if (judgement.verdict === 'escalate_to_human') {
        const existingOpen = await tx.ticket.findFirst({
          where: {
            refType: 'SharedPath',
            refId: sharedPathId,
            status: 'open',
          },
          select: { id: true },
        });
        if (!existingOpen) {
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
      }

      // 8d) Notification — only on auto_reject (terminal). On
      // escalate the author has already received `path_flagged_for_
      // review` at L2; re-notifying with the same copy would be noise.
      // AC-Moderate-8 is satisfied by the L2 notification covering the
      // entire "queued for human review" window.
      if (judgement.verdict === 'auto_reject') {
        await tx.notification.create({
          data: {
            userId: sharedPath.sharedById,
            type: 'path_rejected',
            data: {
              shareId: sharedPathId,
              title: sharedPath.title,
              reasonCode: judgement.reasonCode,
              layer: 3,
            },
          },
        });
      }
    });
  } catch (txErr) {
    // DB failure mid-transition — log and bail. The SharedPath sits in
    // `auditing_l3` and a future re-judge job will pick it up.
    console.error(`[layer3-runner] transaction failed for ${sharedPathId}`, txErr);
    return {
      status: 'flagged_pending_human', // best-effort hint; real status unchanged
      judgement,
      costUsd: cost.usd,
      model: modelId,
      usage: lastUsage,
      ticketId: null,
    };
  }

  // 9) Post-commit email — best-effort, only on auto_reject. The
  //    escalate path already emailed at L2 (sendPathFlaggedEmail);
  //    re-emailing here would duplicate. Never await inside the
  //    transaction (a stuck SMTP would lock state writes).
  if (judgement.verdict === 'auto_reject') {
    const to = sharedPath.sharedBy.email;
    if (to) {
      const title = sharedPath.title;
      void (async () => {
        try {
          await sendPathRejectedEmail({
            to,
            title,
            shareId: sharedPathId,
            reasonCode: judgement.reasonCode,
          });
        } catch (mailErr) {
          console.error('[layer3-runner] email dispatch failed', mailErr);
        }
      })();
    }
  }

  return {
    status: targetStatus,
    judgement,
    costUsd: cost.usd,
    model: modelId,
    usage: lastUsage,
    ticketId: createdTicketId,
  };
}

function statusFor(verdict: L3Judgement['verdict']): L3Result['status'] {
  switch (verdict) {
    case 'auto_reject':
      return 'rejected';
    case 'escalate_to_human':
      return 'flagged_pending_human';
  }
}

function aggregateMeter(meter: Record<string, ModelUsage>): {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
} | null {
  const total = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  };
  let any = false;
  for (const u of Object.values(meter)) {
    any = true;
    total.inputTokens += u.inputTokens;
    total.outputTokens += u.outputTokens;
    total.cacheReadTokens += u.cacheReadTokens;
    total.cacheWriteTokens += u.cacheWriteTokens;
  }
  return any ? total : null;
}
