import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

const VALID_TIERS = ['FREE', 'PLUS', 'PRO'] as const;

export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const body = await request.json();
    const { tier } = body;

    if (!tier || !VALID_TIERS.includes(tier)) {
      return badRequestResponse('Invalid tier. Must be FREE, PLUS, or PRO.');
    }

    const user = await db.user.update({
      where: { id: userId },
      data: { tier },
      select: { id: true, tier: true },
    });

    return successResponse(user);
  } catch (error) {
    console.error('[PUT /api/user/tier]', error);
    return internalErrorResponse();
  }
}
