'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Notification,
  NOTIFICATION_ICONS,
  getNotificationText,
  getNotificationLink,
} from '@/lib/notification-utils';

const EASING = 'cubic-bezier(0.22,1,0.36,1)';
const AUTO_DISMISS_MS = 6000;

const COLORS = {
  cardBg: '#161630',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textMuted: '#8888a8',
  border: '#555578',
} as const;

interface NotificationToastProps {
  notification: Notification;
  onDismiss: () => void;
  onNavigate: (notificationId: string, link: string) => void;
}

export default function NotificationToast({
  notification,
  onDismiss,
  onNavigate,
}: NotificationToastProps) {
  const [leaving, setLeaving] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [closeHovered, setCloseHovered] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(AUTO_DISMISS_MS);
  const startTimeRef = useRef(Date.now());

  const startDismissTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setTimeout(() => {
      setLeaving(true);
    }, remainingRef.current);
  }, []);

  const pauseTimer = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
      remainingRef.current -= Date.now() - startTimeRef.current;
      if (remainingRef.current < 0) remainingRef.current = 0;
    }
  }, []);

  // Start auto-dismiss timer on mount
  useEffect(() => {
    startDismissTimer();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [startDismissTimer]);

  // Pause/resume on hover
  useEffect(() => {
    if (hovered) {
      pauseTimer();
    } else if (remainingRef.current > 0) {
      startDismissTimer();
    }
  }, [hovered, pauseTimer, startDismissTimer]);

  // After leaving animation, actually dismiss
  useEffect(() => {
    if (!leaving) return;
    const timeout = setTimeout(onDismiss, 200);
    return () => clearTimeout(timeout);
  }, [leaving, onDismiss]);

  const link = getNotificationLink(notification);
  const icon = NOTIFICATION_ICONS[notification.type] || 'notifications';

  const handleClick = () => {
    if (link) {
      onNavigate(notification.id, link);
    } else {
      onDismiss();
    }
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    setLeaving(true);
  };

  return (
    <>
      <style>{`
        @keyframes toastSlideIn {
          from { opacity: 0; transform: translateY(-8px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        onClick={handleClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          position: 'absolute',
          right: 0,
          top: '100%',
          marginTop: 8,
          width: 300,
          background: COLORS.cardBg,
          border: `1px solid ${COLORS.border}`,
          borderRadius: 16,
          boxShadow: '0 8px 32px rgba(174,137,255,0.06), 0 2px 8px rgba(0,0,0,0.3)',
          padding: '12px 16px',
          cursor: link ? 'pointer' : 'default',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          zIndex: 99,
          animation: leaving ? 'none' : 'toastSlideIn 0.25s cubic-bezier(0.22,1,0.36,1)',
          opacity: leaving ? 0 : 1,
          transform: leaving ? 'translateY(-8px) scale(0.97)' : 'translateY(0) scale(1)',
          transition: leaving
            ? `opacity 0.2s ${EASING}, transform 0.2s ${EASING}`
            : 'none',
        }}
      >
        {/* Icon */}
        <span
          className="material-symbols-outlined"
          style={{
            fontSize: 20,
            color: COLORS.primary,
            marginTop: 1,
            flexShrink: 0,
          }}
        >
          {icon}
        </span>

        {/* Text */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 13,
              color: COLORS.textPrimary,
              fontWeight: 600,
              lineHeight: 1.4,
            }}
          >
            {getNotificationText(notification)}
          </div>
          <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 3 }}>
            Just now
          </div>
        </div>

        {/* Close button */}
        <button
          onClick={handleClose}
          onMouseEnter={() => setCloseHovered(true)}
          onMouseLeave={() => setCloseHovered(false)}
          style={{
            background: 'none',
            border: 'none',
            padding: 2,
            cursor: 'pointer',
            color: closeHovered ? COLORS.textPrimary : COLORS.textMuted,
            transition: `color 0.15s ${EASING}`,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            close
          </span>
        </button>
      </div>
    </>
  );
}
