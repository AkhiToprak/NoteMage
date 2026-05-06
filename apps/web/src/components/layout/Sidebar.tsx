'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { useSession, signOut } from 'next-auth/react';
import FriendsList from '@/components/social/FriendsList';
import AddFriendModal from '@/components/social/AddFriendModal';
import TierBadge from '@/components/ui/TierBadge';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';
import { DashboardIcon, NotebookIcon, CoWorkIcon } from '@/components/icons/NavIcons';

type NavLink = {
  href: string;
  label: string;
  icon: string | ((color: string) => ReactNode);
};

const navLinks: NavLink[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: (color) => <DashboardIcon size={22} color={color} />,
  },
  { href: '/profile', label: 'Profile', icon: 'person' },
  {
    href: '/notebooks',
    label: 'Notebooks',
    icon: (color) => <NotebookIcon size={22} color={color} />,
  },
  {
    href: '/groups',
    label: 'Co-Work',
    icon: (color) => <CoWorkIcon size={22} color={color} />,
  },
  { href: '/settings', label: 'Settings', icon: 'settings' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [addFriendOpen, setAddFriendOpen] = useState(false);

  return (
    <aside
      style={{
        width: '256px',
        minWidth: '256px',
        height: '100vh',
        background: '#000000',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        paddingTop: '24px',
        paddingBottom: '24px',
        zIndex: 40,
        overflowY: 'auto',
        borderRight: '1px solid rgba(174,137,255,0.08)',
      }}
      className="custom-scrollbar"
    >
      {/* Logo */}
      <Link href="/dashboard" style={{ padding: '0 24px', marginBottom: '8px', display: 'block' }}>
        <Image
          src="/logo_trimmed.png"
          alt="Notemage"
          width={160}
          height={40}
          style={{ objectFit: 'contain', objectPosition: 'left', cursor: 'pointer' }}
          priority
        />
      </Link>

      {/* Nav */}
      <nav style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {navLinks.map(({ href, label, icon }) => {
          const isActive =
            pathname === href || (href !== '/dashboard' && pathname.startsWith(href + '/'));
          return (
            <Link
              key={href}
              href={href}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                margin: '0 8px',
                padding: '12px 16px',
                borderRadius: '12px',
                textDecoration: 'none',
                fontSize: '15px',
                fontWeight: '500',
                color: isActive ? '#ffffff' : '#b9c3ff',
                background: isActive
                  ? '#ae89ff'
                  : 'transparent',
                transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
              }}
              onMouseEnter={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(174,137,255,0.08)';
                  (e.currentTarget as HTMLAnchorElement).style.transform = 'translateX(4px)';
                }
              }}
              onMouseLeave={(e) => {
                if (!isActive) {
                  (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                  (e.currentTarget as HTMLAnchorElement).style.transform = 'translateX(0)';
                }
              }}
            >
              {typeof icon === 'function' ? (
                icon(isActive ? '#ffffff' : '#b9c3ff')
              ) : (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '22px', flexShrink: 0 }}
                >
                  {icon}
                </span>
              )}
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Friends Section */}
      <div
        style={{
          padding: '0 16px',
          borderTop: '1px solid rgba(70,69,96,0.2)',
          paddingTop: '12px',
        }}
      >
        <FriendsList compact onAddFriendClick={() => setAddFriendOpen(true)} />
      </div>

      {/* New Quiz CTA */}
      <div style={{ padding: '0 16px' }}>
        <button
          style={{
            width: '100%',
            padding: '14px 16px',
            background: '#ffde59',
            color: '#5f4f00',
            borderRadius: '16px',
            border: 'none',
            fontWeight: '700',
            fontSize: '15px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(255,222,89,0.15)',
            transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
            fontFamily: 'inherit',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            add_circle
          </span>
          New Quiz
        </button>
      </div>

      {/* Bottom: logout + user profile */}
      <div
        style={{
          borderTop: '1px solid rgba(70,69,96,0.2)',
          paddingTop: '16px',
        }}
      >
        <button
          onClick={() => signOut({ callbackUrl: '/auth/login' })}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: '0 8px',
            padding: '12px 16px',
            borderRadius: '12px',
            width: 'calc(100% - 16px)',
            background: 'transparent',
            border: 'none',
            color: '#b9c3ff',
            fontSize: '15px',
            fontWeight: '500',
            cursor: 'pointer',
            textAlign: 'left',
            fontFamily: 'inherit',
            transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'rgba(174,137,255,0.08)';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(4px)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
            (e.currentTarget as HTMLButtonElement).style.transform = 'translateX(0)';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>
            logout
          </span>
          Logout
        </button>

        {/* User profile */}
        {session?.user && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '16px 24px',
            }}
          >
            <UserAvatar user={session.user} size={40} radius="50%" />
            <div style={{ minWidth: 0 }}>
              <UserName
                as="p"
                user={session.user}
                style={{
                  fontSize: '14px',
                  fontWeight: 700,
                  color: '#e5e3ff',
                  margin: 0,
                  maxWidth: '100%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                <TierBadge tier={session.user.tier || 'FREE'} role={session.user.role} />
              </div>
            </div>
          </div>
        )}
      </div>
      <AddFriendModal open={addFriendOpen} onClose={() => setAddFriendOpen(false)} />
    </aside>
  );
}
