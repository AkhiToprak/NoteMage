import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';
import { createdResponse, badRequestResponse, internalErrorResponse } from '@/lib/api-response';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { enforceIpCap, generatePlaceholderUsername, hashIp, normalizeEmail } from '@/lib/registration';
import { computeAge, parseBirthDate, MIN_AGE } from '@/lib/age';
import { issueEmailVerificationCode } from '@/lib/verification';
import { sendVerificationCode } from '@/lib/verification-email';

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
        },
      }),
      db.ipRegistration.create({
        // Store a salted HMAC, never the raw address (column name is legacy).
        data: { ip: hashIp(ip) },
      }),
    ]);

    // Issue + email the 6-digit confirmation code. The account row exists but
    // is unverified, so CredentialsProvider.authorize() blocks login until the
    // user confirms (see src/lib/verification.ts). A failed send is non-fatal:
    // the account is created and the user can request a fresh code on the
    // verify screen.
    const code = await issueEmailVerificationCode(user.id);
    await sendVerificationCode(user.email, code);

    return createdResponse(
      { id: user.id, email: user.email, requiresVerification: true },
      'Account created — check your email for a verification code'
    );
  } catch (error) {
    console.error('Registration error:', error);
    return internalErrorResponse('Failed to create account');
  }
}
