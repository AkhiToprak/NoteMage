import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  emailUpsert: vi.fn(),
  passwordUpsert: vi.fn(),
  queryRaw: vi.fn(),
  emailDelete: vi.fn(),
  emailUpdate: vi.fn(),
  passwordDelete: vi.fn(),
  passwordUpdate: vi.fn(),
  userUpdate: vi.fn(),
  hash: vi.fn(),
  compare: vi.fn(),
}));

const tx = {
  $queryRaw: mocks.queryRaw,
  emailVerificationCode: { delete: mocks.emailDelete, update: mocks.emailUpdate },
  passwordResetCode: { delete: mocks.passwordDelete, update: mocks.passwordUpdate },
  user: { update: mocks.userUpdate },
};

vi.mock('@/lib/db', () => ({
  db: {
    $transaction: mocks.transaction,
    emailVerificationCode: { upsert: mocks.emailUpsert },
    passwordResetCode: { upsert: mocks.passwordUpsert },
  },
}));
vi.mock('bcryptjs', () => ({
  default: { hash: mocks.hash, compare: mocks.compare },
}));

import {
  issueEmailVerificationCode,
  issuePasswordResetCode,
  resetPasswordWithCode,
  verifyEmailCode,
} from '@/lib/verification';

function codeRow(attempts = 0) {
  return {
    id: 'code-1',
    codeHash: 'hashed-code',
    attempts,
    expiresAt: new Date(Date.now() + 60_000),
  };
}

describe('single-use verification codes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback) => callback(tx));
    mocks.hash.mockResolvedValue('hashed-code');
    mocks.compare.mockResolvedValue(true);
  });

  it('issues both code types with upsert and resets attempts', async () => {
    await issueEmailVerificationCode('user-1');
    await issuePasswordResetCode('user-1');

    expect(mocks.emailUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: expect.objectContaining({ attempts: 0 }),
      })
    );
    expect(mocks.passwordUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        update: expect.objectContaining({ attempts: 0 }),
      })
    );
  });

  it('verifies the email and consumes the locked row in one transaction', async () => {
    mocks.queryRaw.mockResolvedValue([codeRow()]);

    await expect(verifyEmailCode('user-1', '123456')).resolves.toEqual({ ok: true });
    expect(mocks.userUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user-1' } })
    );
    expect(mocks.emailDelete).toHaveBeenCalledWith({ where: { id: 'code-1' } });
  });

  it('allows at most five concurrent wrong comparisons before deleting the code', async () => {
    mocks.compare.mockResolvedValue(false);
    mocks.queryRaw
      .mockResolvedValueOnce([codeRow(0)])
      .mockResolvedValueOnce([codeRow(1)])
      .mockResolvedValueOnce([codeRow(2)])
      .mockResolvedValueOnce([codeRow(3)])
      .mockResolvedValueOnce([codeRow(4)])
      .mockResolvedValueOnce([]);

    await Promise.all(Array.from({ length: 6 }, () => verifyEmailCode('user-1', '000000')));

    expect(mocks.compare).toHaveBeenCalledTimes(5);
    expect(mocks.emailUpdate).toHaveBeenCalledTimes(4);
    expect(mocks.emailDelete).toHaveBeenCalledTimes(1);
  });

  it('produces exactly one success for concurrent correct submissions', async () => {
    mocks.queryRaw.mockResolvedValueOnce([codeRow()]).mockResolvedValueOnce([]);

    const results = await Promise.all([
      verifyEmailCode('user-1', '123456'),
      verifyEmailCode('user-1', '123456'),
    ]);

    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(mocks.emailDelete).toHaveBeenCalledTimes(1);
  });

  it('updates the password, revokes sessions, and consumes the reset code atomically', async () => {
    mocks.queryRaw.mockResolvedValue([codeRow()]);

    await expect(
      resetPasswordWithCode('user-1', '123456', 'new-password-hash', null)
    ).resolves.toEqual({ ok: true });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: expect.objectContaining({
        password: 'new-password-hash',
        authVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedAt: null,
      }),
    });
    expect(mocks.passwordDelete).toHaveBeenCalledWith({ where: { id: 'code-1' } });
  });
});
