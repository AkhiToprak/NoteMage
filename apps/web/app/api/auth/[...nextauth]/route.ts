import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/auth/config';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const handler = NextAuth(authOptions);

// The NextAuth catch-all serves EVERY /api/auth/* action through this one POST
// export: credential sign-in, signOut(), and useSession().update() are all POSTs
// here. Only the credential *login* is brute-forceable, so the rate limit must
// target it alone. Throttling every POST (the previous behavior) meant a normal
// "upgrade → refresh session → log out" sequence shared a single 5-per-15-min
// bucket with login attempts: once it drained, the update() that flips the JWT
// to PRO and the signOut() both 429'd — leaving the user stuck on a stale FREE
// tier (Pro features locked) AND unable to log out.
async function rateLimitedPost(req: NextRequest, ctx: unknown) {
  // The credentials login attempt lands on /api/auth/callback/credentials.
  // signOut() → /api/auth/signout and update() → /api/auth/session are left
  // unthrottled here; NextAuth's CSRF check and the Postgres account-lockout in
  // authorize() still backstop credential brute force.
  const isCredentialLogin = req.nextUrl.pathname.endsWith('/callback/credentials');
  if (isCredentialLogin) {
    const ip = getClientIp(req);
    // Security-critical: fail closed so a Redis outage can't drop the brute-force cap.
    const rl = await rateLimit(`login:${ip}`, 5, 15 * 60 * 1000, true);
    if (!rl.success) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }
  }
  return (handler as (...args: unknown[]) => Promise<Response>)(req, ctx);
}

export { handler as GET, rateLimitedPost as POST };
