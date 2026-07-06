import { cache } from 'react';
import { cookies, headers } from 'next/headers';
import { getToken } from 'next-auth/jwt';
import type { JWT } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { validateAuthToken } from '@/lib/auth-context';

/**
 * Server-side session resolution for Server Components, Server Actions, and
 * Route Handlers that have no `NextRequest` in hand.
 *
 * This project standardised on `getToken` because `getServerSession` is broken
 * under next-auth v4 + Next 16 (see src/lib/auth.ts). `getToken` only ever
 * touches `req.cookies.getAll()` and `req.headers.get()`, and Next's
 * `next/headers` stores satisfy both at runtime — so we hand it those directly.
 *
 * Decoding uses the same cookie rules as middleware, then validates the token
 * against the current User row before returning it. That database check is why
 * server-rendered pages cannot keep using a revoked or banned session.
 */
// `cache()` memoizes per request, so the DB validation runs once even though a
// single dashboard render resolves the session three times (getServerAuthUser +
// AccountGateServerGate + WelcomeBackServerGate all enter through here).
export const getServerAuthToken = cache(async (): Promise<JWT | null> => {
  const [cookieStore, headerStore] = await Promise.all([cookies(), headers()]);
  // The stores aren't typed as a NextRequest, but getToken's SessionStore only
  // calls cookies.getAll() and headers.get() — both present here at runtime.
  const token = await getToken({
    req: { cookies: cookieStore, headers: headerStore } as unknown as NextRequest,
  });
  const auth = await validateAuthToken(token);
  if (!token || !auth) return null;

  // Consumers may need profile claims, but authorization fields are always
  // replaced with their current database values after validation.
  token.role = auth.role;
  token.tier = auth.tier;
  token.scholarName = auth.scholarName ?? undefined;
  return token;
});

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
 * The fields a page typically needs after the shared database validation.
 * Returns null when there is no valid session (middleware should have already
 * redirected, so a page reaching null can render an error/empty state).
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
