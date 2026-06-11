// Per-model USD cost rates for path-generation calls + a small helper
// that computes the total USD cost of a run from an aggregated per-model
// usage map.
//
// The UsageMeter in `path-generator.ts` accumulates tokens BY MODEL
// (not just by provider) because Sonnet and Haiku are both 'anthropic'
// but priced very differently — collapsing them to a single
// 'anthropic' bucket would hide the Sonnet upgrade on ultra quizzes.
//
// Prices are USD per 1,000,000 tokens. Validate against published rates
// at deploy time — Anthropic and Google both rotate pricing
// occasionally.

export interface ModelUsage {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export interface CostBreakdown {
  /** Total cost across all models in USD. */
  usd: number;
  /** Per-model cost in USD. Useful for telemetry / debugging. */
  byModel: Record<string, number>;
}

interface RateCard {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

/**
 * Per-1M-token USD rates by model id. Models we don't have rates for
 * silently cost 0 (the telemetry still records token counts so cost can
 * be backfilled).
 */
export const COSTS: Record<string, RateCard> = {
  // cacheWrite is the 1h-TTL rate (2×): Haiku $2/M, Sonnet $6/M.
  // Stage A uses ephemeral (5-min, 1.25×) writes which are slightly
  // overcounted here — the difference is small and the 1h rate is the
  // dominant cost since Stage B fires ~50 calls that actually read the cache.
  'claude-haiku-4-5-20251001': { input: 1.0, output: 5.0, cacheRead: 0.1, cacheWrite: 2.0 },
  'claude-sonnet-4-6': { input: 3.0, output: 15.0, cacheRead: 0.3, cacheWrite: 6.0 },
  // Gemini 2.5 Flash: implicit caching gives a 75% discount on cache hits
  // but doesn't surface a separate write-cost line. Explicit CachedContent
  // writes (used for Stage B path prefix) are also unmetered server-side
  // and reported separately via cacheWriteTokens from the create response.
  'gemini-2.5-flash': { input: 0.3, output: 2.5, cacheRead: 0.075, cacheWrite: 0.075 },
  // Flash-Lite — the cheapest tier; backs theory/flashcards/classify/title/
  // inline/summary. Same explicit-cache caveat as Flash.
  'gemini-2.5-flash-lite': { input: 0.1, output: 0.4, cacheRead: 0.025, cacheWrite: 0.025 },
};

function computeModelCost(usage: ModelUsage): number {
  const rates = COSTS[usage.model];
  if (!rates) return 0;
  return (
    (usage.inputTokens * rates.input +
      usage.outputTokens * rates.output +
      usage.cacheReadTokens * rates.cacheRead +
      usage.cacheWriteTokens * rates.cacheWrite) /
    1_000_000
  );
}

/**
 * USD cost of a single call given its model id + token counts. Used by the
 * per-feature usage telemetry (`logAiUsage`) so any AI surface — not just path
 * generation — reports a comparable cost figure. Unknown models cost 0 (token
 * counts are still logged so cost can be backfilled).
 */
export function costForCall(
  model: string,
  tokens: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  },
): number {
  return computeModelCost({
    model,
    calls: 1,
    inputTokens: tokens.inputTokens,
    outputTokens: tokens.outputTokens,
    cacheReadTokens: tokens.cacheReadTokens ?? 0,
    cacheWriteTokens: tokens.cacheWriteTokens ?? 0,
  });
}

/**
 * Sum the cost of every model in the usage map. The result's `byModel`
 * breakdown lands in telemetry so we can see which model dominates a
 * given run (esp. useful while comparing providers).
 */
export function computeCost(perModel: Record<string, ModelUsage>): CostBreakdown {
  let usd = 0;
  const byModel: Record<string, number> = {};
  for (const [model, usage] of Object.entries(perModel)) {
    const cost = computeModelCost(usage);
    byModel[model] = cost;
    usd += cost;
  }
  return { usd, byModel };
}
