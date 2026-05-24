import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { verifyEmailCode } from '@/lib/verification';

// Confirms a credentials account's email via the 6-digit code. Unauthenticated
// (the whole point is the user can't log in yet), so it keys off the email.

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    // 10 attempts / minute / IP. Combined with the per-code attempt cap in
    // verifyEmailCode, brute-forcing a 6-digit code is infeasible.
    const rl = await rateLimit(`verify-email:${ip}`, 10, 60 * 1000);
    if (!rl.success) {
      return tooManyRequestsResponse('Too many attempts. Please try again shortly.', rl.retryAfterMs);
    }

    const body = await request.json().catch(() => null);
    const email = body?.email;
    const code = body?.code;
    if (typeof email !== 'string' || typeof code !== 'string') {
      return badRequestResponse('Email and code are required');
    }
    const cleanCode = code.trim();
    if (!/^\d{6}$/.test(cleanCode)) {
      return badRequestResponse('Enter the 6-digit code from your email.');
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    });

    // Every failure below returns the same generic message — never reveal
    // whether the email is registered or which check failed.
    if (!user) return badRequestResponse('That code is invalid or has expired.');
    if (user.emailVerified) return successResponse({ verified: true }); // idempotent

    const result = await verifyEmailCode(user.id, cleanCode);
    if (!result.ok) {
      return badRequestResponse('That code is invalid or has expired.');
    }

    return successResponse({ verified: true });
  } catch (err) {
    console.error('verify-email error:', err);
    return internalErrorResponse('Could not verify your email. Please try again.');
  }
}
