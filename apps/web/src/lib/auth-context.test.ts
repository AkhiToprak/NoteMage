import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { JWT } from 'next-auth/jwt';

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  logSecurityEvent: vi.fn(),
  getToken: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: { user: { findUnique: mocks.findUnique } } }));
vi.mock('@/lib/security-events', () => ({ logSecurityEvent: mocks.logSecurityEvent }));
vi.mock('next-auth/jwt', () => ({ getToken: mocks.getToken }));

import { validateAuthToken } from '@/lib/auth-context';
import { getAdminUserId } from '@/lib/auth';

function jwt(overrides: Partial<JWT> = {}): JWT {
  return { id: 'user-1', authVersion: 4, ...overrides } as JWT;
}

function activeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    role: 'admin',
    tier: 'PRO',
    scholarName: 'Sage',
    banned: false,
    authVersion: 4,
    ...overrides,
  };
}

describe('database-validated auth context', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findUnique.mockResolvedValue(activeUser());
  });

  it.each([undefined, '4', 0, 1.5, Number.NaN])(
    'rejects a missing or malformed authVersion claim (%s)',
    async (authVersion) => {
      const token = jwt({ authVersion: authVersion as number });
      if (authVersion === undefined) delete (token as Partial<JWT>).authVersion;

      await expect(validateAuthToken(token)).resolves.toBeNull();
      expect(mocks.findUnique).not.toHaveBeenCalled();
      expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'session.rejected' })
      );
    }
  );

  it('rejects deleted, banned, and version-mismatched users', async () => {
    mocks.findUnique.mockResolvedValueOnce(null);
    await expect(validateAuthToken(jwt())).resolves.toBeNull();

    mocks.findUnique.mockResolvedValueOnce(activeUser({ banned: true }));
    await expect(validateAuthToken(jwt())).resolves.toBeNull();

    mocks.findUnique.mockResolvedValueOnce(activeUser({ authVersion: 5 }));
    await expect(validateAuthToken(jwt())).resolves.toBeNull();

    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session.banned' })
    );
    expect(mocks.logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'session.version_mismatch' })
    );
  });

  it('returns the current database role and tier', async () => {
    await expect(validateAuthToken(jwt({ role: 'user', tier: 'FREE' }))).resolves.toEqual({
      userId: 'user-1',
      role: 'admin',
      tier: 'PRO',
      scholarName: 'Sage',
    });
  });

  it('removes admin access immediately when the database role changes', async () => {
    mocks.getToken.mockResolvedValue(jwt({ role: 'admin' }));
    mocks.findUnique.mockResolvedValue(activeUser({ role: 'user' }));

    await expect(getAdminUserId({} as never)).resolves.toBeNull();
  });
});
