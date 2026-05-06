import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';

// GET — list notifications (paginated) or get unread count
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    const { searchParams } = new URL(request.url);

    // If just requesting unread count
    if (searchParams.get('unreadCount') === 'true') {
      const [count, latestUnread] = await Promise.all([
        db.notification.count({
          where: { userId, read: false },
        }),
        db.notification.findFirst({
          where: { userId, read: false },
          orderBy: { createdAt: 'desc' },
          select: { id: true, type: true, data: true, createdAt: true },
        }),
      ]);
      return successResponse({
        count,
        latestUnread: latestUnread
          ? {
              id: latestUnread.id,
              type: latestUnread.type,
              data: latestUnread.data,
              createdAt: latestUnread.createdAt,
            }
          : null,
      });
    }

    // Paginated list
    const cursor = searchParams.get('cursor') || undefined;
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const where: any = { userId };
    if (cursor) {
      const cursorDate = new Date(cursor);
      if (isNaN(cursorDate.getTime())) {
        return successResponse({ notifications: [], nextCursor: null });
      }
      where.createdAt = { lt: cursorDate };
    }

    const notifications = await db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });

    const hasMore = notifications.length > limit;
    const sliced = hasMore ? notifications.slice(0, limit) : notifications;
    const nextCursor = hasMore ? sliced[sliced.length - 1].createdAt.toISOString() : null;

    return successResponse({
      notifications: sliced.map((n) => ({
        id: n.id,
        type: n.type,
        data: n.data,
        read: n.read,
        createdAt: n.createdAt,
      })),
      nextCursor,
    });
  } catch {
    return internalErrorResponse();
  }
}
