// Gemini-side mirror of `forcedToolCall` (path-generator.ts:150).
//
// Same retry semantics (2 attempts, exponential backoff 1s/2s, onUsage
// invoked per attempt), but uses Gemini's JSON mode (`responseMimeType:
// 'application/json'` + optional `responseSchema`) instead of the GLM/OpenRouter
// forced tool_choice. The returned value is the parsed JSON cast to `T`;
// the caller (`path-generator.ts`) feeds it through the same Zod
// validators used for the GLM/OpenRouter side, so the two paths are
// apples-to-apples downstream.
//
// Path generation (the basic tier runs on Gemini, so this is where the
// path-gen COGS lives) additionally backs the per-path-constant prefix
// (corpus + stage rules) with an explicit Gemini `CachedContent` resource
// via the opt-in `cacheablePrefix`/`dynamicTail` split, so the ~50 calls in
// a run don't re-send it. Caching is strictly best-effort: a sub-threshold
// prefix, a create failure, or a stale cache transparently falls back to
// sending the prefix inline, and `GEMINI_PATH_CACHE_DISABLED=1` turns it off
// entirely. Non-path callers (translation, moderation) pass a flat
// `systemInstruction` and are unaffected.

import type { Content, GenerateContentConfig, Schema } from '@google/genai';
import { getGeminiClient, GEMINI_PATH_MODEL, GEMINI_MAX_OUTPUT_TOKENS } from './gemini';
import {
  getOrCreateCachedPrefix,
  dropCachedPrefix,
  DEFAULT_CACHE_TTL_SECONDS,
} from './gemini-prefix-cache';

