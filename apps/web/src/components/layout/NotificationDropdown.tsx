'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Notification,
  NOTIFICATION_ICONS,
  getNotificationText,
  getNotificationLink,
  timeAgo,
} from '@/lib/notification-utils';

interface NotificationDropdownProps {
  onClose: () => void;
  onRead: () => void;
  onReadAll: () => void;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  cardBg: '#21213e',
  elevated: '#2d2d52',
  inputBg: '#35355c',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
} as const;

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
