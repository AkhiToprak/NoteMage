import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  tooManyRequestsResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';
import { sendWaitlistConfirmation } from '@/lib/waitlist-email';

export async function POST(request: NextRequest) {
  try {
    // Rate limit: 5 signups per hour per IP (unauthenticated email send + row create).
    // Fail CLOSED in production: this is an unauthenticated DB-write + email send,
    // so if Redis is down we must reject rather than let a flood spam the DB/emails.
    const rl = await rateLimit(rateLimitKey('waitlist', request), 5, 60 * 60 * 1000, true);
    if (!rl.success) return tooManyRequestsResponse('Too many requests. Please try again later.', rl.retryAfterMs);

    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return badRequestResponse('Email is required');
    }

    const trimmed = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      return badRequestResponse('Invalid email address');
    }

    const existing = await db.waitlist.findUnique({ where: { email: trimmed } });
    if (existing) {
      return successResponse({ email: trimmed }, 'You are already on the waitlist!');
    }

    try {
      await db.waitlist.create({ data: { email: trimmed } });
    } catch (err) {
      // Race condition: another request created the same email between findUnique and create
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        return successResponse({ email: trimmed }, 'You are already on the waitlist!');
      }
      throw err;
    }

    await sendWaitlistConfirmation(trimmed);

    return createdResponse({ email: trimmed }, 'Successfully joined the waitlist!');
  } catch (error) {
    console.error('Waitlist signup error:', error);
    return internalErrorResponse();
  }
}
