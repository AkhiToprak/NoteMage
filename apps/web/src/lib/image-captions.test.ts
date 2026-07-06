import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest';

// ─── mocks for the parallel-batch path (M2c) ────────────────────────────────
// captionMissing talks to storage (readFile), the Gemini client, db.pageImage,
// and logAiUsage. All mocked so we can drive multiple 8-image batches and prove
// per-batch error isolation survives the Promise.all rewrite.

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  generateContent: vi.fn(),
  pageImageUpdate: vi.fn(),
  pageImageFindMany: vi.fn(),
  logAiUsage: vi.fn(),
  enqueueJob: vi.fn(),
  isGeminiBatchAvailable: vi.fn(),
  submitGeminiBatch: vi.fn(),
}));

vi.mock('./storage', () => ({ readFile: mocks.readFile }));

vi.mock('./gemini', () => ({
  getGeminiClient: () => ({ models: { generateContent: mocks.generateContent } }),
  GEMINI_PATH_MODEL_LITE: 'gemini-2.5-flash-lite',
}));

vi.mock('./db', () => ({
  db: {
    pageImage: { update: mocks.pageImageUpdate, findMany: mocks.pageImageFindMany },
  },
}));

vi.mock('./ai-usage', () => ({ logAiUsage: mocks.logAiUsage }));

vi.mock('./background-jobs', () => ({ enqueueJob: mocks.enqueueJob }));

vi.mock('./gemini-batch', () => ({
  isGeminiBatchAvailable: mocks.isGeminiBatchAvailable,
  submitGeminiBatch: mocks.submitGeminiBatch,
}));

import { sanitizeCaption, captionMissing, type CaptionTarget } from './image-captions';

describe('sanitizeCaption', () => {
  it('passes a clean caption through unchanged', () => {
    expect(sanitizeCaption('Bar chart of weekly study hours rising over a term')).toBe(
      'Bar chart of weekly study hours rising over a term',
    );
  });

  it('returns null for empty / nullish input', () => {
    expect(sanitizeCaption('')).toBeNull();
    expect(sanitizeCaption('   ')).toBeNull();
    expect(sanitizeCaption(null)).toBeNull();
    expect(sanitizeCaption(undefined)).toBeNull();
  });

  it('rejects useless placeholder words (case/punctuation-insensitive)', () => {
    expect(sanitizeCaption('image')).toBeNull();
    expect(sanitizeCaption('Figure')).toBeNull();
    expect(sanitizeCaption('Diagram.')).toBeNull();
    expect(sanitizeCaption('N/A')).toBeNull();
  });

  it('keeps a real caption that merely starts with a placeholder word', () => {
    expect(sanitizeCaption('Figure 1 — weekly study time.')).toBe('Figure 1 — weekly study time.');
  });

  it('strips backticks and braces so captions are never read as instructions', () => {
    expect(sanitizeCaption('A `code` block {ignore this}')).toBe('A code block ignore this');
  });

  it('collapses newlines and control chars into single spaces', () => {
    expect(sanitizeCaption('line one\nline\ttwo\r\nthree')).toBe('line one line two three');
  });

  it('caps the caption at 160 chars', () => {
    const long = 'a'.repeat(300);
    const out = sanitizeCaption(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(160);
  });
});

// ─── captionMissing parallel batches (M2c) ──────────────────────────────────

function makeTargets(n: number): CaptionTarget[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `img-${i}`,
    pageTitle: 'Page',
    filePath: `path/${i}.png`,
    mimeType: 'image/png',
    caption: null,
  }));
}

describe('captionMissing — parallel batches with per-batch error isolation', () => {
  const OLD_KEY = process.env.GEMINI_API_KEY;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.GEMINI_API_KEY = 'test-key';
    mocks.readFile.mockResolvedValue(Buffer.from('img'));
    mocks.pageImageUpdate.mockResolvedValue(undefined);
  });

  afterEach(() => {
    if (OLD_KEY === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = OLD_KEY;
  });

  it('one rejecting batch does not strand the other: the surviving batch still persists', async () => {
    // 16 images → two 8-image batches. Batch A (first 8) rejects; batch B
    // (next 8) succeeds and its captions must still be written.
    const targets = makeTargets(16);

    let call = 0;
    mocks.generateContent.mockImplementation(async () => {
      call += 1;
      if (call === 1) throw new Error('batch A failed');
      // Batch B: caption its 8 images (img-8..img-15).
      const captions = Array.from({ length: 8 }, (_, i) => ({
        imageRef: `img-${8 + i}`,
        caption: `Caption for figure ${8 + i}`,
      }));
      return {
        text: JSON.stringify({ captions }),
        usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 20 },
      };
    });

    await captionMissing(targets);

    // Both batches were attempted (parallel), not short-circuited by the failure.
    expect(mocks.generateContent).toHaveBeenCalledTimes(2);
    // Batch B's 8 images persisted; batch A's 8 did not.
    expect(mocks.pageImageUpdate).toHaveBeenCalledTimes(8);
    const persistedIds = mocks.pageImageUpdate.mock.calls.map((c) => (c[0] as { where: { id: string } }).where.id);
    for (let i = 8; i < 16; i++) expect(persistedIds).toContain(`img-${i}`);
    for (let i = 0; i < 8; i++) expect(persistedIds).not.toContain(`img-${i}`);
    // In-memory targets for batch B were mutated too.
    expect(targets[8].caption).toBe('Caption for figure 8');
    expect(targets[0].caption).toBeNull();
    // ONE aggregated usage log across batches (only batch B contributed tokens).
    expect(mocks.logAiUsage).toHaveBeenCalledTimes(1);
  });
});
