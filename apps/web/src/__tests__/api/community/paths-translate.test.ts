// P10 — integration tests for GET /api/community/paths/[shareId]?lang=.
//
// Mock strategy mirrors paths-clone.test.ts: hoist mocks for the auth
// boundary, the db, the rate-limiter, the usage-limit helpers, the
// translation runner, and the snapshot loader. The route handler is
// then exercised against those boundaries and the contract asserted.
//
// AC mapping (P0 spec §2.5):
//   - AC-Translate-1: source-lang short-circuit (no AI call, no
//     translation queries).
//   - AC-Translate-2: first request fires the runner + writes the
//     PathTranslation row + increments usage.
//   - AC-Translate-3: cache hit (status='ready') → zero AI call.
//   - AC-Translate-4: concurrent first-requesters → exactly 1 runner
//     call (the racer-loser re-reads via P2002 path).
//   - AC-Translate-5: status='translating' → translating envelope, no
//     quota check, no runner call.
//   - AC-Translate-6: cost is captured in the runner's update; the
//     route hands the result back via the envelope.
//   - AC-Translate-7: daily-budget over → 429.
//   - AC-Translate-8: rate-limit user → 429; rate-limit IP → 429.
//   - AC-Translate-9: snapshot is captured at translation time —
//     verified structurally because the runner takes a snapshot
//     argument, not a SharedPath ID, and the snapshot is loaded
//     against the current SharedPath state (a later edit on the source
//     wouldn't retroactively change the cached row).
//   - AC-Translate-10/11: FREE lifetime exhausted → 402 + upgrade body.
//   - AC-Translate-12: PRO monthly anti-abuse cap → 429.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { Prisma } from '@prisma/client';

const mocks = vi.hoisted(() => {
  const sharedPath = {
    findUnique: vi.fn(),
    update: vi.fn(),
  };
  const studyPhase = {
    findMany: vi.fn(),
  };
  const pathRating = {
    findUnique: vi.fn(),
  };
  const studyPlan = {
    findFirst: vi.fn(),
  };
  const pathTranslation = {
    findUnique: vi.fn(),
    create: vi.fn(),
    updateMany: vi.fn(),
    aggregate: vi.fn(),
  };
  const user = {
    findUnique: vi.fn(),
  };
  return {
    getAuthUserId: vi.fn(),
    getAdminUserId: vi.fn().mockResolvedValue(null),
    rateLimit: vi.fn(),
    checkUsageLimit: vi.fn(),
    incrementUsage: vi.fn(),
    runTranslation: vi.fn(),
    loadTranslatableSnapshot: vi.fn(),
    dbMock: {
      sharedPath,
      studyPhase,
      pathRating,
      studyPlan,
      pathTranslation,
      user,
    },
  };
});

vi.mock('@/lib/auth', () => ({
  getAuthUserId: mocks.getAuthUserId,
  getAdminUserId: mocks.getAdminUserId,
}));
vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));
vi.mock('@/lib/rate-limit', async () => {
  const actual = await vi.importActual<typeof import('@/lib/rate-limit')>(
    '@/lib/rate-limit',
  );
  return {
    ...actual,
    rateLimit: mocks.rateLimit,
    costRateLimit: mocks.rateLimit,
  };
});
vi.mock('@/lib/usage-limits', () => ({
  checkUsageLimit: mocks.checkUsageLimit,
  incrementUsage: mocks.incrementUsage,
}));
vi.mock('@/lib/translation/runner', () => ({
  runTranslation: mocks.runTranslation,
}));
vi.mock('@/lib/translation/snapshot', () => ({
  loadTranslatableSnapshot: mocks.loadTranslatableSnapshot,
}));

import { GET } from '../../../../app/api/community/paths/[shareId]/route';

const callGet = (shareId: string, lang?: string | null) => {
  const qs = lang ? `?lang=${encodeURIComponent(lang)}` : '';
  const req = new NextRequest(
    `http://localhost/api/community/paths/${shareId}${qs}`,
    { method: 'GET' },
  );
  return GET(req, { params: Promise.resolve({ shareId }) });
};

