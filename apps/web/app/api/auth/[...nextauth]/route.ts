import { NextRequest, NextResponse } from 'next/server';
import NextAuth from 'next-auth';
import { authOptions } from '@/auth/config';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

const handler = NextAuth(authOptions);

// Wrap POST to add rate limiting on login attempts
async function rateLimitedPost(req: NextRequest, ctx: unknown) {
  const ip = getClientIp(req);
  const rl = await rateLimit(`login:${ip}`, 50, 15 * 60 * 1000); // Temporarily raised for testing (was 5)
  if (!rl.success) {
    return NextResponse.json(
      { error: 'Too many login attempts. Please try again later.' },
      { status: 429 }
    );
  }
  return (handler as (...args: unknown[]) => Promise<Response>)(req, ctx);
}

export { handler as GET, rateLimitedPost as POST };
