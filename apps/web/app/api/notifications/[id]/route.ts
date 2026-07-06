import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { invalidateUnreadCount } from '@/lib/notification-cache';
import {
  successResponse,
  unauthorizedResponse,
  notFoundResponse,
  forbiddenResponse,
  internalErrorResponse,
} from '@/lib/api-response';

// PUT — mark a single notification as read
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { id } = await params;

    const notification = await db.notification.findUnique({
      where: { id },
      select: { id: true, userId: true },
    });

    if (!notification) return notFoundResponse('Notification not found');
    if (notification.userId !== userId) return forbiddenResponse('Not your notification');

    await db.notification.update({
      where: { id },
      data: { read: true },
    });
    await invalidateUnreadCount(userId).catch(() => {});

    return successResponse({ read: true });
  } catch {
    return internalErrorResponse();
  }
}
