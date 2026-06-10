// Integration tests for the DB-bound L3 runner (P5V verification gate:
// "each verdict path produces correct state transitions and exactly
// one ticket on escalate").
//
// Strategy mirrors layer2-runner.test.ts: mock the four boundaries —
// @/lib/db (Prisma), ./model-call (the AI dispatcher),
// ./moderation-email (Resend), and ./layer1-runner (the snapshot
// loader) — and assert orchestration. Real DB and AI providers are out
// of scope at this layer.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---- mocks ----------------------------------------------------------------

const mocks = vi.hoisted(() => {
  const tx = {
    sharedPath: { updateMany: vi.fn() },
    moderationAudit: { create: vi.fn() },
    notification: { create: vi.fn() },
    ticket: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  };
  const dbMock = {
    sharedPath: { findUnique: vi.fn() },
    moderationAudit: { findFirst: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return {
    tx,
    dbMock,
    loadSharedPathSnapshotMock: vi.fn(),
    moderationStructuredCallMock: vi.fn(),
    sendPathRejectedEmailMock: vi.fn().mockResolvedValue(undefined),
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
  sendPathRejectedEmail: mocks.sendPathRejectedEmailMock,
}));

const {
  tx,
  dbMock,
  loadSharedPathSnapshotMock,
  moderationStructuredCallMock,
  sendPathRejectedEmailMock,
} = mocks;

// Import AFTER vi.mock declarations so the runner picks up the mocked deps.
import { runLayer3 } from './layer3-runner';

// ---- shared fixtures ------------------------------------------------------

const SHARED_PATH_ID = 'shp_test_l3_runner_0001';
const AUTHOR_ID = 'usr_test_author_0001';
const AUTHOR_EMAIL = 'author@example.test';
const TITLE = 'Algorithms — a friendly intro';

function happySharedPath(overrides: Partial<{ moderationStatus: string }> = {}) {
  return {
    id: SHARED_PATH_ID,
    sharedById: AUTHOR_ID,
    title: TITLE,
    moderationStatus: overrides.moderationStatus ?? 'auditing_l3',
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

function happyL2Audit() {
  return {
    reasonCode: 'l2.offtopic',
    reasoning: 'L2 was uncertain — possibly off-topic, possibly fine.',
  };
}

function happyStateTransition() {
  tx.sharedPath.updateMany.mockResolvedValue({ count: 1 });
}

beforeEach(() => {
  vi.clearAllMocks();
  happyStateTransition();
  // Default: no existing open ticket → escalate creates a new one.
  tx.ticket.findFirst.mockResolvedValue(null);
  tx.ticket.create.mockResolvedValue({ id: 'tkt_new_0001' });
  dbMock.moderationAudit.findFirst.mockResolvedValue(happyL2Audit());
});

// ---- helpers --------------------------------------------------------------

function mockModelOutput(out: {
  verdict: 'auto_reject' | 'escalate_to_human';
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
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  emitUsage?: boolean;
}) {
  moderationStructuredCallMock.mockImplementation(async ({ onUsage }) => {
    if (out.emitUsage !== false) {
      onUsage?.({
        provider: 'anthropic',
        model: out.model ?? 'claude-sonnet-4-6',
        inputTokens: out.inputTokens ?? 10_000,
        outputTokens: out.outputTokens ?? 300,
        cacheReadTokens: out.cacheReadTokens ?? 8_000,
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
      provider: 'anthropic',
      model: out.model ?? 'claude-sonnet-4-6',
    };
  });
}

// ---- tests ----------------------------------------------------------------

describe('runLayer3 — auto_reject branch (terminal hard-violation)', () => {
  it('transitions to rejected + writes audit + notifies + emails the author', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'auto_reject',
      category: 'spam',
      confidence: 0.95,
      reason: 'Confirmed promo / MLM content across every slot — L2 was right.',
    });

    const result = await runLayer3(SHARED_PATH_ID);

    expect(result.status).toBe('rejected');
    expect(result.judgement.verdict).toBe('auto_reject');
    expect(result.judgement.reasonCode).toBe('l3.spam');
    expect(result.judgement.failedClosed).toBe(false);

    // State write: moderationStatus + rejectionReason; no approvedAt.
    expect(tx.sharedPath.updateMany).toHaveBeenCalledTimes(1);
    const updateCall = tx.sharedPath.updateMany.mock.calls[0][0];
    expect(updateCall.where).toEqual({
      id: SHARED_PATH_ID,
      moderationStatus: 'auditing_l3',
    });
    expect(updateCall.data.moderationStatus).toBe('rejected');
    expect(updateCall.data.rejectionReason).toContain('spam');

    // Audit row: layer=3, verdict=auto_reject, model + cost populated.
    expect(tx.moderationAudit.create).toHaveBeenCalledTimes(1);
    const auditCall = tx.moderationAudit.create.mock.calls[0][0].data;
    expect(auditCall).toMatchObject({
      sharedPathId: SHARED_PATH_ID,
      layer: 3,
      verdict: 'auto_reject',
      reasonCode: 'l3.spam',
      model: 'claude-sonnet-4-6',
      tokensIn: 10_000,
      tokensOut: 300,
      cacheReadTokens: 8_000,
      cacheWriteTokens: 0,
    });
    expect(auditCall.costUsd).toBeGreaterThan(0);

    // Notification: path_rejected with layer=3.
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    const notif = tx.notification.create.mock.calls[0][0].data;
    expect(notif.type).toBe('path_rejected');
    expect(notif.userId).toBe(AUTHOR_ID);
    expect(notif.data).toMatchObject({
      shareId: SHARED_PATH_ID,
      title: TITLE,
      reasonCode: 'l3.spam',
      layer: 3,
    });

    // No ticket on auto_reject — the ticket flow is escalate-only.
    expect(tx.ticket.create).not.toHaveBeenCalled();
    expect(tx.ticket.findFirst).not.toHaveBeenCalled();
    expect(result.ticketId).toBeNull();

    // Email — best-effort, fires post-commit.
    await new Promise((r) => setTimeout(r, 0));
    expect(sendPathRejectedEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPathRejectedEmailMock).toHaveBeenCalledWith({
      to: AUTHOR_EMAIL,
      title: TITLE,
      shareId: SHARED_PATH_ID,
      reasonCode: 'l3.spam',
    });
  });

  it('cost rate-card: Sonnet usage stays under the L3 ceiling ($0.10)', async () => {
    // P0 §7.3 sizing: Sonnet @ $3 input + $15 output per 1M tokens.
    // 12K input + 500 output without cache = 12*3e-3 + 500*15e-6
    //                                      = 0.036 + 0.0075
    //                                      = ~$0.043 — under target.
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'auto_reject',
      category: 'adult',
      confidence: 0.95,
      reason: 'Confirmed adult content.',
      inputTokens: 12_000,
      outputTokens: 500,
      cacheReadTokens: 0,
    });

    const result = await runLayer3(SHARED_PATH_ID);
    expect(result.costUsd).toBeGreaterThan(0);
    expect(result.costUsd).toBeLessThan(0.05); // under target, not just ceiling
  });
});

describe('runLayer3 — escalate_to_human branch (creates exactly one Ticket)', () => {
  it('transitions to flagged_pending_human + writes audit + opens one Ticket (no notif, no email)', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'escalate_to_human',
      category: 'offtopic',
      confidence: 0.7,
      reason: 'Borderline — looks like a journal but might be intentional.',
    });

    const result = await runLayer3(SHARED_PATH_ID);

    expect(result.status).toBe('flagged_pending_human');
    expect(result.judgement.verdict).toBe('escalate_to_human');
    expect(result.judgement.reasonCode).toBe('l3.offtopic');

    // State: flagged_pending_human; no rejectionReason on escalate.
    const updateCall = tx.sharedPath.updateMany.mock.calls[0][0];
    expect(updateCall.data.moderationStatus).toBe('flagged_pending_human');
    expect(updateCall.data.rejectionReason).toBeUndefined();

    // AC-Moderate-7 invariant: exactly one Ticket open.
    expect(tx.ticket.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.ticket.findFirst).toHaveBeenCalledWith({
      where: {
        refType: 'SharedPath',
        refId: SHARED_PATH_ID,
        status: 'open',
      },
      select: { id: true },
    });
    expect(tx.ticket.create).toHaveBeenCalledTimes(1);
    const ticketCall = tx.ticket.create.mock.calls[0][0].data;
    expect(ticketCall).toMatchObject({
      type: 'moderation_review',
      refType: 'SharedPath',
      refId: SHARED_PATH_ID,
      status: 'open',
    });
    expect(result.ticketId).toBe('tkt_new_0001');

    // Audit row written for the escalation.
    expect(tx.moderationAudit.create).toHaveBeenCalledTimes(1);
    const auditCall = tx.moderationAudit.create.mock.calls[0][0].data;
    expect(auditCall.verdict).toBe('escalate_to_human');
    expect(auditCall.layer).toBe(3);

    // No notification on escalate (L2 already sent path_flagged_for_review).
    expect(tx.notification.create).not.toHaveBeenCalled();

    // No rejection email on escalate (L2 already sent the flagged email).
    await new Promise((r) => setTimeout(r, 0));
    expect(sendPathRejectedEmailMock).not.toHaveBeenCalled();
  });

  it('does NOT open a duplicate Ticket when one already exists (idempotency)', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    // Pre-existing open ticket — seeded fixture, prior escalation race.
    tx.ticket.findFirst.mockResolvedValue({ id: 'tkt_pre_existing_0001' });
    mockModelOutput({
      verdict: 'escalate_to_human',
      category: 'low_quality',
      confidence: 0.6,
      reason: 'Needs human eyes.',
    });

    const result = await runLayer3(SHARED_PATH_ID);

    expect(tx.ticket.findFirst).toHaveBeenCalledTimes(1);
    // The findFirst hit — no fresh insert.
    expect(tx.ticket.create).not.toHaveBeenCalled();
    expect(result.ticketId).toBeNull();
    // State + audit row still apply (the escalate verdict is honoured).
    expect(tx.sharedPath.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.moderationAudit.create).toHaveBeenCalledTimes(1);
  });

  it('honours an explicit escalate_to_human verdict on a hard-violation category', async () => {
    // Even when the model returns escalate on e.g. `adult`, we still
    // escalate (no auto-bumping to auto_reject). The verdict is the
    // model's call; we just project + persist.
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'escalate_to_human',
      category: 'adult',
      confidence: 0.6,
      reason: 'Sensitive sex-ed content — needs human judgement on appropriateness.',
    });

    const result = await runLayer3(SHARED_PATH_ID);
    expect(result.status).toBe('flagged_pending_human');
    expect(result.judgement.reasonCode).toBe('l3.adult');
    expect(tx.ticket.create).toHaveBeenCalledTimes(1);
  });
});

