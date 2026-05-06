import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

// PUT — mark all notifications as read
export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    await db.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });

    return successResponse({ success: true });
  } catch {
    return internalErrorResponse();
  }
}
