// Sign in with Apple — native iOS WebView entry point.
//
// The iOS shell (`apps/mobile/src/bridge.ts`) uses
// `expo-apple-authentication` to obtain an Apple identity token, then posts
// `{ idToken, user }` to this endpoint. We verify the token against Apple's
// JWKS, look up or create the corresponding user via the same helper that
// backs the NextAuth `signIn` callback, and issue a NextAuth-compatible
// session cookie so subsequent requests are authenticated.
//
// The web (browser) Sign in with Apple flow goes through NextAuth's
// AppleProvider redirect handshake — this endpoint is only for native
// shells where the redirect handshake doesn't work.

import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { encode, type JWT } from 'next-auth/jwt';
import { findOrCreateOAuthUser } from '@/auth/oauth-user';
import { hydrateTokenFromDb } from '@/auth/config';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));
const APPLE_BUNDLE_ID = 'app.notemage.mobile';
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

interface NativeApplePayload {
  idToken?: string;
  user?: {
    id?: string;
    email?: string | null;
    fullName?: string | null;
  };
}

interface AppleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  const rl = await rateLimit(`login:${ip}`, 50, 15 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  let body: NativeApplePayload;
  try {
    body = (await req.json()) as NativeApplePayload;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.idToken || typeof body.idToken !== 'string') {
    return NextResponse.json({ error: 'missing_id_token' }, { status: 400 });
  }

  let claims: AppleIdTokenClaims;
  try {
    const verified = await jwtVerify(body.idToken, APPLE_JWKS, {
      issuer: 'https://appleid.apple.com',
      audience: APPLE_BUNDLE_ID,
    });
    claims = verified.payload as unknown as AppleIdTokenClaims;
  } catch {
    return NextResponse.json({ error: 'invalid_id_token' }, { status: 401 });
  }

  if (!claims.sub) {
    return NextResponse.json({ error: 'missing_sub' }, { status: 401 });
  }

  // Apple sends `email` only on the first authorization. After that the
  // token omits it. The iOS framework caches the email locally and the
  // shell forwards it as `body.user.email`, so we accept the cached value
  // as a fallback when the JWT itself doesn't carry an email claim.
  const tokenEmail = typeof claims.email === 'string' ? claims.email.toLowerCase() : '';
  const cachedEmail = typeof body.user?.email === 'string' ? body.user.email.toLowerCase() : '';
  const email = tokenEmail || cachedEmail;

  if (!email) {
    return NextResponse.json({ error: 'email_required' }, { status: 400 });
  }

  // When the JWT carries an email, Apple includes email_verified — require
  // it. When the JWT omits the email (subsequent sign-ins), there's nothing
  // to verify because the email is the cached one tied to this `sub`.
  if (tokenEmail) {
    const verified = claims.email_verified === true || claims.email_verified === 'true';
    if (!verified) {
      return NextResponse.json({ error: 'email_unverified' }, { status: 401 });
    }
  }

  const fullName =
    typeof body.user?.fullName === 'string' && body.user.fullName.trim().length > 0
      ? body.user.fullName.trim()
      : null;

  const resolution = await findOrCreateOAuthUser({
    provider: 'apple',
    providerAccountId: claims.sub,
    email,
    name: fullName,
    avatarUrl: null,
    ip,
  });

  if (!resolution.ok) {
    if (resolution.reason === 'account_exists') {
      return NextResponse.json({ error: 'OAuthAccountExists' }, { status: 409 });
    }
    if (resolution.reason === 'banned') {
      return NextResponse.json({ error: 'banned' }, { status: 403 });
    }
    if (resolution.reason === 'ip_cap') {
      return NextResponse.json({ error: 'ip_cap' }, { status: 429 });
    }
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  // Build the session token in the exact shape NextAuth's JWT callback
  // produces on a fresh OAuth sign-in: id+sub plus the hydrated profile
  // fields the session callback expects to read.
  const tokenShape: Record<string, unknown> = {
    id: resolution.userId,
    sub: resolution.userId,
  };
  await hydrateTokenFromDb(tokenShape, resolution.userId);

  const sessionToken = await encode({
    token: tokenShape as JWT,
    secret,
    maxAge: SESSION_MAX_AGE,
  });

  // NextAuth picks the cookie name based on whether the deployment uses
  // HTTPS. Match its convention exactly so the session is readable by the
  // existing middleware.
  const useSecurePrefix = process.env.NEXTAUTH_URL?.startsWith('https://') ?? false;
  const cookieName = useSecurePrefix
    ? '__Secure-next-auth.session-token'
    : 'next-auth.session-token';

  const res = NextResponse.json({ ok: true });
  res.cookies.set(cookieName, sessionToken, {
    httpOnly: true,
    secure: useSecurePrefix,
    sameSite: 'lax',
    path: '/',
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}
