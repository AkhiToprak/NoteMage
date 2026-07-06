import { NextRequest, NextResponse } from 'next/server';
import * as Sentry from '@sentry/nextjs';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { createdResponse, badRequestResponse, internalErrorResponse } from '@/lib/api-response';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { enforceIpCap, generatePlaceholderUsername, hashIp, normalizeEmail } from '@/lib/registration';
import { verifyTurnstile } from '@/lib/turnstile';
import { computeAge, parseBirthDate, MIN_AGE } from '@/lib/age';
import { issueEmailVerificationCode } from '@/lib/verification';
import { sendVerificationCode } from '@/lib/verification-email';
import { trialGrant } from '@/lib/entitlement';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 registration attempts per IP per hour.
    // Security-critical: fail closed so a Redis outage can't drop the cap.
    const ip = getClientIp(request);
    const rl = await rateLimit(`register:${ip}`, 5, 60 * 60 * 1000, true);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Too many registration attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Hard limit: max 3 accounts per IP address within the last 12 months
    const ipCap = await enforceIpCap(ip);
    if (!ipCap.ok) {
      return NextResponse.json({ success: false, error: ipCap.reason }, { status: 403 });
    }

    const body = await request.json();
    const { password, birthDate } = body;
    const email = normalizeEmail(body.email);

    // Bot/abuse gate — verify the Turnstile token before creating anything.
    // No-op until TURNSTILE_SECRET_KEY is set (see src/lib/turnstile.ts), so a
    // distributed botnet can't mint free-quota accounts past the per-IP cap.
    if (!(await verifyTurnstile(body.turnstileToken, ip))) {
      return badRequestResponse('Verification failed. Please complete the challenge and try again.');
    }

    if (!email || !password) {
      return badRequestResponse('Email and password are required');
    }

    if (!EMAIL_REGEX.test(email)) {
      return badRequestResponse('Invalid email address');
    }

    if (typeof password !== 'string' || password.length < 8 || password.length > 128) {
      return badRequestResponse('Password must be 8–128 characters');
    }

    // 13+ age gate — verified before any account row is created, so an
    // under-13 user never gets a User row (defense in depth: the sign-up
    // form also blocks them client-side).
    const birth = parseBirthDate(birthDate);
    if (!birth) {
      return badRequestResponse('A valid date of birth is required');
    }
    const age = computeAge(birth);
    if (age < MIN_AGE) {
      return badRequestResponse(`You must be at least ${MIN_AGE} years old to use NoteMage.`);
    }

    const existingEmail = await db.user.findUnique({ where: { email } });
    if (existingEmail) {
      return badRequestResponse('An account with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    // Username is no longer collected on the form — it becomes its own
    // onboarding step. Start with a placeholder handle the user replaces
    // there, exactly like the OAuth path.
    const [user] = await db.$transaction([
      db.user.create({
        data: {
          email,
          password: hashedPassword,
          username: generatePlaceholderUsername(),
          birthDate: birth,
          age,
          // New accounts start their 7-day free trial (PRO on weekly caps, no card).
          ...trialGrant(),
        },
      }),
      db.ipRegistration.create({
        // Store a salted HMAC, never the raw address (column name is legacy).
        data: { ip: hashIp(ip) },
      }),
    ]);

    // Issue + email the 6-digit confirmation code. The account row exists but
    // is unverified, so CredentialsProvider.authorize() blocks login until the
    // user confirms (see src/lib/verification.ts). Failures past this point
    // are non-fatal — the verify screen's resend button mints a fresh code —
    // so they must never fall through to the outer catch and surface as a 500
    // that makes the signup look failed while the account row exists.
    try {
      const code = await issueEmailVerificationCode(user.id);
      const sent = await sendVerificationCode(user.email, code);
      if (!sent) {
        // sendVerificationCode never throws; a false return usually means a
        // broken Resend config (missing key, unverified domain) that silently
        // locks ALL signups — page on it instead of relying on stdout.
        Sentry.captureMessage('Registration verification email failed to send', {
          level: 'error',
          tags: { route: 'api/auth/register' },
        });
      }
    } catch (error) {
      Sentry.captureException(error, { tags: { route: 'api/auth/register' } });
      console.error('Post-registration verification-code issue failed:', error);
    }

    return createdResponse(
      { id: user.id, email: user.email, requiresVerification: true },
      'Account created — check your email for a verification code'
    );
  } catch (error) {
    console.error('Registration error:', error);
    return internalErrorResponse('Failed to create account');
  }
}
