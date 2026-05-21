// Integration tests for runReportAggregation (P13 L4 runner).
//
// Strategy mirrors the other moderation runner tests: mock @/lib/db and
// assert the orchestration. The pure ./layer4 helpers run for real
// (threshold pinned via env so the crossing is deterministic).

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    sharedPath: { updateMany: vi.fn() },
    moderationAudit: { create: vi.fn() },
    ticket: { findFirst: vi.fn(), create: vi.fn() },
    notification: { create: vi.fn() },
    // Present so we can ASSERT the runner never mutates trust at takedown
    // (a community report is un-authoritative — trust changes only at L5).
    user: { update: vi.fn() },
  };
  const dbMock = {
    sharedPath: { findUnique: vi.fn() },
    report: { count: vi.fn(), findMany: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return { tx, dbMock };
});

vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));

import { runReportAggregation } from './layer4-runner';

const { tx, dbMock } = mocks;

const SHARED_PATH_ID = 'shp_test_l4_0001';
const AUTHOR_ID = 'usr_test_author_0001';

function approvedShell(overrides: Partial<{ moderationStatus: string; seeded: boolean }> = {}) {
  return {
    id: SHARED_PATH_ID,
    sharedById: AUTHOR_ID,
    title: 'Community path under report',
    moderationStatus: overrides.moderationStatus ?? 'approved',
    seeded: overrides.seeded ?? false,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Pin the threshold so "crossing" is deterministic regardless of env.
  vi.stubEnv('REPORT_REMODERATION_THRESHOLD', '3');
  // Happy defaults for the trigger path.
  tx.sharedPath.updateMany.mockResolvedValue({ count: 1 });
  tx.ticket.findFirst.mockResolvedValue(null);
  tx.ticket.create.mockResolvedValue({ id: 'tkt_new_l4' });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('runReportAggregation — gates', () => {
  it('not_found when the SharedPath is gone', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(null);
    const result = await runReportAggregation(SHARED_PATH_ID);
    expect(result.outcome).toBe('not_found');
    expect(dbMock.report.count).not.toHaveBeenCalled();
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it('skips a path that is not approved (already under review / down)', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(
      approvedShell({ moderationStatus: 'flagged_pending_human' }),
    );
    const result = await runReportAggregation(SHARED_PATH_ID);
    expect(result.outcome).toBe('skipped_not_approved');
    expect(dbMock.report.count).not.toHaveBeenCalled();
  });

  it('skips a seeded/curated path (brigade-proof)', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(approvedShell({ seeded: true }));
    const result = await runReportAggregation(SHARED_PATH_ID);
    expect(result.outcome).toBe('skipped_seeded');
    expect(dbMock.report.count).not.toHaveBeenCalled();
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it('no-ops below the threshold (2 of 3)', async () => {
    dbMock.sharedPath.findUnique.mockResolvedValue(approvedShell());
    dbMock.report.count.mockResolvedValue(2);
    const result = await runReportAggregation(SHARED_PATH_ID);
    expect(result.outcome).toBe('below_threshold');
    expect(result.openReports).toBe(2);
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });
});

describe('runReportAggregation — crossing the threshold', () => {
  beforeEach(() => {
    dbMock.sharedPath.findUnique.mockResolvedValue(approvedShell());
    dbMock.report.count.mockResolvedValue(3);
    dbMock.report.findMany.mockResolvedValue([
      { reason: 'spam' },
      { reason: 'spam' },
      { reason: 'offtopic' },
    ]);
  });

  it('pulls approved → flagged_pending_human + audit + ticket + notification', async () => {
    const result = await runReportAggregation(SHARED_PATH_ID);

    expect(result.outcome).toBe('remoderation_triggered');
    expect(result.openReports).toBe(3);
    expect(result.ticketId).toBe('tkt_new_l4');

    // Status-gated transition.
    const update = tx.sharedPath.updateMany.mock.calls[0][0];
    expect(update.where).toEqual({ id: SHARED_PATH_ID, moderationStatus: 'approved' });
    expect(update.data.moderationStatus).toBe('flagged_pending_human');

    // layer:4 audit row with the report breakdown + zero cost.
    const audit = tx.moderationAudit.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      sharedPathId: SHARED_PATH_ID,
      layer: 4,
      verdict: 'flag',
      reasonCode: 'l4.reports',
    });
    expect(audit.reasoning).toBe('3 reports: spam ×2, offtopic ×1');
    expect(audit.costUsd ?? 0).toBe(0);

    // Exactly one ticket (none existed).
    expect(tx.ticket.findFirst).toHaveBeenCalledTimes(1);
    expect(tx.ticket.create).toHaveBeenCalledTimes(1);
    expect(tx.ticket.create.mock.calls[0][0].data).toMatchObject({
      type: 'moderation_review',
      refType: 'SharedPath',
      refId: SHARED_PATH_ID,
      status: 'open',
    });

    // Author notified, tagged layer:4.
    const notif = tx.notification.create.mock.calls[0][0].data;
    expect(notif.type).toBe('path_flagged_for_review');
    expect(notif.userId).toBe(AUTHOR_ID);
    expect(notif.data).toMatchObject({ shareId: SHARED_PATH_ID, layer: 4 });

    // Trust is NOT touched at takedown — un-authoritative signal.
    expect(tx.user.update).not.toHaveBeenCalled();
  });

  it('reuses an existing open ticket instead of stacking a duplicate', async () => {
    tx.ticket.findFirst.mockResolvedValue({ id: 'tkt_existing' });
    const result = await runReportAggregation(SHARED_PATH_ID);
    expect(result.outcome).toBe('remoderation_triggered');
    expect(result.ticketId).toBe('tkt_existing');
    expect(tx.ticket.create).not.toHaveBeenCalled();
    // Audit + notification still write (the path DID move to the queue).
    expect(tx.moderationAudit.create).toHaveBeenCalledTimes(1);
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
  });

  it('race_lost when a concurrent report won the transition (updateMany count=0)', async () => {
    tx.sharedPath.updateMany.mockResolvedValue({ count: 0 });
    const result = await runReportAggregation(SHARED_PATH_ID);
    expect(result.outcome).toBe('race_lost');
    // No stale audit / ticket / notification on the racer-second.
    expect(tx.moderationAudit.create).not.toHaveBeenCalled();
    expect(tx.ticket.create).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
  });

  it('swallows a transaction failure (a flaky aggregation must not 500 the report)', async () => {
    dbMock.$transaction.mockRejectedValueOnce(new Error('db down'));
    const result = await runReportAggregation(SHARED_PATH_ID);
    // Returns a non-triggering outcome rather than throwing.
    expect(result.outcome).toBe('below_threshold');
  });
});
