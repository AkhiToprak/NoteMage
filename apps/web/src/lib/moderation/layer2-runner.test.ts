// Integration tests for the DB-bound L2 runner (P4V verification gate:
// "each verdict path produces correct state transitions and notifications").
//
// Strategy: mock the four boundaries — @/lib/db (Prisma), ./model-call
// (the AI dispatcher), ./moderation-email (Resend), and ./layer1-runner
// (the snapshot loader) — and assert the orchestration. Real DB and AI
// providers are out of scope at this layer.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- mocks ----------------------------------------------------------------
//
// `vi.mock` factories are hoisted to the top of the file ahead of any
// imports, so top-level `const` declarations are inaccessible from
// inside the factory at first eval. The idiomatic fix is `vi.hoisted`,
// which hoists *the bound value* alongside the mock so we can read it
// from both the factory and the tests below.

const mocks = vi.hoisted(() => {
  const tx = {
    sharedPath: { updateMany: vi.fn() },
    moderationAudit: { create: vi.fn() },
    notification: { create: vi.fn() },
  };
  const dbMock = {
    sharedPath: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return {
    tx,
    dbMock,
    loadSharedPathSnapshotMock: vi.fn(),
    moderationStructuredCallMock: vi.fn(),
    sendPathApprovedEmailMock: vi.fn().mockResolvedValue(undefined),
    sendPathRejectedEmailMock: vi.fn().mockResolvedValue(undefined),
    sendPathFlaggedEmailMock: vi.fn().mockResolvedValue(undefined),
    // P5 — the L2 runner now fires L3 fire-and-forget on `flag`. Mock
    // it out at the L2-test boundary so L2 tests stay isolated and
    // don't try to drag L3's DB surface into the mock graph. L3 has
    // its own dedicated test file.
    runLayer3Mock: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));

vi.mock('./layer1-runner', () => ({
  loadSharedPathSnapshot: mocks.loadSharedPathSnapshotMock,
}));

vi.mock('./model-call', () => ({
  moderationStructuredCall: mocks.moderationStructuredCallMock,
}));

vi.mock('./moderation-email', () => ({
  sendPathApprovedEmail: mocks.sendPathApprovedEmailMock,
  sendPathRejectedEmail: mocks.sendPathRejectedEmailMock,
  sendPathFlaggedEmail: mocks.sendPathFlaggedEmailMock,
}));

vi.mock('./layer3-runner', () => ({
  runLayer3: mocks.runLayer3Mock,
}));

// Aliases so the tests below read naturally instead of `mocks.tx.…`.
const {
  tx,
  dbMock,
  loadSharedPathSnapshotMock,
  moderationStructuredCallMock,
  sendPathApprovedEmailMock,
  sendPathRejectedEmailMock,
  sendPathFlaggedEmailMock,
  runLayer3Mock,
} = mocks;

// Import AFTER vi.mock declarations so the runner picks up the mocked deps.
import { runLayer2 } from './layer2-runner';

// ---- shared fixtures ------------------------------------------------------

const SHARED_PATH_ID = 'shp_test_l2_runner_0001';
const AUTHOR_ID = 'usr_test_author_0001';
const AUTHOR_EMAIL = 'author@example.test';
const TITLE = 'Algorithms — a friendly intro';

function happySharedPath(overrides: Partial<{ moderationStatus: string }> = {}) {
  return {
    id: SHARED_PATH_ID,
    sharedById: AUTHOR_ID,
    title: TITLE,
    moderationStatus: overrides.moderationStatus ?? 'auditing_l2',
    sharedBy: { email: AUTHOR_EMAIL },
  };
}

function happySnapshot() {
  return {
    language: 'en',
    fields: [
      { field: 'title', text: TITLE },
      { field: 'description', text: 'A gentle intro to recursion and big-O.' },
    ],
  };
}

function happyStateTransition() {
  // Default — state actually moved; downstream writes execute.
  tx.sharedPath.updateMany.mockResolvedValue({ count: 1 });
}

beforeEach(() => {
  vi.clearAllMocks();
  happyStateTransition();
});

// ---- helpers --------------------------------------------------------------

function mockModelOutput(out: {
  verdict: 'pass' | 'reject' | 'flag';
  category:
    | 'adult'
    | 'hateful'
    | 'spam'
    | 'copyright'
    | 'offtopic'
    | 'low_quality'
    | 'other';
  confidence: number;
  reason: string;
  model?: string;
  emitUsage?: boolean;
}) {
  moderationStructuredCallMock.mockImplementation(async ({ onUsage }) => {
    if (out.emitUsage !== false) {
      onUsage?.({
        provider: 'gemini',
        model: out.model ?? 'gemini-2.5-flash',
        inputTokens: 8_000,
        outputTokens: 200,
        cacheReadTokens: 6_500,
        cacheWriteTokens: 0,
      });
    }
    return {
      result: {
        verdict: out.verdict,
        category: out.category,
        confidence: out.confidence,
        reason: out.reason,
      },
      provider: 'gemini',
      model: out.model ?? 'gemini-2.5-flash',
    };
  });
}

// ---- tests ----------------------------------------------------------------

describe('runLayer2 — pass branch', () => {
  it('transitions to approved + writes audit + notifies + emails the author', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'pass',
      category: 'other',
      confidence: 0.95,
      reason: 'Clean educational path on algorithms.',
    });

    const result = await runLayer2(SHARED_PATH_ID);

    expect(result.status).toBe('approved');
    expect(result.judgement.verdict).toBe('pass');
    expect(result.judgement.reasonCode).toBeNull();
    expect(result.judgement.failedClosed).toBe(false);

    // State write: moderationStatus + approvedAt; rejectionReason NOT set.
    expect(tx.sharedPath.updateMany).toHaveBeenCalledTimes(1);
    const updateCall = tx.sharedPath.updateMany.mock.calls[0][0];
    expect(updateCall.where).toEqual({
      id: SHARED_PATH_ID,
      moderationStatus: 'auditing_l2',
    });
    expect(updateCall.data.moderationStatus).toBe('approved');
    expect(updateCall.data.approvedAt).toBeInstanceOf(Date);
    expect(updateCall.data.rejectionReason).toBeUndefined();

    // Audit row: layer=2, verdict=pass, model + cost rows populated.
    expect(tx.moderationAudit.create).toHaveBeenCalledTimes(1);
    const auditCall = tx.moderationAudit.create.mock.calls[0][0].data;
    expect(auditCall).toMatchObject({
      sharedPathId: SHARED_PATH_ID,
      layer: 2,
      verdict: 'pass',
      reasonCode: null,
      model: 'gemini-2.5-flash',
      tokensIn: 8_000,
      tokensOut: 200,
      cacheReadTokens: 6_500,
      cacheWriteTokens: 0,
    });
    expect(auditCall.costUsd).toBeGreaterThan(0);
    expect(auditCall.costUsd).toBeLessThan(0.01); // per P0 §7.2 ceiling

    // Notification: path_published.
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    const notif = tx.notification.create.mock.calls[0][0].data;
    expect(notif.type).toBe('path_published');
    expect(notif.userId).toBe(AUTHOR_ID);
    expect(notif.data).toMatchObject({
      shareId: SHARED_PATH_ID,
      title: TITLE,
      layer: 2,
    });

    // Email — best-effort, fires post-commit. Allow the microtask queue
    // to drain so the void-async wrapper has a chance to dispatch.
    await new Promise((r) => setTimeout(r, 0));
    expect(sendPathApprovedEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPathApprovedEmailMock).toHaveBeenCalledWith({
      to: AUTHOR_EMAIL,
      title: TITLE,
      shareId: SHARED_PATH_ID,
    });
    expect(sendPathRejectedEmailMock).not.toHaveBeenCalled();
    expect(sendPathFlaggedEmailMock).not.toHaveBeenCalled();
  });

  it('cost rate-card: Gemini Flash usage is priced + stays under L2 ceiling', async () => {
    // Realistic worst-case L2 sizing per P0 §7.2 — 12K input + 200 output
    // with no cache hit yet. Expected cost: 12_000 * 0.3e-6 + 200 * 2.5e-6
    // = 0.0036 + 0.0005 = 0.0041 USD. Well under the $0.01 ceiling.
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    moderationStructuredCallMock.mockImplementation(async ({ onUsage }) => {
      onUsage?.({
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        inputTokens: 12_000,
        outputTokens: 200,
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
      });
      return {
        result: { verdict: 'pass', category: 'other', confidence: 0.95, reason: 'ok' },
        provider: 'gemini',
        model: 'gemini-2.5-flash',
      };
    });

    const result = await runLayer2(SHARED_PATH_ID);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.costUsd).toBeLessThan(0.005); // under target, not just ceiling
  });
});

