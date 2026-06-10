// Integration tests for GET /api/community/paths (P8).
//
// Strategy mirrors the admin tickets-list tests: mock the two boundaries
// (`@/lib/auth.getAuthUserId` and `@/lib/db`) and assert the route
// handler's orchestration, filter composition, sort semantics, and
// pagination behaviour. The real DB and the real NextAuth session are
// out of scope at this layer.
//
// AC mapping (P0 spec §2.2):
//   - AC-Browse-1: only `moderationStatus='approved'` rows surface.
//   - AC-Browse-2: filters compose (subject × language × min/max slots
//     × sort).
//   - AC-Browse-3: ILIKE-equivalent search on title + description,
//     length-capped at 100 chars.
//   - AC-Browse-4: default limit=20, hard cap 50, totalPages reflects
//     filtered count.
//   - AC-Browse-5: auth required.
//   - AC-Browse-9: rating sort uses MIN_RATING_SAMPLES threshold; below-
//     threshold rows tail the result list.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn(),
  dbMock: {
    sharedPath: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({ getAuthUserId: mocks.getAuthUserId }));
vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));

import { GET } from '../../../../app/api/community/paths/route';
import { MIN_RATING_SAMPLES } from '@/lib/community-paths';

const buildRequest = (search: string = '') =>
  new NextRequest(`http://localhost/api/community/paths${search}`);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/community/paths — auth (AC-Browse-5)', () => {
  it('returns 401 when the requester is unauthenticated', async () => {
    mocks.getAuthUserId.mockResolvedValueOnce(null);

    const res = await GET(buildRequest());

    expect(res.status).toBe(401);
    // The route MUST NOT have touched the DB on a non-auth request.
    expect(mocks.dbMock.sharedPath.findMany).not.toHaveBeenCalled();
    expect(mocks.dbMock.sharedPath.count).not.toHaveBeenCalled();
  });
});

describe('GET /api/community/paths — baseline `where` filter (AC-Browse-1)', () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue('user-1');
  });

  it('always filters by moderationStatus=approved', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest());

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.where.moderationStatus).toBe('approved');
  });

  it('does not surface pending / auditing_l2 / rejected rows (no Prisma OR injecting other statuses)', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?search=anything'));

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.where.moderationStatus).toBe('approved');
    // The search clause must NOT replace or override the approved gate;
    // it composes via an OR over title/description only.
    expect(Array.isArray(call.where.OR)).toBe(true);
    for (const clause of call.where.OR) {
      expect(clause.moderationStatus).toBeUndefined();
    }
  });
});

describe('GET /api/community/paths — pagination (AC-Browse-4)', () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue('user-1');
  });

  it('defaults to page=1, limit=20 when no params are provided', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(200);
    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.take).toBe(20);
    expect(call.skip).toBe(0);
    expect(body.data.page).toBe(1);
    expect(body.data.limit).toBe(20);
  });

  it('clamps limit to the hard cap of 50', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?limit=9999'));

    expect(mocks.dbMock.sharedPath.findMany.mock.calls[0][0].take).toBe(50);
  });

  it('clamps negative or non-numeric page to 1', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?page=-99&limit=10'));

    expect(mocks.dbMock.sharedPath.findMany.mock.calls[0][0].skip).toBe(0);
  });

  it('computes skip = (page-1) * limit', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?page=4&limit=10'));

    expect(mocks.dbMock.sharedPath.findMany.mock.calls[0][0].skip).toBe(30);
    expect(mocks.dbMock.sharedPath.findMany.mock.calls[0][0].take).toBe(10);
  });

  it('reports totalPages reflecting the filtered count (AC-Browse-4)', async () => {
    // 47 matching rows × limit 20 → 3 pages (ceil)
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(47);

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(body.data.total).toBe(47);
    expect(body.data.totalPages).toBe(3);
  });

  it('pages cleanly across a 100+ row fixture set (P8V acceptance)', async () => {
    // Simulate page 5 of a 117-row result: skip=80, take=20.
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) =>
        makeRow({ id: `shp-${80 + i}`, title: `Path ${80 + i}` }),
      ),
    );
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(117);

    const res = await GET(buildRequest('?page=5&limit=20'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.paths).toHaveLength(20);
    expect(body.data.total).toBe(117);
    expect(body.data.totalPages).toBe(Math.ceil(117 / 20));
    expect(body.data.page).toBe(5);
    expect(mocks.dbMock.sharedPath.findMany.mock.calls[0][0].skip).toBe(80);
  });
});

