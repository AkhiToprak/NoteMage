// Sign in with Google — native iOS WebView entry point.
//
// Google refuses OAuth inside embedded WebViews ("disallowed_useragent"), so
// the iOS shell (`apps/mobile/src/bridge.ts`) runs the authorization-code +
// PKCE flow in ASWebAuthenticationSession (the system browser) and exchanges
// the code for a Google id_token. It posts `{ idToken }` here; we verify the
// token against Google's JWKS, look up or create the user via the same helper
// that backs the NextAuth `signIn` callback, and issue a NextAuth-compatible
// session cookie so subsequent requests are authenticated.
//
// The web (browser) Google flow goes through NextAuth's GoogleProvider redirect
// handshake — this endpoint is only for native shells. Mirrors the native Sign
// in with Apple endpoint (`../apple/route.ts`).

import { NextRequest, NextResponse } from 'next/server';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { encode, type JWT } from 'next-auth/jwt';
import { findOrCreateOAuthUser } from '@/auth/oauth-user';
import { hydrateTokenFromDb } from '@/auth/config';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizeEmail } from '@/lib/registration';

const GOOGLE_JWKS = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
// Google mints tokens with either issuer string — accept both.
const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];
const SESSION_MAX_AGE = 7 * 24 * 60 * 60;

// The id_token's `aud` is the OAuth client that started the flow — the native
// iOS client id. Accept a comma-separated allowlist so another native client
// (e.g. a future Android build) can be added without a code change; fall back
// to the single iOS client id. Must match EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID.
function allowedAudiences(): string[] {
  const raw = process.env.GOOGLE_NATIVE_CLIENT_IDS ?? process.env.GOOGLE_IOS_CLIENT_ID ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

interface NativeGooglePayload {
  idToken?: string;
}

interface GoogleIdTokenClaims {
  sub: string;
  email?: string;
  email_verified?: boolean | string;
  name?: string;
  picture?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const ip = getClientIp(req);
  const rl = await rateLimit(`native-google:${ip}`, 10, 15 * 60 * 1000);
  if (!rl.success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 });
  }

  const audiences = allowedAudiences();
  if (audiences.length === 0) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  let body: NativeGooglePayload;
  try {
    body = (await req.json()) as NativeGooglePayload;
  } catch {
    return NextResponse.json({ error: 'invalid_json' }, { status: 400 });
  }

  if (!body.idToken || typeof body.idToken !== 'string') {
    return NextResponse.json({ error: 'missing_id_token' }, { status: 400 });
  }

  let claims: GoogleIdTokenClaims;
  try {
    const verified = await jwtVerify(body.idToken, GOOGLE_JWKS, {
      issuer: GOOGLE_ISSUERS,
      audience: audiences,
    });
    claims = verified.payload as unknown as GoogleIdTokenClaims;
  } catch {
    return NextResponse.json({ error: 'invalid_id_token' }, { status: 401 });
  }

  if (!claims.sub) {
    return NextResponse.json({ error: 'missing_sub' }, { status: 401 });
  }

  // Google sends a real email_verified claim with the email/profile scopes —
  // require it before we trust the email for lookup or silent linking.
  const emailVerified = claims.email_verified === true || claims.email_verified === 'true';
  if (!emailVerified) {
    return NextResponse.json({ error: 'email_unverified' }, { status: 401 });
  }

  const email = typeof claims.email === 'string' ? normalizeEmail(claims.email) : '';
  if (!email) {
    return NextResponse.json({ error: 'email_required' }, { status: 400 });
  }

  const name =
    typeof claims.name === 'string' && claims.name.trim().length > 0 ? claims.name.trim() : null;
  const avatarUrl =
    typeof claims.picture === 'string' && claims.picture.length > 0 ? claims.picture : null;

  const resolution = await findOrCreateOAuthUser({
    provider: 'google',
    providerAccountId: claims.sub,
    email,
    name,
    avatarUrl,
    ip,
    allowNewUser: true,
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
    if (resolution.reason === 'signup_disabled') {
      return NextResponse.json({ error: 'signup_disabled' }, { status: 403 });
    }
    return NextResponse.json({ error: 'invalid_request' }, { status: 400 });
  }

  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'server_misconfigured' }, { status: 500 });
  }

  // Build the session token in the exact shape NextAuth's JWT callback produces
  // on a fresh OAuth sign-in: id+sub plus the hydrated profile fields the
  // session callback expects to read.
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

  // NextAuth picks the cookie name based on whether the deployment uses HTTPS.
  // Match its convention exactly so the existing middleware can read it.
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