describe('runLayer2 — reject branch (confident terminal-category)', () => {
  it('transitions to rejected + writes rejectionReason + notifies + emails', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'reject',
      category: 'spam',
      confidence: 0.95,
      reason: 'Buy-now links across every slot title.',
    });

    const result = await runLayer2(SHARED_PATH_ID);

    expect(result.status).toBe('rejected');
    expect(result.judgement.verdict).toBe('reject');
    expect(result.judgement.reasonCode).toBe('l2.spam');
    expect(result.judgement.rejectionReason).toContain('spam');

    const updateCall = tx.sharedPath.updateMany.mock.calls[0][0];
    expect(updateCall.data.moderationStatus).toBe('rejected');
    expect(updateCall.data.rejectionReason).toContain('spam');
    expect(updateCall.data.approvedAt).toBeUndefined();

    const notif = tx.notification.create.mock.calls[0][0].data;
    expect(notif.type).toBe('path_rejected');
    expect(notif.data.reasonCode).toBe('l2.spam');

    await new Promise((r) => setTimeout(r, 0));
    expect(sendPathRejectedEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPathRejectedEmailMock).toHaveBeenCalledWith({
      to: AUTHOR_EMAIL,
      title: TITLE,
      shareId: SHARED_PATH_ID,
      reasonCode: 'l2.spam',
    });
  });
});

