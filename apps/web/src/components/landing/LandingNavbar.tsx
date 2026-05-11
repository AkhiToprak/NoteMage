'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';

export default function LandingNavbar() {
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  const links = [
    { href: '/about', label: 'About' },
    { href: '/docs', label: 'Docs' },
    { href: '/pricing', label: 'Pricing' },
  ];

  return (
    <>
      <header
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          zIndex: 60,
          padding: '16px 0',
          background: scrolled ? '#0e0c22' : 'transparent',
          borderBottom: scrolled ? '1px solid rgba(174, 137, 255, 0.36)' : '1px solid transparent',
          transition:
            'background 0.35s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <nav
          style={{
            maxWidth: 1280,
            margin: '0 auto',
            padding: '0 32px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 32,
          }}
        >
          <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
            <Link
              href="/"
              aria-label="Notemage home"
              style={{
                display: 'flex',
                alignItems: 'center',
                textDecoration: 'none',
              }}
            >
              <Image
                src="/logo_trimmed.png"
                alt="Notemage"
                width={256}
                height={96}
                priority
                style={{
                  height: 40,
                  width: 'auto',
                  objectFit: 'contain',
                }}
              />
            </Link>
          </div>

          {/* Desktop links */}
          <ul
            className="hide-tablet-down"
            style={{
              display: 'flex',
              listStyle: 'none',
              margin: 0,
              padding: 6,
              gap: 4,
              background: 'rgba(174, 137, 255, 0.06)',
              border: '1px solid rgba(174, 137, 255, 0.14)',
              borderRadius: 'var(--radius-full)',
            }}
          >
            {links.map((l) => {
              const isActive = pathname === l.href;
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    style={{
                      display: 'inline-block',
                      fontSize: 13,
                      fontWeight: 500,
                      color: isActive ? 'var(--on-surface)' : 'rgba(237, 233, 255, 0.72)',
                      textDecoration: 'none',
                      fontFamily: 'var(--font-sans)',
                      letterSpacing: '0.01em',
                      padding: '8px 16px',
                      borderRadius: 'var(--radius-full)',
                      background: isActive ? 'rgba(174, 137, 255, 0.16)' : 'transparent',
                      transition:
                        'color 0.25s cubic-bezier(0.22, 1, 0.36, 1), background 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
                    }}
                    onMouseEnter={(e) => {
                      if (isActive) return;
                      e.currentTarget.style.color = 'var(--on-surface)';
                      e.currentTarget.style.background = 'rgba(174, 137, 255, 0.12)';
                    }}
                    onMouseLeave={(e) => {
                      if (isActive) return;
                      e.currentTarget.style.color = 'rgba(237, 233, 255, 0.72)';
                      e.currentTarget.style.background = 'transparent';
                    }}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div
            className="hide-tablet-down"
            style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 12,
            }}
          >
            <Link
              href="/auth/login"
              style={{
                fontSize: 14,
                fontWeight: 500,
                color: 'var(--on-surface)',
                textDecoration: 'none',
                padding: '10px 16px',
                borderRadius: 'var(--radius-full)',
                fontFamily: 'var(--font-sans)',
                transition: 'opacity 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.7')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
            >
              Log in
            </Link>
            <Link
              href="/waitlist"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '11px 22px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--tertiary-container)',
                color: '#2a2200',
                fontSize: 14,
                fontWeight: 700,
                textDecoration: 'none',
                fontFamily: 'var(--font-sans)',
                boxShadow: '0 8px 24px rgba(255, 222, 89, 0.18), 0 2px 8px rgba(0,0,0,0.3)',
                transition:
                  'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow =
                  '0 16px 36px rgba(255, 222, 89, 0.28), 0 4px 12px rgba(0,0,0,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow =
                  '0 8px 24px rgba(255, 222, 89, 0.18), 0 2px 8px rgba(0,0,0,0.3)';
              }}
            >
              Get started
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                arrow_forward
              </span>
            </Link>
          </div>

          {/* Mobile + tablet burger */}
          <button
            className="nm-burger"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={menuOpen}
            style={{
              width: 44,
              height: 44,
              borderRadius: 'var(--radius-md)',
              background: 'rgba(174, 137, 255, 0.1)',
              border: '1px solid rgba(174, 137, 255, 0.25)',
              color: 'var(--on-surface)',
              cursor: 'pointer',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="material-symbols-outlined">{menuOpen ? 'close' : 'menu'}</span>
          </button>

          <style jsx>{`
            .nm-burger {
              display: inline-flex;
            }
            @media (min-width: 1024px) {
              .nm-burger {
                display: none !important;
              }
            }
          `}</style>
        </nav>
      </header>

      {/* Mobile overlay */}
      {menuOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 55,
            background: 'var(--surface)',
            padding: '96px 32px 32px',
            display: 'flex',
            flexDirection: 'column',
            gap: 28,
          }}
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              style={{
                fontSize: 28,
                fontWeight: 600,
                color: 'var(--on-surface)',
                textDecoration: 'none',
                fontFamily: 'var(--font-display)',
                letterSpacing: '-0.02em',
              }}
            >
              {l.label}
            </Link>
          ))}
          <div
            style={{
              height: 1,
              background: 'var(--ink-20)',
              margin: '16px 0',
            }}
          />
          <Link
            href="/waitlist"
            style={{
              fontSize: 18,
              color: 'var(--ink-70)',
              textDecoration: 'none',
            }}
          >
            Join waitlist
          </Link>
          <Link
            href="/waitlist"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '16px 24px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--tertiary-container)',
              color: '#2a2200',
              fontSize: 18,
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            Get started
            <span className="material-symbols-outlined">arrow_forward</span>
          </Link>
        </div>
      )}
    </>
  );
}
