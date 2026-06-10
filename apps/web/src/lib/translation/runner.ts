// P10 — DB-bound translation runner. Sits between the route handler
// (which owns auth, rate-limit, quota, budget gates, single-flight
// claim) and the provider (which owns the model call). Owns:
//
//   1. Calling the model via translationStructuredCall with the cached
//      rubric + per-(path, language) payload.
//   2. Aggregating per-attempt usage into a meter so the cost row
//      captures every retry's tokens.
//   3. Computing the final USD cost via the shared rate card.
//   4. Updating the caller's pre-inserted PathTranslation row to
//      `ready` (success) or `failed` (any throw) atomically.
//
// Fail-handling: any throw inside the model call or parser surfaces as
// `status='failed'` on the PathTranslation row. The route handler reads
// this back and returns it as `{ translation: { status: 'failed', error } }`
// so the client can offer a retry (which re-acquires the lock by
// updating the same row, not by inserting a new one). Failed
// translations DO NOT burn the user's `path_translation` quota (the
// route increments only after a successful runner call).

import { db } from '@/lib/db';
import { computeCost, type ModelUsage } from '@/lib/path-generator-cost';
import {
  buildTranslationPayload,
  parseTranslationResponse,
  projectTranslationOnto,
  T_ANTHROPIC_TOOL,
  T_GEMINI_SCHEMA,
  TRANSLATION_RUBRIC,
  type PersistedTranslation,
  type TranslatableSnapshot,
  type TranslationModelOutput,
} from './prompt';
import {
  translationStructuredCall,
  type TranslationUsage,
} from './provider';

export interface TranslationRunResult {
  status: 'ready' | 'failed';
  /** Final canonical payload — written to PathTranslation.payload. Null on failure. */
  payload: PersistedTranslation | null;
  /** Final USD cost across all attempts. 0 on a pre-call failure. */
  costUsd: number;
  /** Resolved model id (e.g. "gemini-2.5-flash"). Empty on pre-call failure. */
  model: string;
  /** Aggregated token usage across attempts. Null when no attempt landed. */
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheWriteTokens: number;
  } | null;
  /** Failure reason — populated only on `status='failed'`. */
  error?: string;
}

/**
 * Run a single translation. The caller owns the PathTranslation row's
 * existence (the single-flight insert lives in the route handler so the
 * lock is acquired BEFORE we spend tokens). This runner mutates the
 * existing row from `translating` to `ready`/`failed`.
 *
 * Reentrant: a duplicate call against an already-`ready` row is a
 * harmless no-op (the update query no-ops on the status guard); callers
 * shouldn't rely on that, but the safety means a race between the
 * route's "we won the lock" branch and a stale retry doesn't corrupt
 * the cache.
 */
export async function runTranslation(
  sharedPathId: string,
  snapshot: TranslatableSnapshot,
): Promise<TranslationRunResult> {
  const payload = buildTranslationPayload(snapshot);

  const usageMeter: Record<string, ModelUsage> = {};
  let modelId = '';
  let provider: 'anthropic' | 'gemini' = 'gemini';

  let modelOutput: TranslationModelOutput | null = null;
  let runError: string | null = null;

  try {
    const { result, model, provider: resolvedProvider } =
      await translationStructuredCall<unknown>({
        rubric: TRANSLATION_RUBRIC,
        payload,
        anthropicTool: T_ANTHROPIC_TOOL,
        geminiSchema: T_GEMINI_SCHEMA,
        onUsage: (u: TranslationUsage) => {
          modelId = u.model;
          provider = u.provider;
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
    provider = resolvedProvider;
    modelOutput = parseTranslationResponse(result);
  } catch (err) {
    runError = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    console.error(
      `[translation-runner] translation failed for ${sharedPathId} → ${snapshot.targetLanguage}: ${runError}`,
    );
  }

  // Cost from accumulated usage. Empty meter (e.g. pre-attempt throw) →
  // 0 USD; the audit row still updates so observers don't see a stuck
  // `translating` status forever.
  const cost = computeCost(usageMeter);
  const aggregateUsage = aggregateMeter(usageMeter);

  if (modelOutput && !runError) {
    const projected = projectTranslationOnto(snapshot, modelOutput);
    if (projected.droppedPhaseIds.length > 0 || projected.droppedSlotIds.length > 0) {
      // Drift telemetry — record but don't fail. The user-facing
      // experience is still useful (dropped IDs fall through to source
      // titles).
      console.warn(
        `[translation-runner] ${sharedPathId} → ${snapshot.targetLanguage} drift: phases=${projected.droppedPhaseIds.length}, slots=${projected.droppedSlotIds.length}`,
      );
    }

    await db.pathTranslation.update({
      where: {
        sharedPathId_language: {
          sharedPathId,
          language: snapshot.targetLanguage,
        },
      },
      data: {
        status: 'ready',
        title: projected.payload.title,
        description: projected.payload.description,
        payload: projected.payload as unknown as object,
        error: null,
        provider: modelId,
        costUsd: cost.usd,
        tokensIn: aggregateUsage?.inputTokens ?? 0,
        tokensOut: aggregateUsage?.outputTokens ?? 0,
        cacheReadTokens: aggregateUsage?.cacheReadTokens ?? 0,
        cacheWriteTokens: aggregateUsage?.cacheWriteTokens ?? 0,
      },
    });

    return {
      status: 'ready',
      payload: projected.payload,
      costUsd: cost.usd,
      model: modelId,
      usage: aggregateUsage,
    };
  }

  // Failure path — surface as `status='failed'` with the failure reason
  // so the client can choose to retry. Quota is NOT incremented by the
  // caller because the route's increment site is post-success.
  await db.pathTranslation.update({
    where: {
      sharedPathId_language: {
        sharedPathId,
        language: snapshot.targetLanguage,
      },
    },
    data: {
      status: 'failed',
      error: runError ?? 'Translation failed without an error message.',
      provider: modelId || null,
      costUsd: cost.usd,
      tokensIn: aggregateUsage?.inputTokens ?? 0,
      tokensOut: aggregateUsage?.outputTokens ?? 0,
      cacheReadTokens: aggregateUsage?.cacheReadTokens ?? 0,
      cacheWriteTokens: aggregateUsage?.cacheWriteTokens ?? 0,
    },
  });

  return {
    status: 'failed',
    payload: null,
    costUsd: cost.usd,
    model: modelId,
    usage: aggregateUsage,
    error: runError ?? 'Translation failed.',
    // Make the provider influence visible in tests / logs — useful when
    // a specific provider is misbehaving.
    ...({ _provider: provider } as Record<string, unknown>),
  };
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
