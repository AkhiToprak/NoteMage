// Shared explicit-prefix cache for Gemini `CachedContent` resources.
//
// Gemini applies a billing discount when a constant instruction prefix is
// registered as an explicit `CachedContent` resource and referenced by name
// on subsequent `generateContent` calls (via `config.cachedContent`), instead
// of being re-sent inline as `systemInstruction`. This module owns one
// process-local registry keyed by (prefix hash + model), plus the create /
// reuse / prune / dedup machinery.
//
// Two call sites use it:
//   - path generation (path-generator-gemini.ts): the per-path-constant prefix
//     (corpus + stage rules), reused across a run's ~50 calls.
//   - PDF import (run-job.ts): the STRUCTURE_SYSTEM_PROMPT, reused across an
//     import's per-page calls.
//
// Everything here is best-effort and never throws — `getOrCreateCachedPrefix`
// returns `{ name: null }` whenever the caller should just send the prefix
// inline (caching disabled, prefix below Gemini's minimum cacheable size, or a
// create failure). A prefix that clears the char threshold can still fall below
// the model's real token floor; `caches.create` then fails and we return null,
// so the caller transparently keeps its inline path.

import { createHash } from 'node:crypto';
import { getGeminiClient } from './gemini';

const CACHE_MIN_PREFIX_CHARS = 4096; // ~1024 tokens, Gemini 2.5 Flash's min cacheable size
const CACHE_EXPIRY_BUFFER_MS = 30_000; // stop using an entry 30s before its TTL ends
const CACHE_FAILURE_COOLDOWN_MS = 120_000; // after a failed create, skip this prefix for 2 min

/** Default TTL — path/ultra runs can exceed 15 min; a big PDF import runs long too. */
export const DEFAULT_CACHE_TTL_SECONDS = 1800; // 30 min

export interface CachedPrefixResult {
  /** Resolved cache resource name, or null when the caller should send inline. */
  name: string | null;
  /** Tokens written to the new cache entry — non-zero only on the creating call. */
  writtenTokens: number;
}

interface PrefixCacheEntry {
  /** Resolved cache resource name, or null after a failed/declined create. */
  name: string | null;
  /** Epoch ms after which this entry must not be reused. */
  expiresAt: number;
  /** Token count written when this entry was first created (for cost metering). */
  writtenTokens: number;
  /** In-flight create, so concurrent callers share one round-trip. */
  pending?: Promise<CachedPrefixResult>;
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
  displayName: string,
  ttlSeconds: number,
): Promise<CachedPrefixResult> {
  try {
    const cached = await getGeminiClient().caches.create({
      model,
      config: {
        systemInstruction: prefix,
        ttl: `${ttlSeconds}s`,
        displayName,
      },
    });
    // usageMetadata.totalTokenCount is the token count of the cached content;
    // fall back to a char/4 estimate when the API doesn't surface it.
    const writtenTokens =
      cached.usageMetadata?.totalTokenCount ?? Math.ceil(prefix.length / 4);
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
export async function getOrCreateCachedPrefix(
  model: string,
  prefix: string,
  opts: { displayName: string; ttlSeconds?: number },
): Promise<CachedPrefixResult> {
  const ttlSeconds = opts.ttlSeconds ?? DEFAULT_CACHE_TTL_SECONDS;
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

  const pending = createCachedPrefix(model, prefix, opts.displayName, ttlSeconds);
  prefixCacheRegistry.set(key, {
    name: null,
    writtenTokens: 0,
    expiresAt: now + ttlSeconds * 1000,
    pending,
  });
  const result = await pending;
  prefixCacheRegistry.set(key, {
    name: result.name,
    writtenTokens: result.writtenTokens,
    expiresAt: Date.now() + (result.name ? ttlSeconds * 1000 : CACHE_FAILURE_COOLDOWN_MS),
  });
  return result;
}

/** Drop a cache entry so the next call rebuilds or goes inline (used when a
 *  cached attempt fails — the cache may be stale/invalid). */
export function dropCachedPrefix(prefix: string, model: string): void {
  prefixCacheRegistry.delete(prefixKey(prefix) + ':' + model);
}
