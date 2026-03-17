'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import { LayoutDashboard, BookOpen, Settings } from 'lucide-react';

const navLinks = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/notebooks', label: 'Notebooks', icon: BookOpen },
  { href: '/settings', label: 'Settings', icon: Settings },
];

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      style={{
        width: '256px',
        minWidth: '256px',
        background: '#0d0c20',
        borderRight: '1px solid rgba(140, 82, 255, 0.15)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        fontFamily: "'Gliker', 'DM Sans', sans-serif",
      }}
    >
      {/* Logo */}
      <div
        style={{
          padding: '20px 20px 18px',
          borderBottom: '1px solid rgba(140, 82, 255, 0.1)',
        }}
      >
        <Image
          src="/logo_trimmed.png"
          alt="Quizzard"
          width={160}
          height={40}
          style={{ objectFit: 'contain', objectPosition: 'left' }}
        />
      </div>

      {/* Nav */}
      <nav style={{ padding: '16px 12px', flex: 1 }}>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {navLinks.map(({ href, label, icon: Icon }) => {
            const isActive = pathname === href || pathname.startsWith(href + '/');
            return (
              <li key={href}>
                <Link
                  href={href}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    padding: '16px 20px',
                    borderRadius: '12px',
                    textDecoration: 'none',
                    fontSize: '16px',
                    fontWeight: isActive ? '600' : '400',
                    color: isActive ? '#ede9ff' : 'rgba(237, 233, 255, 0.5)',
                    background: isActive
                      ? 'linear-gradient(135deg, rgba(140,82,255,0.25) 0%, rgba(81,112,255,0.15) 100%)'
                      : 'transparent',
                    boxShadow: isActive
                      ? 'inset 0 0 0 1px rgba(140, 82, 255, 0.3)'
                      : 'none',
                    transition: 'color 0.15s ease, background 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(237, 233, 255, 0.85)';
                      (e.currentTarget as HTMLAnchorElement).style.background = 'rgba(140, 82, 255, 0.08)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(237, 233, 255, 0.5)';
                      (e.currentTarget as HTMLAnchorElement).style.background = 'transparent';
                    }
                  }}
                >
                  <Icon
                    size={18}
                    style={{
                      color: isActive ? '#8c52ff' : 'rgba(237, 233, 255, 0.4)',
                      flexShrink: 0,
                    }}
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom decoration */}
      <div
        style={{
          padding: '16px 20px',
          borderTop: '1px solid rgba(140, 82, 255, 0.1)',
          fontSize: '11px',
          color: 'rgba(237, 233, 255, 0.2)',
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
        }}
      >
        v0.1.0
      </div>
    </aside>
  );
}
