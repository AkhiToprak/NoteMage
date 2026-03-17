'use client';

import { useSession, signOut } from 'next-auth/react';
import { LogOut } from 'lucide-react';

function getInitials(name?: string | null): string {
  if (!name) return '?';
  return name
    .split(' ')
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export default function Header() {
  const { data: session } = useSession();

  return (
    <header
      style={{
        height: '64px',
        background: '#0d0c20',
        borderBottom: '1px solid rgba(140, 82, 255, 0.15)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'flex-end',
        padding: '0 24px',
        gap: '16px',
        fontFamily: "'Gliker', 'DM Sans', sans-serif",
      }}
    >
      {/* User info */}
      {session?.user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Name */}
          <span
            style={{
              fontSize: '14px',
              fontWeight: '500',
              color: 'rgba(237, 233, 255, 0.8)',
            }}
          >
            {session.user.name}
          </span>

          {/* Avatar */}
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #8c52ff 0%, #5170ff 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '13px',
              fontWeight: '700',
              color: '#ede9ff',
              letterSpacing: '0.03em',
              flexShrink: 0,
              boxShadow: '0 2px 8px rgba(140, 82, 255, 0.35)',
            }}
          >
            {getInitials(session.user.name)}
          </div>

          {/* Divider */}
          <div
            style={{
              width: '1px',
              height: '24px',
              background: 'rgba(140, 82, 255, 0.2)',
            }}
          />

          {/* Logout */}
          <button
            onClick={() => signOut({ callbackUrl: '/auth/login' })}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 12px',
              borderRadius: '8px',
              border: '1px solid rgba(237, 233, 255, 0.12)',
              background: 'transparent',
              color: 'rgba(237, 233, 255, 0.5)',
              fontSize: '13px',
              fontWeight: '500',
              cursor: 'pointer',
              transition: 'color 0.15s ease, border-color 0.15s ease, background 0.15s ease',
              fontFamily: 'inherit',
            }}
            onMouseEnter={(e) => {
              const btn = e.currentTarget;
              btn.style.color = '#fca5a5';
              btn.style.borderColor = 'rgba(252, 165, 165, 0.3)';
              btn.style.background = 'rgba(252, 165, 165, 0.07)';
            }}
            onMouseLeave={(e) => {
              const btn = e.currentTarget;
              btn.style.color = 'rgba(237, 233, 255, 0.5)';
              btn.style.borderColor = 'rgba(237, 233, 255, 0.12)';
              btn.style.background = 'transparent';
            }}
            onMouseDown={(e) => {
              e.currentTarget.style.transform = 'scale(0.97)';
            }}
            onMouseUp={(e) => {
              e.currentTarget.style.transform = 'scale(1)';
            }}
          >
            <LogOut size={14} />
            Logout
          </button>
        </div>
      )}
    </header>
  );
}
