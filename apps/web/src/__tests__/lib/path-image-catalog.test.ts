// Figure-reuse hardening — coverage for the two riskiest seams:
//   1. loadSourceImages: the polymorphic-materialIds fix. Page-kind ids load
//      their images; a FlashcardSet/QuizSet id now resolves images via its
//      backing notebook (the silent-drop bug); ownership is always filtered;
//      chat's expandToNotebook=false keeps the tight scope.
//   2. selectCatalogImages: the ranked replacement for "first 24 by createdAt".

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    page: { findMany: vi.fn() },
    document: { findMany: vi.fn() },
    flashcardSet: { findMany: vi.fn() },
    quizSet: { findMany: vi.fn() },
    pageImage: { findMany: vi.fn() },
  },
  logTelemetry: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/telemetry-server', () => ({ logTelemetry: mocks.logTelemetry }));

import {
  loadSourceImages,
  selectCatalogImages,
  scoreSourceImage,
  type SourceImage,
  type CatalogContext,
} from '@/lib/path-image-catalog';

// A DB row as returned by IMAGE_SELECT (pre-mapping).
function mkRow(id: string, pageId: string, over: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    fileName: `${id}.png`,
    filePath: `images/${id}`,
    mimeType: 'image/png',
    fileSize: 50_000,
    bbox: null,
    sourceType: 'vision_crop',
    aiCaption: 'a labelled figure of something',
    page: { id: pageId, title: `Page ${pageId}` },
    ...over,
  };
}

// A fully-formed SourceImage for the pure ranking tests.
function mkImg(id: string, over: Partial<SourceImage> = {}): SourceImage {
  return {
    id,
    pageId: `page_${id}`,
    pageTitle: 'Page',
    fileName: `${id}.png`,
    filePath: `images/${id}`,
    mimeType: 'image/png',
    fileSize: 50_000,
    bbox: null,
    sourceType: 'vision_crop',
    caption: 'a clear labelled figure',
    onPickedPage: false,
    ...over,
  };
}

const CTX = { planId: 'plan1', title: 'Cell Biology', subjectLabels: ['biology'] };

/** Route the two pageImage.findMany calls (picked vs notebook) by where-shape. */
function routePageImages(picked: unknown[], notebook: unknown[]) {
  mocks.db.pageImage.findMany.mockImplementation((args: { where?: Record<string, unknown> }) => {
    const page = (args?.where?.page ?? {}) as Record<string, unknown>;
    // picked query filters page.id IN [...]; notebook query filters page.section.notebookId.
    if (page.id) return Promise.resolve(picked);
    return Promise.resolve(notebook);
  });
}

beforeEach(() => {
  for (const m of [
    mocks.db.page.findMany,
    mocks.db.document.findMany,
    mocks.db.flashcardSet.findMany,
    mocks.db.quizSet.findMany,
    mocks.db.pageImage.findMany,
    mocks.logTelemetry,
  ]) {
    m.mockReset();
  }
  mocks.db.page.findMany.mockResolvedValue([]);
  mocks.db.document.findMany.mockResolvedValue([]);
  mocks.db.flashcardSet.findMany.mockResolvedValue([]);
  mocks.db.quizSet.findMany.mockResolvedValue([]);
  mocks.db.pageImage.findMany.mockResolvedValue([]);
});

