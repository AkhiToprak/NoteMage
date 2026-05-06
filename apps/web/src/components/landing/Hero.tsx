'use client';

import Link from 'next/link';
import HeroCarousel from './HeroCarousel';
import ParticleCanvas from './ParticleCanvas';

export default function Hero() {
  return (
    <section
      style={{
        position: 'relative',
        paddingTop: 140,
        paddingBottom: 100,
        overflow: 'hidden',
        background: '#15142e',
      }}
    >
      {/* Grain overlay */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          opacity: 0.05,
          mixBlendMode: 'overlay',
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <ParticleCanvas />

      <div
        style={{
          position: 'relative',
          zIndex: 2,
          maxWidth: 1280,
          margin: '0 auto',
          padding: '0 32px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 0.9fr) minmax(0, 1.3fr)',
          gap: 64,
          alignItems: 'center',
        }}
        className="hero-grid"
      >
        {/* LEFT — copy */}
        <div style={{ minWidth: 0 }}>
          {/* Eyebrow pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 16px',
              borderRadius: 'var(--radius-full)',
              background: '#25204a',
              border: '1px solid rgba(174, 137, 255, 0.3)',
              marginBottom: 32,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#ffde59' }}>
              auto_awesome
            </span>
            <span
              style={{
                fontFamily: 'var(--font-brand)',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: 'var(--on-surface)',
                fontWeight: 600,
              }}
            >
              Your AI Study Companion
            </span>
          </div>

          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(44px, 6.4vw, 84px)',
              lineHeight: 0.98,
              letterSpacing: '-0.035em',
              fontWeight: 800,
              color: '#ede9ff',
              margin: '0 0 28px 0',
            }}
          >
            Every note.
            <br />
            Every sketch.
            <br />
            <span
              style={{
                color: '#ffde59',
                fontStyle: 'italic',
              }}
            >
              One mage.
            </span>
          </h1>

          <p
            style={{
              fontSize: 'clamp(16px, 1.6vw, 19px)',
              lineHeight: 1.65,
              color: 'rgba(237, 233, 255, 0.65)',
              margin: '0 0 40px 0',
              maxWidth: 520,
              fontFamily: 'var(--font-sans)',
            }}
          >
            Text notes, infinite canvas, flashcards, quizzes, and a personal AI tutor — all living
            inside one magical notebook.
          </p>

          {/* CTAs */}
          <div
            style={{
              display: 'flex',
              gap: 14,
              flexWrap: 'wrap',
            }}
          >
            <Link
              href="/waitlist"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '16px 28px',
                borderRadius: 'var(--radius-full)',
                background: '#ffde59',
                color: '#2a2200',
                fontSize: 15,
                fontWeight: 700,
                textDecoration: 'none',
                fontFamily: 'var(--font-sans)',
                boxShadow:
                  '0 16px 40px rgba(255, 222, 89, 0.22), 0 4px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.4)',
                transition:
                  'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-3px)';
                e.currentTarget.style.boxShadow =
                  '0 24px 60px rgba(255, 222, 89, 0.34), 0 8px 20px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow =
                  '0 16px 40px rgba(255, 222, 89, 0.22), 0 4px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.4)';
              }}
            >
              Start free
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                arrow_forward
              </span>
            </Link>

            <Link
              href="#features"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '16px 26px',
                borderRadius: 'var(--radius-full)',
                background: '#1e1b3e',
                border: '1px solid rgba(174, 137, 255, 0.3)',
                color: 'var(--on-surface)',
                fontSize: 15,
                fontWeight: 600,
                textDecoration: 'none',
                fontFamily: 'var(--font-sans)',
                transition:
                  'background 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = '#2a2550';
                e.currentTarget.style.transform = 'translateY(-3px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = '#1e1b3e';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                play_circle
              </span>
              Watch the magic
            </Link>
          </div>
        </div>

        {/* RIGHT — carousel */}
        <div style={{ position: 'relative', minWidth: 0 }}>
          <HeroCarousel />
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 1023px) {
          .hero-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 56px !important;
          }
        }
      `}</style>
    </section>
  );
}