describe('runLayer2 — flag branch (low-confidence reject → flag, plus explicit flag)', () => {
  it('downgrades a low-confidence reject to flag (state → auditing_l3)', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'reject',
      category: 'adult',
      confidence: 0.5, // < 0.7 guard
      reason: 'Maybe borderline.',
    });

    const result = await runLayer2(SHARED_PATH_ID);
    expect(result.status).toBe('auditing_l3');
    expect(result.judgement.verdict).toBe('flag');
    expect(result.judgement.reasoning).toContain('downgraded');

    const notif = tx.notification.create.mock.calls[0][0].data;
    expect(notif.type).toBe('path_flagged_for_review');

    await new Promise((r) => setTimeout(r, 0));
    expect(sendPathFlaggedEmailMock).toHaveBeenCalledTimes(1);
  });

  it('honours an explicit flag verdict', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'flag',
      category: 'offtopic',
      confidence: 0.6,
      reason: 'Looks like a journal; humans should look.',
    });

    const result = await runLayer2(SHARED_PATH_ID);
    expect(result.status).toBe('auditing_l3');
    expect(result.judgement.reasonCode).toBe('l2.offtopic');
  });

  it('fires runLayer3 fire-and-forget when state moves to auditing_l3 (P5 wire-up)', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'flag',
      category: 'offtopic',
      confidence: 0.6,
      reason: 'Borderline.',
    });

    await runLayer2(SHARED_PATH_ID);
    // Microtask drain so the void-async wrapper has a chance to dispatch.
    await new Promise((r) => setTimeout(r, 0));
    expect(runLayer3Mock).toHaveBeenCalledTimes(1);
    expect(runLayer3Mock).toHaveBeenCalledWith(SHARED_PATH_ID);
  });

  it('does NOT fire runLayer3 on pass or reject (only flag escalates)', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'pass',
      category: 'other',
      confidence: 0.95,
      reason: 'Clean.',
    });

    await runLayer2(SHARED_PATH_ID);
    await new Promise((r) => setTimeout(r, 0));
    expect(runLayer3Mock).not.toHaveBeenCalled();
  });
});