export interface GeminiUsage {
  /** Gemini `usageMetadata.promptTokenCount` — total input tokens (includes cached). */
  promptTokens: number;
  /** Gemini `usageMetadata.candidatesTokenCount` — total output tokens. */
  candidatesTokens: number;
  /** Gemini `usageMetadata.cachedContentTokenCount` — tokens served from an
   *  explicit `CachedContent` resource. Populated when the prefix cache below
   *  is in effect; implicit cache hits do not surface a count (the discount is
   *  applied silently), so a low value does not mean caching is broken. */
  cachedTokens: number;
  /**
   * Estimated token count written to explicit CachedContent on this call.
   * Set from the create response's usageMetadata when a new cache entry was
   * just created; 0 on cache-hit calls and inline (uncached) calls.
   */
  cacheWriteTokens: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The explicit context cache for the constant path-prompt prefix now lives in
// the shared `gemini-prefix-cache` module (also used by PDF import). Path
// generation passes `displayName: 'notemage-path-prefix'` and the default TTL.

const CACHE_DISPLAY_NAME = 'notemage-path-prefix';

function joinNonEmpty(parts: string[]): string {
  return parts.filter((p) => p.length > 0).join('\n\n');
}

/**
 * Call Gemini in JSON mode and return the parsed structured output.
 *
 * Retries up to `maxAttempts` times with exponential backoff (1s, 2s, …)
 * on any thrown error (network, parse failure, empty response). Mirrors
 * the retry shape of `forcedToolCall` so the activity-level retry loop
 * in `path-generator.ts` (which adds 3 more attempts with corrective
 * prompts) behaves the same regardless of provider.
 *
 * Two input modes:
 *   - `cacheablePrefix` (+ `dynamicTail`) — path generation. The constant
 *     prefix is backed by an explicit `CachedContent` resource when it clears
 *     the size threshold; otherwise it is sent inline. A failure on a cached
 *     attempt drops the cache and retries inline, so a bad cache never fails a
 *     call.
 *   - `systemInstruction` — flat instruction for non-cached callers
 *     (translation, moderation); behaviour is unchanged.
 *
 * On a successful attempt, calls `onUsage` with the Gemini usage shape;
 * the caller normalizes it into the unified `NormalizedUsage`.
 *
 * Throws after exhausting retries. The caller catches and retries again
 * at the activity level.
 */
export async function forcedStructuredCallGemini<T>(opts: {
  /** Full system instruction for non-cached callers (translation, moderation). */
  systemInstruction?: string;
  /** Opt-in explicit caching (path generation): the per-path-constant prefix
   *  (corpus + stage rules) to back with a `CachedContent` resource. When set,
   *  `systemInstruction` is ignored in favour of this + `dynamicTail`. The
   *  corpus block is the leading text so the prefix is byte-identical across a
   *  run's calls and the cache (or implicit caching) matches. */
  cacheablePrefix?: string;
  /** Per-call dynamic text (slot specifics + retry notices), sent after the
   *  cached prefix. Only used alongside `cacheablePrefix`. */
  dynamicTail?: string;
  /** Optional Gemini `responseSchema`. When omitted, only
   *  `responseMimeType: 'application/json'` is set — Zod still enforces
   *  the shape after the call. */
  responseSchema?: object;
  /** Optional user-turn message. Defaults to "Generate now." */
  userMessage?: string;
  /** Max attempts at the call level. Default 2. */
  maxAttempts?: number;
  /** Override the default Gemini model id. */
  model?: string;
  /** Per-call output-token ceiling. Omit ⇒ GEMINI_MAX_OUTPUT_TOKENS. */
  maxOutputTokens?: number;
  /** Sampling temperature. Undefined ⇒ Gemini default. Path stages pass the
   *  same low per-stage value they pass the GLM path so a Gemini env-pin
   *  produces equally stable structured output. */
  temperature?: number;
  /** Invoked with the token usage of every attempt, retries included. */
  onUsage?: (usage: GeminiUsage) => void;
}): Promise<T> {
  const {
    systemInstruction,
    cacheablePrefix,
    dynamicTail = '',
    responseSchema,
    userMessage = 'Generate now.',
    maxAttempts = 2,
    model = GEMINI_PATH_MODEL,
    maxOutputTokens = GEMINI_MAX_OUTPUT_TOKENS,
    temperature,
    onUsage,
  } = opts;

  const client = getGeminiClient();
  const cachingMode = typeof cacheablePrefix === 'string';

  // Best-effort: back the constant prefix with an explicit cache. Null name
  // means the caller should send the prefix inline (also the flat-instruction
  // path for translation/moderation callers).
  const cacheResult = cachingMode
    ? await getOrCreateCachedPrefix(model, cacheablePrefix as string, {
        displayName: CACHE_DISPLAY_NAME,
        ttlSeconds: DEFAULT_CACHE_TTL_SECONDS,
      })
    : { name: null, writtenTokens: 0 };
  let activeCacheName = cacheResult.name;
  // Track whether we already reported the write cost for this cache entry
  // (only the first create call in this invocation should report it).
  let pendingWriteTokens = cacheResult.writtenTokens;

  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const usedCache = activeCacheName !== null;
    try {
      const config: GenerateContentConfig = {
        maxOutputTokens,
        responseMimeType: 'application/json',
        // Gemini 2.5 Flash enables thinking by default; thinking tokens
        // are billed at the output rate and can easily double the
        // per-call cost. For structured path generation the shape is
        // already enforced by the prompt + Zod post-validation, so the
        // extra reasoning adds little value — disable it.
        thinkingConfig: { thinkingBudget: 0 },
        ...(temperature !== undefined ? { temperature } : {}),
        ...(responseSchema ? { responseSchema: responseSchema as Schema } : {}),
      };

      let contents: Content[];
      if (usedCache) {
        // The constant prefix lives in the cached systemInstruction; send the
        // dynamic tail in the user turn so it stays out of the cached block.
        config.cachedContent = activeCacheName as string;
        contents = [{ role: 'user', parts: [{ text: joinNonEmpty([dynamicTail, userMessage]) }] }];
      } else if (cachingMode) {
        // Cache unavailable — reconstruct the full systemInstruction inline.
        // The dynamic tail goes into the user turn so non-path callers (which
        // pass a flat systemInstruction) are unaffected by this split.
        config.systemInstruction = cacheablePrefix as string;
        contents = [
          { role: 'user', parts: [{ text: joinNonEmpty([dynamicTail, userMessage]) }] },
        ];
      } else {
        config.systemInstruction = systemInstruction ?? '';
        contents = [{ role: 'user', parts: [{ text: userMessage }] }];
      }

      const response = await client.models.generateContent({ model, contents, config });

      const usage = response.usageMetadata;
      const candidatesTokens = usage?.candidatesTokenCount ?? 0;

      // Check for output truncation before inspecting the response text.
      const candidates = response.candidates;
      if (candidates && candidates.length > 0) {
        const finishReason = candidates[0].finishReason;
        if (finishReason === 'MAX_TOKENS') {
          throw new Error(
            `Gemini response was truncated (finishReason: MAX_TOKENS, outputTokens: ${candidatesTokens})`,
          );
        }
      }

      if (usage) {
        onUsage?.({
          promptTokens: usage.promptTokenCount ?? 0,
          candidatesTokens,
          cachedTokens: usage.cachedContentTokenCount ?? 0,
          cacheWriteTokens: pendingWriteTokens,
        });
        // Write cost is reported exactly once per new cache entry.
        pendingWriteTokens = 0;
      }

      const text = response.text;
      if (!text || text.trim().length === 0) {
        throw new Error('Gemini returned an empty response');
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch (parseErr) {
        throw new Error(
          `Gemini response was not valid JSON: ${
            parseErr instanceof Error ? parseErr.message : String(parseErr)
          }`,
        );
      }
      return parsed as T;
    } catch (error) {
      lastError = error;
      // If this attempt used the cache, the cache may be stale/invalid — drop
      // it so the next attempt (and the next call) rebuilds or goes inline.
      if (usedCache) {
        dropCachedPrefix(cacheablePrefix as string, model);
        activeCacheName = null;
        pendingWriteTokens = 0;
      }
      if (attempt < maxAttempts) {
        const delay = 1000 * Math.pow(2, attempt - 1);
        await sleep(delay);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`forcedStructuredCallGemini failed after ${maxAttempts} attempts`);
}
