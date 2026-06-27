import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { Prisma } from '@prisma/client';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { getGradingSystem } from '@/lib/grading-systems';

// `User.gradingSystem` ships behind migration 20260626000000_user_grading_system.
// Until that migration is applied to the DB, reading/writing the column throws
// Prisma P2022 ("column does not exist"). We treat that as "feature not available
// yet" (available:false) so nothing 500s pre-migration; once the column exists,
// everything works. Isolated from /api/user/profile so the profile never breaks.
function isMissingColumn(err: unknown): boolean {
  return err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2022';
}

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();
    try {
      const u = await db.user.findUnique({
        where: { id: userId },
        select: { gradingSystem: true },
      });
      return successResponse({ available: true, gradingSystem: u?.gradingSystem ?? null });
    } catch (err) {
      if (isMissingColumn(err)) return successResponse({ available: false, gradingSystem: null });
      throw err;
    }
  } catch (err) {
    console.error('[user/grading-system GET]', err);
    return internalErrorResponse();
  }
}

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = (await request.json().catch(() => ({}))) as { gradingSystem?: unknown };
    const value = body.gradingSystem;
    if (value !== null && (typeof value !== 'string' || !getGradingSystem(value))) {
      return badRequestResponse('Unknown grading system');
    }

    try {
      await db.user.update({ where: { id: userId }, data: { gradingSystem: value } });
      return successResponse({ available: true, gradingSystem: value });
    } catch (err) {
      if (isMissingColumn(err)) return successResponse({ available: false, gradingSystem: null });
      throw err;
    }
  } catch (err) {
    console.error('[user/grading-system PUT]', err);
    return internalErrorResponse();
  }
}
