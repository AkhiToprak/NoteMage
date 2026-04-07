'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import NotificationDropdown from './NotificationDropdown';

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  elevated: '#232342',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textMuted: '#8888a8',
  error: '#fd6f85',
} as const;

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchUnreadCount = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications?unreadCount=true');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setUnreadCount(json.data.count || 0);
        }
      }
    } catch {
      // silently fail
    }
  }, []);

  // Poll every 30s
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000);
    return () => clearInterval(interval);
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

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setDropdownOpen(!dropdownOpen)}
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
          transition: `all 0.15s ${EASING}`,
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
          onClose={() => setDropdownOpen(false)}
          onRead={() => setUnreadCount((c) => Math.max(0, c - 1))}
          onReadAll={() => setUnreadCount(0)}
        />
      )}
    </div>
  );
}