describe('runLayer2 — fail-closed (AC-Moderate-5)', () => {
  it('flag-with-l2.other when the model call throws', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    moderationStructuredCallMock.mockRejectedValue(new Error('timeout: provider unreachable'));

    const result = await runLayer2(SHARED_PATH_ID);

    expect(result.status).toBe('auditing_l3');
    expect(result.judgement.verdict).toBe('flag');
    expect(result.judgement.reasonCode).toBe('l2.other');
    expect(result.judgement.failedClosed).toBe(true);
    expect(result.judgement.reasoning).toContain('fail-closed');
    expect(result.judgement.reasoning).toContain('timeout');

    // Audit row still written so the failure is observable in the trail.
    expect(tx.moderationAudit.create).toHaveBeenCalledTimes(1);
    const audit = tx.moderationAudit.create.mock.calls[0][0].data;
    expect(audit.verdict).toBe('flag');
    expect(audit.costUsd).toBe(0); // never billed a successful call

    // Flag email still goes out — author needs to know it's queued.
    await new Promise((r) => setTimeout(r, 0));
    expect(sendPathFlaggedEmailMock).toHaveBeenCalledTimes(1);
  });

  it('flag-with-l2.other when the model returns an unparseable shape', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    moderationStructuredCallMock.mockResolvedValue({
      result: { verdict: 'maybe', category: 'huh', confidence: 'high', reason: null },
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });

    const result = await runLayer2(SHARED_PATH_ID);

    expect(result.judgement.verdict).toBe('flag');
    expect(result.judgement.failedClosed).toBe(true);
    expect(result.status).toBe('auditing_l3');
  });

  it('flag-with-l2.other when the response is a raw string (provider drift)', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    moderationStructuredCallMock.mockResolvedValue({
      result: 'pass',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });

    const result = await runLayer2(SHARED_PATH_ID);
    expect(result.judgement.verdict).toBe('flag');
    expect(result.judgement.failedClosed).toBe(true);
  });
});

describe('runLayer2 — idempotency + reentrancy', () => {
  it('no-ops cleanly when the SharedPath is already past auditing_l2', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(
      happySharedPath({ moderationStatus: 'approved' }),
    );

    const result = await runLayer2(SHARED_PATH_ID);

    // No model call, no state write, no audit, no email.
    expect(moderationStructuredCallMock).not.toHaveBeenCalled();
    expect(tx.sharedPath.updateMany).not.toHaveBeenCalled();
    expect(tx.moderationAudit.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(sendPathApprovedEmailMock).not.toHaveBeenCalled();

    expect(result.status).toBe('approved');
    expect(result.costUsd).toBe(0);
  });

  it('throws when the SharedPath was deleted between L1 and L2', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(null);
    await expect(runLayer2(SHARED_PATH_ID)).rejects.toThrow(/not found/);
    expect(moderationStructuredCallMock).not.toHaveBeenCalled();
  });

  it('skips audit + notification when state already moved (updateMany count=0)', async () => {
    // Race: a concurrent L5 admin override flipped the row. updateMany
    // returns count=0; the runner must NOT write a stale audit/notif.
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'pass',
      category: 'other',
      confidence: 0.95,
      reason: 'ok',
    });
    tx.sharedPath.updateMany.mockResolvedValue({ count: 0 });

    await runLayer2(SHARED_PATH_ID);
    expect(tx.moderationAudit.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
  });
});

describe('runLayer2 — payload contract', () => {
  it('passes language + rubric + payload (not the SharedPath id) to the dispatcher', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'pass',
      category: 'other',
      confidence: 0.95,
      reason: 'ok',
    });

    await runLayer2(SHARED_PATH_ID);

    const callArgs = moderationStructuredCallMock.mock.calls[0][0];
    expect(callArgs.layer).toBe('l2');
    expect(callArgs.rubric).toContain('content moderator');
    expect(callArgs.payload).toContain('language: en');
    expect(callArgs.payload).toContain(TITLE);
    expect(callArgs.anthropicTool).toBeDefined();
    expect(callArgs.geminiSchema).toBeDefined();
    // The SharedPath id is not what the model audits.
    expect(callArgs.payload).not.toContain(SHARED_PATH_ID);
  });
});
