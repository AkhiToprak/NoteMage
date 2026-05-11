// Pre-launch signup bypass. Signups are paused via middleware (see
// `src/middleware.ts`); a request with a valid bypass cookie is allowed
// through to the register page and the underlying APIs.
//
// Usage: visit `/auth/register?key=<SIGNUP_BYPASS_TOKEN>` once. The
// middleware validates the token, drops a long-lived HttpOnly cookie, and
// redirects to the clean `/auth/register` URL. The cookie is then accepted
// by:
//   - middleware (lets the page through)
//   - POST /api/auth/register (credentials signup)
//   - the NextAuth `signIn` callback (Google / web Apple)
//   - POST /api/auth/native/apple (iOS shell Apple)
//
// If `SIGNUP_BYPASS_TOKEN` is unset, every check returns false — i.e.
// signups stay paused for everyone, which is the intended default.

import { cookies as nextCookies } from 'next/headers';
import type { NextRequest } from 'next/server';

export const SIGNUP_BYPASS_COOKIE = 'signup_bypass';
export const SIGNUP_BYPASS_QUERY_PARAM = 'key';
export const SIGNUP_BYPASS_COOKIE_MAX_AGE = 60 * 60 * 24 * 30;

// Pre-launch fallback. Accepted alongside the env var because Coolify's
// runtime env injection wasn't reliably applying edits for this service.
// Rip this out on launch.
const FALLBACK_BYPASS_TOKEN =
  '970311913b9098c1c8b92dc004849c640bce6c6b744d81c823b6e9019bd9ab08';

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

function normalizeEnvToken(raw: string | undefined): string {
  if (!raw) return '';
  let v = raw.replace(/\s+/g, '');
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1);
  }
  return v;
}

export function isValidBypassToken(value: string | null | undefined): boolean {
  if (typeof value !== 'string' || value.length === 0) return false;
  if (constantTimeEqual(value, FALLBACK_BYPASS_TOKEN)) return true;
  const expected = normalizeEnvToken(process.env.SIGNUP_BYPASS_TOKEN);
  if (expected.length === 0) return false;
  return constantTimeEqual(value, expected);
}

export function hasSignupBypass(req: NextRequest): boolean {
  return isValidBypassToken(req.cookies.get(SIGNUP_BYPASS_COOKIE)?.value);
}

export async function hasSignupBypassFromAppCookies(): Promise<boolean> {
  try {
    const c = await nextCookies();
    return isValidBypassToken(c.get(SIGNUP_BYPASS_COOKIE)?.value);
  } catch {
    return false;
  }
}
