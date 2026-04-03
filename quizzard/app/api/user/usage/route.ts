import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { getUserUsageSummary } from '@/lib/usage-limits';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();
    const summary = await getUserUsageSummary(userId);
    return successResponse(summary);
  } catch (error) {
    console.error('[GET /api/user/usage]', error);
    return internalErrorResponse();
  }
}
