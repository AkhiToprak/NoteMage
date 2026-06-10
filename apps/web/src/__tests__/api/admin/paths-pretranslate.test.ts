// P11 — integration tests for POST /api/admin/paths/[shareId]/pretranslate
// (the admin manual pre-translation trigger, P0 §4.10).
//
// Mock the auth boundary, the db, the admin-audit logger, and the
// fan-out runner. Assert the contract: admin-gate-by-404, approved-only
// precondition, atomic first-trigger flip + audit + fan-out, and the
// idempotent no-op when popularityTriggeredAt was already set.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAdminUserId: vi.fn(),
  logAdminAction: vi.fn(),
  runPretranslationFanOut: vi.fn(),
  db: {
    sharedPath: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock('@/lib/auth', () => ({ getAdminUserId: mocks.getAdminUserId }));
vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/admin-audit', () => ({ logAdminAction: mocks.logAdminAction }));
vi.mock('@/lib/translation/pretranslate', () => ({
  runPretranslationFanOut: mocks.runPretranslationFanOut,
}));

import { POST } from '../../../../app/api/admin/paths/[shareId]/pretranslate/route';

const callPost = (shareId: string) => {
  const req = new NextRequest(
    `http://localhost/api/admin/paths/${shareId}/pretranslate`,
    { method: 'POST' },
  );
  return POST(req, { params: Promise.resolve({ shareId }) });
};

beforeEach(() => {
  mocks.getAdminUserId.mockReset();
  mocks.logAdminAction.mockReset();
  mocks.runPretranslationFanOut.mockReset();
  mocks.db.sharedPath.findUnique.mockReset();
  mocks.db.sharedPath.updateMany.mockReset();

  mocks.getAdminUserId.mockResolvedValue('admin-1');
  mocks.logAdminAction.mockResolvedValue(undefined);
  mocks.runPretranslationFanOut.mockResolvedValue({});
});

describe('POST /api/admin/paths/[shareId]/pretranslate — auth + preconditions', () => {
  it('returns 404 for a non-admin (existence-leak guard) and touches nothing', async () => {
    mocks.getAdminUserId.mockResolvedValueOnce(null);

    const res = await callPost('shp-1');
    expect(res.status).toBe(404);
    expect(mocks.db.sharedPath.findUnique).not.toHaveBeenCalled();
    expect(mocks.db.sharedPath.updateMany).not.toHaveBeenCalled();
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
    expect(mocks.runPretranslationFanOut).not.toHaveBeenCalled();
  });

  it('returns 404 when the path does not exist', async () => {
    mocks.db.sharedPath.findUnique.mockResolvedValueOnce(null);
    const res = await callPost('shp-1');
    expect(res.status).toBe(404);
    expect(mocks.db.sharedPath.updateMany).not.toHaveBeenCalled();
    expect(mocks.runPretranslationFanOut).not.toHaveBeenCalled();
  });

  it('returns 409 when the path is not approved', async () => {
    mocks.db.sharedPath.findUnique.mockResolvedValueOnce({
      id: 'shp-1',
      moderationStatus: 'auditing_l2',
      popularityTriggeredAt: null,
    });
    const res = await callPost('shp-1');
    expect(res.status).toBe(409);
    expect(mocks.db.sharedPath.updateMany).not.toHaveBeenCalled();
    expect(mocks.runPretranslationFanOut).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/paths/[shareId]/pretranslate — first trigger', () => {
  it('flips popularityTriggeredAt, writes the audit row, and fires the fan-out', async () => {
    const triggeredAt = new Date('2026-05-21T10:00:00Z');
    mocks.db.sharedPath.findUnique
      // initial precondition read
      .mockResolvedValueOnce({
        id: 'shp-1',
        moderationStatus: 'approved',
        popularityTriggeredAt: null,
      })
      // re-read for the response timestamp
      .mockResolvedValueOnce({ popularityTriggeredAt: triggeredAt });
    // Atomic flip wins.
    mocks.db.sharedPath.updateMany.mockResolvedValueOnce({ count: 1 });

    const res = await callPost('shp-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.shareId).toBe('shp-1');
    expect(body.data.popularityTriggeredAt).toBe(triggeredAt.toISOString());

    // Atomic guard: only flip when still null.
    expect(mocks.db.sharedPath.updateMany).toHaveBeenCalledWith({
      where: { id: 'shp-1', popularityTriggeredAt: null },
      data: { popularityTriggeredAt: expect.any(Date) },
    });
    // Audit + fan-out fired exactly once each on the winning flip.
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      'admin-1',
      'shared_path.pretranslate_force',
      'shp-1',
    );
    expect(mocks.runPretranslationFanOut).toHaveBeenCalledTimes(1);
    expect(mocks.runPretranslationFanOut).toHaveBeenCalledWith('shp-1');
  });
});

describe('POST /api/admin/paths/[shareId]/pretranslate — idempotency', () => {
  it('returns 200 without re-firing the fan-out or re-logging when already triggered', async () => {
    const existing = new Date('2026-05-20T08:00:00Z');
    mocks.db.sharedPath.findUnique
      .mockResolvedValueOnce({
        id: 'shp-1',
        moderationStatus: 'approved',
        popularityTriggeredAt: existing,
      })
      .mockResolvedValueOnce({ popularityTriggeredAt: existing });
    // Flip matches zero rows — popularityTriggeredAt was already set.
    mocks.db.sharedPath.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await callPost('shp-1');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.popularityTriggeredAt).toBe(existing.toISOString());

    // Idempotent: no duplicate audit row, no duplicate fan-out.
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
    expect(mocks.runPretranslationFanOut).not.toHaveBeenCalled();
  });
});
