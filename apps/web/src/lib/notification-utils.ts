export interface Notification {
  id: string;
  type: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

export const NOTIFICATION_ICONS: Record<string, string> = {
  friend_request: 'person_add',
  friend_accepted: 'how_to_reg',
  notebook_sent: 'menu_book',
  post_upvote: 'arrow_upward',
  post_comment: 'chat_bubble',
  comment_reply: 'reply',
  achievement_unlocked: 'emoji_events',
  cosmetic_unlocked: 'auto_awesome',
  exam_reminder: 'alarm',
  exam_readiness_low: 'trending_down',
  exam_weak_topic: 'target',
};

export function safeStr(val: unknown, fallback: string): string {
  if (typeof val === 'string' && val.length > 0 && val.length <= 200) return val;
  return fallback;
}

export function getNotificationText(n: Notification): string {
  const data = n.data && typeof n.data === 'object' ? n.data : {};
  switch (n.type) {
    case 'friend_request':
      return `${safeStr(data.username, 'Someone')} sent you a friend request`;
    case 'friend_accepted':
      return `${safeStr(data.username, 'Someone')} accepted your friend request`;
    case 'notebook_sent':
      return `${safeStr(data.sharedBy, 'Someone')} shared "${safeStr(data.notebookName, 'a study pack')}" with you`;
    case 'post_upvote':
      return `${safeStr(data.fromUsername, 'Someone')} upvoted your post`;
    case 'post_comment':
      return `${safeStr(data.fromUsername, 'Someone')} commented on your post`;
    case 'comment_reply':
      return `${safeStr(data.fromUsername, 'Someone')} replied to your comment`;
    case 'achievement_unlocked':
      return `Achievement unlocked: ${safeStr(data.name, 'New achievement')}`;
    case 'cosmetic_unlocked':
      return `New cosmetic unlocked: ${safeStr(data.label, 'a new item')}`;
    case 'exam_reminder': {
      const days = typeof data.daysLeft === 'number' ? data.daysLeft : null;
      const title = safeStr(data.examTitle, 'your exam');
      if (days === 0) return `${title} is today!`;
      if (days === 1) return `${title} is tomorrow!`;
      return days !== null ? `${title} is in ${days} days` : `Upcoming exam: ${title}`;
    }
    case 'exam_readiness_low': {
      const title = safeStr(data.examTitle, 'your exam');
      const weak = typeof data.weakCount === 'number' ? data.weakCount : null;
      if (weak && weak > 0) {
        return `You're behind on ${title} — ${weak} weak ${weak === 1 ? 'topic' : 'topics'} to review`;
      }
      return `You're behind on ${title} — time to review`;
    }
    case 'exam_weak_topic': {
      const title = safeStr(data.examTitle, 'your exam');
      const topic = typeof data.topic === 'string' ? safeStr(data.topic, '') : '';
      return topic
        ? `New weak topic for ${title}: ${topic}`
        : `New weak topics detected for ${title}`;
    }
    default:
      return 'You have a new notification';
  }
}

export function getNotificationLink(n: Notification): string | null {
  const data = n.data && typeof n.data === 'object' ? n.data : {};
  switch (n.type) {
    case 'friend_request':
    case 'friend_accepted':
      return typeof data.username === 'string' ? `/profile/${data.username}` : null;
    case 'post_upvote':
    case 'post_comment':
    case 'comment_reply':
      return typeof data.postId === 'string' ? `/community/post/${data.postId}` : null;
    case 'cosmetic_unlocked':
      return '/profile';
    case 'exam_reminder':
    case 'exam_readiness_low':
      return typeof data.examId === 'string' ? `/exam/${data.examId}` : null;
    case 'exam_weak_topic':
      return typeof data.examId === 'string' ? `/exam/${data.examId}/weak-areas` : null;
    default:
      return null;
  }
}

export function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m`;
  if (hrs < 24) return `${hrs}h`;
  if (days < 7) return `${days}d`;
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
