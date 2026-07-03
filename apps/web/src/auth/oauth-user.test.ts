import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  findLink: vi.fn(),
  findUser: vi.fn(),
  createLink: vi.fn(),
  enforceIpCap: vi.fn(),
  logSecurityEvent: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  db: {
    oAuthAccount: { findUnique: mocks.findLink, create: mocks.createLink },
    user: { findUnique: mocks.findUser },
  },
}));
vi.mock('@/lib/registration', () => ({
  enforceIpCap: mocks.enforceIpCap,
  generatePlaceholderUsername: () => 'oauth_placeholder',
  hashIp: (ip: string) => `hashed:${ip}`,
}));
vi.mock('@/lib/security-events', () => ({ logSecurityEvent: mocks.logSecurityEvent }));

import { findOrCreateOAuthUser } from '@/auth/oauth-user';

describe('shared OAuth user resolution', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findLink.mockResolvedValue(null);
    mocks.findUser.mockResolvedValue(null);
    mocks.enforceIpCap.mockResolvedValue({ ok: true });
  });

  it('denies an already-linked OAuth identity when its user is banned', async () => {
    mocks.findLink.mockResolvedValue({ userId: 'user-1', user: { banned: true } });

    await expect(
      findOrCreateOAuthUser({
        provider: 'google',
        providerAccountId: 'provider-1',
        email: 'user@example.com',
        name: null,
        avatarUrl: null,
        ip: '127.0.0.1',
        allowNewUser: true,
      })
    ).resolves.toEqual({ ok: false, reason: 'banned' });

    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', type: 'oauth.denied' })
    );
  });
});
