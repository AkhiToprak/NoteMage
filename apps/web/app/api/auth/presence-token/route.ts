import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import {
  successResponse,
  unauthorizedResponse,
  internalErrorResponse,
  tooManyRequestsResponse,
} from '@/lib/api-response';
import { costRateLimit, rateLimitKey } from '@/lib/rate-limit';
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

    // Abuse cap: this mints an HMAC token used to authenticate to the WS
    // presence server, so the endpoint must not be hammerable to harvest
    // tokens. Cap per user (fail-closed in prod via costRateLimit). Keyed per
    // user, NOT per IP, because schools/NATs share an IP and an IP cap here
    // would throttle a whole class of legitimate students.
    const rl = await costRateLimit(rateLimitKey('presence-token', request, userId), 30, 60_000);
    if (!rl.success) {
      return tooManyRequestsResponse('Too many requests. Please slow down.', rl.retryAfterMs);
    }

    if (!NEXTAUTH_SECRET) return internalErrorResponse('Server misconfigured');

    // `aud` scopes the token to the presence channel so it can't be replayed
    // against any other system that also signs with NEXTAUTH_SECRET. The WS
    // server should verify `aud === 'presence'` (unknown fields are ignored, so
    // this is backward-compatible until that check ships).
    const payloadB64 = Buffer.from(JSON.stringify({ userId, aud: 'presence' })).toString(
      'base64url'
    );
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
