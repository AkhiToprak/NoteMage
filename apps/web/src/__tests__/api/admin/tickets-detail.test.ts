// Integration tests for GET /api/admin/tickets/[id] (P6).
//
// Covers AC-Admin-1 (404 on non-admin) and AC-Admin-3 (detail returns
// SharedPath summary + full ModerationAudit chain ordered ASC by createdAt).
// Auth and DB are mocked.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAdminUserId: vi.fn(),
  dbMock: {
    ticket: { findUnique: vi.fn() },
    sharedPath: { findUnique: vi.fn() },
    moderationAudit: { findMany: vi.fn() },
  },
}));

vi.mock('@/lib/auth', () => ({ getAdminUserId: mocks.getAdminUserId }));
vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));

import { GET } from '../../../../app/api/admin/tickets/[id]/route';

const callGet = (id: string) => {
  const req = new NextRequest(`http://localhost/api/admin/tickets/${id}`);
  return GET(req, { params: Promise.resolve({ id }) });
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/admin/tickets/[id] — RBAC', () => {
  it('returns 404 when the requester is not an admin (AC-Admin-1)', async () => {
    mocks.getAdminUserId.mockResolvedValueOnce(null);

    const res = await callGet('ticket-1');

    expect(res.status).toBe(404);
    expect(mocks.dbMock.ticket.findUnique).not.toHaveBeenCalled();
  });
});

describe('GET /api/admin/tickets/[id] — happy path', () => {
  beforeEach(() => {
    mocks.getAdminUserId.mockResolvedValue('admin-user-id');
  });

  it('returns ticket + SharedPath summary + audit chain ordered by createdAt asc', async () => {
    mocks.dbMock.ticket.findUnique.mockResolvedValueOnce(makeTicketRow());
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(makeSharedPathRow());
    const auditRows = [
      makeAudit({ id: 'a1', layer: 1, verdict: 'pass', minutesAgo: 30 }),
      makeAudit({
        id: 'a2',
        layer: 2,
        verdict: 'flag',
        reasonCode: 'l2.offtopic',
        reasoning: 'Borderline off-topic; needs human eyes.',
        model: 'gemini-2.5-flash',
        costUsd: 0.0033,
        tokensIn: 8400,
        tokensOut: 180,
        minutesAgo: 25,
      }),
      makeAudit({
        id: 'a3',
        layer: 3,
        verdict: 'escalate_to_human',
        reasonCode: 'l3.offtopic',
        reasoning: 'Confirms L2 — not auto-rejectable, send to human.',
        model: 'claude-sonnet-4-6',
        costUsd: 0.04,
        tokensIn: 11000,
        tokensOut: 260,
        minutesAgo: 20,
      }),
    ];
    mocks.dbMock.moderationAudit.findMany.mockResolvedValueOnce(auditRows);

    const res = await callGet('ticket-1');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.success).toBe(true);

    // The audit query MUST be ordered ASC so the timeline reads top-down
    // in the order events happened (AC-Admin-3).
    expect(mocks.dbMock.moderationAudit.findMany).toHaveBeenCalledTimes(1);
    const call = mocks.dbMock.moderationAudit.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ sharedPathId: 'shared-path-1' });
    expect(call.orderBy).toEqual({ createdAt: 'asc' });

    expect(body.data.ticket.id).toBe('ticket-1');
    expect(body.data.sharedPath.id).toBe('shared-path-1');
    expect(body.data.audits).toHaveLength(3);
    // Verify the full chain is exposed — no shape narrowing that would
    // hide L2/L3 reasoning from the admin.
    expect(body.data.audits[0].layer).toBe(1);
    expect(body.data.audits[1].layer).toBe(2);
    expect(body.data.audits[1].reasoning).toContain('Borderline off-topic');
    expect(body.data.audits[2].layer).toBe(3);
    expect(body.data.audits[2].model).toBe('claude-sonnet-4-6');
  });

  it('returns 404 when the ticket does not exist', async () => {
    mocks.dbMock.ticket.findUnique.mockResolvedValueOnce(null);

    const res = await callGet('does-not-exist');

    expect(res.status).toBe(404);
    expect(mocks.dbMock.sharedPath.findUnique).not.toHaveBeenCalled();
    expect(mocks.dbMock.moderationAudit.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 when the SharedPath behind the ticket is gone (auto-dismiss-invariant break)', async () => {
    mocks.dbMock.ticket.findUnique.mockResolvedValueOnce(makeTicketRow());
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(null);

    const res = await callGet('ticket-1');

    expect(res.status).toBe(404);
    expect(mocks.dbMock.moderationAudit.findMany).not.toHaveBeenCalled();
  });

  it('returns 404 for non-SharedPath ticket refTypes (v1 only supports SharedPath)', async () => {
    mocks.dbMock.ticket.findUnique.mockResolvedValueOnce({
      ...makeTicketRow(),
      refType: 'SomeFutureType',
    });

    const res = await callGet('ticket-1');

    expect(res.status).toBe(404);
    expect(mocks.dbMock.sharedPath.findUnique).not.toHaveBeenCalled();
  });
});

// ── fixture helpers ────────────────────────────────────────────────────────

function makeTicketRow() {
  const now = new Date('2026-05-20T12:00:00Z');
  return {
    id: 'ticket-1',
    type: 'moderation_review',
    refType: 'SharedPath',
    refId: 'shared-path-1',
    status: 'open',
    assigneeId: null,
    resolvedById: null,
    resolvedAt: null,
    resolutionNote: null,
    createdAt: now,
    updatedAt: now,
    assignee: null,
    resolvedBy: null,
  };
}

function makeSharedPathRow() {
  return {
    id: 'shared-path-1',
    title: 'Possibly off-topic path',
    description: 'A path that the model wasnt sure about.',
    language: 'en',
    subjects: ['general'],
    phaseCount: 3,
    slotCount: 12,
    moderationStatus: 'flagged_pending_human',
    rejectionReason: null,
    seeded: false,
    downloadCount: 0,
    viewCount: 0,
    ratingAverage: null,
    ratingCount: 0,
    createdAt: new Date('2026-05-20T11:00:00Z'),
    approvedAt: null,
    sharedBy: {
      id: 'author-id',
      username: 'author',
      avatarUrl: null,
      email: 'author@example.com',
    },
  };
}

function makeAudit(
  overrides: Partial<{
    id: string;
    layer: number;
    verdict: string;
    reasonCode: string | null;
    reasoning: string | null;
    model: string | null;
    costUsd: number;
    tokensIn: number;
    tokensOut: number;
    minutesAgo: number;
  }> = {}
) {
  const minutesAgo = overrides.minutesAgo ?? 10;
  return {
    id: overrides.id ?? 'audit-1',
    layer: overrides.layer ?? 1,
    verdict: overrides.verdict ?? 'pass',
    reasonCode: overrides.reasonCode ?? null,
    reasoning: overrides.reasoning ?? null,
    actorId: null,
    model: overrides.model ?? null,
    costUsd: overrides.costUsd ?? 0,
    tokensIn: overrides.tokensIn ?? 0,
    tokensOut: overrides.tokensOut ?? 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    createdAt: new Date(Date.now() - minutesAgo * 60_000),
    actor: null,
  };
}
