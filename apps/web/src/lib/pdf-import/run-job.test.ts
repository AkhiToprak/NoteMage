import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PdfPageUsage } from './engine';

// L7: runPdfImportJob must accumulate per-page vision usage and emit exactly
// ONE logAiUsage per import job (summed tokens), replacing the former
// ~one-insert-per-page. This drives the real function against a fully-mocked
// IO surface, with the vision engine firing `onUsage` once per page.

const mocks = vi.hoisted(() => ({
  // db
  importJobFindUnique: vi.fn(),
  importJobUpdate: vi.fn(),
  pageAggregate: vi.fn(),
  pageCreate: vi.fn(),
  pageUpdate: vi.fn(),
  pageImageCreate: vi.fn(),
  // storage
  downloadFromStorage: vi.fn(),
  saveImage: vi.fn(),
  deleteFile: vi.fn(),
  // pipeline
  extractGroundTruth: vi.fn(),
  describePage: vi.fn(),
  getOrCreateCachedPrefix: vi.fn(),
  assembleTiptap: vi.fn(),
  tiptapJsonToPlainText: vi.fn(),
  groundTruthToBlocks: vi.fn(),
  cropFigure: vi.fn(),
  incrementUsage: vi.fn(),
  sweepPageCaptions: vi.fn(),
  logAiUsage: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    importJob: { findUnique: mocks.importJobFindUnique, update: mocks.importJobUpdate },
    page: { aggregate: mocks.pageAggregate, create: mocks.pageCreate, update: mocks.pageUpdate },
    pageImage: { create: mocks.pageImageCreate },
  },
}));

vi.mock('@/lib/storage', () => ({
  downloadFromStorage: mocks.downloadFromStorage,
  saveImage: mocks.saveImage,
  deleteFile: mocks.deleteFile,
}));

vi.mock('@/lib/contentConverter', () => ({ tiptapJsonToPlainText: mocks.tiptapJsonToPlainText }));
vi.mock('@/lib/usage-limits', () => ({ incrementUsage: mocks.incrementUsage }));
vi.mock('@/lib/ai-usage', () => ({ logAiUsage: mocks.logAiUsage }));
vi.mock('@/lib/image-captions', () => ({
  sanitizeCaption: (s: string | null) => s,
  sweepPageCaptions: mocks.sweepPageCaptions,
}));
vi.mock('@/lib/gemini-prefix-cache', () => ({ getOrCreateCachedPrefix: mocks.getOrCreateCachedPrefix }));

// The engine module: both engines resolve to an object exposing describePage.
vi.mock('./engine-gemini', () => ({
  geminiEngine: { describePage: mocks.describePage },
  GEMINI_PDF_MODEL: 'gemini-2.5-flash-lite',
}));
vi.mock('./engine-text', () => ({ textLayerEngine: { describePage: mocks.describePage } }));
vi.mock('./ground-truth', () => ({ extractGroundTruth: mocks.extractGroundTruth }));
vi.mock('./assemble', () => ({ assembleTiptap: mocks.assembleTiptap }));
vi.mock('./heuristic-fallback', () => ({ groundTruthToBlocks: mocks.groundTruthToBlocks }));
vi.mock('./figure-crop', () => ({ cropFigure: mocks.cropFigure }));
vi.mock('./prompt', () => ({ STRUCTURE_SYSTEM_PROMPT: 'sys' }));

import { runPdfImportJob } from './run-job';

