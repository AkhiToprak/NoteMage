import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizeEmail } from '@/lib/registration';
import { verifyTurnstile } from '@/lib/turnstile';
import { issuePasswordResetCode } from '@/lib/verification';
import { sendPasswordResetCode } from '@/lib/verification-email';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Starts (and re-sends) the password-reset flow. Unauthenticated and
// anti-enumeration: always returns the same generic success so it can't be used
// to probe which emails are registered. This endpoint doubles as the resend —
// issuePasswordResetCode atomically replaces the prior code with a fresh one.

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);

    const body = await request.json().catch(() => null);
    const email = normalizeEmail(body?.email);
    if (!email || !EMAIL_REGEX.test(email)) {
      return badRequestResponse('A valid email is required');
    }

    // Two layers: a short per-email cooldown (stops mash-resend) and a per-IP
    // hourly cap (stops abuse as a mail cannon). Both fail CLOSED so a Redis
    // outage can't turn this into an unmetered mail cannon.
    const cooldown = await rateLimit(`forgot-password:email:${email}`, 1, 60 * 1000, true);
    if (!cooldown.success) {
      return tooManyRequestsResponse(
        'Please wait a moment before requesting another code.',
        cooldown.retryAfterMs
      );
    }
    const ipCap = await rateLimit(`forgot-password:ip:${ip}`, 10, 60 * 60 * 1000, true);
    if (!ipCap.success) {
      return tooManyRequestsResponse(
        'Too many requests. Please try again later.',
        ipCap.retryAfterMs
      );
    }

    // Bot gate — no-op until TURNSTILE_SECRET_KEY is set (src/lib/turnstile.ts).
    if (!(await verifyTurnstile(body?.turnstileToken, ip))) {
      return badRequestResponse(
        'Verification failed. Please complete the challenge and try again.'
      );
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, password: true },
    });

    // Only send for a real account that actually has a password. OAuth-only
    // accounts (password === null) have nothing to reset and are skipped
    // silently — the response is identical either way.
    if (user && user.password) {
      const code = await issuePasswordResetCode(user.id);
      await sendPasswordResetCode(email, code);
    }

    return successResponse(
      { sent: true },
      'If an account exists for that email, a reset code is on its way.'
    );
  } catch (err) {
    console.error('forgot-password error:', err);
    return internalErrorResponse('Could not start a password reset. Please try again.');
  }
}
