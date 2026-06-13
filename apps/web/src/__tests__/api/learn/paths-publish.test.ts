// P11 — integration tests for the seeded-path admin bypass in
// POST /api/learn/paths/[planId]/publish (P0 §4.1).
//
// Scope: just the P11 seeded branch. The regular pending→L1→L2 flow is
// already covered by the moderation phase tests; here we assert (a) an
// admin's `seeded:true` creates an approved+seeded row, stamps
// popularityTriggeredAt, writes the admin audit row, and fires the
// pre-translation fan-out; and (b) a non-admin's `seeded:true` falls
// through to the regular L1 flow with no bypass and no fan-out.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn(),
  getAdminUserId: vi.fn(),
  logAdminAction: vi.fn(),
  runLayer1: vi.fn(),
  runLayer2: vi.fn(),
  runPretranslationFanOut: vi.fn(),
  reserveUsage: vi.fn().mockResolvedValue({ allowed: true, used: 0, limit: -1 }),
  refundUsage: vi.fn(),
  db: {
    sharedPath: {
      findUnique: vi.fn(),
      create: vi.fn(),
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
vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/admin-audit', () => ({ logAdminAction: mocks.logAdminAction }));
vi.mock('@/lib/moderation/layer1-runner', () => ({ runLayer1: mocks.runLayer1 }));
vi.mock('@/lib/moderation/layer2-runner', () => ({ runLayer2: mocks.runLayer2 }));
vi.mock('@/lib/translation/pretranslate', () => ({
  runPretranslationFanOut: mocks.runPretranslationFanOut,
}));
vi.mock('@/lib/usage-limits', () => ({
  reserveUsage: mocks.reserveUsage,
  refundUsage: mocks.refundUsage,
}));

import { POST } from '../../../../app/api/learn/paths/[planId]/publish/route';

const callPublish = (planId: string, body: Record<string, unknown>) => {
  const req = new NextRequest(
    `http://localhost/api/learn/paths/${planId}/publish`,
    {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    },
  );
  return POST(req, { params: Promise.resolve({ planId }) });
};

function readyPlan() {
  return {
    id: 'plan-1',
    title: 'Plan title',
    description: 'Plan description',
    generationStatus: 'ready',
    language: 'de',
    subjects: ['coding'],
    _count: { phases: 2 },
    phases: [{ _count: { slots: 3 } }, { _count: { slots: 2 } }],
  };
}

beforeEach(() => {
  mocks.getAuthUserId.mockReset();
  mocks.getAdminUserId.mockReset();
  mocks.logAdminAction.mockReset();
  mocks.runLayer1.mockReset();
  mocks.runLayer2.mockReset();
  mocks.runPretranslationFanOut.mockReset();
  mocks.db.sharedPath.findUnique.mockReset();
  mocks.db.sharedPath.create.mockReset();
  mocks.db.studyPlan.findFirst.mockReset();

  mocks.getAuthUserId.mockResolvedValue('user-1');
  // No existing publication for this plan.
  mocks.db.sharedPath.findUnique.mockResolvedValue(null);
  mocks.db.studyPlan.findFirst.mockResolvedValue(readyPlan());
  mocks.logAdminAction.mockResolvedValue(undefined);
  mocks.runPretranslationFanOut.mockResolvedValue({});
  // L2 is fired fire-and-forget (`void runLayer2(...).catch(...)`) on
  // the regular flow, so the mock must return a promise to `.catch` on.
  mocks.runLayer2.mockResolvedValue(undefined);
});

describe('publish — seeded admin bypass (P0 §4.1)', () => {
  it('admin + seeded:true → approved+seeded row, audit log, and fan-out', async () => {
    mocks.getAdminUserId.mockResolvedValueOnce('admin-1');
    mocks.db.sharedPath.create.mockResolvedValueOnce({
      id: 'shp-1',
      moderationStatus: 'approved',
      rejectionReason: null,
      createdAt: new Date('2026-05-21T09:00:00Z'),
    });

    const res = await callPublish('plan-1', { seeded: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.moderationStatus).toBe('approved');
    expect(body.data.shareId).toBe('shp-1');

    // Created directly approved + seeded + both timestamps stamped.
    const createArg = mocks.db.sharedPath.create.mock.calls[0][0];
    expect(createArg.data.moderationStatus).toBe('approved');
    expect(createArg.data.seeded).toBe(true);
    expect(createArg.data.approvedAt).toBeInstanceOf(Date);
    expect(createArg.data.popularityTriggeredAt).toBeInstanceOf(Date);

    // L1/L2 are skipped entirely on the seeded path.
    expect(mocks.runLayer1).not.toHaveBeenCalled();
    expect(mocks.runLayer2).not.toHaveBeenCalled();

    // Auditability + cache-warm fan-out.
    expect(mocks.logAdminAction).toHaveBeenCalledWith(
      'admin-1',
      'shared_path.approve',
      'shp-1',
      { seeded: true },
    );
    expect(mocks.runPretranslationFanOut).toHaveBeenCalledWith('shp-1');
  });

  it('non-admin + seeded:true → falls through to the regular L1 flow, no bypass, no fan-out', async () => {
    // Not an admin → seeded is silently ignored.
    mocks.getAdminUserId.mockResolvedValueOnce(null);
    mocks.db.sharedPath.create.mockResolvedValueOnce({
      id: 'shp-2',
      moderationStatus: 'pending',
      rejectionReason: null,
      createdAt: new Date('2026-05-21T09:00:00Z'),
    });
    mocks.runLayer1.mockResolvedValueOnce({
      status: 'auditing_l2',
      judgement: { rejectionReason: null },
    });

    const res = await callPublish('plan-1', { seeded: true });
    expect(res.status).toBe(200);

    // Regular create: pending, NOT seeded, no popularity stamp.
    const createArg = mocks.db.sharedPath.create.mock.calls[0][0];
    expect(createArg.data.moderationStatus).toBe('pending');
    expect(createArg.data.seeded).toBeUndefined();
    expect(createArg.data.popularityTriggeredAt).toBeUndefined();

    // L1 ran, the bypass audit + fan-out did NOT fire.
    expect(mocks.runLayer1).toHaveBeenCalledWith('shp-2');
    expect(mocks.logAdminAction).not.toHaveBeenCalled();
    expect(mocks.runPretranslationFanOut).not.toHaveBeenCalled();
  });
});
