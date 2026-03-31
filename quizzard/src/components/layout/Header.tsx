'use client';

import { useSession, signOut } from 'next-auth/react';
import { usePathname } from 'next/navigation';

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

function getPageTitle(pathname: string): string {
  if (pathname === '/dashboard') return 'Dashboard';
  if (pathname.startsWith('/notebooks') && pathname.split('/').length === 3) return 'Notebook';
  if (pathname.startsWith('/notebooks')) return 'Notebooks';
  if (pathname.startsWith('/settings')) return 'Settings';
  if (pathname.startsWith('/ai-chat')) return 'AI Chat';
  return 'Quizzard';
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
        background: 'rgba(17,17,38,0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        zIndex: 30,
      }}
    >
      {/* Page title */}
      <h1
        style={{
          fontFamily: '"Shrikhand", serif',
          fontStyle: 'italic',
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
            <span style={{ fontSize: '14px', fontWeight: '500', color: '#aaa8c8' }}>
              Hello,{' '}
              <span style={{ color: '#e5e3ff' }}>{session.user.name}</span>
            </span>
            {session.user.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={session.user.avatarUrl}
                alt={session.user.name || 'Avatar'}
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  objectFit: 'cover',
                  flexShrink: 0,
                }}
              />
            ) : (
              <div
                style={{
                  width: '40px',
                  height: '40px',
                  borderRadius: '12px',
                  background: 'linear-gradient(135deg, #ae89ff 0%, #8348f6 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '14px',
                  fontWeight: '700',
                  color: '#ffffff',
                  flexShrink: 0,
                }}
              >
                {getInitials(session.user.name)}
              </div>
            )}
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
            (e.currentTarget as HTMLButtonElement).style.background = '#232342';
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
