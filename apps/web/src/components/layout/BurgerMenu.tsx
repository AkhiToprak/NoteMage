'use client';

import { useState, useEffect, useRef, type ReactNode } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import TierBadge from '@/components/ui/TierBadge';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useOptionalMage } from '@/components/mage';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';
// NavIcons kept for backward compat; new items use Material Symbols strings only

interface BurgerMenuProps {
  open: boolean;
  onClose: () => void;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  pageBg: '#000000',
  cardBg: '#0a0a0a',
  elevated: '#1c1c1c',
  primary: '#ae89ff',
  deepPurple: '#884efb',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  error: '#fd6f85',
  border: 'rgba(174,137,255,0.30)',
} as const;

type NavItem = {
  href?: string;
  label: string;
  icon: string | ((color: string) => ReactNode);
  /** Phase 10 — a non-route item that opens the global Mage panel instead of
   *  navigating (the old /learn/chats route was folded into the panel). */
  action?: 'open-mage';
};

/** Primary destinations — learning-path focused. Mage is no longer a route;
 *  it opens the global panel in place. */
const PRIMARY_NAV_ITEMS: NavItem[] = [
  { href: '/dashboard',   label: 'Home',        icon: 'cottage' },
  { href: '/my-path',     label: 'My Paths',    icon: 'route' },
  { label: 'Mage',        icon: 'auto_fix_high', action: 'open-mage' },
];

/** Secondary / utility item — rendered below a divider. */
const SECONDARY_NAV_ITEMS: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

