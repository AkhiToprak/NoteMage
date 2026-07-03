import { afterEach, describe, expect, it, vi } from 'vitest';
import { loginChallengeRequired } from '@/lib/login-challenge';
import { turnstileConfigured, verifyTurnstile } from '@/lib/turnstile';

describe('Turnstile runtime requirements', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('fails closed in production unless both keys are configured', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');

    expect(turnstileConfigured()).toBe(false);
    await expect(loginChallengeRequired('127.0.0.1')).resolves.toBe(true);
    await expect(verifyTurnstile('token', '127.0.0.1')).resolves.toBe(false);
  });

  it('allows the unconfigured no-op only outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv('TURNSTILE_SECRET_KEY', '');
    vi.stubEnv('NEXT_PUBLIC_TURNSTILE_SITE_KEY', '');

    await expect(loginChallengeRequired('127.0.0.1')).resolves.toBe(false);
    await expect(verifyTurnstile(undefined, '127.0.0.1')).resolves.toBe(true);
  });
});
