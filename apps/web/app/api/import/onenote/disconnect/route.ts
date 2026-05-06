import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { disconnectMicrosoft } from '@/lib/microsoftAuth';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

/**
 * POST – disconnect Microsoft account
 */
export async function POST(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    await disconnectMicrosoft(userId);
    return successResponse({ disconnected: true });
  } catch {
    return internalErrorResponse();
  }
}
