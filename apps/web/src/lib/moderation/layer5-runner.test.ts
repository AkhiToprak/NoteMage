// Integration tests for the DB-bound L5 runner (P7V verification gate).
//
// Strategy mirrors layer2-runner.test.ts / layer3-runner.test.ts: mock
// the three boundaries — @/lib/db (Prisma), @/lib/admin-audit
// (AdminAuditLog), and ./moderation-email (Resend) — and assert the
// orchestration. The transaction body is invoked with a tx-shaped mock
// so every write path (state, audit, ticket, notification) is observable.
//
// Coverage matrix (one per branch in `approveSharedPath` / `rejectSharedPath`):
//   - happy path: applied → 4 writes + admin audit + email post-commit
//   - idempotency: already-terminal → 0 writes, 0 audit, 0 email
//   - state conflict: out-of-queue path → 0 writes, conflict_state
//   - not_found: missing ticket / missing path / wrong refType
//   - state race: updateMany count=0 mid-tx → skips downstream writes
//   - email skip: null author email → no email dispatched, action succeeds

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => {
  const tx = {
    sharedPath: { updateMany: vi.fn() },
    moderationAudit: { create: vi.fn() },
    ticket: { updateMany: vi.fn() },
    notification: { create: vi.fn() },
  };
  const dbMock = {
    ticket: { findUnique: vi.fn() },
    sharedPath: { findUnique: vi.fn() },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  return {
    tx,
    dbMock,
    logAdminActionMock: vi.fn().mockResolvedValue(undefined),
    sendPathApprovedEmailMock: vi.fn().mockResolvedValue(undefined),
    sendPathRejectedEmailMock: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));
vi.mock('@/lib/admin-audit', () => ({
  logAdminAction: mocks.logAdminActionMock,
}));
vi.mock('./moderation-email', () => ({
  sendPathApprovedEmail: mocks.sendPathApprovedEmailMock,
  sendPathRejectedEmail: mocks.sendPathRejectedEmailMock,
}));

// Import AFTER vi.mock declarations so the runner picks up the mocked deps.
import { approveSharedPath, rejectSharedPath } from './layer5-runner';

const {
  tx,
  dbMock,
  logAdminActionMock,
  sendPathApprovedEmailMock,
  sendPathRejectedEmailMock,
} = mocks;

// ── shared fixtures ──────────────────────────────────────────────────────

const TICKET_ID = 'tkt_test_l5_0001';
const SHARED_PATH_ID = 'shp_test_l5_0001';
const ADMIN_ID = 'usr_test_admin_0001';
const AUTHOR_ID = 'usr_test_author_0001';
const AUTHOR_EMAIL = 'author@example.test';
const TITLE = 'Algorithms — a friendly intro';

function happyTicket(overrides: Partial<{ status: string; refType: string }> = {}) {
  return {
    id: TICKET_ID,
    status: overrides.status ?? 'open',
    refType: overrides.refType ?? 'SharedPath',
    refId: SHARED_PATH_ID,
  };
}

function happySharedPath(overrides: Partial<{ moderationStatus: string; email: string | null }> = {}) {
  return {
    id: SHARED_PATH_ID,
    sharedById: AUTHOR_ID,
    title: TITLE,
    moderationStatus: overrides.moderationStatus ?? 'flagged_pending_human',
    sharedBy: { email: overrides.email === undefined ? AUTHOR_EMAIL : overrides.email },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Default: happy path — every write succeeds, count=1.
  tx.sharedPath.updateMany.mockResolvedValue({ count: 1 });
  tx.ticket.updateMany.mockResolvedValue({ count: 1 });
});

// ── approve ───────────────────────────────────────────────────────────────

describe('approveSharedPath — happy path (applied)', () => {
  it('writes state + audit + ticket + notification atomically and emails post-commit', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(happyTicket());
    dbMock.sharedPath.findUnique.mockResolvedValueOnce(happySharedPath());

    const result = await approveSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      note: 'Borderline but reviewed manually — legitimate educational content.',
    });

    expect(result.outcome).toBe('applied');
    expect(result.status).toBe('approved');
    expect(result.ticketId).toBe(TICKET_ID);
    expect(result.sharedPathId).toBe(SHARED_PATH_ID);

    // State: moved + approvedAt set + rejectionReason cleared.
    expect(tx.sharedPath.updateMany).toHaveBeenCalledTimes(1);
    const stateCall = tx.sharedPath.updateMany.mock.calls[0][0];
    expect(stateCall.where).toEqual({
      id: SHARED_PATH_ID,
      moderationStatus: 'flagged_pending_human',
    });
    expect(stateCall.data.moderationStatus).toBe('approved');
    expect(stateCall.data.approvedAt).toBeInstanceOf(Date);
    expect(stateCall.data.rejectionReason).toBeNull();

    // Audit: layer=5, verdict=pass, actor=admin, reasoning=note.
    expect(tx.moderationAudit.create).toHaveBeenCalledTimes(1);
    const auditCall = tx.moderationAudit.create.mock.calls[0][0].data;
    expect(auditCall).toMatchObject({
      sharedPathId: SHARED_PATH_ID,
      layer: 5,
      verdict: 'pass',
      reasonCode: null,
      actorId: ADMIN_ID,
    });
    expect(auditCall.reasoning).toContain('legitimate educational content');

    // Ticket: resolved + resolvedById + resolvedAt + note.
    expect(tx.ticket.updateMany).toHaveBeenCalledTimes(1);
    const ticketCall = tx.ticket.updateMany.mock.calls[0][0];
    expect(ticketCall.where).toEqual({
      id: TICKET_ID,
      status: { in: ['open', 'assigned'] },
    });
    expect(ticketCall.data).toMatchObject({
      status: 'resolved',
      resolvedById: ADMIN_ID,
    });
    expect(ticketCall.data.resolvedAt).toBeInstanceOf(Date);

    // Notification: path_published with shareId + title.
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    const notif = tx.notification.create.mock.calls[0][0].data;
    expect(notif.type).toBe('path_published');
    expect(notif.userId).toBe(AUTHOR_ID);
    expect(notif.data).toMatchObject({
      shareId: SHARED_PATH_ID,
      title: TITLE,
      layer: 5,
    });

    // Admin audit log: exactly one shared_path.approve row with admin
    // + target + ticketId in details (AC-Auditability).
    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
    expect(logAdminActionMock).toHaveBeenCalledWith(
      ADMIN_ID,
      'shared_path.approve',
      SHARED_PATH_ID,
      expect.objectContaining({ ticketId: TICKET_ID }),
    );

    // Email: fires post-commit (microtask flush required).
    await new Promise((r) => setTimeout(r, 0));
    expect(sendPathApprovedEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPathApprovedEmailMock).toHaveBeenCalledWith({
      to: AUTHOR_EMAIL,
      title: TITLE,
      shareId: SHARED_PATH_ID,
    });
    expect(sendPathRejectedEmailMock).not.toHaveBeenCalled();
  });

  it('works with no admin note (the most common case)', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(happyTicket());
    dbMock.sharedPath.findUnique.mockResolvedValueOnce(happySharedPath());

    const result = await approveSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      note: null,
    });

    expect(result.outcome).toBe('applied');
    const auditCall = tx.moderationAudit.create.mock.calls[0][0].data;
    expect(auditCall.reasoning).toBeNull();
    const ticketCall = tx.ticket.updateMany.mock.calls[0][0].data;
    expect(ticketCall.resolutionNote).toBeNull();
  });
});

