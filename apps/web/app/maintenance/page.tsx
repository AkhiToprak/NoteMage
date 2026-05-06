import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Notemage — back shortly',
  description: 'Notemage is briefly offline for maintenance.',
  robots: { index: false, follow: false },
};

export default function MaintenancePage() {
  return (
    <main
      style={{
        position: 'relative',
        minHeight: '100dvh',
        background: 'var(--background)',
        color: 'var(--on-surface)',
        fontFamily: 'var(--font-sans)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '32px 24px',
        overflow: 'hidden',
      }}
    >
      <div
        aria-hidden
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: [
            'radial-gradient(900px 700px at 50% -10%, rgba(174, 137, 255, 0.16) 0%, transparent 55%)',
            'radial-gradient(600px 480px at 88% 12%, rgba(255, 222, 89, 0.06) 0%, transparent 60%)',
            'radial-gradient(520px 420px at 6% 90%, rgba(81, 112, 255, 0.10) 0%, transparent 60%)',
          ].join(','),
        }}
      />
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

      <section
        className="glass-panel"
        style={{
          position: 'relative',
          width: '100%',
          maxWidth: 520,
          padding: '48px 36px 40px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          boxShadow:
            '0 32px 64px rgba(174, 137, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.4)',
          border: '1px solid rgba(174, 137, 255, 0.12)',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 64,
            height: 64,
            marginBottom: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: 9999,
              background:
                'radial-gradient(circle, rgba(174, 137, 255, 0.45) 0%, rgba(174, 137, 255, 0) 70%)',
              animation: 'nm-maint-pulse 2.4s ease-in-out infinite',
            }}
          />
          <span
            style={{
              position: 'relative',
              width: 14,
              height: 14,
              borderRadius: 9999,
              background: 'var(--primary)',
              boxShadow:
                '0 0 0 6px rgba(174, 137, 255, 0.18), 0 0 24px rgba(174, 137, 255, 0.55)',
            }}
          />
        </div>

        <p
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: 12,
            letterSpacing: '0.32em',
            textTransform: 'uppercase',
            color: 'var(--on-surface-variant)',
            margin: 0,
            marginBottom: 18,
          }}
        >
          Notemage · Maintenance
        </p>

        <h1
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(30px, 5vw, 40px)',
            fontWeight: 700,
            letterSpacing: '-0.03em',
            lineHeight: 1.1,
            margin: 0,
            marginBottom: 16,
            background:
              'linear-gradient(135deg, #ffffff 0%, var(--primary-fixed) 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text',
          }}
        >
          We&rsquo;ll be back shortly.
        </h1>

        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 16,
            lineHeight: 1.7,
            color: 'var(--on-surface-variant)',
            margin: 0,
            marginBottom: 28,
            maxWidth: 380,
          }}
        >
          We&rsquo;re moving to a new home. Notemage will be available again as
          soon as the move is complete &mdash; usually within an hour.
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--outline-variant)',
            fontFamily: 'var(--font-brand)',
            fontSize: 12,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--on-surface-variant)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: 9999,
              background: 'var(--tertiary-container)',
              boxShadow: '0 0 10px rgba(255, 222, 89, 0.6)',
              animation: 'nm-maint-blink 1.6s ease-in-out infinite',
            }}
          />
          Status&nbsp;·&nbsp;Migrating
        </div>
      </section>

      <p
        style={{
          position: 'absolute',
          bottom: 24,
          left: 0,
          right: 0,
          textAlign: 'center',
          fontFamily: 'var(--font-sans)',
          fontSize: 12,
          color: 'var(--on-surface-variant)',
          opacity: 0.65,
          margin: 0,
        }}
      >
        Need us? <a
          href="mailto:hello@notemage.app"
          style={{ color: 'var(--primary-fixed)', textDecoration: 'none' }}
        >
          hello@notemage.app
        </a>
      </p>

      <style>{`
        @keyframes nm-maint-pulse {
          0%, 100% { transform: scale(0.85); opacity: 0.55; }
          50%      { transform: scale(1.15); opacity: 1; }
        }
        @keyframes nm-maint-blink {
          0%, 100% { opacity: 0.45; }
          50%      { opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="nm-maint-pulse"], [style*="nm-maint-blink"] { animation: none !important; }
        }
      `}</style>
    </main>
  );
}
