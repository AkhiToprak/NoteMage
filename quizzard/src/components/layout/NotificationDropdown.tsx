'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface Notification {
  id: string;
  type: string;
  data: Record<string, unknown>;
  read: boolean;
  createdAt: string;
}

interface NotificationDropdownProps {
  onClose: () => void;
  onRead: () => void;
  onReadAll: () => void;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  cardBg: '#161630',
  elevated: '#232342',
  inputBg: '#2a2a4c',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
} as const;

const NOTIFICATION_ICONS: Record<string, string> = {
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

function safeStr(val: unknown, fallback: string): string {
  if (typeof val === 'string' && val.length > 0 && val.length <= 200) return val;
  return fallback;
}

function getNotificationText(n: Notification): string {
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

function getNotificationLink(n: Notification): string | null {
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
      return typeof data.groupId === 'string' ? `/groups/invite/${data.groupId}` : null;
    case 'group_member_joined':
      return typeof data.groupId === 'string' ? `/groups/${data.groupId}` : null;
    default:
      return null;
  }
}

function timeAgo(dateStr: string): string {
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

export default function NotificationDropdown({
  onClose,
  onRead,
  onReadAll,
}: NotificationDropdownProps) {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [hoveredMarkAll, setHoveredMarkAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notifications?limit=20');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setNotifications(json.data.notifications || []);
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const handleMarkAllRead = async () => {
    try {
      const res = await fetch('/api/notifications/read-all', { method: 'PUT' });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
        onReadAll();
      }
    } catch {
      // silently fail
    }
  };

  const handleMarkRead = async (id: string) => {
    try {
      const res = await fetch(`/api/notifications/${id}`, { method: 'PUT' });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
        onRead();
      }
    } catch {
      // silently fail
    }
  };

  const hasUnread = notifications.some((n) => !n.read);

  return (
    <>
      <style>{`
        @keyframes notifDropIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        style={{
          position: 'absolute',
          right: 0,
          top: '100%',
          marginTop: 8,
          width: 360,
          maxHeight: 440,
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 18,
          boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'notifDropIn 0.2s cubic-bezier(0.22,1,0.36,1)',
          zIndex: 100,
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 18px 12px',
            borderBottom: `1px solid ${COLORS.border}`,
          }}
        >
          <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>
            Notifications
          </span>
          {hasUnread && (
            <button
              onClick={handleMarkAllRead}
              onMouseEnter={() => setHoveredMarkAll(true)}
              onMouseLeave={() => setHoveredMarkAll(false)}
              style={{
                background: 'none',
                border: 'none',
                color: hoveredMarkAll ? COLORS.primary : COLORS.textMuted,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: `color 0.15s ${EASING}`,
              }}
            >
              Mark all read
            </button>
          )}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 40,
                color: COLORS.textMuted,
                fontSize: 13,
                gap: 8,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}
              >
                progress_activity
              </span>
              Loading...
            </div>
          ) : notifications.length === 0 ? (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '40px 20px',
                gap: 8,
                color: COLORS.textMuted,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 36, opacity: 0.4 }}>
                notifications_off
              </span>
              <span style={{ fontSize: 13 }}>No notifications yet</span>
            </div>
          ) : (
            notifications.map((n) => {
              const isHovered = hoveredItem === n.id;
              return (
                <button
                  key={n.id}
                  onClick={() => {
                    if (!n.read) handleMarkRead(n.id);
                    const link = getNotificationLink(n);
                    if (link) router.push(link);
                    onClose();
                  }}
                  onMouseEnter={() => setHoveredItem(n.id)}
                  onMouseLeave={() => setHoveredItem(null)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: 12,
                    padding: '12px 18px',
                    border: 'none',
                    background: isHovered
                      ? 'rgba(255,255,255,0.07)'
                      : !n.read
                        ? 'rgba(174,137,255,0.04)'
                        : 'transparent',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: `background 0.1s`,
                    borderLeft: !n.read ? `3px solid ${COLORS.primary}` : '3px solid transparent',
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{
                      fontSize: 20,
                      color: !n.read ? COLORS.primary : COLORS.textMuted,
                      marginTop: 2,
                      flexShrink: 0,
                    }}
                  >
                    {NOTIFICATION_ICONS[n.type] || 'notifications'}
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 13,
                        color: !n.read ? COLORS.textPrimary : COLORS.textSecondary,
                        fontWeight: !n.read ? 600 : 400,
                        lineHeight: 1.4,
                      }}
                    >
                      {getNotificationText(n)}
                    </div>
                    <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 3 }}>
                      {timeAgo(n.createdAt)}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
