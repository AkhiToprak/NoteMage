// DB-bound runner for Moderation Layer 2 (P4 of the path-publishing plan).
//
// Pure decision logic + prompt assembly lives in `./layer2.ts`. The model
// dispatcher lives in `./model-call.ts`. This file owns:
//
//   1. Loading the SharedPath snapshot via L1's `loadSharedPathSnapshot`
//      (single source of truth — we want L1 and L2 to scan the same
//      surface area).
//   2. Calling the model via `moderationStructuredCall` with the cached
//      rubric block + per-path payload.
//   3. Translating the L2Judgement into the canonical state machine
//      transition (`approved` / `rejected` / `auditing_l3`).
//   4. Persisting one `ModerationAudit{layer:2}` row with model + cost +
//      token usage (per AC-Moderate-1 / P0 §7.2 cost gate).
//   5. Posting Notification + email per AC-Moderate-8.
//
// Fail-closed: per AC-Moderate-5, any thrown error inside the model call
// or the parser collapses to verdict=flag with reasoning carrying the
// failure mode. The path lands in `auditing_l3` so L3 (and ultimately
// the human queue) sees it instead of silently approving.
//
// The runner does NOT throw on DB-side failures inside the transaction
// either — it logs and lets the SharedPath sit in `auditing_l2`. A
// background re-judge job (future work) can pick stuck rows up.

import { db } from '@/lib/db';
import { computeCost, type ModelUsage } from '@/lib/path-generator-cost';
import { loadSharedPathSnapshot } from './layer1-runner';
import {
  buildL2PathPayload,
  failClosedL2,
  L2_ANTHROPIC_TOOL,
  L2_GEMINI_SCHEMA,
  L2_RUBRIC,
  parseL2Response,
  projectL2Output,
  type L2Judgement,
  type L2ModelOutput,
} from './layer2';
import { runLayer3 } from './layer3-runner';
import { applyTrustGate, L4_UNTRUSTED_REASON_CODE } from './layer4';
import {
  moderationStructuredCall,
  type ModerationUsage,
} from './model-call';
import {
  sendPathApprovedEmail,
  sendPathFlaggedEmail,
  sendPathRejectedEmail,
} from './moderation-email';

export interface L2Result {
  /** Post-L2 SharedPath.moderationStatus. */
  status: 'approved' | 'rejected' | 'auditing_l3';
  /** Decision projected onto L2Judgement. */
  judgement: L2Judgement;
  /** Total USD cost of this L2 audit — for the P4V cost gate. */
  costUsd: number;
  /** Resolved model id — useful for cost-gate sliced reporting. */
  model: string;
  /** Accumulated normalised usage across all attempts. */
  usage: ModerationUsage | null;
}

/**
 * Run Layer 2 on a SharedPath that has already passed L1 (state =
 * `auditing_l2`). Atomically transitions the row + writes the audit
 * row + posts Notification on terminal transitions. Emails fire after
 * the transaction commits — best-effort, never blocks.
 *
 * NOTE: this is the function the publish endpoint calls fire-and-forget.
 * It should NEVER throw to its caller — every error path collapses into
 * a flag verdict so the state machine progresses. The caller's only
 * obligation is to not await the returned promise blocking the request.
 */
