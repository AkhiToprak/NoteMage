import { cookies, headers } from 'next/headers';
import { getToken } from 'next-auth/jwt';
import type { JWT } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

/**
 * Server-side session resolution for Server Components, Server Actions, and
 * Route Handlers that have no `NextRequest` in hand.
 *
 * This project standardised on `getToken` because `getServerSession` is broken
 * under next-auth v4 + Next 16 (see src/lib/auth.ts). `getToken` only ever
 * touches `req.cookies.getAll()` and `req.headers.get()`, and Next's
 * `next/headers` stores satisfy both at runtime — so we hand it those directly.
 *
 * The result is byte-for-byte the same token middleware resolves on every
 * request: same `NEXTAUTH_SECRET`, the same `NEXTAUTH_URL`-driven secure-cookie
 * name (`__Secure-next-auth.session-token` in prod, unprefixed in dev), and the
 * same chunked-cookie reassembly (large tokens are split across `.0`/`.1`/…).
 * That parity is why this is safe to render pages from.
 */
export async function getServerAuthToken(): Promise<JWT | null> {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  // The stores aren't typed as a NextRequest, but getToken's SessionStore only
  // calls cookies.getAll() and headers.get() — both present here at runtime.
  return getToken({
    req: { cookies: cookieStore, headers: headerStore } as unknown as NextRequest,
  });
}

/** The authenticated user id, or null when there is no valid session. */
export async function getServerUserId(): Promise<string | null> {
  const token = await getServerAuthToken();
  return (token?.id as string | undefined) ?? null;
}

export interface ServerAuthUser {
  id: string;
  name: string | null;
  username: string | null;
  onboardingComplete: boolean;
}

/**
 * The fields a page typically needs from the session without a DB round-trip —
 * all carried on the JWT (see src/auth/config.ts). Returns null when there is no
 * valid session (middleware should have already redirected, so a page reaching
 * a null here can safely render an error/empty state).
 */
export async function getServerAuthUser(): Promise<ServerAuthUser | null> {
  const token = await getServerAuthToken();
  if (!token?.id) return null;
  return {
    id: token.id as string,
    name: (token.name as string | null | undefined) ?? null,
    username: (token.username as string | null | undefined) ?? null,
    onboardingComplete: Boolean(token.onboardingComplete),
  };
}