// --- Default happy-path fixture --------------------------------------

function makeSharedPath(overrides: Partial<{ language: string }> = {}) {
  return {
    id: 'shp-1',
    planId: 'plan-1',
    title: 'Source title',
    description: 'Source description',
    coverImageUrl: null,
    language: 'de',
    subjects: ['coding'],
    phaseCount: 1,
    slotCount: 2,
    downloadCount: 5,
    viewCount: 12,
    ratingAverage: 4.2,
    ratingCount: 6,
    seeded: false,
    approvedAt: new Date('2026-05-01T00:00:00Z'),
    createdAt: new Date('2026-04-29T00:00:00Z'),
    moderationStatus: 'approved' as const,
    sharedBy: { id: 'usr-author', username: 'author', avatarUrl: null },
    ...overrides,
  };
}

function makePhases() {
  return [
    {
      id: 'phase-1',
      title: 'Phase 1',
      sortOrder: 0,
      slots: [
        {
          id: 'slot-1',
          title: 'Slot 1',
          description: 'Slot 1 description',
          kind: 'learning',
          sortOrder: 0,
        },
        {
          id: 'slot-2',
          title: 'Slot 2',
          description: null,
          kind: 'assessment',
          sortOrder: 1,
        },
      ],
    },
  ];
}

function makeSnapshot() {
  return {
    sourceLanguage: 'de',
    targetLanguage: 'en',
    title: 'Source title',
    description: 'Source description',
    phases: [
      {
        id: 'phase-1',
        title: 'Phase 1',
        description: null,
        slots: [
          { id: 'slot-1', title: 'Slot 1', description: 'Slot 1 description' },
          { id: 'slot-2', title: 'Slot 2', description: null },
        ],
      },
    ],
  };
}

beforeEach(() => {
  // `mockReset()` (not `clearAllMocks`) — clears BOTH the call history
  // AND any `mockResolvedValueOnce` / `mockRejectedValueOnce` queues
  // left behind by the previous test. `clearAllMocks` keeps those
  // queues, which leaks `ready` cache rows into single-flight tests and
  // similar cross-test contamination.
  mocks.getAuthUserId.mockReset();
  mocks.getAdminUserId.mockReset();
  mocks.rateLimit.mockReset();
  mocks.checkUsageLimit.mockReset();
  mocks.incrementUsage.mockReset();
  mocks.runTranslation.mockReset();
  mocks.loadTranslatableSnapshot.mockReset();
  mocks.dbMock.sharedPath.findUnique.mockReset();
  mocks.dbMock.sharedPath.update.mockReset();
  mocks.dbMock.studyPhase.findMany.mockReset();
  mocks.dbMock.pathRating.findUnique.mockReset();
  mocks.dbMock.studyPlan.findFirst.mockReset();
  mocks.dbMock.pathTranslation.findUnique.mockReset();
  mocks.dbMock.pathTranslation.create.mockReset();
  mocks.dbMock.pathTranslation.updateMany.mockReset();
  mocks.dbMock.pathTranslation.aggregate.mockReset();
  mocks.dbMock.user.findUnique.mockReset();

  // Re-establish defaults: authed user, approved path, no clone, no
  // rating, view-increment rate-limit succeeds (so the fire-and-forget
  // branch runs without throwing).
  mocks.getAuthUserId.mockResolvedValue('user-1');
  mocks.getAdminUserId.mockResolvedValue(null);
  mocks.dbMock.studyPhase.findMany.mockResolvedValue(makePhases());
  mocks.dbMock.pathRating.findUnique.mockResolvedValue(null);
  mocks.dbMock.studyPlan.findFirst.mockResolvedValue(null);
  mocks.dbMock.sharedPath.update.mockResolvedValue({ id: 'shp-1' });
  mocks.rateLimit.mockResolvedValue({ success: true });
  // Daily-budget default — no spend recorded today, so the budget
  // check passes unless a test overrides this.
  mocks.dbMock.pathTranslation.aggregate.mockResolvedValue({ _sum: { costUsd: 0 } });
  // User default — FREE tier with quota left.
  mocks.dbMock.user.findUnique.mockResolvedValue({ tier: 'FREE' });
  mocks.checkUsageLimit.mockResolvedValue({ allowed: true, used: 0, limit: 5 });
  mocks.incrementUsage.mockResolvedValue(undefined);
});

