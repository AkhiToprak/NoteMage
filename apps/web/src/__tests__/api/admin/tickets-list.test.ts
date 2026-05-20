// Integration tests for GET /api/admin/tickets (P6).
//
// Strategy mirrors moderation/layer*-runner.test.ts: mock the two
// boundaries (`@/lib/auth.getAdminUserId` and `@/lib/db`) and assert the
// route handler's orchestration, response shape, and RBAC contract. The
// real DB and the real NextAuth session are out of scope at this layer.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAdminUserId: vi.fn(),
  dbMock: {
    ticket: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    sharedPath: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({ getAdminUserId: mocks.getAdminUserId }));
vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));

// Import the route handler AFTER vi.mock declarations so it picks up the
// mocked deps. The relative path resolves to `apps/web/app/api/admin/tickets/route.ts`.
import { GET } from '../../../../app/api/admin/tickets/route';

const buildRequest = (search: string = '') =>
  new NextRequest(`http://localhost/api/admin/tickets${search}`);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/admin/tickets — RBAC', () => {
  it('returns 404 when the requester is not an admin (AC-Admin-1)', async () => {
    mocks.getAdminUserId.mockResolvedValueOnce(null);

    const res = await GET(buildRequest());

    expect(res.status).toBe(404);
    // The route MUST NOT have touched the DB on a non-admin request.
    expect(mocks.dbMock.ticket.findMany).not.toHaveBeenCalled();
    expect(mocks.dbMock.ticket.count).not.toHaveBeenCalled();
    expect(mocks.dbMock.sharedPath.findMany).not.toHaveBeenCalled();
  });

  it('does not leak the existence of the endpoint via the response body', async () => {
    mocks.getAdminUserId.mockResolvedValueOnce(null);

    const res = await GET(buildRequest('?status=open'));
    const body = await res.json();

    // Generic "Not found" — identical to the response a missing route gives.
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not found');
  });
});

describe('GET /api/admin/tickets — default queue (open, oldest-first)', () => {
  beforeEach(() => {
    mocks.getAdminUserId.mockResolvedValue('admin-user-id');
  });

  it('queries with status=open + type=moderation_review by default, oldest-first', async () => {
    mocks.dbMock.ticket.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.ticket.count.mockResolvedValueOnce(0);

    const res = await GET(buildRequest());

    expect(res.status).toBe(200);
    expect(mocks.dbMock.ticket.findMany).toHaveBeenCalledTimes(1);
    const call = mocks.dbMock.ticket.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ status: 'open', type: 'moderation_review' });
    expect(call.orderBy).toEqual({ createdAt: 'asc' }); // AC-Admin-2
    expect(call.take).toBe(20); // default limit
    expect(call.skip).toBe(0); // page 1
  });

  it('respects the status query param when valid', async () => {
    mocks.dbMock.ticket.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.ticket.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?status=resolved'));

    const call = mocks.dbMock.ticket.findMany.mock.calls[0][0];
    expect(call.where.status).toBe('resolved');
  });

  it('clamps an unknown status param to "open" (no SQL injection surface)', async () => {
    mocks.dbMock.ticket.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.ticket.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?status=DROP-TABLE'));

    const call = mocks.dbMock.ticket.findMany.mock.calls[0][0];
    expect(call.where.status).toBe('open');
  });

  it('clamps limit to [1, 50] — caps overly-large requests', async () => {
    mocks.dbMock.ticket.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.ticket.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?limit=9999'));

    expect(mocks.dbMock.ticket.findMany.mock.calls[0][0].take).toBe(50);
  });

  it('computes skip from page', async () => {
    mocks.dbMock.ticket.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.ticket.count.mockResolvedValueOnce(0);

    await GET(buildRequest('?page=3&limit=10'));

    expect(mocks.dbMock.ticket.findMany.mock.calls[0][0].skip).toBe(20);
    expect(mocks.dbMock.ticket.findMany.mock.calls[0][0].take).toBe(10);
  });
});

