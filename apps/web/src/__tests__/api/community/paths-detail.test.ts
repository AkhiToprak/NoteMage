// Integration tests for GET /api/community/paths/[shareId] (P8).
//
// Strategy mirrors paths-list.test.ts: mock the four boundaries
// (`@/lib/auth.getAuthUserId`, `@/lib/db`, `@/lib/rate-limit.rateLimit`,
// `@/lib/admin-audit` for the DELETE path) and assert the route
// handler's contract.
//
// AC mapping (P0 spec §2.2 + §4.5):
//   - AC-Browse-5: auth required → 401 on missing session.
//   - 404 existence-leak guard on non-approved or missing rows.
//   - AC-Browse-6: payload exposes phase + slot titles only, never
//     theory / flashcards / quiz bodies.
//   - AC-Browse-8: payload includes downloadCount, viewCount, rating
//     aggregates.
//   - viewCount increment is rate-limited 1/user/path/24h; failure to
//     acquire the lock is the no-op branch.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn(),
  getAdminUserId: vi.fn(),
  rateLimit: vi.fn(),
  dbMock: {
    sharedPath: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    studyPhase: {
      findMany: vi.fn(),
    },
    pathRating: {
      findUnique: vi.fn(),
    },
    studyPlan: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({
  getAuthUserId: mocks.getAuthUserId,
  getAdminUserId: mocks.getAdminUserId,
}));
vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));
vi.mock('@/lib/rate-limit', () => ({ rateLimit: mocks.rateLimit }));
// admin-audit only matters for the DELETE branch (P2); the GET tests
// here never exercise it, but we mock it so the import doesn't drag in
// real Prisma at module load.
vi.mock('@/lib/admin-audit', () => ({ logAdminAction: vi.fn() }));

import { GET } from '../../../../app/api/community/paths/[shareId]/route';

const callGet = (shareId: string, search: string = '') => {
  const req = new NextRequest(
    `http://localhost/api/community/paths/${shareId}${search}`,
  );
  return GET(req, { params: Promise.resolve({ shareId }) });
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: every test allows the viewCount increment unless it opts
  // out. Tests that exercise the rate-limit failure branch override
  // this mock to return success=false.
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.dbMock.sharedPath.update.mockResolvedValue({});
});

describe('GET /api/community/paths/[shareId] — auth (AC-Browse-5)', () => {
  it('returns 401 when the requester is unauthenticated', async () => {
    mocks.getAuthUserId.mockResolvedValueOnce(null);

    const res = await callGet('shp-1');

    expect(res.status).toBe(401);
    expect(mocks.dbMock.sharedPath.findUnique).not.toHaveBeenCalled();
  });
});

describe('GET /api/community/paths/[shareId] — existence-leak guard (404 contract)', () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue('viewer-1');
  });

  it('returns 404 when the SharedPath row does not exist', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(null);

    const res = await callGet('shp-missing');

    expect(res.status).toBe(404);
    // No downstream queries fire when the row is missing.
    expect(mocks.dbMock.studyPhase.findMany).not.toHaveBeenCalled();
    expect(mocks.dbMock.pathRating.findUnique).not.toHaveBeenCalled();
  });

  it('returns 404 when moderationStatus is `pending` (existence-leak)', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(
      makeSharedPathRow({ moderationStatus: 'pending' }),
    );

    const res = await callGet('shp-pending');

    expect(res.status).toBe(404);
    expect(mocks.dbMock.studyPhase.findMany).not.toHaveBeenCalled();
  });

  it.each([
    'pending',
    'auditing_l2',
    'auditing_l3',
    'flagged_pending_human',
    'rejected',
  ])('returns 404 for non-approved status `%s`', async (status) => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(
      makeSharedPathRow({ moderationStatus: status }),
    );

    const res = await callGet('shp-non-public');

    expect(res.status).toBe(404);
  });
});

