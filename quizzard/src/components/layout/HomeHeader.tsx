'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Image from 'next/image';
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

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  pageBg: '#1a1a36',
  cardBg: '#21213e',
  elevated: '#2d2d52',
  inputBg: '#35355c',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  error: '#fd6f85',
  border: '#555578',
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
          background: 'rgba(26, 26, 54,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div
          style={{
            maxWidth: 1400,
            margin: '0 auto',
            padding: isPhone ? '0 12px' : isTablet ? '0 16px' : '0 20px',
            height: isPhone ? 56 : 64,
            display: 'flex',
            alignItems: 'center',
            gap: isPhone ? 8 : 16,
          }}
        >
          {/* Burger button */}
          <button
            onClick={() => setBurgerOpen(true)}
            onMouseEnter={() => setHoveredBurger(true)}
            onMouseLeave={() => setHoveredBurger(false)}
            style={{
              width: 38,
              height: 38,
              borderRadius: 10,
              border: 'none',
              background: hoveredBurger ? COLORS.elevated : 'transparent',
              color: hoveredBurger ? COLORS.textPrimary : COLORS.textMuted,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
              transition: `all 0.15s ${EASING}`,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 24 }}>
              menu
            </span>
          </button>

          {/* Logo */}
          <Link
            href="/home"
            style={{
              display: isPhone ? 'none' : 'flex',
              alignItems: 'center',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <Image
              src="/logo_trimmed.png"
              alt="Notemage"
              width={isTablet ? 100 : 120}
              height={32}
              style={{ objectFit: 'contain' }}
            />
          </Link>

          {/* Search bar */}
          <div
            style={{
              flex: 1,
              maxWidth: isPhone ? undefined : isTablet ? 400 : 500,
              margin: '0 auto',
              position: 'relative',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{
                position: 'absolute',
                left: 14,
                top: '50%',
                transform: 'translateY(-50%)',
                fontSize: 20,
                color: searchFocused ? COLORS.primary : COLORS.textMuted,
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
                padding: '9px 16px 9px 44px',
                borderRadius: 12,
                border: `1.5px solid ${searchFocused ? COLORS.primary : COLORS.border}`,
                background: COLORS.inputBg,
                color: COLORS.textPrimary,
                fontSize: 13,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Timer */}
            <TimerWidget />
            {/* Notification bell */}
            <NotificationBell />

            {/* User avatar */}
            <div ref={avatarMenuRef} style={{ position: 'relative' }}>
              <button
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
                  padding: 2,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  borderRadius: user?.equippedFrameId ? 9999 : 10,
                  outline:
                    hoveredAvatar || avatarMenuOpen
                      ? `2px solid ${COLORS.primary}`
                      : '2px solid transparent',
                  outlineOffset: 1,
                  transition: `outline-color 0.2s ${EASING}`,
                }}
              >
                <UserAvatar user={user} size={36} radius={8} />
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
                    background: COLORS.cardBg,
                    border: `1px solid ${COLORS.border}`,
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
                      borderBottom: `1px solid ${COLORS.border}`,
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
                          transition: `all 0.1s`,
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
                    style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 4, paddingTop: 4 }}
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
                        transition: `all 0.1s`,
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
