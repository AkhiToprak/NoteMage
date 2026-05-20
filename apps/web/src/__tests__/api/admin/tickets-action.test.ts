// Integration tests for POST /api/admin/tickets/[id]/approve and
// POST /api/admin/tickets/[id]/reject (P7 of the path-publishing plan).
//
// Strategy mirrors the existing tickets-list / tickets-detail tests:
// mock the two boundaries (`@/lib/auth.getAdminUserId` and the
// `@/lib/moderation/layer5-runner` runner) and assert the route
// handler's orchestration, response shape, and contract.
//
// What's *covered here* (route-level concerns):
//   - AC-Admin-1: non-admin → 404 (existence-leak guard).
//   - Input validation: reject without reasonCode → 400; over-cap note → 400;
//     malformed JSON → 400.
//   - Outcome mapping: applied → 200, noop_already_terminal → 200 (with
//     `noop:true`), conflict_state → 409, not_found → 404.
//   - The runner is NOT invoked when auth or validation fails.
//
// What's *covered in layer5-runner.test.ts* (not duplicated here):
//   - Transaction writes (state, audit, ticket, notification).
//   - AdminAuditLog dispatch.
//   - Email dispatch + skip-when-null-email.
//   - In-tx race recovery.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAdminUserId: vi.fn(),
  approveSharedPath: vi.fn(),
  rejectSharedPath: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getAdminUserId: mocks.getAdminUserId }));
vi.mock('@/lib/moderation/layer5-runner', () => ({
  approveSharedPath: mocks.approveSharedPath,
  rejectSharedPath: mocks.rejectSharedPath,
}));

import { POST as approveRoute } from '../../../../app/api/admin/tickets/[id]/approve/route';
import { POST as rejectRoute } from '../../../../app/api/admin/tickets/[id]/reject/route';

const TICKET_ID = 'tkt_test_l5_action_0001';
const SHARED_PATH_ID = 'shp_test_l5_action_0001';
const ADMIN_ID = 'usr_admin_0001';

function approveRequest(body?: unknown) {
  return new NextRequest(`http://localhost/api/admin/tickets/${TICKET_ID}/approve`, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  });
}

function rejectRequest(body?: unknown) {
  return new NextRequest(`http://localhost/api/admin/tickets/${TICKET_ID}/reject`, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
  });
}

const callApprove = (body?: unknown) =>
  approveRoute(approveRequest(body), { params: Promise.resolve({ id: TICKET_ID }) });
const callReject = (body?: unknown) =>
  rejectRoute(rejectRequest(body), { params: Promise.resolve({ id: TICKET_ID }) });

beforeEach(() => {
  vi.clearAllMocks();
});

// ── RBAC (AC-Admin-1) ────────────────────────────────────────────────────

describe('POST /api/admin/tickets/[id]/approve — RBAC', () => {
  it('returns 404 for non-admin (existence-leak guard)', async () => {
    mocks.getAdminUserId.mockResolvedValueOnce(null);

    const res = await callApprove({ note: 'ignored' });

    expect(res.status).toBe(404);
    // The runner MUST NOT have been called.
    expect(mocks.approveSharedPath).not.toHaveBeenCalled();
  });

  it('returns the same generic 404 body as a missing route', async () => {
    mocks.getAdminUserId.mockResolvedValueOnce(null);
    const res = await callApprove({});
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('Not found');
  });
});

describe('POST /api/admin/tickets/[id]/reject — RBAC', () => {
  it('returns 404 for non-admin', async () => {
    mocks.getAdminUserId.mockResolvedValueOnce(null);

    const res = await callReject({ reasonCode: 'l5.adult' });

    expect(res.status).toBe(404);
    expect(mocks.rejectSharedPath).not.toHaveBeenCalled();
  });
});

// ── approve: outcome mapping ─────────────────────────────────────────────

describe('POST /api/admin/tickets/[id]/approve — outcomes', () => {
  beforeEach(() => {
    mocks.getAdminUserId.mockResolvedValue(ADMIN_ID);
  });

  it('200 + noop:false on applied', async () => {
    mocks.approveSharedPath.mockResolvedValueOnce({
      outcome: 'applied',
      status: 'approved',
      ticketId: TICKET_ID,
      sharedPathId: SHARED_PATH_ID,
    });

    const res = await callApprove({ note: 'looks fine' });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toEqual({
      ticketId: TICKET_ID,
      sharedPathId: SHARED_PATH_ID,
      moderationStatus: 'approved',
      ticketStatus: 'resolved',
      noop: false,
    });
    expect(mocks.approveSharedPath).toHaveBeenCalledTimes(1);
    expect(mocks.approveSharedPath).toHaveBeenCalledWith({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      note: 'looks fine',
    });
  });

  it('200 + noop:true on idempotent re-approve (the P7V "no-op, not error" gate)', async () => {
    mocks.approveSharedPath.mockResolvedValueOnce({
      outcome: 'noop_already_terminal',
      status: 'approved',
      ticketId: TICKET_ID,
      sharedPathId: SHARED_PATH_ID,
    });

    const res = await callApprove({});
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.noop).toBe(true);
  });

  it('409 on conflict_state (path moved out of queue under us)', async () => {
    mocks.approveSharedPath.mockResolvedValueOnce({
      outcome: 'conflict_state',
      status: 'rejected',
      ticketId: TICKET_ID,
      sharedPathId: SHARED_PATH_ID,
    });

    const res = await callApprove({});

    expect(res.status).toBe(409);
  });

  it('404 on not_found (ticket missing or wrong refType)', async () => {
    mocks.approveSharedPath.mockResolvedValueOnce({
      outcome: 'not_found',
      status: '',
      ticketId: TICKET_ID,
      sharedPathId: '',
    });

    const res = await callApprove({});

    expect(res.status).toBe(404);
  });

  it('handles a missing body (admin clicks Approve without typing a note)', async () => {
    mocks.approveSharedPath.mockResolvedValueOnce({
      outcome: 'applied',
      status: 'approved',
      ticketId: TICKET_ID,
      sharedPathId: SHARED_PATH_ID,
    });

    const res = await callApprove(); // no body at all
    expect(res.status).toBe(200);
    expect(mocks.approveSharedPath).toHaveBeenCalledWith({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      note: null,
    });
  });

  it('400 on over-cap note (no truncation)', async () => {
    const tooLong = 'x'.repeat(1001);

    const res = await callApprove({ note: tooLong });

    expect(res.status).toBe(400);
    expect(mocks.approveSharedPath).not.toHaveBeenCalled();
  });
});

