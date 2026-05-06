import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import {
  successResponse,
  createdResponse,
  badRequestResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { sendWaitlistConfirmation } from '@/lib/waitlist-email';

export async function POST(request: Request) {
  try {
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