describe('approveSharedPath — idempotency (no-op when already terminal)', () => {
  it('returns noop_already_terminal when path is already approved and ticket is resolved', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(happyTicket({ status: 'resolved' }));
    dbMock.sharedPath.findUnique.mockResolvedValueOnce(
      happySharedPath({ moderationStatus: 'approved' }),
    );

    const result = await approveSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      note: null,
    });

    expect(result.outcome).toBe('noop_already_terminal');
    expect(result.status).toBe('approved');

    // No writes, no audit, no notification, no email, no admin audit log.
    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(tx.sharedPath.updateMany).not.toHaveBeenCalled();
    expect(tx.moderationAudit.create).not.toHaveBeenCalled();
    expect(tx.ticket.updateMany).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(logAdminActionMock).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(sendPathApprovedEmailMock).not.toHaveBeenCalled();
  });
});

describe('approveSharedPath — state conflict', () => {
  it('returns conflict_state when the path moved out of the queue', async () => {
    // Path was already rejected by another admin between page load and
    // this admin's click.
    dbMock.ticket.findUnique.mockResolvedValueOnce(happyTicket());
    dbMock.sharedPath.findUnique.mockResolvedValueOnce(
      happySharedPath({ moderationStatus: 'rejected' }),
    );

    const result = await approveSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      note: null,
    });

    expect(result.outcome).toBe('conflict_state');
    expect(result.status).toBe('rejected');
    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(logAdminActionMock).not.toHaveBeenCalled();
  });

  it('catches the in-transaction race (updateMany count=0 mid-tx)', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(happyTicket());
    dbMock.sharedPath.findUnique.mockResolvedValueOnce(happySharedPath());
    // Race window — pre-check passed, but a concurrent admin's tx
    // committed before ours. updateMany returns count=0; the runner
    // must NOT write a stale audit / ticket / notification.
    tx.sharedPath.updateMany.mockResolvedValueOnce({ count: 0 });

    const result = await approveSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      note: null,
    });

    // The outcome is still `applied` (we ran the transaction); the
    // count=0 short-circuit just prevents stale writes inside it.
    expect(result.outcome).toBe('applied');
    expect(tx.moderationAudit.create).not.toHaveBeenCalled();
    expect(tx.ticket.updateMany).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
  });
});

