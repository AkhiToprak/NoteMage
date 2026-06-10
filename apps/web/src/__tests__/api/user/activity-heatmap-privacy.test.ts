// NM3-15 — regression test for the cross-user privacy gate on
// GET /api/user/activity-heatmap (NM-H3/H4). A private, non-friend target's
// activity must NOT be readable; the endpoint must not become an activity
// oracle. Strategy mirrors the community route tests: mock the auth + db
// boundaries and let the real api-response helpers produce the NextResponse.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn(),
  dbMock: {
    user: { findUnique: vi.fn() },
    friendship: { findFirst: vi.fn() },
    $queryRaw: vi.fn(),
  },
}));

vi.mock('@/lib/auth', () => ({ getAuthUserId: mocks.getAuthUserId }));
vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));

import { GET } from '../../../../app/api/user/activity-heatmap/route';

const VIEWER_ID = 'viewer-1';
const TARGET_ID = 'target-1';

function callGet(query = '') {
  const req = new NextRequest(`http://localhost/api/user/activity-heatmap${query}`);
  return GET(req);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthUserId.mockResolvedValue(VIEWER_ID);
  // Default: empty heatmap for the self/own-data path.
  mocks.dbMock.$queryRaw.mockResolvedValue([]);
});

describe('GET activity-heatmap — auth', () => {
  it('401 without a session, zero DB touch', async () => {
    mocks.getAuthUserId.mockResolvedValue(null);
    const res = await callGet(`?userId=${TARGET_ID}`);
    expect(res.status).toBe(401);
    expect(mocks.dbMock.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.dbMock.$queryRaw).not.toHaveBeenCalled();
  });
});

describe('GET activity-heatmap — cross-user privacy gate', () => {
  it('403 for a private target with no accepted friendship — never reads activity', async () => {
    mocks.dbMock.user.findUnique.mockResolvedValue({ profilePrivate: true });
    mocks.dbMock.friendship.findFirst.mockResolvedValue(null); // not friends

    const res = await callGet(`?userId=${TARGET_ID}`);

    expect(res.status).toBe(403);
    // The privacy gate must short-circuit BEFORE the activity query runs, so
    // the endpoint can't be used as an activity oracle.
    expect(mocks.dbMock.$queryRaw).not.toHaveBeenCalled();
    expect(mocks.dbMock.friendship.findFirst).toHaveBeenCalledTimes(1);
  });

  it('403 for a missing target user (existence-leak guard)', async () => {
    mocks.dbMock.user.findUnique.mockResolvedValue(null);

    const res = await callGet(`?userId=${TARGET_ID}`);

    expect(res.status).toBe(403);
    expect(mocks.dbMock.friendship.findFirst).not.toHaveBeenCalled();
    expect(mocks.dbMock.$queryRaw).not.toHaveBeenCalled();
  });

  it('200 for a private target when an accepted friendship exists', async () => {
    mocks.dbMock.user.findUnique.mockResolvedValue({ profilePrivate: true });
    mocks.dbMock.friendship.findFirst.mockResolvedValue({ id: 'fr-1' });

    const res = await callGet(`?userId=${TARGET_ID}`);

    expect(res.status).toBe(200);
    // Reads the TARGET's activity once the friendship gate passes.
    expect(mocks.dbMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('200 for a public target without requiring a friendship', async () => {
    mocks.dbMock.user.findUnique.mockResolvedValue({ profilePrivate: false });

    const res = await callGet(`?userId=${TARGET_ID}`);

    expect(res.status).toBe(200);
    // Public profile → no friendship lookup needed.
    expect(mocks.dbMock.friendship.findFirst).not.toHaveBeenCalled();
    expect(mocks.dbMock.$queryRaw).toHaveBeenCalledTimes(1);
  });
});

describe('GET activity-heatmap — self read', () => {
  it('reads own activity without any privacy lookup when userId is omitted', async () => {
    const res = await callGet();
    expect(res.status).toBe(200);
    expect(mocks.dbMock.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.dbMock.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('reads own activity without a privacy lookup when userId === self', async () => {
    const res = await callGet(`?userId=${VIEWER_ID}`);
    expect(res.status).toBe(200);
    expect(mocks.dbMock.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.dbMock.$queryRaw).toHaveBeenCalledTimes(1);
  });
});
