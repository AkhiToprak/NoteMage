'use client';

import { useState, useRef, useEffect } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Image from 'next/image';
import Link from 'next/link';
import BurgerMenu from './BurgerMenu';
import NotificationBell from './NotificationBell';
import { useSearch } from '@/hooks/useSearch';
import SearchDropdown from '@/components/search/SearchDropdown';

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  pageBg: '#111126',
  cardBg: '#161630',
  elevated: '#232342',
  inputBg: '#2a2a4c',
  primary: '#ae89ff',
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

export default function HomeHeader() {
  const { data: session } = useSession();
  const user = session?.user as { id?: string; username?: string; name?: string; avatarUrl?: string } | undefined;

  const [burgerOpen, setBurgerOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);
  const [dropdownVisible, setDropdownVisible] = useState(false);
  const { query: searchQuery, setQuery: setSearchQuery, results, isLoading, clearResults } = useSearch('home');
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
    { key: 'profile', label: 'Profile', icon: 'person', href: '/settings' },
    { key: 'settings', label: 'Settings', icon: 'settings', href: '/settings' },
  ];

  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 50,
          background: 'rgba(17,17,38,0.85)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          borderBottom: `1px solid ${COLORS.border}`,
        }}
      >
        <div
          style={{
            maxWidth: 1400,
            margin: '0 auto',
            padding: '0 20px',
            height: 64,
            display: 'flex',
            alignItems: 'center',
            gap: 16,
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
              display: 'flex',
              alignItems: 'center',
              textDecoration: 'none',
              flexShrink: 0,
            }}
          >
            <Image
              src="/logo_trimmed.png"
              alt="Quizzard"
              width={120}
              height={32}
              style={{ objectFit: 'contain' }}
            />
          </Link>

          {/* Search bar */}
          <div
            style={{
              flex: 1,
              maxWidth: 500,
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
              onFocus={() => { setSearchFocused(true); setDropdownVisible(true); }}
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
              onMouseEnter={() => { dropdownMouseRef.current = true; }}
              onMouseLeave={() => { dropdownMouseRef.current = false; }}
            >
              <SearchDropdown
                query={searchQuery}
                results={results}
                isLoading={isLoading}
                isVisible={dropdownVisible && searchQuery.length >= 2}
                onClose={() => { setDropdownVisible(false); clearResults(); }}
                context="home"
              />
            </div>
          </div>

          {/* Right actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            {/* Notification bell */}
            <NotificationBell />

            {/* User avatar */}
            <div ref={avatarMenuRef} style={{ position: 'relative' }}>
              <button
                onClick={() => setAvatarMenuOpen(!avatarMenuOpen)}
                onMouseEnter={() => setHoveredAvatar(true)}
                onMouseLeave={() => setHoveredAvatar(false)}
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 10,
                  border: `2px solid ${hoveredAvatar || avatarMenuOpen ? COLORS.primary : 'transparent'}`,
                  background: 'transparent',
                  cursor: 'pointer',
                  padding: 0,
                  overflow: 'hidden',
                  transition: `border-color 0.2s ${EASING}`,
                  flexShrink: 0,
                }}
              >
                {user?.avatarUrl ? (
                  <img
                    src={user.avatarUrl}
                    alt={user.username || ''}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 8 }}
                  />
                ) : (
                  <div
                    style={{
                      width: '100%',
                      height: '100%',
                      borderRadius: 8,
                      background: getAvatarGradient(user?.id || ''),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#fff',
                    }}
                  >
                    {(user?.username || user?.name || '?')[0].toUpperCase()}
                  </div>
                )}
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
                  <div style={{ padding: '10px 12px 8px', borderBottom: `1px solid ${COLORS.border}`, marginBottom: 4 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary }}>
                      {user?.name || user?.username}
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

                  <div style={{ borderTop: `1px solid ${COLORS.border}`, marginTop: 4, paddingTop: 4 }}>
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
                        background: hoveredMenuItem === 'logout' ? 'rgba(253,111,133,0.08)' : 'transparent',
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
