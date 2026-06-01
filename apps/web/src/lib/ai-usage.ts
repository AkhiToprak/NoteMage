// Per-feature AI usage + cost telemetry. Extends the path generator's
// UsageMeter/computeCost pattern to EVERY AI surface so the cost-composition
// savings can be proven in prod: each swapped call logs one `ai.model_usage`
// event with the model, token counts, and computed USD cost. Coolify captures
// stdout, so a log query can roll up cost-per-feature before vs after a swap.

import { logTelemetry } from './telemetry-server';
import { costForCall } from './path-generator-cost';
import type { ModelProvider } from './model-routing';
import type { TierKey } from './tiers';

export interface AiUsageEvent {
  userId: string | null;
  /** Stable feature key, e.g. 'essay', 'chat-title', 'path-classify', 'inline-rewrite'. */
  feature: string;
  tier?: TierKey | null;
  provider: ModelProvider;
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  /** Optional extra context (e.g. essay mode, inline action). */
  extra?: Record<string, unknown>;
}

/**
 * Log a single AI call's usage + USD cost. Never throws (telemetry is
 * best-effort). Computes cost from the model id so unknown models still record
 * token counts (cost 0) for later backfill.
 */
export function logAiUsage(event: AiUsageEvent): void {
  const costUsd = costForCall(event.model, {
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
}
