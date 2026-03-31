import { NextRequest } from 'next/server';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store) {
    if (entry.resetAt <= now) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Simple in-memory rate limiter.
 * Returns { success: true } if allowed, or { success: false, retryAfterMs } if blocked.
 */
export function rateLimit(
  key: string,
  maxRequests: number,
  windowMs: number
): { success: boolean; retryAfterMs?: number } {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || entry.resetAt <= now) {
    store.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true };
  }

  if (entry.count >= maxRequests) {
    return { success: false, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { success: true };
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
    const ips = forwarded.split(',').map(ip => ip.trim()).filter(Boolean);
    // Use the rightmost IP — the one appended by the closest trusted proxy
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