describe('GET /api/community/paths — search (AC-Browse-3)', () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue('user-1');
  });

  it('search applies ILIKE-equivalent over title AND description', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?search=Algorithms'));

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.where.OR).toEqual([
      { title: { contains: 'Algorithms', mode: 'insensitive' } },
      { description: { contains: 'Algorithms', mode: 'insensitive' } },
    ]);
  });

  it('caps search length at 100 chars (no DOS via runaway input)', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    const runaway = 'x'.repeat(500);
    await GET(buildRequest(`?search=${runaway}`));

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.where.OR[0].title.contains).toHaveLength(100);
  });

  it('trims whitespace and treats empty search as no filter', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?search=%20%20%20'));

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.where.OR).toBeUndefined();
  });
});

describe('GET /api/community/paths — filter composition (AC-Browse-2)', () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue('user-1');
  });

  it('subject filter uses `subjects: { has: <subject> }`', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?subject=math'));

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.where.subjects).toEqual({ has: 'math' });
  });

  it('language filter matches source OR a ready translation (lowercased + length-capped)', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?language=DE'));

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.where.AND).toEqual([
      {
        OR: [
          { language: 'de' },
          { translations: { some: { language: 'de', status: 'ready' } } },
        ],
      },
    ]);
  });

  it('drops malformed language codes (over the BCP-47 length cap)', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?language=this-is-way-too-long-to-be-bcp47'));

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.where.AND).toBeUndefined();
    expect(call.where.language).toBeUndefined();
  });

  it('minSlots / maxSlots compose into a single IntFilter (gte + lte)', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?minSlots=10&maxSlots=18'));

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.where.slotCount).toEqual({ gte: 10, lte: 18 });
  });

  it('minSlots without maxSlots produces a gte-only filter', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?minSlots=19'));

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.where.slotCount).toEqual({ gte: 19 });
  });

  it('subject + language + minSlots + maxSlots + search compose simultaneously (matrix)', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(
      buildRequest(
        '?subject=coding&language=en&minSlots=10&maxSlots=20&search=python',
      ),
    );

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.where).toMatchObject({
      moderationStatus: 'approved',
      subjects: { has: 'coding' },
      slotCount: { gte: 10, lte: 20 },
      OR: [
        { title: { contains: 'python', mode: 'insensitive' } },
        { description: { contains: 'python', mode: 'insensitive' } },
      ],
    });
    // Language now composes via AND (source OR ready-translation), not a
    // direct `where.language` scalar.
    expect(call.where.AND).toEqual([
      {
        OR: [
          { language: 'en' },
          { translations: { some: { language: 'en', status: 'ready' } } },
        ],
      },
    ]);
  });
});

describe('GET /api/community/paths — `filter=mine`', () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue('user-1');
  });

  it('restricts to the requester\'s own approved paths', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?filter=mine'));

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.where.sharedById).toBe('user-1');
    // Still gated on approved — `mine` doesn't open up pending/rejected.
    expect(call.where.moderationStatus).toBe('approved');
  });

  it('clamps an unknown filter param to "all"', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?filter=NUKE-ALL-DATA'));

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.where.sharedById).toBeUndefined();
  });
});

