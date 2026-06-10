// Integration tests for POST /api/community/paths/[shareId]/report (P13).
//
// Strategy mirrors paths-clone.test.ts: mock the auth + db + aggregation
// boundaries and assert the route handler's contract.
//
//   - auth required (401)
//   - reason allow-list (400) + detail cap (400), validated BEFORE any DB
//   - approved-only (404, existence-leak guard)
//   - no self-report (400)
//   - idempotent upsert per (user, path), then runReportAggregation inline

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn(),
  runReportAggregation: vi.fn(() =>
    Promise.resolve({ outcome: 'below_threshold', openReports: 1, ticketId: null }),
  ),
  dbMock: {
    sharedPath: { findUnique: vi.fn() },
    report: { upsert: vi.fn() },
  },
}));

vi.mock('@/lib/auth', () => ({ getAuthUserId: mocks.getAuthUserId }));
vi.mock('@/lib/moderation/layer4-runner', () => ({
  runReportAggregation: mocks.runReportAggregation,
}));
vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));

import { POST } from '../../../../app/api/community/paths/[shareId]/report/route';

const SHARE_ID = 'shp-1';
const VIEWER_ID = 'user-1';
const AUTHOR_ID = 'author-1';

function callPost(body: unknown, shareId = SHARE_ID) {
  const req = new NextRequest(
    `http://localhost/api/community/paths/${shareId}/report`,
    {
      method: 'POST',
      body: body === undefined ? undefined : JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    },
  );
  return POST(req, { params: Promise.resolve({ shareId }) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getAuthUserId.mockResolvedValue(VIEWER_ID);
  mocks.dbMock.sharedPath.findUnique.mockResolvedValue({
    id: SHARE_ID,
    moderationStatus: 'approved',
    sharedById: AUTHOR_ID,
  });
  mocks.dbMock.report.upsert.mockResolvedValue({ id: 'rep-1' });
});

describe('POST report — auth + validation', () => {
  it('401 without a session, zero DB touch', async () => {
    mocks.getAuthUserId.mockResolvedValue(null);
    const res = await callPost({ reason: 'spam' });
    expect(res.status).toBe(401);
    expect(mocks.dbMock.sharedPath.findUnique).not.toHaveBeenCalled();
    expect(mocks.dbMock.report.upsert).not.toHaveBeenCalled();
  });

  it('400 on a missing / invalid reason, before any DB work', async () => {
    const missing = await callPost({});
    expect(missing.status).toBe(400);
    const bad = await callPost({ reason: 'l2.adult' }); // a moderation code, not a report reason
    expect(bad.status).toBe(400);
    expect(mocks.dbMock.sharedPath.findUnique).not.toHaveBeenCalled();
  });

  it('400 when the detail exceeds the cap', async () => {
    const res = await callPost({ reason: 'spam', detail: 'x'.repeat(1001) });
    expect(res.status).toBe(400);
    expect(mocks.dbMock.report.upsert).not.toHaveBeenCalled();
  });
});

describe('POST report — gates', () => {
  it('404 for a non-approved (or missing) path — existence-leak guard', async () => {
    mocks.dbMock.sharedPath.findUnique.mockResolvedValue({
      id: SHARE_ID,
      moderationStatus: 'pending',
      sharedById: AUTHOR_ID,
    });
    const res = await callPost({ reason: 'spam' });
    expect(res.status).toBe(404);
    expect(mocks.dbMock.report.upsert).not.toHaveBeenCalled();
    expect(mocks.runReportAggregation).not.toHaveBeenCalled();
  });

  it('400 when you try to report your own path', async () => {
    mocks.getAuthUserId.mockResolvedValue(AUTHOR_ID); // viewer is the author
    const res = await callPost({ reason: 'spam' });
    expect(res.status).toBe(400);
    expect(mocks.dbMock.report.upsert).not.toHaveBeenCalled();
    expect(mocks.runReportAggregation).not.toHaveBeenCalled();
  });
});

describe('POST report — happy path', () => {
  it('upserts the report (idempotent per user+path) and runs aggregation', async () => {
    const res = await callPost({ reason: 'spam', detail: '  buy-now links  ' });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toMatchObject({ success: true, data: { reported: true } });

    expect(mocks.dbMock.report.upsert).toHaveBeenCalledTimes(1);
    const upsert = mocks.dbMock.report.upsert.mock.calls[0][0];
    expect(upsert.where).toEqual({
      sharedPathId_reporterId: { sharedPathId: SHARE_ID, reporterId: VIEWER_ID },
    });
    expect(upsert.create).toMatchObject({
      sharedPathId: SHARE_ID,
      reporterId: VIEWER_ID,
      reason: 'spam',
      detail: 'buy-now links', // trimmed
      status: 'open',
    });
    expect(upsert.update).toMatchObject({ reason: 'spam', detail: 'buy-now links' });

    // Aggregation runs inline with the shareId.
    expect(mocks.runReportAggregation).toHaveBeenCalledTimes(1);
    expect(mocks.runReportAggregation).toHaveBeenCalledWith(SHARE_ID);
  });

  it('treats a blank detail as null', async () => {
    await callPost({ reason: 'offtopic', detail: '   ' });
    const upsert = mocks.dbMock.report.upsert.mock.calls[0][0];
    expect(upsert.create.detail).toBeNull();
  });
});
