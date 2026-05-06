/**
 * Shared registration helpers used by both the credentials register route
 * (`app/api/auth/register/route.ts`) and the OAuth sign-in callback
 * (`src/auth/config.ts`). Keep this file pure — no NextRequest or Next.js
 * route primitives — so it can be imported from the NextAuth callback
 * context where a request object isn't available.
 */

import { randomBytes } from 'crypto';
import { db } from '@/lib/db';

/** Must match USERNAME_REGEX in app/api/auth/register/route.ts. */
const USER_USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

/** Placeholder prefix reserved for auto-generated OAuth usernames. */
export const OAUTH_USERNAME_PREFIX = 'oauth_';

export type IpCapResult = { ok: true } | { ok: false; reason: string };

/**
 * Enforce the "max 3 accounts per IP in the last 12 months" rule.
 *
 * Split out of app/api/auth/register/route.ts so the OAuth signIn callback
 * (which has no NextRequest access) can also gate new-user creation.
 *
 * Fails open (`ok: true`) if the IP is "unknown" — OAuth callbacks may not
 * always have reliable IP information, and blocking all of them would be
 * worse than letting them through when the provider already verified email.
 */
export async function enforceIpCap(ip: string): Promise<IpCapResult> {
  if (!ip || ip === 'unknown') {
    return { ok: true };
  }

  const whitelistedIps = (process.env.IP_WHITELIST ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  if (whitelistedIps.includes(ip)) {
    return { ok: true };
  }

  const twelveMonthsAgo = new Date();
  twelveMonthsAgo.setFullYear(twelveMonthsAgo.getFullYear() - 1);

  const ipRegistrationCount = await db.ipRegistration.count({
    where: {
      ip,
      createdAt: { gte: twelveMonthsAgo },
    },
  });

  if (ipRegistrationCount >= 3) {
    return {
      ok: false,
      reason: 'Maximum number of accounts reached for this network. Please try again later.',
    };
  }

  return { ok: true };
}

/**
 * Read the client IP from a plain `Headers` object — used from the NextAuth
 * signIn callback via `next/headers`. Mirrors the precedence of
 * getClientIp() in src/lib/rate-limit.ts.
 */
export function getIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const ips = forwarded
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);
    return ips[ips.length - 1] || 'unknown';
  }
  return headers.get('x-real-ip') || 'unknown';
}

/**
 * Generate a placeholder username for a freshly-created OAuth user.
 *
 * The returned value intentionally exceeds the 20-char public limit and
 * contains no characters a user would naturally type — it can only be
 * written via direct Prisma create in the signIn callback, never via the
 * public /api/user/username endpoint (which rejects the `oauth_` prefix).
 *
 * The user replaces this with a real handle in the UsernameStep of the
 * onboarding wizard before they can reach any protected route.
 */
export function generatePlaceholderUsername(): string {
  return `${OAUTH_USERNAME_PREFIX}${randomBytes(12).toString('hex')}`;
}

/** True if the given username is a placeholder (never shown publicly). */
export function isPlaceholderUsername(username: string | null | undefined): boolean {
  return typeof username === 'string' && username.startsWith(OAUTH_USERNAME_PREFIX);
}

/**
 * Validate a user-submitted username. Mirrors the rules enforced in
 * app/api/auth/register/route.ts, plus rejects the OAuth placeholder
 * namespace so users can't squat on it.
 */
export function validateUserUsername(
  raw: unknown
): { ok: true; username: string } | { ok: false; reason: string } {
  if (typeof raw !== 'string') {
    return { ok: false, reason: 'Username is required' };
  }
  const username = raw.toLowerCase().trim();
  if (!username) {
    return { ok: false, reason: 'Username is required' };
  }
  if (username.startsWith(OAUTH_USERNAME_PREFIX)) {
    return { ok: false, reason: 'This username prefix is reserved' };
  }
  if (!USER_USERNAME_REGEX.test(username)) {
    return {
      ok: false,
      reason: 'Username must be 3–20 characters: letters, numbers, underscores only',
    };
  }
  return { ok: true, username };
}