describe('GET /api/community/paths/[shareId] — happy path (AC-Browse-6 + AC-Browse-8)', () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue('viewer-1');
  });

  it('returns the source snapshot, phase/slot preview, and user rating', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(
      makeSharedPathRow({
        id: 'shp-algos',
        title: 'Algorithms warm-up',
        moderationStatus: 'approved',
        downloadCount: 87,
        viewCount: 412,
        ratingAverage: 4.4,
        ratingCount: 18,
      }),
    );
    mocks.dbMock.studyPhase.findMany.mockResolvedValueOnce([
      makePhase({
        id: 'phase-1',
        title: 'Foundations',
        sortOrder: 0,
        slots: [
          makeSlot({ id: 'slot-1', title: 'Arrays', kind: 'learning', sortOrder: 0 }),
          makeSlot({ id: 'slot-2', title: 'Linked lists', kind: 'learning', sortOrder: 1 }),
          makeSlot({ id: 'slot-3', title: 'Phase quiz', kind: 'assessment', sortOrder: 2 }),
        ],
      }),
    ]);
    mocks.dbMock.pathRating.findUnique.mockResolvedValueOnce({ value: 5 });
    mocks.dbMock.studyPlan.findFirst.mockResolvedValueOnce(null);

    const res = await callGet('shp-algos');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.source).toMatchObject({
      shareId: 'shp-algos',
      title: 'Algorithms warm-up',
      downloadCount: 87,
      viewCount: 412,
      ratingAverage: 4.4,
      ratingCount: 18,
    });
    expect(body.data.source.phases).toHaveLength(1);
    expect(body.data.source.phases[0].slots).toHaveLength(3);
    expect(body.data.source.phases[0].slots[0]).toMatchObject({
      id: 'slot-1',
      title: 'Arrays',
      kind: 'learning',
    });
    expect(body.data.userRating).toBe(5);
  });

  it('returns userRating=null when the requester has not rated the path', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(
      makeSharedPathRow({ moderationStatus: 'approved' }),
    );
    mocks.dbMock.studyPhase.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.pathRating.findUnique.mockResolvedValueOnce(null);
    mocks.dbMock.studyPlan.findFirst.mockResolvedValueOnce(null);

    const res = await callGet('shp-unrated');
    const body = await res.json();

    expect(body.data.userRating).toBeNull();
  });

  it('returns userClonePlanId when the requester has an existing clone of this path', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(
      makeSharedPathRow({ moderationStatus: 'approved' }),
    );
    mocks.dbMock.studyPhase.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.pathRating.findUnique.mockResolvedValueOnce(null);
    mocks.dbMock.studyPlan.findFirst.mockResolvedValueOnce({ id: 'plan-clone-1' });

    const res = await callGet('shp-already-cloned');
    const body = await res.json();

    expect(body.data.userClonePlanId).toBe('plan-clone-1');
  });

  it('phases are loaded ordered by sortOrder asc, slots within phases ordered the same way (AC-Browse-6)', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(
      makeSharedPathRow({ moderationStatus: 'approved' }),
    );
    mocks.dbMock.studyPhase.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.pathRating.findUnique.mockResolvedValueOnce(null);
    mocks.dbMock.studyPlan.findFirst.mockResolvedValueOnce(null);

    await callGet('shp-ordered');

    const phaseCall = mocks.dbMock.studyPhase.findMany.mock.calls[0][0];
    expect(phaseCall.orderBy).toEqual({ sortOrder: 'asc' });
    expect(phaseCall.select.slots.orderBy).toEqual({ sortOrder: 'asc' });
  });

  it('never selects theory / flashcards / quiz bodies (AC-Browse-6 — preview only)', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(
      makeSharedPathRow({ moderationStatus: 'approved' }),
    );
    mocks.dbMock.studyPhase.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.pathRating.findUnique.mockResolvedValueOnce(null);
    mocks.dbMock.studyPlan.findFirst.mockResolvedValueOnce(null);

    await callGet('shp-preview-only');

    const slotSelect =
      mocks.dbMock.studyPhase.findMany.mock.calls[0][0].select.slots.select;
    // Only the preview-grade fields are selected.
    expect(slotSelect).toEqual({
      id: true,
      title: true,
      description: true,
      kind: true,
      sortOrder: true,
    });
    // Critically — these MUST NOT appear in the slot selection.
    expect(slotSelect.activities).toBeUndefined();
    expect(slotSelect.theory).toBeUndefined();
    expect(slotSelect.flashcardSet).toBeUndefined();
    expect(slotSelect.quizSet).toBeUndefined();
  });
});