describe('loadSourceImages — polymorphic scope resolution', () => {
  it('returns [] for empty materialIds without touching the DB', async () => {
    const out = await loadSourceImages('user1', [], CTX);
    expect(out).toEqual([]);
    expect(mocks.db.page.findMany).not.toHaveBeenCalled();
    expect(mocks.db.pageImage.findMany).not.toHaveBeenCalled();
  });

  it('loads images for a page-kind material and flags them onPickedPage', async () => {
    mocks.db.page.findMany.mockResolvedValue([
      { id: 'page1', title: 'Mitosis', section: { notebookId: 'nb1' } },
    ]);
    routePageImages([mkRow('img1', 'page1')], [mkRow('img1', 'page1')]);

    const out = await loadSourceImages('user1', ['page1'], CTX);
    expect(out.map((i) => i.id)).toEqual(['img1']);
    expect(out[0].onPickedPage).toBe(true);
  });

  it('THE BUG: a flashcard-set material resolves images via its backing notebook', async () => {
    // 'fs1' is not a page — page.findMany returns nothing for it.
    mocks.db.flashcardSet.findMany.mockResolvedValue([{ notebookId: 'nb1' }]);
    // No picked-page images; the notebook query surfaces a sibling page's image.
    routePageImages([], [mkRow('imgN', 'pageX')]);

    const out = await loadSourceImages('user1', ['fs1'], CTX);
    expect(out.map((i) => i.id)).toEqual(['imgN']);
    // Surfaced via the notebook, not an explicitly-picked page.
    expect(out[0].onPickedPage).toBe(false);
  });

  it('always filters PageImage by the owning userId (ownership isolation)', async () => {
    mocks.db.page.findMany.mockResolvedValue([
      { id: 'page1', title: 'P', section: { notebookId: 'nb1' } },
    ]);
    routePageImages([mkRow('img1', 'page1')], []);

    await loadSourceImages('user1', ['page1'], CTX);

    // The picked-image query must scope through section → notebook → userId.
    const pickedCall = mocks.db.pageImage.findMany.mock.calls.find(
      (c) => (c[0]?.where?.page as Record<string, unknown> | undefined)?.id,
    );
    expect(pickedCall).toBeTruthy();
    expect(JSON.stringify(pickedCall![0].where)).toContain('"userId":"user1"');
  });

  it('expandToNotebook:false (chat) skips the notebook-wide query', async () => {
    mocks.db.page.findMany.mockResolvedValue([
      { id: 'page1', title: 'P', section: { notebookId: 'nb1' } },
    ]);
    routePageImages([mkRow('img1', 'page1')], [mkRow('imgN', 'pageX')]);

    await loadSourceImages('user1', ['page1'], CTX, { expandToNotebook: false });

    // Only the picked-page query should have fired.
    const notebookCall = mocks.db.pageImage.findMany.mock.calls.find(
      (c) => !(c[0]?.where?.page as Record<string, unknown> | undefined)?.id,
    );
    expect(notebookCall).toBeUndefined();
  });

  it('emits a source_scan telemetry event with per-kind resolution counts', async () => {
    mocks.db.flashcardSet.findMany.mockResolvedValue([{ notebookId: 'nb1' }]);
    routePageImages([], [mkRow('imgN', 'pageX')]);

    await loadSourceImages('user1', ['fs1', 'ghost'], CTX);

    expect(mocks.logTelemetry).toHaveBeenCalledWith(
      'user1',
      'path.figures.source_scan',
      expect.objectContaining({
        planId: 'plan1',
        resolved: expect.objectContaining({ flashcard_set: 1, page: 0, unresolved: 1 }),
      }),
    );
  });
});

describe('selectCatalogImages — ranked selection', () => {
  const ctx: CatalogContext = { title: 'Cell Biology', subjectLabels: ['biology'], pickedPageTitles: [] };

  it('ranks picked-page images above mere notebook siblings', () => {
    const sibling = mkImg('sibling', { onPickedPage: false });
    const picked = mkImg('picked', { onPickedPage: true });
    const out = selectCatalogImages([sibling, picked], ctx, 10);
    expect(out[0].id).toBe('picked');
  });

  it('penalizes full-page bbox and tiny files below a normal crop', () => {
    const normal = mkImg('normal', { bbox: [0.1, 0.1, 0.6, 0.5] });
    const fullPage = mkImg('full', { bbox: [0, 0, 1, 1] });
    const tiny = mkImg('tiny', { fileSize: 1_000 });
    const topic = new Set<string>();
    expect(scoreSourceImage(normal, topic)).toBeGreaterThan(scoreSourceImage(fullPage, topic));
    expect(scoreSourceImage(normal, topic)).toBeGreaterThan(scoreSourceImage(tiny, topic));
  });

  it('rewards topic-relevant captions', () => {
    const topic = new Set(['mitochondria', 'cell']);
    const relevant = mkImg('rel', { caption: 'diagram of a mitochondria inside a cell' });
    const offtopic = mkImg('off', { caption: 'a photo of a bridge over water' });
    expect(scoreSourceImage(relevant, topic)).toBeGreaterThan(scoreSourceImage(offtopic, topic));
  });

  it('drops near-duplicate captions, keeping the higher-ranked instance', () => {
    const a = mkImg('a', { caption: 'identical caption', onPickedPage: true });
    const b = mkImg('b', { caption: 'Identical Caption', onPickedPage: false });
    const out = selectCatalogImages([b, a], ctx, 10);
    expect(out.map((i) => i.id)).toEqual(['a']);
  });

  it('caps the result at the requested limit', () => {
    const many = Array.from({ length: 40 }, (_, i) => mkImg(`img${i}`, { caption: `caption ${i}` }));
    expect(selectCatalogImages(many, ctx, 24)).toHaveLength(24);
  });

  it('returns [] for no candidates', () => {
    expect(selectCatalogImages([], ctx, 24)).toEqual([]);
  });
});