describe('GET /api/community/paths — sort modes (AC-Browse-2 + AC-Browse-9)', () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue('user-1');
  });

  it('default sort is `popular` (downloadCount DESC, approvedAt DESC)', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest());

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([{ downloadCount: 'desc' }, { approvedAt: 'desc' }]);
  });

  it('`sort=recent` orders by approvedAt DESC', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?sort=recent'));

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([{ approvedAt: 'desc' }]);
  });

  it('clamps an unknown sort param to "popular"', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?sort=ALL-BY-MAGIC'));

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual([{ downloadCount: 'desc' }, { approvedAt: 'desc' }]);
  });

  it('`sort=rating` splits into above-threshold and below-threshold queues (AC-Browse-9)', async () => {
    // Above-threshold count: 12 (ratingCount >= MIN). Below-threshold: 25.
    // Total: 37. Page 1, limit 20 → all 12 above + first 8 below.
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(12); // above count
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(25); // below count
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce(
      Array.from({ length: 12 }, (_, i) => makeRow({ id: `above-${i}` })),
    );
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce(
      Array.from({ length: 8 }, (_, i) => makeRow({ id: `below-${i}` })),
    );

    const res = await GET(buildRequest('?sort=rating'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.total).toBe(37);
    expect(body.data.paths).toHaveLength(20);
    expect(body.data.paths.slice(0, 12).map((p: { shareId: string }) => p.shareId)).toEqual(
      Array.from({ length: 12 }, (_, i) => `above-${i}`),
    );
    expect(body.data.paths.slice(12).map((p: { shareId: string }) => p.shareId)).toEqual(
      Array.from({ length: 8 }, (_, i) => `below-${i}`),
    );

    // Above-threshold query: ratingCount >= MIN, ordered by ratingAverage DESC
    const aboveCall = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(aboveCall.where.ratingCount).toEqual({ gte: MIN_RATING_SAMPLES });
    expect(aboveCall.orderBy[0]).toEqual({ ratingAverage: 'desc' });

    // Below-threshold query: ratingCount < MIN, ordered by popular (downloadCount DESC, approvedAt DESC)
    const belowCall = mocks.dbMock.sharedPath.findMany.mock.calls[1][0];
    expect(belowCall.where.ratingCount).toEqual({ lt: MIN_RATING_SAMPLES });
    expect(belowCall.orderBy).toEqual([{ downloadCount: 'desc' }, { approvedAt: 'desc' }]);
  });

  it('`sort=rating` — page entirely inside the above-threshold queue', async () => {
    // 50 above-threshold rows, 30 below. Page 2 limit 20 → skip 20 — fully inside above.
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(50);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(30);
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) => makeRow({ id: `above-${20 + i}` })),
    );

    const res = await GET(buildRequest('?sort=rating&page=2&limit=20'));
    const body = await res.json();

    expect(body.data.paths).toHaveLength(20);
    expect(body.data.total).toBe(80);
    // Only ONE findMany call — the below-threshold queue wasn't hit
    // because the requested page sits entirely above the boundary.
    expect(mocks.dbMock.sharedPath.findMany).toHaveBeenCalledTimes(1);
  });

  it('`sort=rating` — page entirely inside the below-threshold queue', async () => {
    // 10 above + 50 below. Page 2 limit 20 → skip 20 → fully inside below
    // with adjusted skip = 20 - 10 = 10.
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(10);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(50);
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce(
      Array.from({ length: 20 }, (_, i) => makeRow({ id: `below-${10 + i}` })),
    );

    const res = await GET(buildRequest('?sort=rating&page=2&limit=20'));
    const body = await res.json();

    expect(body.data.paths).toHaveLength(20);
    expect(body.data.total).toBe(60);
    expect(mocks.dbMock.sharedPath.findMany).toHaveBeenCalledTimes(1);
    // The below-queue findMany was invoked with skip=10 (the
    // page-2 offset minus the entire above-queue length).
    expect(mocks.dbMock.sharedPath.findMany.mock.calls[0][0].skip).toBe(10);
    expect(mocks.dbMock.sharedPath.findMany.mock.calls[0][0].where.ratingCount).toEqual({
      lt: MIN_RATING_SAMPLES,
    });
  });

  it('AC-Browse-9 invariant: a single 5-star vote NEVER outranks a 4.8/200 row', async () => {
    // 1 above-threshold row (4.8 avg, 200 ratings); 1 below-threshold row
    // (5.0 avg, 1 rating). Above must come first regardless of average.
    const aboveRow = makeRow({
      id: 'long-form',
      ratingAverage: 4.8,
      ratingCount: 200,
    });
    const belowRow = makeRow({
      id: 'fluke-five-star',
      ratingAverage: 5.0,
      ratingCount: 1,
    });
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(1);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(1);
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([aboveRow]);
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([belowRow]);

    const res = await GET(buildRequest('?sort=rating'));
    const body = await res.json();

    expect(body.data.paths[0].shareId).toBe('long-form');
    expect(body.data.paths[1].shareId).toBe('fluke-five-star');
  });
});

