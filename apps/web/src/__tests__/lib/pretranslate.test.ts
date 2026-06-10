// P11 — unit tests for the popular-language pre-translation fan-out
// (src/lib/translation/pretranslate.ts).
//
// Mock strategy mirrors paths-translate.test.ts: hoist mocks for the db,
// the snapshot loader, the translation runner, and the popular-language
// config. The fan-out + clone-trigger are then exercised against those
// boundaries and the contract asserted.
//
// P11V gate mapping:
//   - Seeded/community fan-out → one PathTranslation row per non-source
//     popular language, runner fired once each.
//   - Skip-existing → a P2002 on the single-flight claim skips that
//     language with zero runner calls (idempotent re-fire).
//   - Cost gate → cumulative cost crossing the hard ceiling aborts the
//     remaining languages.
//   - Failure handling → a failed runner result is recorded and the
//     fan-out continues (the failed row is retried on-demand later).
//   - Concurrent clones at the threshold boundary → exactly one fan-out
//     (the atomic updateMany guard; count !== 1 → no fan-out).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => ({
  loadTranslatableSnapshot: vi.fn(),
  runTranslation: vi.fn(),
  getPopularLanguages: vi.fn(),
  getPopularityThreshold: vi.fn(),
  getPretranslationCostCeilingUsd: vi.fn(),
  db: {
    sharedPath: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    pathTranslation: {
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/translation/snapshot', () => ({
  loadTranslatableSnapshot: mocks.loadTranslatableSnapshot,
}));
vi.mock('@/lib/translation/runner', () => ({
  runTranslation: mocks.runTranslation,
}));
vi.mock('@/lib/translation/popular-languages', () => ({
  getPopularLanguages: mocks.getPopularLanguages,
  getPopularityThreshold: mocks.getPopularityThreshold,
  getPretranslationCostCeilingUsd: mocks.getPretranslationCostCeilingUsd,
}));

import {
  runPretranslationFanOut,
  triggerPretranslationOnClone,
} from '@/lib/translation/pretranslate';

const POPULAR = ['de', 'en', 'fr', 'es', 'it', 'tr'];

function approvedHeader(language = 'de') {
  return { id: 'shp-1', language, moderationStatus: 'approved' as const };
}
function snapshotFor(lang: string) {
  return {
    sourceLanguage: 'de',
    targetLanguage: lang,
    title: 'Source title',
    description: 'Source description',
    phases: [],
  };
}
function readyResult(costUsd = 0.001) {
  return {
    status: 'ready' as const,
    payload: { title: 't', description: null, phases: [] },
    costUsd,
    model: 'gemini-2.5-flash',
    usage: null,
  };
}

beforeEach(() => {
  mocks.loadTranslatableSnapshot.mockReset();
  mocks.runTranslation.mockReset();
  mocks.getPopularLanguages.mockReset();
  mocks.getPopularityThreshold.mockReset();
  mocks.getPretranslationCostCeilingUsd.mockReset();
  mocks.db.sharedPath.findUnique.mockReset();
  mocks.db.sharedPath.updateMany.mockReset();
  mocks.db.pathTranslation.create.mockReset();
  mocks.db.pathTranslation.update.mockReset();

  // Defaults: the 6-language popular set, $1 ceiling, threshold 10.
  mocks.getPopularLanguages.mockReturnValue([...POPULAR]);
  mocks.getPopularityThreshold.mockReturnValue(10);
  mocks.getPretranslationCostCeilingUsd.mockReturnValue(1.0);
  // Default fan-out happy path: approved DE path, claims succeed,
  // snapshots load, runner returns ready.
  mocks.db.sharedPath.findUnique.mockResolvedValue(approvedHeader('de'));
  mocks.db.pathTranslation.create.mockResolvedValue({ id: 'pt-x' });
  mocks.db.pathTranslation.update.mockResolvedValue({ id: 'pt-x' });
  mocks.loadTranslatableSnapshot.mockImplementation((_id: string, lang: string) =>
    Promise.resolve(snapshotFor(lang)),
  );
  mocks.runTranslation.mockResolvedValue(readyResult());
});

