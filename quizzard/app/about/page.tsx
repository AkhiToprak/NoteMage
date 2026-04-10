'use client';

import LandingNavbar from '@/components/landing/LandingNavbar';
import LandingFooter from '@/components/landing/LandingFooter';

export default function AboutPage() {
  return (
    <main
      className="nm-about"
      style={{
        position: 'relative',
        background: '#09081a',
        color: '#ede9ff',
        fontFamily: 'var(--font-sans)',
        minHeight: '100vh',
        overflow: 'hidden',
      }}
    >
      <LandingNavbar />

      {/* ───────────── HERO ───────────── */}
      <section
        style={{
          position: 'relative',
          paddingTop: 180,
          paddingBottom: 80,
          overflow: 'hidden',
        }}
      >
        {/* Layered radial glows */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: [
              'radial-gradient(900px 700px at 50% -10%, rgba(140, 82, 255, 0.16) 0%, transparent 55%)',
              'radial-gradient(600px 480px at 88% 10%, rgba(255, 222, 89, 0.07) 0%, transparent 60%)',
              'radial-gradient(420px 380px at 6% 85%, rgba(81, 112, 255, 0.09) 0%, transparent 60%)',
            ].join(','),
          }}
        />
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

        {/* Scattered sparkles */}
        {[
          { top: '26%', left: '14%', size: 16, delay: '0s' },
          { top: '68%', left: '10%', size: 12, delay: '1.4s' },
          { top: '30%', left: '84%', size: 18, delay: '0.8s' },
          { top: '74%', left: '86%', size: 14, delay: '2.2s' },
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
              animation: `nm-about-twinkle 3.6s ease-in-out infinite ${s.delay}`,
              pointerEvents: 'none',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z"
                fill="#ffde59"
              />
            </svg>
          </div>
        ))}

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            maxWidth: 960,
            margin: '0 auto',
            padding: '0 32px',
            textAlign: 'center',
          }}
        >
          {/* Eyebrow pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 18px',
              borderRadius: 'var(--radius-full)',
              background:
                'linear-gradient(135deg, rgba(174, 137, 255, 0.18) 0%, rgba(255, 222, 89, 0.12) 100%)',
              border: '1px solid rgba(174, 137, 255, 0.3)',
              marginBottom: 40,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 16, color: 'var(--tertiary-container)' }}
            >
              auto_awesome
            </span>
            <span
              style={{
                fontFamily: 'var(--font-brand)',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--on-surface)',
              }}
            >
              About Notemage
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(56px, 10vw, 132px)',
              fontWeight: 800,
              letterSpacing: '-0.035em',
              lineHeight: 0.95,
              margin: 0,
              color: 'var(--on-surface)',
            }}
          >
            Challenge
            <br />
            <span style={{ position: 'relative', display: 'inline-block' }}>
              accepted
              <span style={{ color: 'var(--tertiary-container)' }}>.</span>
              {/* Brush-stroke underline */}
              <svg
                aria-hidden
                viewBox="0 0 600 24"
                preserveAspectRatio="none"
                style={{
                  position: 'absolute',
                  left: '-2%',
                  right: 0,
                  bottom: '-0.18em',
                  width: '104%',
                  height: '0.22em',
                  pointerEvents: 'none',
                }}
              >
                <path
                  d="M4 14 C 120 4, 260 22, 380 10 S 560 6, 596 14"
                  fill="none"
                  stroke="#ffde59"
                  strokeWidth="5"
                  strokeLinecap="round"
                  opacity="0.9"
                />
              </svg>
            </span>
          </h1>

          {/* Subtitle — direct quote from the letter */}
          <p
            style={{
              maxWidth: 640,
              margin: '48px auto 0',
              fontSize: 20,
              lineHeight: 1.6,
              color: 'rgba(237, 233, 255, 0.72)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            A single dev. Fed up with the bad UI of the competitors.
          </p>
        </div>
      </section>

      {/* ───────────── LETTER ───────────── */}
      <section
        style={{
          position: 'relative',
          padding: '72px 32px 120px',
        }}
      >
        {/* Ambient side glows */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '12%',
            left: '-10%',
            width: 640,
            height: 640,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(174, 137, 255, 0.09) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '55%',
            right: '-8%',
            width: 520,
            height: 520,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(255, 222, 89, 0.05) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <article
          className="nm-letter"
          style={{
            position: 'relative',
            maxWidth: 720,
            margin: '0 auto',
          }}
        >
          {/* Paragraph 1 — with drop cap */}
          <p
            style={{
              fontSize: 20,
              lineHeight: 1.75,
              color: 'rgba(237, 233, 255, 0.88)',
              fontFamily: 'var(--font-sans)',
              margin: 0,
            }}
          >
            <span
              style={{
                float: 'left',
                fontFamily: 'var(--font-display)',
                fontSize: 104,
                lineHeight: 0.85,
                fontWeight: 800,
                color: 'var(--tertiary-container)',
                paddingRight: 16,
                paddingTop: 6,
                marginBottom: -6,
                textShadow: '0 10px 34px rgba(255, 222, 89, 0.28)',
              }}
            >
              N
            </span>
            otemage was created by me, a single dev who&apos;s studying
            computer science and was fed up with the bad UI of the competitors,
            and the constant tab switching, and on top of that the noisy ads
            if you don&apos;t pay the monthly{' '}
            <span
              style={{
                color: 'var(--on-surface)',
                fontWeight: 700,
              }}
            >
              $20
            </span>{' '}
            for{' '}
            <span
              style={{
                fontFamily: 'var(--font-brand)',
                fontWeight: 700,
                letterSpacing: '0.08em',
                color: 'var(--tertiary-container)',
                whiteSpace: 'nowrap',
              }}
            >
              EVERY.SINGLE.ONE
            </span>{' '}
            of them.
          </p>

          {/* Pull quote — extracted from the letter */}
          <figure
            className="nm-pullquote"
            style={{
              position: 'relative',
              margin: '80px -48px',
              padding: '60px 52px 52px',
              borderRadius: 'var(--radius-xl)',
              background:
                'linear-gradient(135deg, rgba(174, 137, 255, 0.09) 0%, rgba(255, 222, 89, 0.045) 100%)',
              border: '1px solid rgba(174, 137, 255, 0.22)',
              textAlign: 'center',
              overflow: 'hidden',
              boxShadow:
                '0 32px 64px rgba(174,137,255,0.06), 0 8px 24px rgba(0,0,0,0.4)',
            }}
          >
            {/* Giant decorative quote mark */}
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: -56,
                left: 12,
                fontFamily: 'var(--font-display)',
                fontSize: 240,
                lineHeight: 1,
                color: 'rgba(174, 137, 255, 0.12)',
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              &ldquo;
            </span>
            <blockquote
              style={{
                position: 'relative',
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(26px, 4vw, 40px)',
                lineHeight: 1.22,
                fontWeight: 600,
                letterSpacing: '-0.022em',
                color: 'var(--on-surface)',
              }}
            >
              You&apos;re supposed to be able to build this yourself, no?
            </blockquote>
            <figcaption
              style={{
                position: 'relative',
                marginTop: 28,
                fontFamily: 'var(--font-brand)',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--primary)',
              }}
            >
              — So I thought to myself
            </figcaption>
          </figure>

          {/* Paragraph 3 — principles highlighted inline */}
          <p
            style={{
              fontSize: 20,
              lineHeight: 1.75,
              color: 'rgba(237, 233, 255, 0.88)',
              fontFamily: 'var(--font-sans)',
              margin: 0,
            }}
          >
            This is the reason why I have a{' '}
            <span
              style={{
                color: 'var(--tertiary-container)',
                fontWeight: 700,
                textDecoration: 'underline',
                textDecorationColor: 'rgba(255, 222, 89, 0.4)',
                textDecorationThickness: '2px',
                textUnderlineOffset: '4px',
              }}
            >
              strict policy of not running ads
            </span>
            , and{' '}
            <span
              style={{
                color: 'var(--tertiary-container)',
                fontWeight: 700,
                textDecoration: 'underline',
                textDecorationColor: 'rgba(255, 222, 89, 0.4)',
                textDecorationThickness: '2px',
                textUnderlineOffset: '4px',
              }}
            >
              keeping the core features of my app free
            </span>
            . You only have to pay for the usage of AI, because well… I have
            to pay for it{' '}
            <span
              style={{
                display: 'inline-block',
                fontFamily: 'var(--font-brand)',
                color: 'rgba(237, 233, 255, 0.55)',
              }}
            >
              :(
            </span>
          </p>

          {/* Paragraph 4 — bugs */}
          <p
            style={{
              fontSize: 20,
              lineHeight: 1.75,
              color: 'rgba(237, 233, 255, 0.88)',
              fontFamily: 'var(--font-sans)',
              margin: '32px 0 0',
            }}
          >
            So if you encounter any bugs, feel free to contact me, and I will
            get to fixing it as best as I can!
          </p>

          {/* Contact CTA */}
          <div style={{ marginTop: 32 }}>
            <a
              href="/contact"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '14px 26px',
                borderRadius: 'var(--radius-full)',
                background: 'var(--tertiary-container)',
                color: '#2a2200',
                fontSize: 15,
                fontWeight: 700,
                textDecoration: 'none',
                fontFamily: 'var(--font-sans)',
                boxShadow:
                  '0 8px 24px rgba(255, 222, 89, 0.18), 0 2px 8px rgba(0,0,0,0.3)',
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
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                mail
              </span>
              Contact me
            </a>
          </div>

          {/* Divider */}
          <div
            aria-hidden
            style={{
              height: 1,
              background:
                'linear-gradient(90deg, transparent, rgba(174, 137, 255, 0.32), transparent)',
              margin: '72px 0',
            }}
          />

          {/* Paragraph 5 — manifesto */}
          <p
            style={{
              fontSize: 20,
              lineHeight: 1.75,
              color: 'rgba(237, 233, 255, 0.88)',
              fontFamily: 'var(--font-sans)',
              margin: 0,
            }}
          >
            Notemage is an app targeted at{' '}
            <span style={{ color: 'var(--on-surface)', fontWeight: 700 }}>
              students
            </span>{' '}
            who want everything they need in terms of studying tools in a
            single app, with a nice UI, and{' '}
            <span style={{ color: 'var(--primary)', fontWeight: 700 }}>
              a dev that actually cares
            </span>{' '}
            about your wants and needs, and not a huge corporation that
            couldn&apos;t be bothered with the fact that you don&apos;t like
            the UI.{' '}
            <span
              style={{
                fontStyle: 'italic',
                color: 'rgba(237, 233, 255, 0.5)',
              }}
            >
              *cough cough* M-slop
            </span>
          </p>

          {/* P.S. sticky note — easter egg closer */}
          <aside
            className="nm-ps"
            style={{
              position: 'relative',
              width: 'min(460px, 100%)',
              margin: '112px auto 0',
              padding: '32px 36px 36px',
              background:
                'linear-gradient(180deg, #fff6d0 0%, #ffde59 100%)',
              color: '#2a2200',
              borderRadius: 6,
              boxShadow:
                '0 36px 72px rgba(255, 222, 89, 0.18), 0 16px 32px rgba(0, 0, 0, 0.45)',
              transform: 'rotate(-1.2deg)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            {/* Washi tape */}
            <div
              aria-hidden
              style={{
                position: 'absolute',
                top: -14,
                left: '50%',
                transform: 'translateX(-50%) rotate(-3deg)',
                width: 96,
                height: 24,
                background:
                  'repeating-linear-gradient(45deg, rgba(255,255,255,0.55) 0 6px, rgba(255,255,255,0.3) 6px 12px)',
                border: '1px solid rgba(255, 255, 255, 0.55)',
                borderRadius: 2,
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
              }}
            />
            <div
              style={{
                fontFamily: 'var(--font-brand)',
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: 'rgba(42, 34, 0, 0.58)',
                marginBottom: 10,
              }}
            >
              P.S.
            </div>
            <p
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: 24,
                lineHeight: 1.32,
                fontWeight: 700,
                letterSpacing: '-0.015em',
              }}
            >
              If you&apos;re reading this, have fun with Notemage!
            </p>
          </aside>
        </article>
      </section>

      <LandingFooter />

      <style jsx global>{`
        @keyframes nm-about-twinkle {
          0%,
          100% {
            opacity: 0.25;
            transform: scale(0.9);
          }
          50% {
            opacity: 1;
            transform: scale(1.15);
          }
        }

        .nm-about a:focus-visible,
        .nm-about button:focus-visible {
          outline: 2px solid #ffde59;
          outline-offset: 3px;
          border-radius: 8px;
        }
        .nm-about a:focus:not(:focus-visible),
        .nm-about button:focus:not(:focus-visible) {
          outline: none;
        }

        @media (max-width: 820px) {
          .nm-about .nm-pullquote {
            margin-left: 0 !important;
            margin-right: 0 !important;
            padding: 48px 28px 40px !important;
          }
        }
      `}</style>
    </main>
  );
}
