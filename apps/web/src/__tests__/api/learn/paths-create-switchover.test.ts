// P12V — POST /api/learn/paths free-tier switchover gate (AC-Switch-1)
// plus the PRO-unchanged regression (AC-Switch-2).
//
// Two shapes:
//   - FREE + flag on: checkUsageLimit reports limit 0 → the route returns
//     402 with library-pointing copy, fires the blocked-telemetry, and
//     never touches the AI pipeline.
//   - allowed user (PRO): the route proceeds through the unchanged Stage A
//     + transaction + fire-and-forget Stage B and returns 201. The
//     blocked-telemetry is never fired.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn(),
  checkUsageLimit: vi.fn(),
  incrementUsage: vi.fn(),
  checkTokenBudget: vi.fn(),
  trackFreeUserPathGenerationBlocked: vi.fn(),
  loadMaterialCorpus: vi.fn(),
  renderMaterialCorpus: vi.fn(),
  classifySubjects: vi.fn(),
  generatePathStructure: vi.fn(),
  generatePath: vi.fn(),
  logTelemetry: vi.fn(),
  loadPathsForUser: vi.fn(),
  serializePath: vi.fn(),
  db: {
    notebook: { count: vi.fn(), findFirst: vi.fn() },
    // Concurrent-generation cap counts the user's in-flight 'generating' plans.
    studyPlan: { count: vi.fn().mockResolvedValue(0) },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/auth', () => ({ getAuthUserId: mocks.getAuthUserId }));
vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/usage-limits', () => ({
  checkUsageLimit: mocks.checkUsageLimit,
  incrementUsage: mocks.incrementUsage,
}));
vi.mock('@/lib/token-budget', () => ({
  checkTokenBudget: mocks.checkTokenBudget,
}));
vi.mock('@/lib/telemetry-switchover', () => ({
  trackFreeUserPathGenerationBlocked: mocks.trackFreeUserPathGenerationBlocked,
}));
vi.mock('@/lib/path-corpus', () => ({
  loadMaterialCorpus: mocks.loadMaterialCorpus,
  renderMaterialCorpus: mocks.renderMaterialCorpus,
}));
vi.mock('@/lib/path-classifier', () => ({ classifySubjects: mocks.classifySubjects }));
vi.mock('@/lib/path-generator', () => ({
  generatePathStructure: mocks.generatePathStructure,
  generatePath: mocks.generatePath,
}));
vi.mock('@/lib/telemetry-server', () => ({ logTelemetry: mocks.logTelemetry }));
vi.mock('@/lib/path-loader', () => ({
  loadPathsForUser: mocks.loadPathsForUser,
  serializePath: mocks.serializePath,
  // Concurrent-generation cap reads this to exclude dead/stale 'generating' rows.
  staleGenerationCutoff: () => new Date(0),
}));

import { POST } from '../../../../app/api/learn/paths/route';

const ORIGINAL = process.env.FREE_TIER_AI_PATHS_DISABLED;

function callPost(body: Record<string, unknown>) {
  const req = new NextRequest('http://localhost/api/learn/paths', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'content-type': 'application/json' },
  });
  return POST(req);
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.FREE_TIER_AI_PATHS_DISABLED;
  else process.env.FREE_TIER_AI_PATHS_DISABLED = ORIGINAL;
});

describe('POST /api/learn/paths — FREE switchover block (AC-Switch-1)', () => {
  beforeEach(() => {
    process.env.FREE_TIER_AI_PATHS_DISABLED = 'true';
    mocks.getAuthUserId.mockResolvedValue('free-user');
    // tiers.ts getter would return 0; checkUsageLimit reflects that.
    mocks.checkUsageLimit.mockResolvedValue({ allowed: false, used: 0, limit: 0 });
  });

  it('returns 402 with copy pointing at the community library', async () => {
    const res = await callPost({ title: 'Quantum mechanics' });
    const body = await res.json();

    expect(res.status).toBe(402);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/community library/i);
    expect(body.error).toMatch(/Pro/);
  });

  it('fires free_user.path_generation_blocked telemetry', async () => {
    await callPost({ title: 'Quantum mechanics' });
    expect(mocks.trackFreeUserPathGenerationBlocked).toHaveBeenCalledWith('free-user');
  });

  it('never reaches the AI pipeline', async () => {
    await callPost({ title: 'Quantum mechanics' });
    expect(mocks.classifySubjects).not.toHaveBeenCalled();
    expect(mocks.generatePathStructure).not.toHaveBeenCalled();
    expect(mocks.db.$transaction).not.toHaveBeenCalled();
    expect(mocks.incrementUsage).not.toHaveBeenCalled();
  });

  it('still returns the legacy 429 (not 402) when the flag is off but quota is spent', async () => {
    process.env.FREE_TIER_AI_PATHS_DISABLED = 'false';
    // Flag off → the only way to be blocked is exhausting the limit of 3.
    mocks.checkUsageLimit.mockResolvedValue({ allowed: false, used: 3, limit: 3 });

    const res = await callPost({ title: 'Quantum mechanics' });

    expect(res.status).toBe(429);
    expect(mocks.trackFreeUserPathGenerationBlocked).not.toHaveBeenCalled();
  });
});

describe('POST /api/learn/paths — PRO unchanged flow (AC-Switch-2 regression)', () => {
  beforeEach(() => {
    // Even with the switchover flag on, an allowed (PRO) user sails past.
    process.env.FREE_TIER_AI_PATHS_DISABLED = 'true';
    mocks.getAuthUserId.mockResolvedValue('pro-user');
    mocks.checkUsageLimit.mockResolvedValue({ allowed: true, used: 0, limit: -1 });
    mocks.checkTokenBudget.mockResolvedValue({
      allowed: true,
      usedTokens: 0,
      tokenLimit: 1_000_000,
    });
    mocks.loadMaterialCorpus.mockResolvedValue([]);
    mocks.renderMaterialCorpus.mockReturnValue('');
    mocks.db.notebook.findFirst.mockResolvedValue({ id: 'nb1' });
    mocks.classifySubjects.mockResolvedValue({
      subjects: ['general'],
      weights: [1],
      fallback: false,
    });
    mocks.generatePathStructure.mockResolvedValue({
      title: 'Designed title',
      description: 'Designed description',
      phases: [
        {
          title: 'Phase 1',
          description: 'p1',
          slots: [{ title: 'Slot 1', topicHint: 'hint', kind: 'learning' }],
        },
      ],
    });
    mocks.db.$transaction.mockImplementation(
      async (cb: (tx: unknown) => Promise<unknown>) =>
        cb({
          studyPlan: { create: vi.fn().mockResolvedValue({ id: 'plan-new' }) },
          studyPhase: { create: vi.fn().mockResolvedValue({ id: 'phase-1' }) },
          checkpointSlot: { create: vi.fn().mockResolvedValue({ id: 'slot-1' }) },
        }),
    );
    mocks.generatePath.mockResolvedValue(undefined);
    mocks.incrementUsage.mockResolvedValue(undefined);
  });

  it('returns 201 and generates a path (no 402, no blocked telemetry)', async () => {
    const res = await callPost({ title: 'Quantum mechanics' });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data).toEqual({ planId: 'plan-new', status: 'generating' });
    expect(mocks.trackFreeUserPathGenerationBlocked).not.toHaveBeenCalled();
    expect(mocks.generatePathStructure).toHaveBeenCalled();
    expect(mocks.incrementUsage).toHaveBeenCalledWith('pro-user', 'ai_study_plan');
  });
});
