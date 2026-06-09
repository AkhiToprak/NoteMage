import { NextRequest } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { normalizeEmail } from '@/lib/registration';
import { verifyPasswordResetCode } from '@/lib/verification';
import { logSecurityEvent } from '@/lib/security-events';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Completes the password reset: verifies the 6-digit code and rewrites the
// password atomically. Unauthenticated (the user can't log in — that's why
// they're here). Anti-enumeration: a missing account, an OAuth-only account,
// and a bad code all return the SAME generic error.

export async function POST(request: NextRequest) {
  try {
    const ip = getClientIp(request);
    // 10 attempts / minute / IP. Fail CLOSED — higher stakes than verify-email,
    // and combined with the per-code 5-attempt cap a 6-digit brute force is
    // infeasible.
    const rl = await rateLimit(`reset-password:${ip}`, 10, 60 * 1000, true);
    if (!rl.success) {
      return tooManyRequestsResponse('Too many attempts. Please try again shortly.', rl.retryAfterMs);
    }

    const body = await request.json().catch(() => null);
    const email = normalizeEmail(body?.email);
    const code = body?.code;
    const password = body?.password;

    if (!email || !EMAIL_REGEX.test(email)) {
      return badRequestResponse('A valid email is required');
    }
    const cleanCode = typeof code === 'string' ? code.trim() : '';
    if (!/^\d{6}$/.test(cleanCode)) {
      return badRequestResponse('Enter the 6-digit code from your email.');
    }
    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return badRequestResponse('Password must be 8–128 characters');
    }

    const user = await db.user.findUnique({
      where: { email },
      select: { id: true, password: true, emailVerified: true },
    });

    // Same generic error for every account/code failure — never reveal whether
    // the email is registered or that it's an OAuth-only account.
    if (!user || !user.password) {
      return badRequestResponse('That code is invalid or has expired.');
    }

    const result = await verifyPasswordResetCode(user.id, cleanCode);
    if (!result.ok) {
      return badRequestResponse('That code is invalid or has expired.');
    }

    const hashed = await bcrypt.hash(password, 12);

    // One transaction: rewrite the password, clear any brute-force lockout
    // (reset doubles as a lock-recovery path, mirroring authorize()'s success
    // path), stamp emailVerified if it was never confirmed (proving email
    // ownership), and burn the reset codes.
    await db.$transaction([
      db.user.update({
        where: { id: user.id },
        data: {
          password: hashed,
          failedLoginAttempts: 0,
          lockedAt: null,
          emailVerified: user.emailVerified ?? new Date(),
        },
      }),
      db.passwordResetCode.deleteMany({ where: { userId: { equals: user.id } } }),
    ]);

    logSecurityEvent({ userId: user.id, type: 'password.reset', ip });

    return successResponse({ reset: true }, 'Your password has been reset.');
  } catch (err) {
    console.error('reset-password error:', err);
    return internalErrorResponse('Could not reset your password. Please try again.');
  }
}
