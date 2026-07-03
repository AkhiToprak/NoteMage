import { getRedis } from '@/lib/redis';

/**
 * Adaptive login bot-gate. Counts failed credential logins per IP; once an IP
 * crosses THRESHOLD failures within WINDOW, the login form must solve a
 * Turnstile challenge until a successful login clears the counter. This keeps
 * the challenge invisible for normal users and surfaces it only during a
 * brute-force / credential-stuffing run (many emails from one IP) — which the
 * per-account lockout alone does not catch.
 *
 * Dormant without Turnstile only in development/test. Production treats a
 * missing key pair as requiring a challenge, which then fails closed.
 */
const WINDOW_SECONDS = 15 * 60;
const THRESHOLD = 3;

function failKey(ip: string): string {
  return `login-fail:${ip}`;
}

function configured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

/** True when this IP has failed enough recent logins to warrant a challenge. */
export async function loginChallengeRequired(ip: string): Promise<boolean> {
  if (!configured()) return process.env.NODE_ENV === 'production';
  try {
    const count = await getRedis().get<number>(failKey(ip));
    return (count ?? 0) >= THRESHOLD;
  } catch {
    // Redis unavailable → don't block legitimate logins.
    return false;
  }
}

/** Record one failed login from this IP (best-effort; sets the window TTL). */
export async function recordLoginFailure(ip: string): Promise<void> {
  if (!configured()) return;
  try {
    const redis = getRedis();
    const count = await redis.incr(failKey(ip));
    if (count === 1) await redis.expire(failKey(ip), WINDOW_SECONDS);
  } catch {
    /* best-effort — a missed count just means one fewer signal */
  }
}

/** Clear the failure counter for this IP after a successful login. */
export async function clearLoginChallenge(ip: string): Promise<void> {
  if (!configured()) return;
  try {
    await getRedis().del(failKey(ip));
  } catch {
    /* best-effort */
  }
}
