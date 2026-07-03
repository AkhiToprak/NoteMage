import { createHmac } from 'crypto';
import { getRedis } from '@/lib/redis';

const FAILURE_WINDOW_SECONDS = 15 * 60;
const MAX_DELAY_SECONDS = 60;

const RECORD_FAILURE_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
redis.call('EXPIRE', KEYS[1], ARGV[1])

local delay = 0
if count >= 3 then
  delay = math.min(60, 2 ^ (count - 3))
  redis.call('SET', KEYS[2], '1', 'PX', delay * 1000)
end

return { count, delay * 1000 }
`;

export interface LoginThrottleStatus {
  allowed: boolean;
  retryAfterMs?: number;
  unavailable?: boolean;
}

export interface LoginFailureResult {
  recorded: boolean;
  count?: number;
  delayMs?: number;
}

export function loginDelaySeconds(failureCount: number): number {
  if (!Number.isSafeInteger(failureCount) || failureCount < 3) return 0;
  return Math.min(MAX_DELAY_SECONDS, 2 ** (failureCount - 3));
}

function emailFingerprint(email: string): string {
  const secret = process.env.NEXTAUTH_SECRET || 'notemage-development-only';
  return createHmac('sha256', secret).update(email.trim().toLowerCase()).digest('hex');
}

function keysFor(email: string): [string, string] {
  const fingerprint = emailFingerprint(email);
  return [`login-email:failures:${fingerprint}`, `login-email:block:${fingerprint}`];
}

/** Fail-closed preflight for the progressive per-email login delay. */
export async function checkLoginThrottle(email: string): Promise<LoginThrottleStatus> {
  try {
    const [, blockKey] = keysFor(email);
    const ttl = await getRedis().pttl(blockKey);
    return ttl > 0 ? { allowed: false, retryAfterMs: ttl } : { allowed: true };
  } catch (error) {
    console.error('[login-throttle] preflight failed closed', error);
    return { allowed: false, retryAfterMs: MAX_DELAY_SECONDS * 1000, unavailable: true };
  }
}

/** Atomically count a failed credential attempt and arm the next delay. */
export async function recordLoginFailureForEmail(email: string): Promise<LoginFailureResult> {
  try {
    const [failureKey, blockKey] = keysFor(email);
    const result = await getRedis().eval<[number], [number, number]>(
      RECORD_FAILURE_SCRIPT,
      [failureKey, blockKey],
      [FAILURE_WINDOW_SECONDS]
    );
    const count = Number(result[0]);
    const delayMs = Number(result[1]);
    return { recorded: true, count, delayMs };
  } catch (error) {
    console.error('[login-throttle] failure recording failed closed', error);
    return { recorded: false };
  }
}

/** Clear both progressive-throttle keys after a successful credential login. */
export async function clearLoginThrottle(email: string): Promise<boolean> {
  try {
    await getRedis().del(...keysFor(email));
    return true;
  } catch (error) {
    console.error('[login-throttle] clear failed closed', error);
    return false;
  }
}