export default function BurgerMenu({ open, onClose }: BurgerMenuProps) {
  const { data: session } = useSession();
  const pathname = usePathname();
  const { isPhone } = useBreakpoint();
  const mage = useOptionalMage();
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

  // Sidebar sizing — scaled up ~2x on desktop to match the enlarged top bar
  // and give every row room to breathe. Phone keeps a full-bleed panel with
  // gentler sizing so the drawer stays usable on a small viewport.
  const sb = isPhone
    ? {
        width: '100vw' as number | string,
        userPad: '32px 24px 24px',
        avatar: 88,
        userGap: 14,
        nameFont: 19,
        userFont: 15,
        navPad: '14px 14px',
        itemGap: 4,
        itemPad: '15px 16px',
        itemIconGap: 14,
        itemRadius: 14,
        itemIcon: 28,
        itemFont: 17,
        dot: 7,
        dividerMargin: '10px 2px',
        logoutPad: '14px 14px 28px',
      }
    : {
        width: 520 as number | string,
        userPad: '44px 32px 32px',
        avatar: 120,
        userGap: 20,
        nameFont: 28,
        userFont: 22,
        navPad: '20px 18px',
        itemGap: 6,
        itemPad: '18px 22px',
        itemIconGap: 18,
        itemRadius: 18,
        itemIcon: 40,
        itemFont: 25,
        dot: 10,
        dividerMargin: '14px 4px',
        logoutPad: '18px 18px 40px',
      };

  // Admin-only entry to the /admin console. `role` rides on the JWT, so this
  // surfaces only for users whose User.role === 'admin'.
  const primaryItems: NavItem[] =
    user?.role === 'admin'
      ? [...PRIMARY_NAV_ITEMS, { href: '/admin', label: 'Admin', icon: 'admin_panel_settings' }]
      : PRIMARY_NAV_ITEMS;

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

  // Shared row renderer — used for both the primary and secondary nav groups so
  // their styling stays in lockstep with the `sb` sizing object. A route item
  // renders a <Link>; an `action` item (Mage) renders a <button> that opens the
  // global panel in place — it has no route, so it never reads as "active".
  const renderNavItem = (item: NavItem) => {
    const key = item.href ?? item.label;
    const isActive = item.href
      ? pathname === item.href || pathname.startsWith(item.href + '/')
      : false;
    const isHovered = hoveredItem === key;
    const tint = isActive ? COLORS.primary : isHovered ? COLORS.textPrimary : COLORS.textSecondary;

    const rowStyle = {
      display: 'flex',
      alignItems: 'center',
      gap: sb.itemIconGap,
      padding: sb.itemPad,
      borderRadius: sb.itemRadius,
      background: isActive
        ? 'rgba(174,137,255,0.1)'
        : isHovered
          ? 'rgba(255,255,255,0.06)'
          : 'transparent',
      color: tint,
      textDecoration: 'none',
      fontSize: sb.itemFont,
      fontWeight: isActive ? 700 : 500,
      transition: `background 0.15s ${EASING}, color 0.15s ${EASING}`,
    } as const;

    const inner = (
      <>
        {typeof item.icon === 'function' ? (
          item.icon(tint)
        ) : (
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: sb.itemIcon,
              fontVariationSettings: isActive ? '"FILL" 1' : '"FILL" 0',
            }}
          >
            {item.icon}
          </span>
        )}
        {item.label}
        {isActive && (
          <div
            style={{
              marginLeft: 'auto',
              width: sb.dot,
              height: sb.dot,
              borderRadius: '50%',
              background: COLORS.primary,
            }}
          />
        )}
      </>
    );

    if (item.action === 'open-mage') {
      return (
        <button
          key={key}
          type="button"
          onClick={() => {
            onClose();
            mage?.open();
          }}
          onMouseEnter={() => setHoveredItem(key)}
          onMouseLeave={() => setHoveredItem(null)}
          style={{ ...rowStyle, border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}
        >
          {inner}
        </button>
      );
    }

    return (
      <Link
        key={key}
        href={item.href!}
        onClick={onClose}
        onMouseEnter={() => setHoveredItem(key)}
        onMouseLeave={() => setHoveredItem(null)}
        style={rowStyle}
      >
        {inner}
      </Link>
    );
  };

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
          width: sb.width,
          maxWidth: '100vw',
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
            padding: sb.userPad,
            borderBottom: `1px solid ${COLORS.border}`,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: sb.userGap,
          }}
        >
          <UserAvatar
            user={user}
            size={sb.avatar}
            radius="50%"
            style={{ border: '2px solid rgba(174,137,255,0.3)' }}
          />
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontSize: sb.nameFont,
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
              <div style={{ fontSize: sb.userFont, color: COLORS.textMuted, marginTop: 2 }}>
                @{user.username}
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav
          style={{
            flex: 1,
            padding: sb.navPad,
            display: 'flex',
            flexDirection: 'column',
            gap: sb.itemGap,
            overflowY: 'auto',
          }}
        >
          {/* Primary items */}
          {primaryItems.map(renderNavItem)}

          {/* Divider before secondary items */}
          <div
            style={{
              height: 1,
              background: COLORS.border,
              margin: sb.dividerMargin,
            }}
          />

          {/* Secondary items (Settings) */}
          {SECONDARY_NAV_ITEMS.map(renderNavItem)}
        </nav>

        {/* Logout */}
        <div style={{ padding: sb.logoutPad }}>
          <button
            onClick={() => signOut({ callbackUrl: '/auth/login' })}
            onMouseEnter={() => setHoveredLogout(true)}
            onMouseLeave={() => setHoveredLogout(false)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              gap: sb.itemIconGap,
              padding: sb.itemPad,
              borderRadius: sb.itemRadius,
              border: 'none',
              background: hoveredLogout ? 'rgba(253,111,133,0.08)' : 'transparent',
              color: hoveredLogout ? COLORS.error : COLORS.textMuted,
              fontSize: sb.itemFont,
              fontWeight: 500,
              cursor: 'pointer',
              transition: `background 0.15s ${EASING}, color 0.15s ${EASING}`,
              textAlign: 'left',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: sb.itemIcon }}>
              logout
            </span>
            Log Out
          </button>
        </div>
      </div>
    </>
  );
}
