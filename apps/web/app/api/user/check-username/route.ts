import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  tooManyRequestsResponse,
} from '@/lib/api-response';
import { rateLimit, rateLimitKey } from '@/lib/rate-limit';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export async function GET(request: NextRequest) {
  // IP-keyed throttle — this endpoint is intentionally usable without auth
  // (the OAuth username-pick step is pre-session), so cap enumeration here.
  const rl = await rateLimit(rateLimitKey('check-username', request), 30, 60_000);
  if (!rl.success) return tooManyRequestsResponse('Too many requests.', rl.retryAfterMs);

  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');

  if (!username) {
    return badRequestResponse('username query param is required');
  }

  if (!USERNAME_REGEX.test(username)) {
    return successResponse({ available: false, reason: 'format' });
  }

  const existing = await db.user.findUnique({
    where: { username: username.toLowerCase() },
    select: { id: true },
  });

  return successResponse({ available: !existing });
}
