'use client';

import Link from 'next/link';
import Image from 'next/image';

const columns = [
  {
    title: 'Product',
    links: [
      { label: 'Pricing', href: '/pricing' },
      { label: 'How it works', href: '#how-it-works' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '/about' },
      { label: 'Contact', href: '/contact' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '/privacy' },
      { label: 'Terms', href: '/terms' },
      { label: 'Legal Notice', href: '/legal' },
    ],
  },
];

export default function LandingFooter() {
  return (
    <footer
      style={{
        position: 'relative',
        padding: '96px 32px 48px',
        background: '#0e0d20',
        borderTop: '1px solid rgba(140, 82, 255, 0.16)',
        overflow: 'hidden',
      }}
    >

      <div
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          position: 'relative',
        }}
      >
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1.6fr repeat(3, 1fr)',
            gap: 48,
            marginBottom: 64,
          }}
          className="footer-grid"
        >
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 12,
                marginBottom: 20,
              }}
            >
              <Image
                src="/logo_trimmed.png"
                alt="Notemage"
                width={256}
                height={96}
                style={{ height: 32, width: 'auto', objectFit: 'contain' }}
              />
            </div>
            <p
              style={{
                fontSize: 14,
                lineHeight: 1.7,
                color: 'rgba(237, 233, 255, 0.55)',
                maxWidth: 280,
                margin: 0,
              }}
            >
              Notes, canvas, flashcards, quizzes, and a personal AI tutor — all living inside one
              magical notebook.
            </p>

            <div
              style={{
                display: 'flex',
                gap: 10,
                marginTop: 24,
              }}
            >
              <a
                href="https://www.tiktok.com/@notemage"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Notemage on TikTok"
                style={{
                  width: 38,
                  height: 38,
                  borderRadius: 'var(--radius-md)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(174, 137, 255, 0.08)',
                  border: '1px solid rgba(174, 137, 255, 0.18)',
                  color: 'var(--on-surface-variant)',
                  textDecoration: 'none',
                  transition:
                    'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), background 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.background = 'rgba(174, 137, 255, 0.18)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.background = 'rgba(174, 137, 255, 0.08)';
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M19.321 5.562a5.124 5.124 0 0 1-3.414-1.267 5.124 5.124 0 0 1-1.537-2.723 5.105 5.105 0 0 1-.08-.898h-3.29v13.4a3.022 3.022 0 0 1-5.436 1.817 3.02 3.02 0 0 1-.604-1.817 3.022 3.022 0 0 1 3.022-3.022c.324 0 .634.051.926.145V8.045a6.353 6.353 0 0 0-.926-.067 6.318 6.318 0 0 0-6.318 6.318 6.318 6.318 0 0 0 6.318 6.318 6.318 6.318 0 0 0 6.318-6.318V8.871a8.399 8.399 0 0 0 5.021 1.647V7.229a5.102 5.102 0 0 1-.003-.003 5.124 5.124 0 0 1 .003-1.664z" />
                </svg>
              </a>
            </div>
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h4
                style={{
                  fontFamily: 'var(--font-brand)',
                  fontSize: 12,
                  fontWeight: 600,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'var(--primary)',
                  margin: '0 0 18px 0',
                }}
              >
                {col.title}
              </h4>
              <ul
                style={{
                  listStyle: 'none',
                  margin: 0,
                  padding: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 12,
                }}
              >
                {col.links.map((l) => (
                  <li key={l.label}>
                    <Link
                      href={l.href}
                      style={{
                        fontSize: 14,
                        color: 'rgba(237, 233, 255, 0.6)',
                        textDecoration: 'none',
                        transition: 'color 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--on-surface)')}
                      onMouseLeave={(e) =>
                        (e.currentTarget.style.color = 'rgba(237, 233, 255, 0.6)')
                      }
                    >
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div
          style={{
            paddingTop: 32,
            borderTop: '1px solid rgba(140, 82, 255, 0.14)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 16,
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: 13,
              color: 'rgba(237, 233, 255, 0.4)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            © 2026 Notemage. Crafted with curiosity and a lot of coffee.
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 11,
              color: 'var(--primary)',
              fontFamily: 'var(--font-brand)',
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
            }}
          >
            ✦ Status: All spells operational
          </p>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 1023px) {
          .footer-grid {
            grid-template-columns: 1fr 1fr !important;
            gap: 36px !important;
          }
        }
        @media (max-width: 639px) {
          .footer-grid {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </footer>
  );
}
