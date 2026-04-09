'use client';

import Link from 'next/link';

export default function FinalCta() {
  return (
    <section
      style={{
        position: 'relative',
        padding: '160px 32px 192px',
        background: '#09081a',
        overflow: 'hidden',
        textAlign: 'center',
      }}
    >
      {/* Layered glows */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: [
            'radial-gradient(900px 600px at 50% 50%, rgba(140, 82, 255, 0.18) 0%, transparent 60%)',
            'radial-gradient(500px 360px at 20% 80%, rgba(255, 222, 89, 0.08) 0%, transparent 60%)',
            'radial-gradient(480px 360px at 80% 20%, rgba(81, 112, 255, 0.12) 0%, transparent 60%)',
          ].join(','),
        }}
      />

      {/* Sparkles */}
      {[
        { top: '20%', left: '12%', size: 20, delay: '0s' },
        { top: '68%', left: '18%', size: 14, delay: '1.2s' },
        { top: '28%', left: '84%', size: 18, delay: '0.6s' },
        { top: '72%', left: '82%', size: 22, delay: '1.8s' },
      ].map((s, i) => (
        <div
          key={i}
          aria-hidden
          style={{
            position: 'absolute',
            top: s.top,
            left: s.left,
            width: s.size,
            height: s.size,
            animation: `nm-twinkle 3.6s ease-in-out infinite ${s.delay}`,
            pointerEvents: 'none',
          }}
        >
          <svg viewBox="0 0 24 24" fill="none">
            <path
              d="M12 2L13.5 9.5L22 12L13.5 14.5L12 22L10.5 14.5L2 12L10.5 9.5L12 2Z"
              fill="#ffde59"
            />
          </svg>
        </div>
      ))}

      <div style={{ position: 'relative', maxWidth: 860, margin: '0 auto' }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 16px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(174, 137, 255, 0.1)',
            border: '1px solid rgba(174, 137, 255, 0.28)',
            marginBottom: 28,
          }}
        >
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#ffde59',
              boxShadow: '0 0 10px #ffde59',
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-brand)',
              fontSize: 11,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              color: 'var(--on-surface)',
              fontWeight: 600,
            }}
          >
            Ready when you are
          </span>
        </div>

        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(40px, 6vw, 80px)',
            lineHeight: 1,
            letterSpacing: '-0.035em',
            fontWeight: 800,
            color: 'var(--on-surface)',
            margin: '0 0 24px 0',
          }}
        >
          Your next exam
          <br />
          <span
            style={{
              background:
                'linear-gradient(135deg, #ffde59 0%, #ffc94a 50%, #ffb347 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
              fontStyle: 'italic',
            }}
          >
            starts here.
          </span>
        </h2>

        <p
          style={{
            fontSize: 'clamp(16px, 1.6vw, 19px)',
            lineHeight: 1.65,
            color: 'rgba(237, 233, 255, 0.62)',
            margin: '0 auto 44px',
            maxWidth: 560,
            fontFamily: 'var(--font-sans)',
          }}
        >
          Free forever. No credit card. 60 seconds to your first notebook — and
          your first spell.
        </p>

        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: 14,
            flexWrap: 'wrap',
          }}
        >
          <Link
            href="/auth/register"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '18px 32px',
              borderRadius: 'var(--radius-full)',
              background:
                'linear-gradient(135deg, #ffde59 0%, #ffc94a 100%)',
              color: '#2a2200',
              fontSize: 16,
              fontWeight: 700,
              textDecoration: 'none',
              fontFamily: 'var(--font-sans)',
              boxShadow:
                '0 24px 60px rgba(255, 222, 89, 0.3), 0 8px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)',
              transition:
                'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-4px)';
              e.currentTarget.style.boxShadow =
                '0 32px 80px rgba(255, 222, 89, 0.42), 0 12px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.4)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow =
                '0 24px 60px rgba(255, 222, 89, 0.3), 0 8px 16px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.4)';
            }}
          >
            Start free — no card
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
              arrow_forward
            </span>
          </Link>

          <Link
            href="/pricing"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '18px 28px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(174, 137, 255, 0.08)',
              border: '1px solid rgba(174, 137, 255, 0.32)',
              color: 'var(--on-surface)',
              fontSize: 16,
              fontWeight: 600,
              textDecoration: 'none',
              fontFamily: 'var(--font-sans)',
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
              transition:
                'background 0.35s cubic-bezier(0.22, 1, 0.36, 1), transform 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(174, 137, 255, 0.18)';
              e.currentTarget.style.transform = 'translateY(-4px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(174, 137, 255, 0.08)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            See pricing
          </Link>
        </div>
      </div>

      <style jsx>{`
        @keyframes nm-twinkle {
          0%, 100% {
            opacity: 0.2;
            transform: scale(0.7) rotate(0deg);
          }
          50% {
            opacity: 1;
            transform: scale(1) rotate(20deg);
          }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*='nm-twinkle'] {
            animation: none !important;
            opacity: 0.5 !important;
          }
        }
      `}</style>
    </section>
  );
}
