import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { getDashboardData } from '@/lib/dashboard-data';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    return successResponse(await getDashboardData(userId));
  } catch (error) {
    console.error('[GET /api/dashboard]', error);
    return internalErrorResponse();
  }
}
