import { NextRequest } from 'next/server';
import { Ratelimit } from '@upstash/ratelimit';
import { redis } from '@/lib/redis';

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
 * Fails open (allows request) if Redis is unreachable.
 */
export async function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): Promise<{ success: boolean; retryAfterMs?: number }> {
  try {
    const limiter = getLimiter(maxRequests, windowMs);
    const result = await limiter.limit(key);

    if (!result.success) {
      return { success: false, retryAfterMs: result.reset - Date.now() };
    }
    return { success: true };
  } catch (error) {
    // Fail open: if Redis is down, allow the request through.
    // Account-level lockout in Postgres still provides protection.
    console.error('Rate limiter error (failing open):', error);
    return { success: true };
  }
}

/**
 * Extract client IP from request headers.
 *
 * Security: X-Forwarded-For can be spoofed by clients. We take the
 * *rightmost* IP in the chain (the one added by the last trusted proxy),
 * which is harder to forge than the leftmost (client-supplied) value.
 * For environments without a reverse proxy, falls back to x-real-ip.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);
    return ips[ips.length - 1] || 'unknown';
  }
  return request.headers.get('x-real-ip') || 'unknown';
}

/**
 * Build a rate-limit key that combines user identity (if authenticated)
 * with IP. This prevents bypass via header spoofing for logged-in users.
 */
export function rateLimitKey(prefix: string, request: NextRequest, userId?: string | null): string {
  const ip = getClientIp(request);
  return userId ? `${prefix}:user:${userId}` : `${prefix}:ip:${ip}`;
}