describe('GET /api/admin/tickets — SharedPath hydration', () => {
  beforeEach(() => {
    mocks.getAdminUserId.mockResolvedValue('admin-user-id');
  });

  it('hydrates SharedPath summaries via a single bulk findMany call', async () => {
    const t1 = makeTicket({ id: 't1', refId: 'shp1' });
    const t2 = makeTicket({ id: 't2', refId: 'shp2' });
    mocks.dbMock.ticket.findMany.mockResolvedValueOnce([t1, t2]);
    mocks.dbMock.ticket.count.mockResolvedValueOnce(2);
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([
      makeSharedPath({ id: 'shp1', title: 'Path one' }),
      makeSharedPath({ id: 'shp2', title: 'Path two' }),
    ]);

    const res = await GET(buildRequest());
    const body = await res.json();

    // N tickets must NOT produce N+1 sharedPath queries — exactly one bulk
    // findMany call keyed by the in-memory refIds.
    expect(mocks.dbMock.sharedPath.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.dbMock.sharedPath.findMany.mock.calls[0][0].where).toEqual({
      id: { in: ['shp1', 'shp2'] },
    });

    expect(body.success).toBe(true);
    expect(body.data.tickets).toHaveLength(2);
    expect(body.data.tickets[0].sharedPath.title).toBe('Path one');
    expect(body.data.tickets[1].sharedPath.title).toBe('Path two');
    expect(body.data.total).toBe(2);
    expect(body.data.page).toBe(1);
    expect(body.data.totalPages).toBe(1);
  });

  it('sets sharedPath to null when the SharedPath has been deleted out from under the ticket', async () => {
    // AC-Publish-6 auto-dismisses tickets on SharedPath delete; this branch
    // is the defensive fallback for if that invariant ever breaks.
    const t1 = makeTicket({ id: 't1', refId: 'shp-deleted' });
    mocks.dbMock.ticket.findMany.mockResolvedValueOnce([t1]);
    mocks.dbMock.ticket.count.mockResolvedValueOnce(1);
    mocks.dbMock.sharedPath.findMany.mockResolvedValueOnce([]); // missing

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(body.data.tickets[0].sharedPath).toBeNull();
  });

  it('skips the SharedPath query entirely when no tickets reference a SharedPath', async () => {
    mocks.dbMock.ticket.findMany.mockResolvedValueOnce([]);
    mocks.dbMock.ticket.count.mockResolvedValueOnce(0);

    await GET(buildRequest());

    expect(mocks.dbMock.sharedPath.findMany).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/tickets — failure modes', () => {
  it('returns 500 on a DB failure (does not leak the underlying error)', async () => {
    mocks.getAdminUserId.mockResolvedValue('admin-user-id');
    mocks.dbMock.ticket.findMany.mockRejectedValueOnce(new Error('boom'));
    mocks.dbMock.ticket.count.mockResolvedValueOnce(0);

    const res = await GET(buildRequest());
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.success).toBe(false);
    // No raw error message leaks through.
    expect(body.error).not.toContain('boom');
  });
});

// ── fixture helpers ────────────────────────────────────────────────────────

function makeTicket(overrides: Partial<{ id: string; refId: string; status: string }> = {}) {
  const now = new Date('2026-05-20T12:00:00Z');
  return {
    id: overrides.id ?? 'ticket-1',
    type: 'moderation_review',
    refType: 'SharedPath',
    refId: overrides.refId ?? 'shared-path-1',
    status: overrides.status ?? 'open',
    assigneeId: null,
    resolvedById: null,
    resolvedAt: null,
    resolutionNote: null,
    createdAt: now,
    updatedAt: now,
  };
}

function makeSharedPath(overrides: Partial<{ id: string; title: string }> = {}) {
  return {
    id: overrides.id ?? 'shared-path-1',
    title: overrides.title ?? 'Fixture path',
    language: 'en',
    phaseCount: 3,
    slotCount: 12,
    moderationStatus: 'flagged_pending_human',
    seeded: false,
    sharedBy: { id: 'author-id', username: 'author', avatarUrl: null },
  };
}