describe('runLayer3 — projection guards (auto_reject downgraded by runner)', () => {
  it('low-confidence auto_reject (< 0.85) downgrades to escalate + opens ticket', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'auto_reject',
      category: 'adult',
      confidence: 0.7, // above L2 bar (0.7) but below L3 bar (0.85)
      reason: 'Maybe inappropriate, not sure.',
    });

    const result = await runLayer3(SHARED_PATH_ID);
    expect(result.status).toBe('flagged_pending_human');
    expect(result.judgement.verdict).toBe('escalate_to_human');
    expect(result.judgement.reasoning).toContain('downgraded auto_reject');
    expect(tx.ticket.create).toHaveBeenCalledTimes(1);
    expect(sendPathRejectedEmailMock).not.toHaveBeenCalled();
  });

  it('non-hard-violation auto_reject (offtopic) downgrades to escalate', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'auto_reject',
      category: 'offtopic',
      confidence: 0.95, // confident, but category doesn't allow auto_reject
      reason: 'Definitely off-topic.',
    });

    const result = await runLayer3(SHARED_PATH_ID);
    expect(result.status).toBe('flagged_pending_human');
    expect(result.judgement.reasoning).toContain('non-terminal-reject');
    expect(tx.ticket.create).toHaveBeenCalledTimes(1);
  });
});

