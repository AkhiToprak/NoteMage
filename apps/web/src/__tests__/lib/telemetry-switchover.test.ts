// P12V — switchover telemetry (P0 §5.3 / AC-Switch-4).
//
// Three metrics: free_user.path_clone, free_user.path_generation_blocked,
// free_user.ai_cost_attributed. Mocks the db + both telemetry sinks and
// asserts the FREE-only guards, the never-throw contracts, and the
// cost-attribution aggregation.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  logTelemetry: vi.fn(),
  captureServerEvent: vi.fn(),
  db: {
    user: { findUnique: vi.fn(), findMany: vi.fn() },
    moderationAudit: { findMany: vi.fn() },
    pathTranslation: { aggregate: vi.fn() },
  },
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/telemetry-server', () => ({ logTelemetry: mocks.logTelemetry }));
vi.mock('@/lib/analytics/posthog-server', () => ({
  captureServerEvent: mocks.captureServerEvent,
}));

import {
  trackFreeUserPathClone,
  trackFreeUserPathGenerationBlocked,
  rollupFreeUserAiCost,
} from '@/lib/telemetry-switchover';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('trackFreeUserPathClone', () => {
  it('emits free_user.path_clone for a FREE cloner', async () => {
    mocks.db.user.findUnique.mockResolvedValueOnce({ tier: 'FREE' });

    await trackFreeUserPathClone('u1', 'shp-1');

    expect(mocks.logTelemetry).toHaveBeenCalledWith('u1', 'free_user.path_clone', {
      shareId: 'shp-1',
    });
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({ distinctId: 'u1', event: 'free_user.path_clone' }),
    );
  });

  it('stays silent for a PRO cloner (not part of the funnel metric)', async () => {
    mocks.db.user.findUnique.mockResolvedValueOnce({ tier: 'PRO' });

    await trackFreeUserPathClone('u1', 'shp-1');

    expect(mocks.logTelemetry).not.toHaveBeenCalled();
    expect(mocks.captureServerEvent).not.toHaveBeenCalled();
  });

  it('never throws — a db failure is swallowed (telemetry must not break a clone)', async () => {
    mocks.db.user.findUnique.mockRejectedValueOnce(new Error('db down'));

    await expect(trackFreeUserPathClone('u1', 'shp-1')).resolves.toBeUndefined();
    expect(mocks.logTelemetry).not.toHaveBeenCalled();
  });
});

describe('trackFreeUserPathGenerationBlocked', () => {
  it('emits free_user.path_generation_blocked', () => {
    trackFreeUserPathGenerationBlocked('u1');

    expect(mocks.logTelemetry).toHaveBeenCalledWith(
      'u1',
      'free_user.path_generation_blocked',
      { feature: 'ai_study_plan' },
    );
    expect(mocks.captureServerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        distinctId: 'u1',
        event: 'free_user.path_generation_blocked',
      }),
    );
  });
});

describe('rollupFreeUserAiCost', () => {
  it('attributes moderation cost to FREE publishers and totals translation cost', async () => {
    mocks.db.moderationAudit.findMany.mockResolvedValueOnce([
      { costUsd: 0.01, sharedPath: { sharedById: 'free1' } },
      { costUsd: 0.04, sharedPath: { sharedById: 'free1' } },
      { costUsd: 0.02, sharedPath: { sharedById: 'pro1' } },
    ]);
    // Only free1 is FREE — pro1's cost is excluded from the per-user roll-up.
    mocks.db.user.findMany.mockResolvedValueOnce([{ id: 'free1' }]);
    mocks.db.pathTranslation.aggregate.mockResolvedValueOnce({
      _sum: { costUsd: 0.5 },
    });

    const since = new Date('2026-05-20T00:00:00Z');
    const until = new Date('2026-05-21T00:00:00Z');
    const r = await rollupFreeUserAiCost({ since, until });

    expect(r.moderationByUser).toHaveLength(1);
    expect(r.moderationByUser[0].userId).toBe('free1');
    expect(r.moderationByUser[0].costUsd).toBeCloseTo(0.05, 5);
    expect(r.moderationTotalUsd).toBeCloseTo(0.05, 5);
    expect(r.translationTotalUsd).toBe(0.5);
    expect(r.freeUserCount).toBe(1);

    // Window was scoped correctly on both cost sources.
    expect(mocks.db.moderationAudit.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          createdAt: { gte: since, lt: until },
          costUsd: { gt: 0 },
        }),
      }),
    );

    // One per-FREE-user event + one window-summary event.
    expect(mocks.logTelemetry).toHaveBeenCalledWith(
      'free1',
      'free_user.ai_cost_attributed',
      expect.objectContaining({ moderationCostUsd: expect.any(Number) }),
    );
    expect(mocks.logTelemetry).toHaveBeenCalledWith(
      null,
      'free_user.ai_cost_attributed',
      expect.objectContaining({ scope: 'window_summary', translationTotalUsd: 0.5 }),
    );
  });

  it('handles an empty window without querying users', async () => {
    mocks.db.moderationAudit.findMany.mockResolvedValueOnce([]);
    mocks.db.pathTranslation.aggregate.mockResolvedValueOnce({
      _sum: { costUsd: null },
    });

    const r = await rollupFreeUserAiCost({ since: new Date(), until: new Date() });

    expect(r.moderationByUser).toEqual([]);
    expect(r.translationTotalUsd).toBe(0);
    expect(r.freeUserCount).toBe(0);
    // No publishers → no point hitting the users table.
    expect(mocks.db.user.findMany).not.toHaveBeenCalled();
  });
});
