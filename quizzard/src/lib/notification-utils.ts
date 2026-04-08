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
  co_work_invite: 'group_work',
  level_up: 'trending_up',
  achievement_unlocked: 'emoji_events',
  exam_reminder: 'alarm',
  group_invitation: 'group_add',
  group_member_joined: 'groups',
  group_message: 'chat',
  dm_message: 'chat_bubble',
  group_content_shared: 'share',
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
      return `${safeStr(data.sharedBy, 'Someone')} shared "${safeStr(data.notebookName, 'a notebook')}" with you`;
    case 'post_upvote':
      return `${safeStr(data.fromUsername, 'Someone')} upvoted your post`;
    case 'post_comment':
      return `${safeStr(data.fromUsername, 'Someone')} commented on your post`;
    case 'comment_reply':
      return `${safeStr(data.fromUsername, 'Someone')} replied to your comment`;
    case 'co_work_invite':
      return `${safeStr(data.username, 'Someone')} invited you to co-work on "${safeStr(data.notebookName, 'a notebook')}"`;
    case 'level_up':
      return `You reached level ${typeof data.newLevel === 'number' ? data.newLevel : '?'}!`;
    case 'achievement_unlocked':
      return `Achievement unlocked: ${safeStr(data.name, 'New achievement')}`;
    case 'exam_reminder': {
      const days = typeof data.daysLeft === 'number' ? data.daysLeft : null;
      const title = safeStr(data.examTitle, 'your exam');
      if (days === 0) return `${title} is today!`;
      if (days === 1) return `${title} is tomorrow!`;
      return days !== null ? `${title} is in ${days} days` : `Upcoming exam: ${title}`;
    }
    case 'group_invitation':
      return `${safeStr(data.inviterName, 'Someone')} invited you to join "${safeStr(data.groupName, 'a study group')}"`;
    case 'group_member_joined':
      return `${safeStr(data.userName, 'Someone')} joined "${safeStr(data.groupName, 'a study group')}"`;
    case 'group_message':
      return `${safeStr(data.senderName, 'Someone')} sent a message in "${safeStr(data.groupName, 'a group')}"`;
    case 'dm_message':
      return `${safeStr(data.senderName, 'Someone')} sent you a message`;
    case 'group_content_shared':
      return `${safeStr(data.sharerName, 'Someone')} shared "${safeStr(data.contentTitle, 'content')}"`;
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
    case 'group_invitation':
      return '/groups';
    case 'group_member_joined':
    case 'group_message':
    case 'dm_message':
    case 'group_content_shared':
      return typeof data.groupId === 'string' ? `/groups/${data.groupId}` : null;
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