describe('runLayer3 — fail-closed (AC-Moderate-5 / AC-Moderate-7)', () => {
  it('escalate-with-l3.other when the model call throws', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    moderationStructuredCallMock.mockRejectedValue(new Error('timeout: provider unreachable'));

    const result = await runLayer3(SHARED_PATH_ID);

    // Fail-closed at L3 = escalate (NOT auto_reject — never silently
    // auto-reject on a failure).
    expect(result.status).toBe('flagged_pending_human');
    expect(result.judgement.verdict).toBe('escalate_to_human');
    expect(result.judgement.reasonCode).toBe('l3.other');
    expect(result.judgement.failedClosed).toBe(true);
    expect(result.judgement.reasoning).toContain('fail-closed');
    expect(result.judgement.reasoning).toContain('timeout');

    // Audit row + ticket still written so the failure is observable.
    expect(tx.moderationAudit.create).toHaveBeenCalledTimes(1);
    const audit = tx.moderationAudit.create.mock.calls[0][0].data;
    expect(audit.verdict).toBe('escalate_to_human');
    expect(audit.costUsd).toBe(0); // never billed a successful call
    expect(tx.ticket.create).toHaveBeenCalledTimes(1);

    // No rejection email on a fail-closed escalate.
    await new Promise((r) => setTimeout(r, 0));
    expect(sendPathRejectedEmailMock).not.toHaveBeenCalled();
  });

  it('escalate when the model returns an unparseable shape', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    moderationStructuredCallMock.mockResolvedValue({
      result: { verdict: 'maybe', category: 'huh', confidence: 'high', reason: null },
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });

    const result = await runLayer3(SHARED_PATH_ID);
    expect(result.judgement.verdict).toBe('escalate_to_human');
    expect(result.judgement.failedClosed).toBe(true);
    expect(result.status).toBe('flagged_pending_human');
    expect(tx.ticket.create).toHaveBeenCalledTimes(1);
  });

  it('escalate when the response is a raw string (provider drift)', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    moderationStructuredCallMock.mockResolvedValue({
      result: 'auto_reject',
      provider: 'anthropic',
      model: 'claude-sonnet-4-6',
    });

    const result = await runLayer3(SHARED_PATH_ID);
    expect(result.judgement.verdict).toBe('escalate_to_human');
    expect(result.judgement.failedClosed).toBe(true);
  });
});

