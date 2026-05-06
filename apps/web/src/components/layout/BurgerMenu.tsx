'use client';

import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import TierBadge from '@/components/ui/TierBadge';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';

interface BurgerMenuProps {
  open: boolean;
  onClose: () => void;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  pageBg: '#1a1a36',
  cardBg: '#21213e',
  elevated: '#2d2d52',
  primary: '#ae89ff',
  deepPurple: '#884efb',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  error: '#fd6f85',
  border: '#555578',
} as const;

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/notebooks', label: 'Notebooks', icon: 'menu_book' },
  { href: '/groups', label: 'Co-Work', icon: 'workspaces' },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

export default function BurgerMenu({ open, onClose }: BurgerMenuProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { isPhone } = useBreakpoint();
  const user = session?.user as
    | {
        id?: string;
        username?: string;
        name?: string;
        avatarUrl?: string;
        tier?: string;
        role?: string;
      }
    | undefined;
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
    return () => {
      document.body.style.overflow = '';
    };
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
          width: isPhone ? '100vw' : 280,
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
          <UserAvatar
            user={user}
            size={64}
            radius="50%"
            style={{ border: '2px solid rgba(174,137,255,0.3)' }}
          />
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: COLORS.textPrimary,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
              }}
            >
              <UserName user={user} fallback="User" />
              <TierBadge tier={user?.tier || 'FREE'} role={user?.role} />
            </div>
            {user?.username && (
              <div style={{ fontSize: 13, color: COLORS.textMuted, marginTop: 2 }}>
                @{user.username}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav
          style={{
            flex: 1,
            padding: '12px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
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
                  color: isActive
                    ? COLORS.primary
                    : isHovered
                      ? COLORS.textPrimary
                      : COLORS.textSecondary,
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
