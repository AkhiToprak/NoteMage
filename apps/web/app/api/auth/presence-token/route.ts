import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';
import * as crypto from 'crypto';

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
const TOKEN_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/auth/presence-token
 * Returns a short-lived HMAC token for authenticating with the WebSocket presence server.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();
    if (!NEXTAUTH_SECRET) return internalErrorResponse('Server misconfigured');

    const payloadB64 = Buffer.from(JSON.stringify({ userId })).toString('base64url');
    const expiresB64 = Buffer.from(String(Date.now() + TOKEN_TTL)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', NEXTAUTH_SECRET)
      .update(`${payloadB64}.${expiresB64}`)
      .digest('base64url');

    const token = `${payloadB64}.${expiresB64}.${signature}`;

    return successResponse({ token });
  } catch {
    return internalErrorResponse();
  }
}
