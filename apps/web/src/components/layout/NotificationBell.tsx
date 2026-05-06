'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import NotificationDropdown from './NotificationDropdown';
import NotificationToast from './NotificationToast';
import type { Notification } from '@/lib/notification-utils';

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  elevated: '#2d2d52',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textMuted: '#8888a8',
  error: '#fd6f85',
} as const;

export default function NotificationBell() {
  const router = useRouter();
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [toastNotification, setToastNotification] = useState<Notification | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const lastSeenIdRef = useRef<string | null>(null);
  const isInitialLoadRef = useRef(true);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?unreadCount=true');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setUnreadCount(json.data.count || 0);

          const latest = json.data.latestUnread;
          if (latest) {
            if (isInitialLoadRef.current) {
              // First load — just store the ID, don't show toast
              lastSeenIdRef.current = latest.id;
              isInitialLoadRef.current = false;
            } else if (latest.id !== lastSeenIdRef.current) {
              // New notification detected. `cosmetic_unlocked` gets its own
              // richer toast via <UnlockProvider> (see cosmetics/UnlockToast),
              // so we skip the generic bell pop for those to avoid stacking
              // two toasts for the same event. The unread count still bumps.
              lastSeenIdRef.current = latest.id;
              if (latest.type !== 'cosmetic_unlocked') {
                setToastNotification({
                  id: latest.id,
                  type: latest.type,
                  data: latest.data,
                  read: false,
                  createdAt:
                    typeof latest.createdAt === 'string'
                      ? latest.createdAt
                      : new Date(latest.createdAt).toISOString(),
                });
              }
            }
          } else {
            if (isInitialLoadRef.current) {
              isInitialLoadRef.current = false;
            }
          }
        }
      }
    } catch {
      // silently fail
    }
  }, []);

  // Poll every 30s. The first fetch is fired from inside setInterval's
  // microtask cycle (via Promise.resolve()) so the effect body itself
  // does not synchronously call setState — the state updates happen in
  // the .then handlers inside fetchUnreadCount.
  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void fetchUnreadCount();
    };
    void Promise.resolve().then(tick);
    const interval = setInterval(tick, 30000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [fetchUnreadCount]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!dropdownOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropdownOpen]);

  // Dismiss toast when the dropdown opens. We wrap the bell open setter
  // (`setDropdownOpen`) so the toast clear happens in the same event
  // handler that toggles the dropdown — moving it out of an effect
  // satisfies react-hooks/set-state-in-effect.
  const openDropdown = useCallback(() => {
    setDropdownOpen(true);
    setToastNotification(null);
  }, []);
  const closeDropdown = useCallback(() => setDropdownOpen(false), []);

  const handleToastNavigate = async (notificationId: string, link: string) => {
    setToastNotification(null);
    try {
      await fetch(`/api/notifications/${notificationId}`, { method: 'PUT' });
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      // silently fail
    }
    router.push(link);
  };

  const handleToastDismiss = () => {
    setToastNotification(null);
  };

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => (dropdownOpen ? closeDropdown() : openDropdown())}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: 38,
          height: 38,
          borderRadius: 10,
          border: 'none',
          background: hovered || dropdownOpen ? COLORS.elevated : 'transparent',
          color: hovered || dropdownOpen ? COLORS.textPrimary : COLORS.textMuted,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          transition: `background 0.15s ${EASING}, color 0.15s ${EASING}`,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
          notifications
        </span>
        {unreadCount > 0 && (
          <div
            style={{
              position: 'absolute',
              top: 4,
              right: 4,
              minWidth: 16,
              height: 16,
              borderRadius: 8,
              background: COLORS.error,
              color: '#fff',
              fontSize: 10,
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
              lineHeight: 1,
            }}
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </div>
        )}
      </button>

      {dropdownOpen && (
        <NotificationDropdown
          onClose={closeDropdown}
          onRead={() => setUnreadCount((c) => Math.max(0, c - 1))}
          onReadAll={() => setUnreadCount(0)}
        />
      )}

      {!dropdownOpen && toastNotification && (
        <NotificationToast
          notification={toastNotification}
          onDismiss={handleToastDismiss}
          onNavigate={handleToastNavigate}
        />
      )}
    </div>
  );
}