describe('runLayer3 — idempotency + reentrancy', () => {
  it('no-ops cleanly when the SharedPath is already past auditing_l3', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(
      happySharedPath({ moderationStatus: 'rejected' }),
    );

    const result = await runLayer3(SHARED_PATH_ID);

    expect(moderationStructuredCallMock).not.toHaveBeenCalled();
    expect(tx.sharedPath.updateMany).not.toHaveBeenCalled();
    expect(tx.moderationAudit.create).not.toHaveBeenCalled();
    expect(tx.ticket.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(sendPathRejectedEmailMock).not.toHaveBeenCalled();

    expect(result.status).toBe('rejected');
    expect(result.costUsd).toBe(0);
  });

  it('reentrant on flagged_pending_human (a re-judge race)', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(
      happySharedPath({ moderationStatus: 'flagged_pending_human' }),
    );

    const result = await runLayer3(SHARED_PATH_ID);

    expect(moderationStructuredCallMock).not.toHaveBeenCalled();
    expect(result.status).toBe('flagged_pending_human');
    expect(tx.ticket.create).not.toHaveBeenCalled();
  });

  it('throws when the SharedPath was deleted between L2 and L3', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(null);
    await expect(runLayer3(SHARED_PATH_ID)).rejects.toThrow(/not found/);
    expect(moderationStructuredCallMock).not.toHaveBeenCalled();
  });

  it('skips audit + ticket + notification when state already moved (updateMany count=0)', async () => {
    // Race: a concurrent L5 admin override flipped the row. updateMany
    // returns count=0; the runner must NOT write a stale audit / ticket /
    // notif that would misrepresent the chain.
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'auto_reject',
      category: 'spam',
      confidence: 0.95,
      reason: 'Buy now.',
    });
    tx.sharedPath.updateMany.mockResolvedValue({ count: 0 });

    await runLayer3(SHARED_PATH_ID);
    expect(tx.moderationAudit.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(tx.ticket.create).not.toHaveBeenCalled();
    expect(tx.ticket.findFirst).not.toHaveBeenCalled();
  });
});

describe('runLayer3 — payload contract', () => {
  it('passes the L3 rubric + payload (with L2 context) + Sonnet-targeting layer to the dispatcher', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    mockModelOutput({
      verdict: 'escalate_to_human',
      category: 'offtopic',
      confidence: 0.7,
      reason: 'Edge case.',
    });

    await runLayer3(SHARED_PATH_ID);

    const callArgs = moderationStructuredCallMock.mock.calls[0][0];
    expect(callArgs.layer).toBe('l3');
    expect(callArgs.rubric).toContain('Layer-3 content moderator');
    // L2 context block embedded in the payload, not the rubric.
    expect(callArgs.payload).toContain('LAYER-2 CONTEXT');
    expect(callArgs.payload).toContain('l2.offtopic');
    expect(callArgs.payload).toContain('L2 was uncertain');
    // Path payload also present.
    expect(callArgs.payload).toContain('language: en');
    expect(callArgs.payload).toContain(TITLE);
    expect(callArgs.anthropicTool).toBeDefined();
    expect(callArgs.geminiSchema).toBeDefined();
  });

  it('still runs L3 when no L2 audit row is present (defensive — re-judge job entry)', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(happySharedPath());
    loadSharedPathSnapshotMock.mockResolvedValue(happySnapshot());
    dbMock.moderationAudit.findFirst.mockResolvedValue(null);
    mockModelOutput({
      verdict: 'escalate_to_human',
      category: 'other',
      confidence: 0.6,
      reason: 'No L2 context — escalate by default.',
    });

    const result = await runLayer3(SHARED_PATH_ID);
    expect(result.status).toBe('flagged_pending_human');
    const callArgs = moderationStructuredCallMock.mock.calls[0][0];
    expect(callArgs.payload).toContain('l2.reasonCode: (none)');
  });
});
