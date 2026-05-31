import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { issueEmailVerificationCode } from '@/lib/verification';
import { sendVerificationCode } from '@/lib/verification-email';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Reissues a verification code for an unverified credentials account.
// Unauthenticated and anti-enumeration: always returns the same generic
// success so it can't be used to probe which emails are registered.

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);

    const body = await request.json().catch(() => null);
    const email = body?.email;
    if (typeof email !== 'string' || !EMAIL_REGEX.test(email)) {
      return badRequestResponse('A valid email is required');
    }

    // Two layers: a short per-email cooldown (stops mash-resend) and a per-IP
    // hourly cap (stops abuse as a mail cannon). Both fail CLOSED if Redis is
    // down so an outage can't turn this into an unmetered mail cannon.
    const cooldown = await rateLimit(`resend-code:email:${email}`, 1, 60 * 1000, true);
    if (!cooldown.success) {
      return tooManyRequestsResponse(
        'Please wait a moment before requesting another code.',
        cooldown.retryAfterMs
      );
    }
    const ipCap = await rateLimit(`resend-code:ip:${ip}`, 10, 60 * 60 * 1000, true);
    if (!ipCap.success) {
      return tooManyRequestsResponse('Too many requests. Please try again later.', ipCap.retryAfterMs);
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    });

    // Only actually send for a real, still-unverified account.
    if (user && !user.emailVerified) {
      const code = await issueEmailVerificationCode(user.id);
      await sendVerificationCode(email, code);
    }

    return successResponse({ sent: true }, 'If that email needs confirming, a new code is on its way.');
  } catch (err) {
    console.error('resend-code error:', err);
    return internalErrorResponse('Could not send a new code. Please try again.');
  }
}