describe('GET /api/community/paths/[shareId] — viewCount throttle', () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue('viewer-1');
    mocks.dbMock.sharedPath.findUnique.mockResolvedValue(
      makeSharedPathRow({ moderationStatus: 'approved' }),
    );
    mocks.dbMock.studyPhase.findMany.mockResolvedValue([]);
    mocks.dbMock.pathRating.findUnique.mockResolvedValue(null);
    mocks.dbMock.studyPlan.findFirst.mockResolvedValue(null);
  });

  it('increments viewCount when the rate-limit token is acquired', async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: true });

    await callGet('shp-fresh');
    // The increment runs in a fire-and-forget IIFE; flush microtasks so
    // the void-async branch lands before assertion.
    await new Promise((r) => setTimeout(r, 0));

    expect(mocks.dbMock.sharedPath.update).toHaveBeenCalledWith({
      where: { id: 'shp-fresh' },
      data: { viewCount: { increment: 1 } },
    });
  });

  it('does NOT increment viewCount when the rate-limit window is closed', async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: false, retryAfterMs: 60_000 });

    await callGet('shp-refresh-spam');
    await new Promise((r) => setTimeout(r, 0));

    expect(mocks.dbMock.sharedPath.update).not.toHaveBeenCalled();
  });

  it('keys the rate-limit token on (userId, shareId)', async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: true });

    await callGet('shp-keyed');
    await new Promise((r) => setTimeout(r, 0));

    const call = mocks.rateLimit.mock.calls[0];
    expect(call[0]).toContain('viewer-1');
    expect(call[0]).toContain('shp-keyed');
  });

  it('a viewCount-update DB failure does not surface to the user', async () => {
    mocks.rateLimit.mockResolvedValueOnce({ success: true });
    mocks.dbMock.sharedPath.update.mockRejectedValueOnce(new Error('boom'));

    const res = await callGet('shp-flaky-counter');
    await new Promise((r) => setTimeout(r, 0));

    // The detail page still serves a 200; the counter is best-effort.
    expect(res.status).toBe(200);
  });
});

describe('GET /api/community/paths/[shareId] — failure modes', () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue('viewer-1');
  });

  it('returns 500 on a DB failure during the primary load', async () => {
    mocks.dbMock.sharedPath.findUnique.mockRejectedValueOnce(new Error('boom'));

    const res = await callGet('shp-err');
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    expect(body.error).not.toContain('boom');
  });
});

// ── fixtures ─────────────────────────────────────────────────────────

function makeSharedPathRow(overrides: Partial<{
  id: string;
  planId: string;
  title: string;
  description: string | null;
  coverImageUrl: string | null;
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
  createdAt: Date;
  moderationStatus: string;
}> = {}) {
  const now = new Date('2026-05-19T12:00:00Z');
  return {
    id: overrides.id ?? 'shp-1',
    planId: overrides.planId ?? 'plan-1',
    title: overrides.title ?? 'Fixture path',
    description: overrides.description ?? 'A seed-friendly description.',
    coverImageUrl: overrides.coverImageUrl ?? null,
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
    createdAt: overrides.createdAt ?? now,
    moderationStatus: overrides.moderationStatus ?? 'approved',
    sharedBy: {
      id: 'author-1',
      username: 'fixture_author',
      avatarUrl: null,
    },
  };
}

function makePhase(opts: {
  id: string;
  title: string;
  sortOrder: number;
  slots: ReturnType<typeof makeSlot>[];
}) {
  return { id: opts.id, title: opts.title, sortOrder: opts.sortOrder, slots: opts.slots };
}

function makeSlot(opts: {
  id: string;
  title: string;
  kind: string;
  sortOrder: number;
  description?: string | null;
}) {
  return {
    id: opts.id,
    title: opts.title,
    description: opts.description ?? null,
    kind: opts.kind,
    sortOrder: opts.sortOrder,
  };
}
