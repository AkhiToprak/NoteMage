import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn(),
  getDashboardData: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({ getAuthUserId: mocks.getAuthUserId }));
vi.mock('@/lib/dashboard-data', () => ({ getDashboardData: mocks.getDashboardData }));

import { GET } from '../../../app/api/dashboard/route';

beforeEach(() => {
  vi.clearAllMocks();
});

describe('GET /api/dashboard', () => {
  it('returns 401 when unauthenticated', async () => {
    mocks.getAuthUserId.mockResolvedValueOnce(null);

    const res = await GET(new NextRequest('http://localhost/api/dashboard'));

    expect(res.status).toBe(401);
    expect(mocks.getDashboardData).not.toHaveBeenCalled();
  });

  it('returns the dashboard cockpit payload for the authenticated user', async () => {
    mocks.getAuthUserId.mockResolvedValueOnce('user-1');
    mocks.getDashboardData.mockResolvedValueOnce({
      hasUsablePath: false,
      studiedToday: false,
      active: null,
    });

    const res = await GET(new NextRequest('http://localhost/api/dashboard'));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(mocks.getDashboardData).toHaveBeenCalledWith('user-1');
    expect(body.data).toEqual({
      hasUsablePath: false,
      studiedToday: false,
      active: null,
    });
  });
});