// ---------------------------------------------------------------------
// runPretranslationFanOut — happy path / skip-source
// ---------------------------------------------------------------------

describe('runPretranslationFanOut — fan-out coverage', () => {
  it('translates every popular language except the source, one runner call each', async () => {
    const result = await runPretranslationFanOut('shp-1', { throttleMs: 0 });

    // 6 popular languages minus the DE source = 5 targets.
    const expectedTargets = ['en', 'fr', 'es', 'it', 'tr'];
    expect(result.sourceLanguage).toBe('de');
    expect(result.attempted).toEqual(expectedTargets);
    expect(result.succeeded).toEqual(expectedTargets);
    expect(result.failed).toEqual([]);
    expect(result.skipped).toEqual([]);
    expect(result.ceilingHit).toBe(false);

    // Never claims or translates the source language.
    expect(mocks.db.pathTranslation.create).toHaveBeenCalledTimes(5);
    expect(mocks.runTranslation).toHaveBeenCalledTimes(5);
    for (const lang of expectedTargets) {
      expect(mocks.db.pathTranslation.create).toHaveBeenCalledWith({
        data: { sharedPathId: 'shp-1', language: lang, status: 'translating' },
      });
    }
    expect(mocks.db.pathTranslation.create).not.toHaveBeenCalledWith({
      data: { sharedPathId: 'shp-1', language: 'de', status: 'translating' },
    });
  });

  it('no-ops when the path is missing or not approved', async () => {
    mocks.db.sharedPath.findUnique.mockResolvedValueOnce({
      ...approvedHeader('de'),
      moderationStatus: 'pending',
    });
    const result = await runPretranslationFanOut('shp-1', { throttleMs: 0 });
    expect(result.attempted).toEqual([]);
    expect(mocks.db.pathTranslation.create).not.toHaveBeenCalled();
    expect(mocks.runTranslation).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// Skip-existing (single-flight idempotency)
// ---------------------------------------------------------------------

describe('runPretranslationFanOut — skip languages that already have a row', () => {
  it('a P2002 on the claim skips that language without firing the runner', async () => {
    // EN already has a row (pre-baked / in-flight / ready / failed) →
    // claim collides with the unique constraint.
    mocks.db.pathTranslation.create.mockImplementation(
      (args: { data: { language: string } }) => {
        if (args.data.language === 'en') {
          return Promise.reject(
            new Prisma.PrismaClientKnownRequestError('unique', {
              code: 'P2002',
              clientVersion: '5.x.x',
            }),
          );
        }
        return Promise.resolve({ id: 'pt-x' });
      },
    );

    const result = await runPretranslationFanOut('shp-1', { throttleMs: 0 });

    expect(result.skipped).toEqual(['en']);
    expect(result.succeeded).toEqual(['fr', 'es', 'it', 'tr']);
    // The runner never ran for the skipped language.
    expect(mocks.runTranslation).toHaveBeenCalledTimes(4);
    expect(mocks.loadTranslatableSnapshot).not.toHaveBeenCalledWith('shp-1', 'en');
  });
});

// ---------------------------------------------------------------------
// Cost gate (P0 §7.4 — hard per-path ceiling)
// ---------------------------------------------------------------------

describe('runPretranslationFanOut — cost ceiling', () => {
  it('aborts the remaining languages once cumulative cost crosses the ceiling', async () => {
    // Ceiling $0.0015; each translation costs $0.001. After EN ($0.001)
    // and FR ($0.002) the top-of-loop check on ES sees $0.002 ≥ $0.0015
    // and breaks.
    mocks.runTranslation.mockResolvedValue(readyResult(0.001));

    const result = await runPretranslationFanOut('shp-1', {
      throttleMs: 0,
      costCeilingUsd: 0.0015,
    });

    expect(result.ceilingHit).toBe(true);
    expect(result.attempted).toEqual(['en', 'fr']);
    expect(result.succeeded).toEqual(['en', 'fr']);
    expect(mocks.runTranslation).toHaveBeenCalledTimes(2);
    expect(result.totalCostUsd).toBeCloseTo(0.002, 6);
  });
});

// ---------------------------------------------------------------------
// Failure handling (continue; the failed row is retried on-demand later)
// ---------------------------------------------------------------------

describe('runPretranslationFanOut — failure handling', () => {
  it('records a failed runner result and continues to the next language', async () => {
    mocks.runTranslation.mockImplementation((_id: string, snap: { targetLanguage: string }) => {
      if (snap.targetLanguage === 'en') {
        return Promise.resolve({
          status: 'failed' as const,
          payload: null,
          costUsd: 0,
          model: 'gemini-2.5-flash',
          usage: null,
          error: 'Provider unavailable',
        });
      }
      return Promise.resolve(readyResult());
    });

    const result = await runPretranslationFanOut('shp-1', { throttleMs: 0 });

    expect(result.failed).toEqual(['en']);
    expect(result.succeeded).toEqual(['fr', 'es', 'it', 'tr']);
    // The fan-out kept going after the failure (all 5 attempted).
    expect(result.attempted).toEqual(['en', 'fr', 'es', 'it', 'tr']);
    expect(mocks.runTranslation).toHaveBeenCalledTimes(5);
  });

  it('marks the claimed row failed and stops if the source path vanished mid-flight', async () => {
    // The first language's snapshot loads, but EN's returns null —
    // the path was unpublished between claim and snapshot.
    mocks.loadTranslatableSnapshot.mockImplementation((_id: string, lang: string) => {
      if (lang === 'en') return Promise.resolve(null);
      return Promise.resolve(snapshotFor(lang));
    });

    const result = await runPretranslationFanOut('shp-1', { throttleMs: 0 });

    expect(result.attempted).toEqual(['en']);
    expect(result.failed).toEqual(['en']);
    // The fan-out broke after the null snapshot — no further claims.
    expect(result.succeeded).toEqual([]);
    expect(mocks.runTranslation).not.toHaveBeenCalled();
    expect(mocks.db.pathTranslation.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sharedPathId_language: { sharedPathId: 'shp-1', language: 'en' } },
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------
// triggerPretranslationOnClone — popularity-gate atomicity
// ---------------------------------------------------------------------

describe('triggerPretranslationOnClone — popularity gate', () => {
  it('fires the fan-out when the atomic flip wins (count === 1)', async () => {
    mocks.db.sharedPath.updateMany.mockResolvedValueOnce({ count: 1 });

    const fired = await triggerPretranslationOnClone('shp-1', { throttleMs: 0 });

    expect(fired).toBe(true);
    // Atomic guard: only flip if still null AND over the threshold.
    expect(mocks.db.sharedPath.updateMany).toHaveBeenCalledWith({
      where: {
        id: 'shp-1',
        popularityTriggeredAt: null,
        downloadCount: { gte: 10 },
      },
      data: { popularityTriggeredAt: expect.any(Date) },
    });
    // Fan-out actually ran (claims were made).
    expect(mocks.db.pathTranslation.create).toHaveBeenCalled();
    expect(mocks.runTranslation).toHaveBeenCalled();
  });

  it('does NOT fan out when the flip loses the race or is below threshold (count === 0)', async () => {
    mocks.db.sharedPath.updateMany.mockResolvedValueOnce({ count: 0 });

    const fired = await triggerPretranslationOnClone('shp-1', { throttleMs: 0 });

    expect(fired).toBe(false);
    // No fan-out: zero claims, zero runner calls. This is the 11th-clone
    // idempotency case AND the concurrent-boundary collapse — only the
    // single count===1 winner fans out.
    expect(mocks.db.pathTranslation.create).not.toHaveBeenCalled();
    expect(mocks.runTranslation).not.toHaveBeenCalled();
  });
});
