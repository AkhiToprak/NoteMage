'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Link from 'next/link';
import BurgerMenu from './BurgerMenu';
import NotificationBell from './NotificationBell';
import { useSearch } from '@/hooks/useSearch';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import SearchDropdown from '@/components/search/SearchDropdown';
import TierBadge from '@/components/ui/TierBadge';
import TimerWidget from './TimerWidget';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';
import { ContextualMascot, useMascotContextPose } from '@/components/mascot';

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

// Theme-aware chrome tokens. The header surface flips with var(--background),
// so every child colour must be a token too (no hardcoded near-white text /
// dark fills that would strand the search bar dark on the light header).
const COLORS = {
  pageBg: 'var(--background)',
  cardBg: 'var(--surface-container)',
  elevated: 'var(--surface-container-high)',
  inputBg: 'var(--surface-container-high)',
  primary: 'var(--brand-purple)',
  textPrimary: 'var(--on-surface)',
  textSecondary: 'var(--on-surface-variant)',
  textMuted: 'var(--outline)',
  error: 'var(--error)',
  border: 'var(--outline-variant)',
} as const;

export default function HomeHeader() {
  const { data: session } = useSession();
  const user = session?.user as
    | {
        id?: string;
        username?: string;
        name?: string;
        avatarUrl?: string;
        tier?: string;
        role?: string;
        equippedFrameId?: string | null;
      }
    | undefined;

  const { isPhone, isTablet, isDesktop } = useBreakpoint();
  const mascotContext = useMascotContextPose();

  // Topbar sizing — scaled up ~2x on desktop/tablet so the bar reads at the
  // same visual weight as the (now wider, spacious) page content. Phone stays
  // compact so the header doesn't dominate the small viewport.
  const tb = isPhone
    ? {
        h: 80,
        gap: 12,
        burger: 46,
        burgerIcon: 30,
        burgerRadius: 12,
        mascot: 'xs' as const,
        searchMax: undefined as number | undefined,
        searchPad: '13px 16px 13px 46px',
        searchFont: 16,
        searchRadius: 14,
        searchIconLeft: 15,
        searchIcon: 24,
        rightGap: 6,
        widget: 46,
        avatar: 44,
        avatarRadius: 11,
        avatarPad: 3,
      }
    : {
        h: 144,
        gap: 28,
        burger: 76,
        burgerIcon: 44,
        burgerRadius: 20,
        mascot: 96,
        searchMax: isTablet ? 640 : 900,
        searchPad: '24px 24px 24px 64px',
        searchFont: 20,
        searchRadius: 20,
        searchIconLeft: 24,
        searchIcon: 30,
        rightGap: 16,
        widget: 68,
        avatar: 72,
        avatarRadius: 16,
        avatarPad: 4,
      };

  const [burgerOpen, setBurgerOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const {
    query: searchQuery,
    setQuery: setSearchQuery,
    results,
    isLoading,
    clearResults,
  } = useSearch('home');
  const dropdownMouseRef = useRef(false);

  // Hover states
  const [hoveredBurger, setHoveredBurger] = useState(false);
  const [hoveredAvatar, setHoveredAvatar] = useState(false);
  const [hoveredMenuItem, setHoveredMenuItem] = useState<string | null>(null);

  const avatarMenuRef = useRef<HTMLDivElement>(null);

  // Close avatar menu on outside click
  useEffect(() => {
    if (!avatarMenuOpen) return;
    const handler = (e: MouseEvent) => {
      if (avatarMenuRef.current && !avatarMenuRef.current.contains(e.target as Node)) {
        setAvatarMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [avatarMenuOpen]);

  const AVATAR_MENU_ITEMS = [
    { key: 'profile', label: 'Profile', icon: 'person', href: '/profile' },
    { key: 'settings', label: 'Settings', icon: 'settings', href: '/settings' },
  ];

  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'color-mix(in srgb, var(--background) 85%, transparent)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: '1px solid rgba(174,137,255,0.30)',
        }}
      >
        <div
          style={{
            // Track the same width as the page content below, so the header's
            // burger/avatar line up with the content edges and the bar grows
            // with the screen instead of sitting in a narrow centered strip.
            maxWidth: 'var(--nm-page-max)',
            margin: '0 auto',
            padding: '0 clamp(16px, 4vw, 32px)',
            height: tb.h,
            display: 'flex',
            alignItems: 'center',
            gap: tb.gap,
          }}
        >
          {/* Burger button */}
          <button
            className="tap-target"
            onClick={() => setBurgerOpen(true)}
            onMouseEnter={() => setHoveredBurger(true)}
            onMouseLeave={() => setHoveredBurger(false)}
            aria-label="Open menu"
            style={{
              width: tb.burger,
              height: tb.burger,
              borderRadius: tb.burgerRadius,
              border: 'none',
              background: hoveredBurger ? COLORS.elevated : 'transparent',
              color: hoveredBurger ? COLORS.textPrimary : COLORS.textSecondary,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: `background 0.15s ${EASING}, color 0.15s ${EASING}`,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: tb.burgerIcon }}>
              menu
            </span>
          </button>

          <Link
            href="/dashboard"
            style={{
              display: isPhone ? 'none' : 'flex',
              alignItems: 'center',
              gap: 8,
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <ContextualMascot
              pose={mascotContext.pose}
              idle={mascotContext.idle}
              size={tb.mascot}
              alt="NoteMage mascot"
            />
          </Link>

          {/* Search bar */}
          <div
            style={{
              flex: 1,
              maxWidth: tb.searchMax,
              margin: '0 auto',
              position: 'relative',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                position: 'absolute',
                left: tb.searchIconLeft,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: tb.searchIcon,
                color: searchFocused ? COLORS.primary : COLORS.textSecondary,
                transition: `color 0.2s ${EASING}`,
                pointerEvents: 'none',
              }}
            >
              search
            </span>
            <input
              type="text"
              placeholder="Search notebooks, users..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => {
                setSearchFocused(true);
                setDropdownVisible(true);
              }}
              onBlur={() => {
                setSearchFocused(false);
                if (!dropdownMouseRef.current) setDropdownVisible(false);
              }}
              style={{
                width: '100%',
                padding: tb.searchPad,
                borderRadius: tb.searchRadius,
                border: `1.5px solid ${searchFocused ? COLORS.primary : COLORS.border}`,
                background: COLORS.inputBg,
                color: COLORS.textPrimary,
                fontSize: tb.searchFont,
                outline: 'none',
                transition: `border-color 0.2s ${EASING}`,
                boxSizing: 'border-box',
              }}
            />
            <div
              onMouseEnter={() => {
                dropdownMouseRef.current = true;
              }}
              onMouseLeave={() => {
                dropdownMouseRef.current = false;
              }}
            >
              <SearchDropdown
                query={searchQuery}
                results={results}
                isLoading={isLoading}
                isVisible={dropdownVisible && searchQuery.length >= 2}
                onClose={() => {
                  setDropdownVisible(false);
                  clearResults();
                }}
                context="home"
              />
            </div>
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: tb.rightGap, flexShrink: 0 }}>
            {/* Timer */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <TimerWidget size={tb.widget} />
            </div>
            {/* Notification bell */}
            <NotificationBell size={tb.widget} />

            {/* User avatar */}
            <div ref={avatarMenuRef} style={{ position: 'relative' }}>
              <button
                className="tap-target"
                onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
                onMouseEnter={() => setHoveredAvatar(true)}
                onMouseLeave={() => setHoveredAvatar(false)}
                aria-label="Open account menu"
                style={{
                  // No fixed dimensions: let the UserAvatar size itself so an
                  // equipped frame's halo doesn't get clipped. The hover ring
                  // is an outline (not border/overflow) so it can't distort
                  // layout or crop the frame.
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: tb.avatarPad,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  borderRadius: user?.equippedFrameId ? 9999 : tb.avatarRadius,
                  outline:
                    hoveredAvatar || avatarMenuOpen
                      ? `2px solid ${COLORS.primary}`
                      : '2px solid transparent',
                  outlineOffset: 1,
                  transition: `outline-color 0.2s ${EASING}`,
                }}
              >
                <UserAvatar user={user} size={tb.avatar} radius={tb.avatarRadius} />
              </button>

              {/* Avatar dropdown menu */}
              {avatarMenuOpen && (
                <div
                  style={{
                    position: 'absolute',
                    right: 0,
                    top: '100%',
                    marginTop: 8,
                    minWidth: 180,
                    // Cap so a long username can't push the right-anchored menu
                    // off the left edge on a narrow phone.
                    maxWidth: 'calc(100vw - 16px)',
                    background: COLORS.cardBg,
                    border: '1px solid rgba(174,137,255,0.30)',
                    borderRadius: 14,
                    boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
                    padding: 6,
                    zIndex: 100,
                    animation: 'avatarDropIn 0.15s ease-out',
                  }}
                >
                  <style>{`
                    @keyframes avatarDropIn {
                      from { opacity: 0; transform: translateY(-6px); }
                      to { opacity: 1; transform: translateY(0); }
                    }
                  `}</style>
                  {/* User info */}
                  <div
                    style={{
                      padding: '10px 12px 8px',
                      borderBottom: '1px solid rgba(174,137,255,0.30)',
                      marginBottom: 4,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: COLORS.textPrimary,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <UserName user={user} />
                      <TierBadge tier={user?.tier || 'FREE'} role={user?.role} />
                    </div>
                    {user?.username && (
                      <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 1 }}>
                        @{user.username}
                      </div>
                    )}
                  </div>

                  {AVATAR_MENU_ITEMS.map((item) => {
                    const isHovered = hoveredMenuItem === item.key;
                    return (
                      <Link
                        key={item.key}
                        href={item.href}
                        onClick={() => setAvatarMenuOpen(false)}
                        onMouseEnter={() => setHoveredMenuItem(item.key)}
                        onMouseLeave={() => setHoveredMenuItem(null)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                          padding: '8px 12px',
                          borderRadius: 8,
                          background: isHovered ? 'rgba(255,255,255,0.07)' : 'transparent',
                          color: isHovered ? COLORS.textPrimary : COLORS.textSecondary,
                          textDecoration: 'none',
                          fontSize: 13,
                          transition: `background 0.1s, color 0.1s`,
                        }}
                      >
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                          {item.icon}
                        </span>
                        {item.label}
                      </Link>
                    );
                  })}

                  <div
                    style={{
                      borderTop: '1px solid rgba(174,137,255,0.30)',
                      marginTop: 4,
                      paddingTop: 4,
                    }}
                  >
                    <button
                      onClick={() => signOut({ callbackUrl: '/auth/login' })}
                      onMouseEnter={() => setHoveredMenuItem('logout')}
                      onMouseLeave={() => setHoveredMenuItem(null)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: 10,
                        padding: '8px 12px',
                        borderRadius: 8,
                        border: 'none',
                        background:
                          hoveredMenuItem === 'logout' ? 'rgba(253,111,133,0.08)' : 'transparent',
                        color: hoveredMenuItem === 'logout' ? COLORS.error : COLORS.textMuted,
                        fontSize: 13,
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: `background 0.1s, color 0.1s`,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                        logout
                      </span>
                      Log Out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <BurgerMenu open={burgerOpen} onClose={() => setBurgerOpen(false)} />
    </>
  );
}