describe('GET /api/community/paths — payload shape (AC-Browse-8)', () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue('user-1');
  });

  it('payload exposes the v1 social signals: downloadCount, viewCount, ratingAverage, ratingCount', async () => {
    const row = makeRow({
      id: 'shp-1',
      title: 'Algorithms',
      downloadCount: 42,
      viewCount: 410,
      ratingAverage: 4.6,
      ratingCount: 12,
    });
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([row]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(1);

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(body.data.paths[0]).toMatchObject({
      shareId: 'shp-1',
      title: 'Algorithms',
      downloadCount: 42,
      viewCount: 410,
      ratingAverage: 4.6,
      ratingCount: 12,
      author: { id: 'user-1', username: 'author', avatarUrl: null },
    });
  });

  it('selects the narrow list shape, never the full path tree', async () => {
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    await GET(buildRequest());

    const call = mocks.dbMock.sharedPath.findMany.mock.calls[0][0];
    expect(call.select).toBeDefined();
    // Confirm we're NOT pulling theory/flashcards/quizzes — those are
    // P9 (clone) / P10 (translate) concerns and would balloon the
    // list payload.
    expect(call.select.plan).toBeUndefined();
    expect(call.select.audits).toBeUndefined();
    expect(call.select.translations).toBeUndefined();
  });
});

describe('GET /api/community/paths — failure modes', () => {
  it('returns 500 on a DB failure (does not leak the underlying error)', async () => {
    mocks.getAuthUserId.mockResolvedValue('user-1');
    mocks.dbMock.sharedPath.findMany.mockRejectedValueOnce(new Error('boom'));
    mocks.dbMock.sharedPath.count.mockResolvedValueOnce(0);

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).not.toContain('boom');
  });
});

// ── fixtures ─────────────────────────────────────────────────────────

function makeRow(overrides: Partial<{
  id: string;
  title: string;
  description: string | null;
  language: string;
  subjects: string[];
  phaseCount: number;
  slotCount: number;
  downloadCount: number;
  viewCount: number;
  ratingAverage: number | null;
  ratingCount: number;
  seeded: boolean;
  approvedAt: Date | null;
  authorUsername: string;
}> = {}) {
  const now = new Date('2026-05-19T12:00:00Z');
  return {
    id: overrides.id ?? 'shp-1',
    title: overrides.title ?? 'Fixture path',
    description: overrides.description ?? 'A seed-friendly description.',
    coverImageUrl: null,
    language: overrides.language ?? 'en',
    subjects: overrides.subjects ?? ['general'],
    phaseCount: overrides.phaseCount ?? 3,
    slotCount: overrides.slotCount ?? 9,
    downloadCount: overrides.downloadCount ?? 0,
    viewCount: overrides.viewCount ?? 0,
    ratingAverage: overrides.ratingAverage ?? null,
    ratingCount: overrides.ratingCount ?? 0,
    seeded: overrides.seeded ?? false,
    approvedAt: overrides.approvedAt ?? now,
    sharedBy: {
      id: 'user-1',
      username: overrides.authorUsername ?? 'author',
      avatarUrl: null,
    },
  };
}
