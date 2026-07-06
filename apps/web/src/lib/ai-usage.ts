// Per-feature AI usage + cost telemetry. Extends the path generator's
// UsageMeter/computeCost pattern to EVERY AI surface so the cost-composition
// savings can be proven in prod: each swapped call logs one `ai.model_usage`
// event with the model, token counts, and computed USD cost. Coolify captures
// stdout, so a log query can roll up cost-per-feature before vs after a swap.

import { logTelemetry } from './telemetry-server';
import { costForCall } from './path-generator-cost';
import { db } from './db';
import { invalidateTokenBudgetCache } from './token-budget';
import type { ModelProvider } from './model-routing';
import type { TierKey } from './tiers';

/** Cache hit ratio = cacheRead / (cacheRead + input). 0 when nothing ran. */
export function computeCacheHitRatio(cacheReadTokens: number, inputTokens: number): number {
  const denom = cacheReadTokens + inputTokens;
  return denom > 0 ? cacheReadTokens / denom : 0;
}

export interface AiUsageEvent {
  userId: string | null;
  /** Stable feature key, e.g. 'chat-generate', 'chat-title', 'path-classify', 'doc-summarize'. */
  feature: string;
  tier?: TierKey | null;
  provider: ModelProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Exact USD billed for this call (e.g. OpenRouter's inline `usage.cost`).
   *  When set, overrides the model-id-derived `costForCall` estimate — used for
   *  GLM, where OpenRouter reports the real charged amount per call. */
  costUsd?: number;
  /** Optional extra context (e.g. essay mode, inline action). */
  extra?: Record<string, unknown>;
}

/**
 * Log a single AI call's usage + USD cost. Never throws (telemetry is
 * best-effort). Computes cost from the model id so unknown models still record
 * token counts (cost 0) for later backfill.
 */
export function logAiUsage(event: AiUsageEvent): void {
  // Prefer the exact billed cost when the caller provides it (OpenRouter/GLM);
  // otherwise derive it from the model id + token counts.
  const costUsd =
    event.costUsd ??
    costForCall(event.model, {
      inputTokens: event.inputTokens,
      outputTokens: event.outputTokens,
      cacheReadTokens: event.cacheReadTokens,
      cacheWriteTokens: event.cacheWriteTokens,
    });
  logTelemetry(event.userId, 'ai.model_usage', {
    feature: event.feature,
    tier: event.tier ?? null,
    provider: event.provider,
    model: event.model,
    inTok: event.inputTokens,
    outTok: event.outputTokens,
    cacheTok: event.cacheReadTokens ?? 0,
    costUsd,
    ...event.extra,
  });

  // Persist a row so the admin console can aggregate token spend + cost across
  // every AI surface (not just chat's ChatMessage.tokens). Fire-and-forget:
  // telemetry must never block or throw out of a request/stream path.
  void db.aiUsageEvent
    .create({
      data: {
        userId: event.userId,
        feature: event.feature,
        provider: event.provider,
        model: event.model,
        inputTokens: event.inputTokens,
        outputTokens: event.outputTokens,
        cacheReadTokens: event.cacheReadTokens ?? 0,
        cacheWriteTokens: event.cacheWriteTokens ?? 0,
        costUsd,
      },
    })
    .then(() => invalidateTokenBudgetCache(event.userId))
    .catch(() => {
      /* best-effort — usage analytics must not break the call */
    });
}
