import { NextRequest } from 'next/server';
import { db } from '@/lib/db';
import { successResponse, badRequestResponse } from '@/lib/api-response';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export async function GET(request: NextRequest) {
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
