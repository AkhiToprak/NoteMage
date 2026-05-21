'use client';

import Link from 'next/link';
import Image from 'next/image';

const links = [
  { label: 'Pricing', href: '/pricing' },
  { label: 'How it works', href: '/#how-it-works' },
  { label: 'About', href: '/about' },
  { label: 'Contact', href: '/contact' },
  { label: 'Docs', href: '/docs' },
  { label: 'Privacy', href: '/privacy' },
  { label: 'Terms', href: '/terms' },
  { label: 'Refunds', href: '/refund' },
  { label: 'Legal Notice', href: '/legal' },
];

export default function LandingFooter() {
  return (
    <footer
      style={{
        position: 'relative',
        padding: '72px 32px 40px',
        background: 'transparent',
        borderTop: '1px solid rgba(174, 137, 255, 0.32)',
        overflow: 'hidden',
      }}
    >
      <div style={{ maxWidth: 1080, margin: '0 auto' }}>
        {/* Wordmark + voice line */}
        <div
          className="footer-top"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 32,
            flexWrap: 'wrap',
            marginBottom: 40,
          }}
        >
          <div style={{ maxWidth: 440 }}>
            <Image
              src="/logo_trimmed.png"
              alt="Notemage"
              width={256}
              height={96}
              style={{ height: 32, width: 'auto', objectFit: 'contain', marginBottom: 18 }}
            />
            <p
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 19,
                lineHeight: 1.4,
                letterSpacing: '-0.015em',
                color: 'var(--on-surface)',
                margin: 0,
              }}
            >
              One app for notes, canvas, flashcards, quizzes, and a personal AI tutor.
            </p>
            <p
              style={{
                fontSize: 13,
                lineHeight: 1.6,
                color: 'rgba(237, 233, 255, 0.5)',
                margin: '10px 0 0',
              }}
            >
              Made by one dev who got tired of bad study apps.
            </p>
          </div>

          <a
            href="https://www.tiktok.com/@notemage"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Notemage on TikTok"
            style={{
              width: 40,
              height: 40,
              borderRadius: 'var(--radius-md)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(174, 137, 255, 0.08)',
              border: '1px solid rgba(174, 137, 255, 0.18)',
              color: 'var(--on-surface-variant)',
              textDecoration: 'none',
              flexShrink: 0,
              transition: 'background 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(174, 137, 255, 0.18)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(174, 137, 255, 0.08)';
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M19.321 5.562a5.124 5.124 0 0 1-3.414-1.267 5.124 5.124 0 0 1-1.537-2.723 5.105 5.105 0 0 1-.08-.898h-3.29v13.4a3.022 3.022 0 0 1-5.436 1.817 3.02 3.02 0 0 1-.604-1.817 3.022 3.022 0 0 1 3.022-3.022c.324 0 .634.051.926.145V8.045a6.353 6.353 0 0 0-.926-.067 6.318 6.318 0 0 0-6.318 6.318 6.318 6.318 0 0 0 6.318 6.318 6.318 6.318 0 0 0 6.318-6.318V8.871a8.399 8.399 0 0 0 5.021 1.647V7.229a5.102 5.102 0 0 1-.003-.003 5.124 5.124 0 0 1 .003-1.664z" />
            </svg>
          </a>
        </div>

        {/* Flat link row — no Product/Company/Legal columns */}
        <nav
          aria-label="Footer"
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '12px 24px',
            paddingTop: 28,
            borderTop: '1px solid rgba(174, 137, 255, 0.14)',
          }}
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              style={{
                fontSize: 13,
                color: 'rgba(237, 233, 255, 0.6)',
                textDecoration: 'none',
                whiteSpace: 'nowrap',
                transition: 'color 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--on-surface)')}
              onMouseLeave={(e) => (e.currentTarget.style.color = 'rgba(237, 233, 255, 0.6)')}
            >
              {l.label}
            </Link>
          ))}
        </nav>

        <p style={{ marginTop: 24, fontSize: 12, color: 'rgba(237, 233, 255, 0.4)', margin: '24px 0 0' }}>
          © 2026 Notemage — built for students, by a student.
        </p>
      </div>

      <style jsx>{`
        @media (max-width: 639px) {
          .footer-top {
            flex-direction: column;
          }
        }
      `}</style>
    </footer>
  );
}
