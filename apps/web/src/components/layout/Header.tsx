'use client';

import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import TierBadge from '@/components/ui/TierBadge';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';

function getPageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'Dashboard';
  if (pathname.startsWith('/notebooks') && pathname.split('/').length === 3) return 'Notebook';
  if (pathname.startsWith('/notebooks')) return 'Notebooks';
  if (pathname.startsWith('/settings')) return 'Settings';
  return 'Notemage';
}

export default function Header() {
  const { data: session } = useSession();
  const pathname = usePathname();
  const title = getPageTitle(pathname);

  return (
    <header
      style={{
        height: '80px',
        padding: '0 32px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        position: 'sticky',
        top: 0,
        background: 'rgba(26, 26, 54,0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 30,
      }}
    >
      {/* Page title */}
      <h1
        style={{
          fontFamily: 'var(--font-brand)',
          fontSize: '24px',
          fontWeight: '400',
          color: '#ae89ff',
          margin: 0,
        }}
      >
        {title}
      </h1>

      {/* Right side */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
        {session?.user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span
              style={{
                fontSize: '14px',
                fontWeight: '500',
                color: '#aaa8c8',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              Hello, <UserName user={session.user} style={{ color: '#e5e3ff' }} />
              <TierBadge tier={session.user.tier || 'FREE'} role={session.user.role} />
            </span>
            <UserAvatar user={session.user} size={40} />
          </div>
        )}

        <button
          onClick={() => signOut({ callbackUrl: '/auth/login' })}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '8px 20px',
            borderRadius: '12px',
            border: '1px solid rgba(70,69,96,0.3)',
            background: 'transparent',
            color: '#aaa8c8',
            fontSize: '14px',
            fontWeight: '700',
            cursor: 'pointer',
            fontFamily: 'inherit',
            transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = '#2d2d52';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>
            logout
          </span>
          Logout
        </button>
      </div>
    </header>
  );
}