describe('approveSharedPath — not_found branches', () => {
  it('returns not_found when the ticket does not exist', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(null);

    const result = await approveSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      note: null,
    });

    expect(result.outcome).toBe('not_found');
    expect(dbMock.sharedPath.findUnique).not.toHaveBeenCalled();
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns not_found when the SharedPath behind the ticket is gone', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(happyTicket());
    dbMock.sharedPath.findUnique.mockResolvedValueOnce(null);

    const result = await approveSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      note: null,
    });

    expect(result.outcome).toBe('not_found');
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns not_found for non-SharedPath ticket refTypes (v1 invariant)', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(
      happyTicket({ refType: 'SomeFutureType' }),
    );

    const result = await approveSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      note: null,
    });

    expect(result.outcome).toBe('not_found');
    expect(dbMock.sharedPath.findUnique).not.toHaveBeenCalled();
  });
});

describe('approveSharedPath — email skip when author has no email', () => {
  it('does not call sendPathApprovedEmail when sharedBy.email is null', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(happyTicket());
    dbMock.sharedPath.findUnique.mockResolvedValueOnce(
      happySharedPath({ email: null }),
    );

    const result = await approveSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      note: null,
    });

    expect(result.outcome).toBe('applied');
    expect(tx.notification.create).toHaveBeenCalledTimes(1);
    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
    await new Promise((r) => setTimeout(r, 0));
    expect(sendPathApprovedEmailMock).not.toHaveBeenCalled();
  });
});

describe('approveSharedPath — DB failure', () => {
  it('throws when the transaction fails (caller surfaces as 500)', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(happyTicket());
    dbMock.sharedPath.findUnique.mockResolvedValueOnce(happySharedPath());
    tx.sharedPath.updateMany.mockRejectedValueOnce(
      new Error('connection lost'),
    );

    await expect(
      approveSharedPath({ ticketId: TICKET_ID, adminId: ADMIN_ID, note: null }),
    ).rejects.toThrow(/connection lost/);

    // No post-commit fan-out on a DB failure.
    expect(logAdminActionMock).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(sendPathApprovedEmailMock).not.toHaveBeenCalled();
  });
});

// ── reject ────────────────────────────────────────────────────────────────

