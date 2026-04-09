'use client';

import Link from 'next/link';
import Image from 'next/image';

const columns = [
  {
    title: 'Product',
    links: [
      { label: 'Features', href: '#features' },
      { label: 'Pricing', href: '/pricing' },
      { label: 'Changelog', href: '#' },
      { label: 'Roadmap', href: '#' },
    ],
  },
  {
    title: 'Learn',
    links: [
      { label: 'How it works', href: '#how-it-works' },
      { label: 'Tutorials', href: '#' },
      { label: 'Study tips', href: '#' },
      { label: 'Exam guides', href: '#' },
    ],
  },
  {
    title: 'Company',
    links: [
      { label: 'About', href: '#' },
      { label: 'Blog', href: '#' },
      { label: 'Contact', href: '#' },
      { label: 'Press kit', href: '#' },
    ],
  },
  {
    title: 'Legal',
    links: [
      { label: 'Privacy', href: '#' },
      { label: 'Terms', href: '#' },
      { label: 'Cookies', href: '#' },
      { label: 'Imprint', href: '#' },
    ],
  },
];

export default function LandingFooter() {
  return (
    <footer
      style={{
        position: 'relative',
        padding: '96px 32px 48px',
        background:
          'linear-gradient(180deg, rgba(8, 8, 22, 0.0) 0%, rgba(8, 8, 22, 0.85) 40%, #050410 100%)',
        borderTop: '1px solid rgba(140, 82, 255, 0.16)',
        overflow: 'hidden',
      }}
    >
      {/* Decorative sigil */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          right: -120,
          bottom: -120,
          width: 400,
          height: 400,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(140, 82, 255, 0.12) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

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
            gridTemplateColumns: '1.4fr repeat(4, 1fr)',
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
              <span
                style={{
                  fontFamily: 'var(--font-brand)',
                  fontSize: 20,
                  fontWeight: 600,
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--on-surface)',
                }}
              >
                Notemage
              </span>
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
              Notes, canvas, flashcards, quizzes, and a personal AI tutor — all
              living inside one magical notebook.
            </p>

            <div
              style={{
                display: 'flex',
                gap: 10,
                marginTop: 24,
              }}
            >
              {['alternate_email', 'public', 'play_circle', 'photo_camera'].map(
                (icon) => (
                  <a
                    key={icon}
                    href="#"
                    aria-label="Social link"
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
                      e.currentTarget.style.background =
                        'rgba(174, 137, 255, 0.18)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.background =
                        'rgba(174, 137, 255, 0.08)';
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                      {icon}
                    </span>
                  </a>
                )
              )}
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
                      onMouseEnter={(e) =>
                        (e.currentTarget.style.color = 'var(--on-surface)')
                      }
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
