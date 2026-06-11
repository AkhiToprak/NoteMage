// Gemini-side mirror of `forcedToolCall` (path-generator.ts:150).
//
// Same retry semantics (2 attempts, exponential backoff 1s/2s, onUsage
// invoked per attempt), but uses Gemini's JSON mode (`responseMimeType:
// 'application/json'` + optional `responseSchema`) instead of Anthropic's
// forced tool_choice. The returned value is the parsed JSON cast to `T`;
// the caller (`path-generator.ts`) feeds it through the same Zod
// validators used for the Anthropic side, so the two paths are
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
import { createHash } from 'node:crypto';
import { getGeminiClient, GEMINI_PATH_MODEL, GEMINI_MAX_OUTPUT_TOKENS } from './gemini';

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

// ── Explicit context cache for the constant path-prompt prefix ──────────
//
// Gemini 2.5 Flash applies a billing discount on an explicit `CachedContent`
// resource. We create one per distinct (corpus + stage-rules) prefix, keyed
// by hash, and reuse it across that stage's calls in a run (and, for
// title-only paths whose prefix is identical across users, across runs). The
// registry is process-local; a short TTL plus lazy pruning keep both it and
// Google-side storage small. Everything here is best-effort and never throws
// — `getOrCreateCachedPrefix` returns null whenever the caller should just
// send the prefix inline.

const CACHE_TTL_SECONDS = 1800; // 30 min — ultra runs can exceed 15 min
const CACHE_MIN_PREFIX_CHARS = 4096; // ~1024 tokens, Gemini 2.5 Flash's min cacheable size
const CACHE_EXPIRY_BUFFER_MS = 30_000; // stop using an entry 30s before its TTL ends
const CACHE_FAILURE_COOLDOWN_MS = 120_000; // after a failed create, skip this prefix for 2 min

interface PrefixCacheEntry {
  /** Resolved cache resource name, or null after a failed/declined create. */
  name: string | null;
  /** Epoch ms after which this entry must not be reused. */
  expiresAt: number;
  /** Token count written when this entry was first created (for cost metering). */
  writtenTokens: number;
  /** In-flight create, so concurrent callers share one round-trip. */
  pending?: Promise<{ name: string | null; writtenTokens: number }>;
}

const prefixCacheRegistry = new Map<string, PrefixCacheEntry>();

function pathCacheDisabled(): boolean {
  const v = process.env.GEMINI_PATH_CACHE_DISABLED;
  return v === '1' || v === 'true';
}

function prefixKey(prefix: string): string {
  return createHash('sha256').update(prefix).digest('hex');
}

function prunePrefixCache(now: number): void {
  for (const [key, entry] of prefixCacheRegistry) {
    if (!entry.pending && entry.expiresAt <= now) prefixCacheRegistry.delete(key);
  }
}

async function createCachedPrefix(
  model: string,
  prefix: string,
): Promise<{ name: string | null; writtenTokens: number }> {
  try {
    const cached = await getGeminiClient().caches.create({
      model,
      config: {
        systemInstruction: prefix,
        ttl: `${CACHE_TTL_SECONDS}s`,
        displayName: 'notemage-path-prefix',
      },
    });
    // usageMetadata.totalTokenCount is the token count of the cached content;
    // fall back to a char/4 estimate when the API doesn't surface it.
    const writtenTokens =
      (cached.usageMetadata?.totalTokenCount ?? Math.ceil(prefix.length / 4));
    return { name: cached.name ?? null, writtenTokens };
  } catch {
    return { name: null, writtenTokens: 0 };
  }
}

/**
 * Resolve a live `CachedContent` for `prefix`, creating one on first use
 * and reusing it across the run. Returns `{ name: null, writtenTokens: 0 }`
 * when caching is disabled, the prefix is below Gemini's minimum cacheable
 * size, or creation fails. Never throws.
 *
 * `writtenTokens` is non-zero only on the call that created the entry — used
 * by the caller to meter the cache-write cost that isn't in promptTokenCount.
 */
async function getOrCreateCachedPrefix(
  model: string,
  prefix: string,
): Promise<{ name: string | null; writtenTokens: number }> {
  if (pathCacheDisabled() || prefix.length < CACHE_MIN_PREFIX_CHARS) {
    return { name: null, writtenTokens: 0 };
  }

  const now = Date.now();
  prunePrefixCache(now);
  const key = prefixKey(prefix) + ':' + model;

  const existing = prefixCacheRegistry.get(key);
  if (existing && existing.expiresAt - CACHE_EXPIRY_BUFFER_MS > now) {
    if (existing.pending) {
      const result = await existing.pending;
      return { name: result.name, writtenTokens: 0 }; // write already counted
    }
    return { name: existing.name, writtenTokens: 0 };
  }

  const pending = createCachedPrefix(model, prefix);
  prefixCacheRegistry.set(key, {
    name: null,
    writtenTokens: 0,
    expiresAt: now + CACHE_TTL_SECONDS * 1000,
    pending,
  });
  const result = await pending;
  prefixCacheRegistry.set(key, {
    name: result.name,
    writtenTokens: result.writtenTokens,
    expiresAt: Date.now() + (result.name ? CACHE_TTL_SECONDS * 1000 : CACHE_FAILURE_COOLDOWN_MS),
  });
  return result;
}

function dropCachedPrefix(prefix: string, model: string): void {
  prefixCacheRegistry.delete(prefixKey(prefix) + ':' + model);
}

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
    onUsage,
  } = opts;

  const client = getGeminiClient();
  const cachingMode = typeof cacheablePrefix === 'string';

  // Best-effort: back the constant prefix with an explicit cache. Null name
  // means the caller should send the prefix inline (also the flat-instruction
  // path for translation/moderation callers).
  const cacheResult = cachingMode
    ? await getOrCreateCachedPrefix(model, cacheablePrefix as string)
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
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        responseMimeType: 'application/json',
        // Gemini 2.5 Flash enables thinking by default; thinking tokens
        // are billed at the output rate and can easily double the
        // per-call cost. For structured path generation the shape is
        // already enforced by the prompt + Zod post-validation, so the
        // extra reasoning adds little value — disable it.
        thinkingConfig: { thinkingBudget: 0 },
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
