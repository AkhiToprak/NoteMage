import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { computeAge, parseBirthDate, MIN_AGE } from '@/lib/age';

/**
 * Persist a user's date of birth. This is the OAuth-path home for the 13+
 * gate — OAuth users never see the credentials sign-up form, so the gate
 * needs its own onboarding screen. An under-13 date deletes the account
 * the NextAuth signIn callback already created (OAuthAccount cascades);
 * the client signs the user out when it sees the 403.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { onboardingComplete: true },
    });
    if (!user) return unauthorizedResponse();
    if (user.onboardingComplete) {
      return badRequestResponse('Onboarding already completed');
    }

    const body = await request.json().catch(() => ({}));
    const birth = parseBirthDate((body as { birthDate?: unknown }).birthDate);
    if (!birth) {
      return badRequestResponse('A valid date of birth is required');
    }

    const age = computeAge(birth);
    if (age < MIN_AGE) {
      await db.user.delete({ where: { id: userId } });
      return NextResponse.json(
        { success: false, error: `You must be at least ${MIN_AGE} years old to use NoteMage.` },
        { status: 403 }
      );
    }

    await db.user.update({
      where: { id: userId },
      data: { birthDate: birth, age },
    });

    return successResponse({ ok: true });
  } catch (error) {
    console.error('Birth-date update error:', error);
    return internalErrorResponse('Failed to save date of birth');
  }
}
