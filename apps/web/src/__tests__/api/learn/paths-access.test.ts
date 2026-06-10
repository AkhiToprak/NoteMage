// P12V — GET /api/learn/paths/access (capability probe, AC-Switch-3).
//
// Drives the client create-CTA decision: PRO / admins always generate;
// FREE generates only while the switchover flag is off. Computed from the
// JWT (no DB), so we mock getToken and toggle the env var.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({ getToken: vi.fn() }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));

import { GET } from '../../../../app/api/learn/paths/access/route';

const ORIGINAL = process.env.FREE_TIER_AI_PATHS_DISABLED;

function callGet() {
  return GET(new NextRequest('http://localhost/api/learn/paths/access'));
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.FREE_TIER_AI_PATHS_DISABLED;
  else process.env.FREE_TIER_AI_PATHS_DISABLED = ORIGINAL;
});

describe('GET /api/learn/paths/access', () => {
  it('401 when unauthenticated', async () => {
    mocks.getToken.mockResolvedValueOnce(null);
    const res = await callGet();
    expect(res.status).toBe(401);
  });

  it('FREE + flag off → canGenerate true (legacy behaviour)', async () => {
    process.env.FREE_TIER_AI_PATHS_DISABLED = 'false';
    mocks.getToken.mockResolvedValueOnce({ id: 'u1', tier: 'FREE', role: 'user' });
    const res = await callGet();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ canGenerate: true });
  });

  it('FREE + flag on → canGenerate false (routes to library)', async () => {
    process.env.FREE_TIER_AI_PATHS_DISABLED = 'true';
    mocks.getToken.mockResolvedValueOnce({ id: 'u1', tier: 'FREE', role: 'user' });
    const res = await callGet();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.data).toEqual({ canGenerate: false });
  });

  it('PRO is never blocked by the flag (AC-Switch-2)', async () => {
    process.env.FREE_TIER_AI_PATHS_DISABLED = 'true';
    mocks.getToken.mockResolvedValueOnce({ id: 'u1', tier: 'PRO', role: 'user' });
    const res = await callGet();
    const body = await res.json();
    expect(body.data).toEqual({ canGenerate: true });
  });

  it('admin is never blocked by the flag', async () => {
    process.env.FREE_TIER_AI_PATHS_DISABLED = 'true';
    mocks.getToken.mockResolvedValueOnce({ id: 'a1', tier: 'FREE', role: 'admin' });
    const res = await callGet();
    const body = await res.json();
    expect(body.data).toEqual({ canGenerate: true });
  });
});
