// NM-M1 guard — defense-in-depth invariant for the API auth surface.
//
// The middleware does NOT blanket-gate /api/* (a runtime gate was deferred
// because a wrong public-route allowlist would break every public endpoint).
// Instead, this test asserts that EVERY `app/api/**/route.ts` either enforces
// session auth itself or is on an explicit, justified public allowlist. A new
// route added without auth and without a conscious allowlist entry fails CI —
// which is exactly the regression that produced the audit's reachable IDORs.
//
// To add a genuinely public route: add it to PUBLIC_ALLOWLIST *with* a comment
// explaining what protects it instead of a session (signature, OAuth state,
// rate-limit, or "intentionally anonymous").

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// apps/web/app/api — resolved from this file (apps/web/src/__tests__/…) so the
// test is independent of the working directory vitest is launched from.
const API_DIR = join(dirname(fileURLToPath(import.meta.url)), '../..', 'app', 'api');

// Any of these means the handler establishes the caller's identity from the
// session/JWT. `getToken` is next-auth's lower-level JWT read (used by routes
// that branch on tier/role without a DB round-trip).
const SESSION_AUTH = /\bgetAuthUserId\b|\bgetAdminUserId\b|\bgetServerSession\b|\bgetToken\b/;

// Routes that are public-by-design or protected by something other than a
// session. Each entry is the path relative to app/api, posix-separated.
const PUBLIC_ALLOWLIST = new Set<string>([
  'auth/[...nextauth]/route.ts', // NextAuth core handler
  'auth/forgot-password/route.ts', // pre-session: starts password reset; fail-closed rate-limited (per-email + per-IP)
  'auth/native/apple/route.ts', // pre-session: verifies an Apple-JWKS-signed token
  'auth/native/google/route.ts', // pre-session: verifies a Google-JWKS-signed id_token (aud-checked)
  'auth/register/route.ts', // pre-session: credentials signup
  'auth/resend-code/route.ts', // pre-session: resend email verification code
  'auth/reset-password/route.ts', // pre-session: completes password reset via emailed token; fail-closed rate-limited
  'auth/verify-email/route.ts', // pre-session: token-based email verification
  'billing/lemonsqueezy/webhook/route.ts', // HMAC signature over raw body + timingSafeEqual
  'billing/revenuecat/webhook/route.ts', // constant-time auth-header check
  'currency/route.ts', // anonymous: IP→display currency + FX rates, no PII, read-only
  'import/onenote/callback/route.ts', // OAuth callback: HMAC-signed state + timestamp
  'user/check-username/route.ts', // intentionally anonymous handle-availability check (rate-limited)
  'waitlist/route.ts', // anonymous waitlist signup (rate-limited)
]);

function findRouteFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findRouteFiles(full));
    else if (entry.name === 'route.ts') out.push(full);
  }
  return out;
}

describe('API route auth coverage (NM-M1)', () => {
  const routes = findRouteFiles(API_DIR);

  it('discovers the API route tree', () => {
    // Sanity: if this drops near zero, path resolution broke and the rest of
    // the suite would pass vacuously.
    expect(routes.length).toBeGreaterThan(100);
  });

  it('every /api route enforces session auth or is an explicitly-justified public route', () => {
    const offenders: string[] = [];
    for (const file of routes) {
      const rel = relative(API_DIR, file).split(sep).join('/');
      if (PUBLIC_ALLOWLIST.has(rel)) continue;
      const src = readFileSync(file, 'utf8');
      if (!SESSION_AUTH.test(src)) offenders.push(rel);
    }
    expect(
      offenders,
      `These routes neither enforce session auth nor are on the public allowlist:\n  ${offenders.join('\n  ')}\n` +
        'Add a session check, or add the route to PUBLIC_ALLOWLIST with a justification comment.'
    ).toEqual([]);
  });

  it('the public allowlist has no stale entries', () => {
    const present = new Set(routes.map((f) => relative(API_DIR, f).split(sep).join('/')));
    const stale = [...PUBLIC_ALLOWLIST].filter((p) => !present.has(p));
    expect(stale, `Allowlisted routes that no longer exist:\n  ${stale.join('\n  ')}`).toEqual([]);
  });
});
