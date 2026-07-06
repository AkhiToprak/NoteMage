import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { invalidateUnreadCount } from '@/lib/notification-cache';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

// PUT — mark all notifications as read
export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    await db.notification.updateMany({
      where: { userId: { equals: userId }, read: false },
      data: { read: true },
    });
    await invalidateUnreadCount(userId).catch(() => {});

    return successResponse({ success: true });
  } catch {
    return internalErrorResponse();
  }
}
