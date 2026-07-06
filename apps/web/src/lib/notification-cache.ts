import { cacheDel } from '@/lib/redis-cache';

/**
 * Per-user cache for the unread-notification badge (count + latest unread), read
 * by the app-wide NotificationBell poll. The count/findFirst are already index-
 * served, so this is a read-avoidance play — a short TTL (just under the 30s poll
 * interval) so a missed invalidation self-heals within one tick. The user's own
 * mark-read actions invalidate eagerly; cross-user notification creation relies
 * on the TTL (no worse than the 30s poll latency it already had).
 */
export const UNREAD_COUNT_TTL_SECONDS = 25;

export function unreadCountCacheKey(userId: string): string {
  return `notif:unread:${userId}`;
}

export async function invalidateUnreadCount(userId: string): Promise<void> {
  await cacheDel(unreadCountCacheKey(userId));
}
