import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the shared Gemini client so caches.create runs against a fake — no key,
// no network. Each test uses a distinct prefix so the module-level registry
// (shared across tests) never cross-contaminates.
const create = vi.fn();
vi.mock('./gemini', () => ({
  getGeminiClient: () => ({ caches: { create } }),
}));

const { getOrCreateCachedPrefix } = await import('./gemini-prefix-cache');

const MODEL = 'gemini-2.5-flash-lite';
const OPTS = { displayName: 'notemage-test' };

/** A prefix comfortably over the 4096-char minimum, unique per test. */
function bigPrefix(tag: string): string {
  return `${tag}:` + 'x'.repeat(5000);
}

beforeEach(() => {
  create.mockReset();
  delete process.env.GEMINI_PATH_CACHE_DISABLED;
});

describe('getOrCreateCachedPrefix', () => {
  it('returns the cache name on a successful create', async () => {
    create.mockResolvedValue({
      name: 'cachedContents/ok',
      usageMetadata: { totalTokenCount: 1500 },
    });
    const r = await getOrCreateCachedPrefix(MODEL, bigPrefix('success'), OPTS);
    expect(r.name).toBe('cachedContents/ok');
    expect(r.writtenTokens).toBe(1500);
    expect(create).toHaveBeenCalledTimes(1);
    // config carries the parameterized displayName + a TTL string.
    const cfg = create.mock.calls[0][0].config;
    expect(cfg.displayName).toBe('notemage-test');
    expect(cfg.ttl).toMatch(/^\d+s$/);
  });

  it('returns null (never throws) when create fails — inline fallback', async () => {
    create.mockRejectedValue(new Error('below min token count'));
    const r = await getOrCreateCachedPrefix(MODEL, bigPrefix('fail'), OPTS);
    expect(r.name).toBeNull();
    expect(r.writtenTokens).toBe(0);
  });

  it('short-circuits below the min prefix size without calling create', async () => {
    const r = await getOrCreateCachedPrefix(MODEL, 'too short', OPTS);
    expect(r.name).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });

  it('reuses the entry within TTL — create is called once across repeat calls', async () => {
    create.mockResolvedValue({ name: 'cachedContents/reuse', usageMetadata: {} });
    const prefix = bigPrefix('reuse');
    const a = await getOrCreateCachedPrefix(MODEL, prefix, OPTS);
    const b = await getOrCreateCachedPrefix(MODEL, prefix, OPTS);
    expect(a.name).toBe('cachedContents/reuse');
    expect(b.name).toBe('cachedContents/reuse');
    expect(b.writtenTokens).toBe(0); // write counted only on the creating call
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('dedups concurrent creates — one in-flight round trip is shared', async () => {
    let resolve!: (v: unknown) => void;
    create.mockReturnValue(new Promise((r) => (resolve = r)));
    const prefix = bigPrefix('dedup');
    const p1 = getOrCreateCachedPrefix(MODEL, prefix, OPTS);
    const p2 = getOrCreateCachedPrefix(MODEL, prefix, OPTS);
    resolve({ name: 'cachedContents/dedup', usageMetadata: { totalTokenCount: 2000 } });
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.name).toBe('cachedContents/dedup');
    expect(r2.name).toBe('cachedContents/dedup');
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('respects the GEMINI_PATH_CACHE_DISABLED kill switch', async () => {
    process.env.GEMINI_PATH_CACHE_DISABLED = '1';
    const r = await getOrCreateCachedPrefix(MODEL, bigPrefix('disabled'), OPTS);
    expect(r.name).toBeNull();
    expect(create).not.toHaveBeenCalled();
  });
});