function gtPage(pageNumber: number) {
  return { pageNumber, width: 600, height: 800, lines: [] };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.importJobFindUnique.mockResolvedValue({
    id: 'job-1',
    pdfPath: 'pdf/1.pdf',
    sectionId: 'section-1',
    pageImagePaths: ['p/0.png', 'p/1.png', 'p/2.png'],
    pageCap: 100,
    mode: 'rich',
    userId: 'user-1',
    user: { tier: 'PRO' },
  });
  mocks.importJobUpdate.mockResolvedValue(undefined);
  mocks.pageAggregate.mockResolvedValue({ _max: { sortOrder: 0 } });
  mocks.pageCreate.mockResolvedValue({ id: 'page-1' });
  mocks.pageUpdate.mockResolvedValue(undefined);
  mocks.downloadFromStorage.mockResolvedValue(Buffer.from('img'));
  // 3-page scanned (no text layer) PDF → every page routes to the vision engine.
  mocks.extractGroundTruth.mockResolvedValue({
    pageCount: 3,
    encrypted: false,
    hasTextLayer: false,
    pages: [gtPage(1), gtPage(2), gtPage(3)],
  });
  mocks.getOrCreateCachedPrefix.mockResolvedValue({ name: null });
  mocks.assembleTiptap.mockReturnValue({ doc: { type: 'doc', content: [] }, truncated: false });
  mocks.tiptapJsonToPlainText.mockReturnValue('text');
  mocks.groundTruthToBlocks.mockReturnValue([]);
  mocks.incrementUsage.mockResolvedValue(undefined);
  mocks.deleteFile.mockResolvedValue(undefined);
});

describe('runPdfImportJob usage aggregation (L7)', () => {
  it('3-page fixture → exactly ONE logAiUsage call with summed tokens', async () => {
    // Each page's engine call fires onUsage once with distinct token counts and
    // returns a blank page (valid `[]`), so no crop/heuristic branches run.
    const perPage: PdfPageUsage[] = [
      { provider: 'gemini', model: 'gemini-2.5-flash-lite', inputTokens: 100, outputTokens: 10, cacheReadTokens: 5, cacheWriteTokens: 1 },
      { provider: 'gemini', model: 'gemini-2.5-flash-lite', inputTokens: 200, outputTokens: 20, cacheReadTokens: 6, cacheWriteTokens: 2 },
      { provider: 'gemini', model: 'gemini-2.5-flash-lite', inputTokens: 300, outputTokens: 30, cacheReadTokens: 7, cacheWriteTokens: 3 },
    ];
    let page = 0;
    mocks.describePage.mockImplementation(async (input: { onUsage?: (u: PdfPageUsage) => void }) => {
      input.onUsage?.(perPage[page]);
      page += 1;
      return []; // blank page — valid, skips figure/heuristic branches
    });

    await runPdfImportJob('job-1');

    // Exactly ONE ledger entry for the whole 3-page job.
    expect(mocks.logAiUsage).toHaveBeenCalledTimes(1);
    const [event] = mocks.logAiUsage.mock.calls[0] as [
      {
        feature: string;
        model: string;
        inputTokens: number;
        outputTokens: number;
        cacheReadTokens: number;
        cacheWriteTokens: number;
      },
    ];
    expect(event.feature).toBe('pdf-import');
    expect(event.inputTokens).toBe(600); // 100+200+300
    expect(event.outputTokens).toBe(60); // 10+20+30
    expect(event.cacheReadTokens).toBe(18); // 5+6+7
    expect(event.cacheWriteTokens).toBe(6); // 1+2+3
  });

  it('emits partial usage even when a later page throws (job fails mid-way)', async () => {
    let page = 0;
    mocks.describePage.mockImplementation(async (input: { onUsage?: (u: PdfPageUsage) => void }) => {
      if (page === 0) {
        input.onUsage?.({
          provider: 'gemini',
          model: 'gemini-2.5-flash-lite',
          inputTokens: 150,
          outputTokens: 15,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
        });
        page += 1;
        return [];
      }
      throw new Error('vision engine exploded'); // page 2 engine fails
    });
    // Heuristic fallback also empty → page still processed as blank; force a
    // hard job failure instead by making the page write throw.
    mocks.pageCreate.mockRejectedValueOnce(new Error('db write failed'));

    await runPdfImportJob('job-1');

    // The partial page-1 usage is still recorded exactly once.
    expect(mocks.logAiUsage).toHaveBeenCalledTimes(1);
    const [event] = mocks.logAiUsage.mock.calls[0] as [{ inputTokens: number }];
    expect(event.inputTokens).toBe(150);
  });

  it('makes NO usage log when the engine never reports usage (pure text-layer job)', async () => {
    mocks.describePage.mockResolvedValue([]); // never calls onUsage

    await runPdfImportJob('job-1');

    expect(mocks.logAiUsage).not.toHaveBeenCalled();
  });
});
