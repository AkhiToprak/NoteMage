import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { isConnected } from '@/lib/microsoftAuth';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

/**
 * GET – check if the current user has a Microsoft connection
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const connected = await isConnected(userId);
    return successResponse({ connected });
  } catch {
    return internalErrorResponse();
  }
}