export async function runLayer2(sharedPathId: string): Promise<L2Result> {
  // 1) Load the SharedPath shell first so we have author + title for
  //    notifications + emails regardless of which branch we end up on.
  const sharedPath = await db.sharedPath.findUnique({
    where: { id: sharedPathId },
    select: {
      id: true,
      sharedById: true,
      title: true,
      moderationStatus: true,
      // P13 trust gate — need the author's role (admins bypass) and
      // current trust score in the same query, no extra round trip.
      sharedBy: { select: { email: true, role: true, publishTrustScore: true } },
    },
  });
  if (!sharedPath) {
    // No row to audit — most likely the author unpublished between
    // L1 finishing and the L2 fire-and-forget kicking in. Treat as
    // a quiet no-op; nothing to write.
    throw new Error(`SharedPath ${sharedPathId} not found at L2 entry`);
  }

  // Idempotency guard — if a racer already pushed the path past
  // `auditing_l2` (rejected by L1 in a re-judge, or admin manual
  // override), don't redo the work. Returning the already-final
  // status keeps the runner reentrant.
  if (sharedPath.moderationStatus !== 'auditing_l2') {
    return {
      status: sharedPath.moderationStatus as L2Result['status'],
      judgement: {
        verdict: 'pass',
        reasonCode: null,
        reasoning: `[skipped] SharedPath already in state ${sharedPath.moderationStatus}`,
        rejectionReason: null,
        failedClosed: false,
      },
      costUsd: 0,
      model: '',
      usage: null,
    };
  }

  // 2) Load the scannable surface (same as L1). Reused via the L1
  //    runner so the surface area never drifts between layers.
  const snapshot = await loadSharedPathSnapshot(sharedPathId);

  // 3) Build the per-path payload (variable part of the prompt). The
  //    rubric stays as the cached leading block.
  const payload = buildL2PathPayload(snapshot);

  // 4) Call the model. Accumulate usage so the cost-row write below
  //    captures every attempt's tokens (retries included).
  const usageMeter: Record<string, ModelUsage> = {};
  let lastUsage: ModerationUsage | null = null;
  let modelId = '';

  let judgement: L2Judgement;
  try {
    const { result, model } = await moderationStructuredCall<L2ModelOutput>({
      layer: 'l2',
      rubric: L2_RUBRIC,
      payload,
      anthropicTool: L2_ANTHROPIC_TOOL,
      geminiSchema: L2_GEMINI_SCHEMA,
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

    // 5) Parse + project. Either throw → fail-closed below.
    const parsed = parseL2Response(result);
    judgement = projectL2Output(parsed);
  } catch (err) {
    // Fail-closed branch — model error, timeout, or parser throw.
    const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(`[layer2-runner] failing closed for ${sharedPathId}: ${reason}`);
    judgement = failClosedL2(reason);
  }

  // 6) Compute cost from accumulated usage. Empty meter → 0 USD,
  //    which is fine: a failed first attempt that never got a usage
  //    callback still produces a valid audit row with cost=0.
  const cost = computeCost(usageMeter);
  const aggregateUsage = aggregateMeter(usageMeter);

  // 6.5) P13 trust gate — a clean `pass` by an untrusted, non-admin
  //      author is downgraded to `flag` so the deep L3 audit (and
  //      ultimately a human) sees a new author's first publications.
  //      `effective` drives the state machine / notification / email;
  //      the original `judgement` still backs the genuine L2 audit row
  //      (the content WAS clean and that's worth recording honestly).
  const gate = applyTrustGate(judgement, {
    score: sharedPath.sharedBy.publishTrustScore,
    role: sharedPath.sharedBy.role,
  });
  const effective = gate.judgement;

  // 7) Apply the state transition + write the audit row(s) + post the
  //    notification in one transaction. Email goes out post-commit so
  //    a flaky SMTP doesn't roll back the state machine.
  const targetStatus = statusFor(effective.verdict);
  try {
    await db.$transaction(async (tx) => {
      // 7a) State transition — gate on the current status so we don't
      // overwrite a concurrent L5 manual override.
      const updated = await tx.sharedPath.updateMany({
        where: { id: sharedPathId, moderationStatus: 'auditing_l2' },
        data: {
          moderationStatus: targetStatus,
          // approvedAt is set only on `approved`. AC-Publish-5 + P0 §3.1.
          ...(targetStatus === 'approved' ? { approvedAt: new Date() } : {}),
          // rejectionReason captured on terminal reject so the author UI
          // has something to surface immediately.
          ...(targetStatus === 'rejected'
            ? { rejectionReason: effective.rejectionReason }
            : {}),
        },
      });
      // If the state had already moved (count 0), don't write a stale
      // audit row that would misrepresent the chain.
      if (updated.count === 0) return;

      // 7b) Genuine L2 audit row — always the ORIGINAL verdict + the
      // resolved model + cost. When the trust gate downgraded a pass,
      // this row still records "L2 said pass" so the chain reads
      // honestly (content clean, author new → deeper look).
      await tx.moderationAudit.create({
        data: {
          sharedPathId,
          layer: 2,
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

      // 7b-ii) P13 trust downgrade — append the layer:4 row that records
      // WHY a clean path is being routed to L3 (the author is too new).
      // Zero cost: this isn't a model decision, it's the trust rule.
      if (gate.trustGated) {
        await tx.moderationAudit.create({
          data: {
            sharedPathId,
            layer: 4,
            verdict: 'flag',
            reasonCode: L4_UNTRUSTED_REASON_CODE,
            reasoning: effective.reasoning,
          },
        });
      }

      // 7c) P13 trust reward — a genuine approval bumps the author's
      // publish trust toward the autoflag threshold. Only fires on a
      // real `approved` transition; an untrusted pass was downgraded to
      // `auditing_l3` above so it never reaches here.
      if (targetStatus === 'approved') {
        await tx.user.update({
          where: { id: sharedPath.sharedById },
          data: { publishTrustScore: { increment: 1 } },
        });
      }

      // 7d) Notification — per AC-Moderate-8 every terminal transition
      // (including flag→human-queue) gets one. Uses the EFFECTIVE verdict
      // so a trust-downgraded path notifies "queued for review", and
      // tags layer:4 so the source of the flag is traceable.
      await tx.notification.create({
        data: {
          userId: sharedPath.sharedById,
          type: notificationTypeFor(effective.verdict),
          data: {
            shareId: sharedPathId,
            title: sharedPath.title,
            ...(effective.reasonCode ? { reasonCode: effective.reasonCode } : {}),
            layer: gate.trustGated ? 4 : 2,
          },
        },
      });
    });
  } catch (txErr) {
    // DB failure mid-transition — log and bail. The SharedPath sits in
    // `auditing_l2` and a future re-judge job will pick it up.
    console.error(`[layer2-runner] transaction failed for ${sharedPathId}`, txErr);
    return {
      status: 'auditing_l3', // best-effort hint; real status unchanged
      judgement: effective,
      costUsd: cost.usd,
      model: modelId,
      usage: lastUsage,
    };
  }

  // 8) Post-commit email — best-effort. Branches on the EFFECTIVE verdict
  //    so a trust-downgraded pass sends the "queued for review" email,
  //    not the approval one. Never await inside the transaction.
  const to = sharedPath.sharedBy.email;
  if (to) {
    const title = sharedPath.title;
    // Fire-and-forget; errors are logged inside each helper.
    void (async () => {
      try {
        if (effective.verdict === 'pass') {
          await sendPathApprovedEmail({ to, title, shareId: sharedPathId });
        } else if (effective.verdict === 'reject') {
          await sendPathRejectedEmail({
            to,
            title,
            shareId: sharedPathId,
            reasonCode: effective.reasonCode,
          });
        } else {
          await sendPathFlaggedEmail({ to, title, shareId: sharedPathId });
        }
      } catch (mailErr) {
        console.error('[layer2-runner] email dispatch failed', mailErr);
      }
    })();
  }

  // 9) Fire-and-forget L3 on `flag` — including a trust-downgraded pass,
  //    which is the whole point of the gate (new authors get the deep
  //    audit). State is now `auditing_l3`; runLayer3 moves it to
  //    `rejected` (auto_reject) or `flagged_pending_human` (escalate,
  //    ticket opened). Reentrant + idempotent. Same async pattern as
  //    publish→L2 in `app/api/learn/paths/[planId]/publish/route.ts`.
  if (targetStatus === 'auditing_l3') {
    void runLayer3(sharedPathId).catch((l3Err) => {
      console.error('[layer2-runner] L3 background run failed', l3Err);
    });
  }

  return {
    status: targetStatus,
    judgement: effective,
    costUsd: cost.usd,
    model: modelId,
    usage: lastUsage,
  };
}

function statusFor(verdict: L2Judgement['verdict']): L2Result['status'] {
  switch (verdict) {
    case 'pass':
      return 'approved';
    case 'reject':
      return 'rejected';
    case 'flag':
      return 'auditing_l3';
  }
}

function notificationTypeFor(verdict: L2Judgement['verdict']): string {
  switch (verdict) {
    case 'pass':
      return 'path_published';
    case 'reject':
      return 'path_rejected';
    case 'flag':
      return 'path_flagged_for_review';
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