// ---------------------------------------------------------------------
// AC-Translate-1 — source-lang short-circuit / auth guard
// ---------------------------------------------------------------------

describe('GET /api/community/paths/[shareId] — source language (AC-Translate-1)', () => {
  it('returns 401 when unauthenticated', async () => {
    mocks.getAuthUserId.mockResolvedValueOnce(null);
    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(401);
    expect(mocks.dbMock.sharedPath.findUnique).not.toHaveBeenCalled();
    expect(mocks.dbMock.pathTranslation.findUnique).not.toHaveBeenCalled();
    expect(mocks.runTranslation).not.toHaveBeenCalled();
  });

  it('returns the source snapshot with no translation envelope when ?lang is omitted', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    const res = await callGet('shp-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.language).toBe('de');
    expect(body.data.translation).toBeNull();
    expect(body.data.source.title).toBe('Source title');
    // No translation queries fired — entire translation branch skipped.
    expect(mocks.dbMock.pathTranslation.findUnique).not.toHaveBeenCalled();
    expect(mocks.runTranslation).not.toHaveBeenCalled();
    expect(mocks.checkUsageLimit).not.toHaveBeenCalled();
  });

  it('short-circuits when ?lang equals source language (no AI, no translation queries)', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(
      makeSharedPath({ language: 'de' }),
    );
    const res = await callGet('shp-1', 'de');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.language).toBe('de');
    expect(body.data.translation).toBeNull();
    expect(mocks.dbMock.pathTranslation.findUnique).not.toHaveBeenCalled();
    expect(mocks.runTranslation).not.toHaveBeenCalled();
  });

  it('returns 400 on a malformed lang query', async () => {
    const res = await callGet('shp-1', 'not_a_bcp47!!');
    expect(res.status).toBe(400);
    expect(mocks.dbMock.sharedPath.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 on a non-approved SharedPath (existence-leak)', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce({
      ...makeSharedPath(),
      moderationStatus: 'pending',
    });
    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(404);
    expect(mocks.runTranslation).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// AC-Translate-2 — first request → AI call + cache write + quota inc
// ---------------------------------------------------------------------

describe('GET /api/community/paths/[shareId]?lang= — first request (AC-Translate-2)', () => {
  it('fires the runner exactly once, increments usage, and returns a ready envelope', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    // No existing translation row.
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce(null);
    // Single-flight create succeeds (we won the lock).
    mocks.dbMock.pathTranslation.create.mockResolvedValueOnce({ id: 'pt-1' });
    // Snapshot loads cleanly.
    mocks.loadTranslatableSnapshot.mockResolvedValueOnce(makeSnapshot());
    // Runner produces a deterministic ready result.
    mocks.runTranslation.mockResolvedValueOnce({
      status: 'ready',
      payload: {
        title: 'Source title',
        description: 'Source description (translated)',
        phases: [
          {
            id: 'phase-1',
            title: 'Phase 1 (translated)',
            description: null,
            slots: [
              { id: 'slot-1', title: 'Slot 1 (translated)', description: 'Slot 1 description (translated)' },
              { id: 'slot-2', title: 'Slot 2 (translated)', description: null },
            ],
          },
        ],
      },
      costUsd: 0.0034,
      model: 'gemini-2.5-flash',
      usage: { inputTokens: 800, outputTokens: 200, cacheReadTokens: 600, cacheWriteTokens: 0 },
    });
    // The route re-reads the row for `updatedAt` after the runner
    // returns. Returning a deterministic timestamp makes the cachedAt
    // assertion stable.
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce({
      updatedAt: new Date('2026-05-21T12:00:00Z'),
    });

    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.language).toBe('en');
    expect(body.data.translation).toEqual({
      status: 'ready',
      language: 'en',
      payload: expect.objectContaining({
        title: 'Source title',
        phases: expect.any(Array),
      }),
      cachedAt: '2026-05-21T12:00:00.000Z',
    });

    // AC-Translate-2 — runner fired EXACTLY once with our snapshot.
    expect(mocks.runTranslation).toHaveBeenCalledTimes(1);
    expect(mocks.runTranslation).toHaveBeenCalledWith('shp-1', expect.objectContaining({
      sourceLanguage: 'de',
      targetLanguage: 'en',
      title: 'Source title',
    }));

    // Cache-write side-effect — the route created the single-flight
    // row before calling the runner.
    expect(mocks.dbMock.pathTranslation.create).toHaveBeenCalledWith({
      data: {
        sharedPathId: 'shp-1',
        language: 'en',
        status: 'translating',
      },
    });

    // AC-Translate-10 quota increment fires AFTER a successful AI call.
    expect(mocks.incrementUsage).toHaveBeenCalledTimes(1);
    expect(mocks.incrementUsage).toHaveBeenCalledWith('user-1', 'path_translation');
  });

  it('lowercases the lang query before any lookup or runner call', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    // Sequential queue: cache lookup → null; re-read after runner →
    // `{ updatedAt }`. Order matters — a non-null first response would
    // short-circuit the runner call we're trying to assert on.
    mocks.dbMock.pathTranslation.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ updatedAt: new Date() });
    mocks.dbMock.pathTranslation.create.mockResolvedValueOnce({ id: 'pt-1' });
    mocks.loadTranslatableSnapshot.mockResolvedValueOnce(makeSnapshot());
    mocks.runTranslation.mockResolvedValueOnce({
      status: 'ready',
      payload: makeSnapshot(),
      costUsd: 0.001,
      model: 'gemini-2.5-flash',
      usage: null,
    });

    await callGet('shp-1', 'EN');

    expect(mocks.dbMock.pathTranslation.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { sharedPathId_language: { sharedPathId: 'shp-1', language: 'en' } },
      }),
    );
    expect(mocks.runTranslation).toHaveBeenCalledWith(
      'shp-1',
      expect.objectContaining({ targetLanguage: 'en' }),
    );
  });
});

