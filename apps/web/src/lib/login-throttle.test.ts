import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  pttl: vi.fn(),
  eval: vi.fn(),
  del: vi.fn(),
}));

vi.mock('@/lib/redis', () => ({
  getRedis: () => ({ pttl: mocks.pttl, eval: mocks.eval, del: mocks.del }),
}));

import {
  checkLoginThrottle,
  clearLoginThrottle,
  loginDelaySeconds,
  recordLoginFailureForEmail,
} from '@/lib/login-throttle';

describe('progressive email login throttle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXTAUTH_SECRET', 'test-auth-secret');
    mocks.pttl.mockResolvedValue(-2);
    mocks.eval.mockResolvedValue([3, 1000]);
    mocks.del.mockResolvedValue(2);
  });

  it('uses the requested progressive delay schedule with a 60 second cap', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 12].map(loginDelaySeconds)).toEqual([
      0, 0, 1, 2, 4, 8, 16, 32, 60, 60,
    ]);
  });

  it('never puts the normalized email in Redis keys', async () => {
    await recordLoginFailureForEmail('learner@example.com');

    const keys = mocks.eval.mock.calls[0][1] as string[];
    expect(keys.join(':')).not.toContain('learner@example.com');
    expect(keys[0]).toMatch(/^login-email:failures:[a-f0-9]{64}$/);
  });

  it('reports active delays and fails closed when Redis is unavailable', async () => {
    mocks.pttl.mockResolvedValueOnce(3200);
    await expect(checkLoginThrottle('a@example.com')).resolves.toEqual({
      allowed: false,
      retryAfterMs: 3200,
    });

    mocks.pttl.mockRejectedValueOnce(new Error('redis down'));
    await expect(checkLoginThrottle('a@example.com')).resolves.toEqual({
      allowed: false,
      retryAfterMs: 60_000,
      unavailable: true,
    });
  });

  it('clears the failure and delay keys after successful authentication', async () => {
    await expect(clearLoginThrottle('a@example.com')).resolves.toBe(true);
    expect(mocks.del).toHaveBeenCalledWith(
      expect.stringMatching(/^login-email:failures:/),
      expect.stringMatching(/^login-email:block:/)
    );
  });
});