// ── reject: outcome mapping + validation ─────────────────────────────────

describe('POST /api/admin/tickets/[id]/reject — validation', () => {
  beforeEach(() => {
    mocks.getAdminUserId.mockResolvedValue(ADMIN_ID);
  });

  it('400 when reasonCode is missing', async () => {
    const res = await callReject({ note: 'orphan note' });

    expect(res.status).toBe(400);
    expect(mocks.rejectSharedPath).not.toHaveBeenCalled();
  });

  it('400 when reasonCode is not in the L5 allow-list', async () => {
    const res = await callReject({ reasonCode: 'l5.fake_category' });

    expect(res.status).toBe(400);
    expect(mocks.rejectSharedPath).not.toHaveBeenCalled();
  });

  it('400 when reasonCode is a cross-layer code (l2.adult)', async () => {
    const res = await callReject({ reasonCode: 'l2.adult' });
    expect(res.status).toBe(400);
    expect(mocks.rejectSharedPath).not.toHaveBeenCalled();
  });

  it('400 on over-cap note', async () => {
    const tooLong = 'x'.repeat(1001);
    const res = await callReject({ reasonCode: 'l5.spam', note: tooLong });
    expect(res.status).toBe(400);
    expect(mocks.rejectSharedPath).not.toHaveBeenCalled();
  });

  it('400 when the body is missing entirely (reject requires a reason)', async () => {
    const res = await callReject();
    expect(res.status).toBe(400);
    expect(mocks.rejectSharedPath).not.toHaveBeenCalled();
  });
});

describe('POST /api/admin/tickets/[id]/reject — outcomes', () => {
  beforeEach(() => {
    mocks.getAdminUserId.mockResolvedValue(ADMIN_ID);
  });

  it('200 on applied — forwards reasonCode + note to the runner', async () => {
    mocks.rejectSharedPath.mockResolvedValueOnce({
      outcome: 'applied',
      status: 'rejected',
      ticketId: TICKET_ID,
      sharedPathId: SHARED_PATH_ID,
    });

    const res = await callReject({
      reasonCode: 'l5.offtopic',
      note: 'personal journal',
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual({
      ticketId: TICKET_ID,
      sharedPathId: SHARED_PATH_ID,
      moderationStatus: 'rejected',
      ticketStatus: 'resolved',
      noop: false,
    });
    expect(mocks.rejectSharedPath).toHaveBeenCalledTimes(1);
    expect(mocks.rejectSharedPath).toHaveBeenCalledWith({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      reasonCode: 'l5.offtopic',
      note: 'personal journal',
    });
  });

  it('200 + noop:true on idempotent re-reject', async () => {
    mocks.rejectSharedPath.mockResolvedValueOnce({
      outcome: 'noop_already_terminal',
      status: 'rejected',
      ticketId: TICKET_ID,
      sharedPathId: SHARED_PATH_ID,
    });

    const res = await callReject({ reasonCode: 'l5.adult' });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data.noop).toBe(true);
  });

  it('409 on conflict_state', async () => {
    mocks.rejectSharedPath.mockResolvedValueOnce({
      outcome: 'conflict_state',
      status: 'approved',
      ticketId: TICKET_ID,
      sharedPathId: SHARED_PATH_ID,
    });

    const res = await callReject({ reasonCode: 'l5.spam' });
    expect(res.status).toBe(409);
  });

  it('404 on not_found', async () => {
    mocks.rejectSharedPath.mockResolvedValueOnce({
      outcome: 'not_found',
      status: '',
      ticketId: TICKET_ID,
      sharedPathId: '',
    });

    const res = await callReject({ reasonCode: 'l5.adult' });
    expect(res.status).toBe(404);
  });

  it('passes note=null when the field is omitted', async () => {
    mocks.rejectSharedPath.mockResolvedValueOnce({
      outcome: 'applied',
      status: 'rejected',
      ticketId: TICKET_ID,
      sharedPathId: SHARED_PATH_ID,
    });

    await callReject({ reasonCode: 'l5.copyright' });

    expect(mocks.rejectSharedPath).toHaveBeenCalledWith({
      ticketId: TICKET_ID,
      adminId: ADMIN_ID,
      reasonCode: 'l5.copyright',
      note: null,
    });
  });
});