// ---------------------------------------------------------------------
// AC-Translate-3 — cache hit (zero AI calls)
// ---------------------------------------------------------------------

describe('GET /api/community/paths/[shareId]?lang= — cache hit (AC-Translate-3)', () => {
  it('returns the cached payload without calling the runner, the rate-limiter, or the quota check', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    const cachedPayload = {
      title: 'Cached title',
      description: 'Cached description',
      phases: [
        {
          id: 'phase-1',
          title: 'Cached Phase 1',
          description: null,
          slots: [
            { id: 'slot-1', title: 'Cached Slot 1', description: null },
            { id: 'slot-2', title: 'Cached Slot 2', description: null },
          ],
        },
      ],
    };
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce({
      status: 'ready',
      payload: cachedPayload,
      error: null,
      updatedAt: new Date('2026-05-20T08:00:00Z'),
    });

    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.translation).toEqual({
      status: 'ready',
      language: 'en',
      payload: cachedPayload,
      cachedAt: '2026-05-20T08:00:00.000Z',
    });

    // Crucial: AC-Translate-3 — ZERO AI call on cache hit.
    expect(mocks.runTranslation).not.toHaveBeenCalled();
    // ...and ZERO of the gate checks fire — cache hits bypass them.
    // (Only the view-counter rate-limit token may have fired in the
    // fire-and-forget branch; the translation rate-limit + quota +
    // budget gates must stay silent.)
    expect(mocks.checkUsageLimit).not.toHaveBeenCalled();
    expect(mocks.incrementUsage).not.toHaveBeenCalled();
    expect(mocks.dbMock.pathTranslation.aggregate).not.toHaveBeenCalled();
    expect(mocks.dbMock.pathTranslation.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// AC-Translate-5 — in-flight translating-status polling
// ---------------------------------------------------------------------

describe('GET /api/community/paths/[shareId]?lang= — translating status (AC-Translate-5)', () => {
  it('returns translating envelope without calling the runner or burning quota', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce({
      status: 'translating',
      payload: null,
      error: null,
      updatedAt: new Date(),
    });

    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.translation).toEqual({
      status: 'translating',
      language: 'en',
    });

    expect(mocks.runTranslation).not.toHaveBeenCalled();
    expect(mocks.checkUsageLimit).not.toHaveBeenCalled();
    expect(mocks.incrementUsage).not.toHaveBeenCalled();
    expect(mocks.dbMock.pathTranslation.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// AC-Translate-4 — concurrent first-requesters → exactly 1 AI call
// ---------------------------------------------------------------------

describe('GET /api/community/paths/[shareId]?lang= — single-flight (AC-Translate-4)', () => {
  it('the race-loser sees P2002, re-reads, and returns the winner\'s row WITHOUT firing the runner', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    // Cache lookup returns null (no row exists yet).
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce(null);
    // Create throws a P2002 — the winner beat us to the insert.
    mocks.dbMock.pathTranslation.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        'Unique constraint failed on the fields: (`sharedPathId`,`language`)',
        { code: 'P2002', clientVersion: '5.x.x' },
      ),
    );
    // Re-read picks up the winner's row (still translating because
    // the winner's runner hasn't finished yet).
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce({
      status: 'translating',
      payload: null,
      error: null,
      updatedAt: new Date(),
    });

    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.translation).toEqual({
      status: 'translating',
      language: 'en',
    });

    // The runner was NOT called by the racer-loser — exactly one
    // runner call across the concurrent pair (the winner runs in a
    // separate request the test doesn't simulate).
    expect(mocks.runTranslation).not.toHaveBeenCalled();
    // The racer-loser does NOT burn quota — the winner will.
    expect(mocks.incrementUsage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// AC-Translate-8 — rate limit user + IP
// ---------------------------------------------------------------------

describe('GET /api/community/paths/[shareId]?lang= — rate limits (AC-Translate-8)', () => {
  it('returns 429 when the per-user rate-limit fires (no runner call)', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce(null);
    // The viewCount fire-and-forget rate-limit + the translation rate-
    // limit both call mocks.rateLimit. Order: the translation flow
    // fires user-limit first. We mock the first translation-limit call
    // as a 429.
    //
    // Sequence: viewCount (succeeds), then user-translation-limit
    // (fails).
    mocks.rateLimit
      .mockResolvedValueOnce({ success: true }) // viewCount limit
      .mockResolvedValueOnce({ success: false, retryAfterMs: 30_000 }); // user

    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(429);
    expect(mocks.runTranslation).not.toHaveBeenCalled();
    expect(mocks.dbMock.pathTranslation.create).not.toHaveBeenCalled();
  });

  it('returns 429 when the per-IP rate-limit fires after the user-limit passes', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce(null);
    mocks.rateLimit
      .mockResolvedValueOnce({ success: true }) // viewCount
      .mockResolvedValueOnce({ success: true }) // user-translation
      .mockResolvedValueOnce({ success: false, retryAfterMs: 60_000 }); // IP

    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(429);
    expect(mocks.runTranslation).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// AC-Translate-10/11/12 — usage quota gates
// ---------------------------------------------------------------------

describe('GET /api/community/paths/[shareId]?lang= — quota gates (AC-Translate-10/11/12)', () => {
  it('FREE lifetime exhausted → 402 with upgrade body, no runner call, no increment', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce(null);
    mocks.dbMock.user.findUnique.mockResolvedValueOnce({ tier: 'FREE' });
    mocks.checkUsageLimit.mockResolvedValueOnce({
      allowed: false,
      used: 5,
      limit: 5,
    });

    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(402);
    const body = await res.json();
    expect(body.upgrade).toBe(true);
    expect(body.success).toBe(false);
    expect(typeof body.error).toBe('string');
    expect(mocks.runTranslation).not.toHaveBeenCalled();
    expect(mocks.incrementUsage).not.toHaveBeenCalled();
  });

  it('PRO monthly cap → 429, no runner call (anti-abuse safety net)', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce(null);
    mocks.dbMock.user.findUnique.mockResolvedValueOnce({ tier: 'PRO' });
    mocks.checkUsageLimit.mockResolvedValueOnce({
      allowed: false,
      used: 50,
      limit: 50,
    });

    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(mocks.runTranslation).not.toHaveBeenCalled();
    expect(mocks.incrementUsage).not.toHaveBeenCalled();
  });

  it('FREE user within quota → request proceeds to runner', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce(null);
    mocks.dbMock.user.findUnique.mockResolvedValueOnce({ tier: 'FREE' });
    mocks.checkUsageLimit.mockResolvedValueOnce({
      allowed: true,
      used: 3,
      limit: 5,
    });
    mocks.dbMock.pathTranslation.create.mockResolvedValueOnce({ id: 'pt-1' });
    mocks.loadTranslatableSnapshot.mockResolvedValueOnce(makeSnapshot());
    mocks.runTranslation.mockResolvedValueOnce({
      status: 'ready',
      payload: makeSnapshot(),
      costUsd: 0.001,
      model: 'gemini-2.5-flash',
      usage: null,
    });
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce({
      updatedAt: new Date(),
    });

    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(200);
    expect(mocks.runTranslation).toHaveBeenCalledTimes(1);
    expect(mocks.incrementUsage).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------
// AC-Translate-7 — per-language daily budget guard
// ---------------------------------------------------------------------

describe('GET /api/community/paths/[shareId]?lang= — daily budget (AC-Translate-7)', () => {
  it('returns 429 when today\'s spend in the target language exceeds the cap (no runner call)', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce(null);
    // Today's spend already over the default $5 cap.
    mocks.dbMock.pathTranslation.aggregate.mockResolvedValueOnce({
      _sum: { costUsd: 7.5 },
    });

    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(mocks.runTranslation).not.toHaveBeenCalled();
    expect(mocks.dbMock.pathTranslation.create).not.toHaveBeenCalled();
    expect(mocks.incrementUsage).not.toHaveBeenCalled();
  });

  it('honours TRANSLATION_DAILY_BUDGET_<L>_USD env override', async () => {
    process.env.TRANSLATION_DAILY_BUDGET_EN_USD = '1.0';
    try {
      mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
      mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce(null);
      // $1.50 > $1.00 cap → 429.
      mocks.dbMock.pathTranslation.aggregate.mockResolvedValueOnce({
        _sum: { costUsd: 1.5 },
      });

      const res = await callGet('shp-1', 'en');
      expect(res.status).toBe(429);
      expect(mocks.runTranslation).not.toHaveBeenCalled();
    } finally {
      delete process.env.TRANSLATION_DAILY_BUDGET_EN_USD;
    }
  });
});

// ---------------------------------------------------------------------
// AC-Translate-9 — failed-row retry path increments quota fresh
// ---------------------------------------------------------------------

describe('GET /api/community/paths/[shareId]?lang= — failed-row retry', () => {
  it('claims the failed row via updateMany + runs the translation again', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    // Existing row in failed status.
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce({
      status: 'failed',
      payload: null,
      error: 'previous failure',
      updatedAt: new Date(),
    });
    // Quota + budget + rate limits all pass (defaults).
    // We win the lock on updateMany (count: 1).
    mocks.dbMock.pathTranslation.updateMany.mockResolvedValueOnce({ count: 1 });
    mocks.loadTranslatableSnapshot.mockResolvedValueOnce(makeSnapshot());
    mocks.runTranslation.mockResolvedValueOnce({
      status: 'ready',
      payload: makeSnapshot(),
      costUsd: 0.002,
      model: 'gemini-2.5-flash',
      usage: null,
    });
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce({
      updatedAt: new Date('2026-05-21T13:00:00Z'),
    });

    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.translation.status).toBe('ready');

    expect(mocks.dbMock.pathTranslation.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          sharedPathId: 'shp-1',
          language: 'en',
          status: 'failed',
        }),
      }),
    );
    expect(mocks.runTranslation).toHaveBeenCalledTimes(1);
    expect(mocks.incrementUsage).toHaveBeenCalledTimes(1);
  });

  it('returns the racer-winner\'s status when updateMany matches zero rows', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce({
      status: 'failed',
      payload: null,
      error: 'previous failure',
      updatedAt: new Date(),
    });
    // Lost the updateMany race (count: 0 — another retryer claimed it).
    mocks.dbMock.pathTranslation.updateMany.mockResolvedValueOnce({ count: 0 });
    // Re-read shows the racer-winner ran it to completion.
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce({
      status: 'ready',
      payload: makeSnapshot(),
      error: null,
      updatedAt: new Date('2026-05-21T14:00:00Z'),
    });

    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.translation.status).toBe('ready');
    expect(mocks.runTranslation).not.toHaveBeenCalled();
    expect(mocks.incrementUsage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// Runner failure surfaces as `failed` envelope (no quota increment)
// ---------------------------------------------------------------------

describe('GET /api/community/paths/[shareId]?lang= — runner failure', () => {
  it('surfaces a failed envelope and does NOT increment quota', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce(null);
    mocks.dbMock.pathTranslation.create.mockResolvedValueOnce({ id: 'pt-1' });
    mocks.loadTranslatableSnapshot.mockResolvedValueOnce(makeSnapshot());
    mocks.runTranslation.mockResolvedValueOnce({
      status: 'failed',
      payload: null,
      costUsd: 0,
      model: 'gemini-2.5-flash',
      usage: null,
      error: 'Provider unavailable',
    });

    const res = await callGet('shp-1', 'en');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.translation.status).toBe('failed');
    expect(body.data.translation.error).toContain('Provider unavailable');
    expect(mocks.incrementUsage).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// AC-Translate-9 — snapshot taken at translation time (forensic copy)
// ---------------------------------------------------------------------

describe('GET /api/community/paths/[shareId]?lang= — snapshot semantics (AC-Translate-9)', () => {
  it('hands the runner a forensic snapshot (the runner gets its own copy, not a live SharedPath reference)', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPath());
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce(null);
    mocks.dbMock.pathTranslation.create.mockResolvedValueOnce({ id: 'pt-1' });
    const capturedSnapshot = makeSnapshot();
    mocks.loadTranslatableSnapshot.mockResolvedValueOnce(capturedSnapshot);
    mocks.runTranslation.mockResolvedValueOnce({
      status: 'ready',
      payload: makeSnapshot(),
      costUsd: 0.001,
      model: 'gemini-2.5-flash',
      usage: null,
    });
    mocks.dbMock.pathTranslation.findUnique.mockResolvedValueOnce({
      updatedAt: new Date(),
    });

    await callGet('shp-1', 'en');

    // The runner receives the snapshot object loaded at translation
    // time — a later mutation on the original SharedPath cannot flow
    // into this call's payload (the data is already in the runner's
    // argument).
    expect(mocks.runTranslation).toHaveBeenCalledWith('shp-1', capturedSnapshot);
  });
});
