import { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/redis';
import { clientIpFromHeaders } from '@/lib/client-ip';

/**
 * Cache Ratelimit instances by (maxRequests, windowMs) to avoid
 * recreating them on every request in serverless environments.
 */
const limiters = new Map<string, Ratelimit>();

function getLimiter(maxRequests: number, windowMs: number): Ratelimit {
  const cacheKey = `${maxRequests}:${windowMs}`;
  let limiter = limiters.get(cacheKey);
  if (!limiter) {
    limiter = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms`),
      prefix: 'rl',
    });
    limiters.set(cacheKey, limiter);
  }
  return limiter;
}

/**
 * Redis-backed rate limiter using Upstash.
 * Returns { success: true } if allowed, or { success: false, retryAfterMs } if blocked.
 *
 * Failure mode on a Redis error is controlled by `failClosed` (default false):
 *   - false → fail OPEN (allow the request). Used for non-security-critical
 *     limiters where availability matters more than the cap.
 *   - true  → fail CLOSED (block the request). Used for security-critical
 *     limiters (login, register, resend-code) where a dropped cap would let
 *     an attacker brute-force / spam while Redis is down.
 */
export async function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
  failClosed = false,
  cost = 1
): Promise<{ success: boolean; retryAfterMs?: number }> {
  try {
    const limiter = getLimiter(maxRequests, windowMs);
    // `cost` consumes more than one token in a single call — used when one
    // request triggers multiple backend operations (e.g. a quiz code-grade
    // runs one sandbox execution per test), so the limiter reflects the real
    // load instead of charging a flat 1 per request.
    const result = await limiter.limit(key, cost > 1 ? { rate: cost } : undefined);

    if (!result.success) {
      return { success: false, retryAfterMs: result.reset - Date.now() };
    }
    return { success: true };
  } catch (error) {
    if (failClosed) {
      // Fail closed: if Redis is down, block the request rather than drop
      // the cap on a security-critical endpoint.
      console.error('Rate limiter error (failing closed):', error);
      return { success: false };
    }
    // Fail open: if Redis is down, allow the request through.
    // Account-level lockout in Postgres still provides protection.
    console.error('Rate limiter error (failing open):', error);
    return { success: true };
  }
}

/**
 * Extract the client IP from a request's forwarded headers. The trusted-proxy
 * precedence (and the TRUSTED_PROXY_HOPS knob) lives in src/lib/client-ip.ts so
 * it stays identical to the OAuth-cap extractor in src/lib/registration.ts.
 */
export function getClientIp(request: NextRequest): string {
  return clientIpFromHeaders(
    request.headers.get('x-forwarded-for'),
    request.headers.get('x-real-ip')
  );
}

/**
 * Build a rate-limit key that combines user identity (if authenticated)
 * with IP. This prevents bypass via header spoofing for logged-in users.
 */
export function rateLimitKey(prefix: string, request: NextRequest, userId?: string | null): string {
  const ip = getClientIp(request);
  return userId ? `${prefix}:user:${userId}` : `${prefix}:ip:${ip}`;
}
