import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { getAuthCodeUrl } from '@/lib/microsoftAuth';
import {
  successResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';

/**
 * GET – initiate Microsoft OAuth flow, returns the authorization URL
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const url = await getAuthCodeUrl(userId);
    return successResponse({ url });
  } catch (error) {
    console.error('[OneNote Auth] Error:', error);
    return internalErrorResponse();
  }
}