describe('rejectSharedPath — happy path (applied)', () => {
  it('writes state + audit (with reasonCode) + ticket + notification + emails', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(happyTicket());
    dbMock.sharedPath.findUnique.mockResolvedValueOnce(happySharedPath());

    const result = await rejectSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      reasonCode: 'l5.offtopic',
      note: 'reads as a personal diary, not a learning resource',
    });

    expect(result.outcome).toBe('applied');
    expect(result.status).toBe('rejected');

    // State: moderationStatus=rejected + rejectionReason composed
    // (canned phrase + admin note appended).
    const stateCall = tx.sharedPath.updateMany.mock.calls[0][0];
    expect(stateCall.where).toEqual({
      id: SHARED_PATH_ID,
      moderationStatus: 'flagged_pending_human',
    });
    expect(stateCall.data.moderationStatus).toBe('rejected');
    expect(stateCall.data.rejectionReason).toContain('off-topic');
    expect(stateCall.data.rejectionReason).toContain('personal diary');

    // Audit: layer=5, verdict=reject, reasonCode passed through,
    // reasoning=note, actor=admin.
    const auditCall = tx.moderationAudit.create.mock.calls[0][0].data;
    expect(auditCall).toMatchObject({
      sharedPathId: SHARED_PATH_ID,
      layer: 5,
      verdict: 'reject',
      reasonCode: 'l5.offtopic',
      actorId: ADMIN_ID,
    });
    expect(auditCall.reasoning).toBe('reads as a personal diary, not a learning resource');

    // Ticket → resolved.
    expect(tx.ticket.updateMany).toHaveBeenCalledTimes(1);

    // Notification: path_rejected with reasonCode + layer=5.
    const notif = tx.notification.create.mock.calls[0][0].data;
    expect(notif.type).toBe('path_rejected');
    expect(notif.data).toMatchObject({
      shareId: SHARED_PATH_ID,
      title: TITLE,
      reasonCode: 'l5.offtopic',
      layer: 5,
    });

    // Admin audit: shared_path.reject with reasonCode in details
    // (AC-Auditability gate).
    expect(logAdminActionMock).toHaveBeenCalledTimes(1);
    expect(logAdminActionMock).toHaveBeenCalledWith(
      ADMIN_ID,
      'shared_path.reject',
      SHARED_PATH_ID,
      expect.objectContaining({
        ticketId: TICKET_ID,
        reasonCode: 'l5.offtopic',
      }),
    );

    // Email: rejection email, not approval.
    await new Promise((r) => setTimeout(r, 0));
    expect(sendPathRejectedEmailMock).toHaveBeenCalledTimes(1);
    expect(sendPathRejectedEmailMock).toHaveBeenCalledWith({
      to: AUTHOR_EMAIL,
      title: TITLE,
      shareId: SHARED_PATH_ID,
      reasonCode: 'l5.offtopic',
    });
    expect(sendPathApprovedEmailMock).not.toHaveBeenCalled();
  });

  it('works without an admin note (composed rejection reason is just the canned phrase)', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(happyTicket());
    dbMock.sharedPath.findUnique.mockResolvedValueOnce(happySharedPath());

    await rejectSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      reasonCode: 'l5.spam',
      note: null,
    });

    const stateCall = tx.sharedPath.updateMany.mock.calls[0][0];
    expect(stateCall.data.rejectionReason).toBe('Looks like spam or promotion.');
    const auditCall = tx.moderationAudit.create.mock.calls[0][0].data;
    expect(auditCall.reasoning).toBeNull();
  });
});

describe('rejectSharedPath — idempotency', () => {
  it('returns noop_already_terminal when path is already rejected and ticket is resolved', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(happyTicket({ status: 'resolved' }));
    dbMock.sharedPath.findUnique.mockResolvedValueOnce(
      happySharedPath({ moderationStatus: 'rejected' }),
    );

    const result = await rejectSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      reasonCode: 'l5.adult',
      note: null,
    });

    expect(result.outcome).toBe('noop_already_terminal');
    expect(result.status).toBe('rejected');
    expect(dbMock.$transaction).not.toHaveBeenCalled();
    expect(logAdminActionMock).not.toHaveBeenCalled();
    await new Promise((r) => setTimeout(r, 0));
    expect(sendPathRejectedEmailMock).not.toHaveBeenCalled();
  });
});

describe('rejectSharedPath — conflict + not_found mirror approve', () => {
  it('conflict_state when the path moved to approved', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(happyTicket());
    dbMock.sharedPath.findUnique.mockResolvedValueOnce(
      happySharedPath({ moderationStatus: 'approved' }),
    );

    const result = await rejectSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      reasonCode: 'l5.spam',
      note: null,
    });

    expect(result.outcome).toBe('conflict_state');
    expect(result.status).toBe('approved');
    expect(dbMock.$transaction).not.toHaveBeenCalled();
  });

  it('not_found when the ticket is missing', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(null);

    const result = await rejectSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      reasonCode: 'l5.spam',
      note: null,
    });

    expect(result.outcome).toBe('not_found');
  });

  it('skips downstream writes when updateMany count=0 mid-tx', async () => {
    dbMock.ticket.findUnique.mockResolvedValueOnce(happyTicket());
    dbMock.sharedPath.findUnique.mockResolvedValueOnce(happySharedPath());
    tx.sharedPath.updateMany.mockResolvedValueOnce({ count: 0 });

    await rejectSharedPath({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      reasonCode: 'l5.adult',
      note: null,
    });

    expect(tx.moderationAudit.create).not.toHaveBeenCalled();
    expect(tx.ticket.updateMany).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
  });
});
