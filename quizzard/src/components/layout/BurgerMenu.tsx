'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';

interface BurgerMenuProps {
  open: boolean;
  onClose: () => void;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  pageBg: '#111126',
  cardBg: '#161630',
  elevated: '#232342',
  primary: '#ae89ff',
  deepPurple: '#884efb',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  error: '#fd6f85',
  border: '#555578',
} as const;

const AVATAR_COLORS = [
  'linear-gradient(135deg, #ae89ff, #884efb)',
  'linear-gradient(135deg, #ff89ae, #fb4e88)',
  'linear-gradient(135deg, #89ffd4, #4efba5)',
  'linear-gradient(135deg, #ffde59, #fbae4e)',
];

function getAvatarGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

const NAV_ITEMS = [
  { href: '/home', label: 'Home', icon: 'home' },
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/notebooks', label: 'Notebooks', icon: 'menu_book' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

export default function BurgerMenu({ open, onClose }: BurgerMenuProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const user = session?.user as { id?: string; username?: string; name?: string; avatarUrl?: string } | undefined;
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [hoveredLogout, setHoveredLogout] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Lock body scroll when open
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <style>{`
        @keyframes burgerSlideIn {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        @keyframes burgerBackdropIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          zIndex: 200,
          animation: 'burgerBackdropIn 0.2s ease-out',
        }}
      />

      {/* Menu panel */}
      <div
        ref={menuRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: 280,
          background: COLORS.cardBg,
          borderRight: `1px solid ${COLORS.border}`,
          zIndex: 201,
          display: 'flex',
          flexDirection: 'column',
          animation: 'burgerSlideIn 0.3s cubic-bezier(0.22,1,0.36,1)',
          boxShadow: '8px 0 32px rgba(0,0,0,0.4)',
        }}
      >
        {/* User info */}
        <div
          style={{
            padding: '28px 24px 20px',
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 12,
          }}
        >
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.username || ''}
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                objectFit: 'cover',
                border: `2px solid ${COLORS.border}`,
              }}
            />
          ) : (
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                background: getAvatarGradient(user?.id || ''),
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 24,
                fontWeight: 700,
                color: '#fff',
                border: `2px solid ${COLORS.border}`,
              }}
            >
              {(user?.username || user?.name || '?')[0].toUpperCase()}
            </div>
          )}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>
              {user?.name || user?.username || 'User'}
            </div>
            {user?.username && (
              <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 2 }}>
                @{user.username}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
            const isHovered = hoveredItem === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={onClose}
                onMouseEnter={() => setHoveredItem(item.href)}
                onMouseLeave={() => setHoveredItem(null)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 12,
                  background: isActive
                    ? 'rgba(174,137,255,0.1)'
                    : isHovered
                    ? 'rgba(255,255,255,0.06)'
                    : 'transparent',
                  color: isActive ? COLORS.primary : isHovered ? COLORS.textPrimary : COLORS.textSecondary,
                  textDecoration: 'none',
                  fontSize: 14,
                  fontWeight: isActive ? 700 : 500,
                  transition: `all 0.15s ${EASING}`,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: 22,
                    fontVariationSettings: isActive ? '"FILL" 1' : '"FILL" 0',
                  }}
                >
                  {item.icon}
                </span>
                {item.label}
                {isActive && (
                  <div
                    style={{
                      marginLeft: 'auto',
                      width: 6,
                      height: 6,
                      borderRadius: '50%',
                      background: COLORS.primary,
                    }}
                  />
                )}
              </Link>
            );
          })}
        </nav>

        {/* Logout */}
        <div style={{ padding: '12px 12px 24px' }}>
          <button
            onClick={() => signOut({ callbackUrl: '/auth/login' })}
            onMouseEnter={() => setHoveredLogout(true)}
            onMouseLeave={() => setHoveredLogout(false)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              padding: '12px 14px',
              borderRadius: 12,
              border: 'none',
              background: hoveredLogout ? 'rgba(253,111,133,0.08)' : 'transparent',
              color: hoveredLogout ? COLORS.error : COLORS.textMuted,
              fontSize: 14,
              fontWeight: 500,
              cursor: 'pointer',
              transition: `all 0.15s ${EASING}`,
              textAlign: 'left',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
              logout
            </span>
            Log Out
          </button>
        </div>
      </div>
    </>
  );
}
