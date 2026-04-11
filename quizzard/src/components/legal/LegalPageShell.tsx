import LandingNavbar from '@/components/landing/LandingNavbar';
import LandingFooter from '@/components/landing/LandingFooter';
import DocsMarkdown from '@/components/docs/DocsMarkdown';

interface LegalPageShellProps {
  eyebrow: string;
  titleEn: string;
  titleDe: string;
  enContent: string;
  deContent: string;
}

export default function LegalPageShell({
  eyebrow,
  titleEn,
  titleDe,
  enContent,
  deContent,
}: LegalPageShellProps) {
  return (
    <main
      className="nm-legal"
      style={{
        position: 'relative',
        background: '#15142e',
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
          paddingTop: 160,
          paddingBottom: 56,
          overflow: 'hidden',
        }}
      >
        {/* Restrained ambient glows — quieter than marketing pages */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: [
              'radial-gradient(720px 520px at 50% -8%, rgba(140, 82, 255, 0.12) 0%, transparent 60%)',
              'radial-gradient(420px 320px at 88% 6%, rgba(255, 222, 89, 0.04) 0%, transparent 60%)',
            ].join(','),
          }}
        />
        {/* Grain overlay for depth */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: 0.04,
            mixBlendMode: 'overlay',
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            maxWidth: 760,
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
              marginBottom: 32,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 16, color: 'var(--tertiary-container)' }}
            >
              shield
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
              {eyebrow}
            </span>
          </div>

          {/* English title — primary */}
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(40px, 6vw, 68px)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.04,
              margin: 0,
              color: 'var(--on-surface)',
            }}
          >
            {titleEn}
          </h1>

          {/* German title — secondary, italic, muted */}
          <p
            lang="de"
            style={{
              margin: '14px 0 0',
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(18px, 2vw, 22px)',
              fontWeight: 500,
              fontStyle: 'italic',
              color: 'rgba(237, 233, 255, 0.5)',
              letterSpacing: '-0.005em',
            }}
          >
            {titleDe}
          </p>

          {/* Language jump pills */}
          <div
            style={{
              display: 'flex',
              gap: 12,
              justifyContent: 'center',
              marginTop: 36,
              flexWrap: 'wrap',
            }}
          >
            <a
              href="#en"
              className="nm-legal-pill"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(174, 137, 255, 0.08)',
                border: '1px solid rgba(174, 137, 255, 0.22)',
                color: 'var(--on-surface)',
                textDecoration: 'none',
                fontSize: 12,
                fontFamily: 'var(--font-brand)',
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16 }}
              >
                arrow_downward
              </span>
              English
            </a>
            <a
              href="#de"
              className="nm-legal-pill"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(174, 137, 255, 0.08)',
                border: '1px solid rgba(174, 137, 255, 0.22)',
                color: 'var(--on-surface)',
                textDecoration: 'none',
                fontSize: 12,
                fontFamily: 'var(--font-brand)',
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16 }}
              >
                arrow_downward
              </span>
              Deutsch
            </a>
          </div>
        </div>
      </section>

      {/* ───────────── CONTENT ───────────── */}
      <section
        style={{
          position: 'relative',
          padding: '24px 32px 120px',
        }}
      >
        {/* Soft side glows for the content well */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '8%',
            left: '-8%',
            width: 540,
            height: 540,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(174, 137, 255, 0.06) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '60%',
            right: '-6%',
            width: 460,
            height: 460,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(81, 112, 255, 0.05) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <article
          style={{
            position: 'relative',
            maxWidth: 720,
            margin: '0 auto',
          }}
        >
          {/* English section */}
          <div id="en" style={{ scrollMarginTop: 100 }}>
            <DocsMarkdown content={enContent} />
          </div>

          {/* Editorial section divider */}
          <div
            aria-hidden
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              margin: '96px 0 56px',
            }}
          >
            <div
              style={{
                flex: 1,
                height: 1,
                background:
                  'linear-gradient(90deg, transparent, rgba(174, 137, 255, 0.32), rgba(174, 137, 255, 0.18))',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-brand)',
                fontSize: 11,
                fontWeight: 600,
                letterSpacing: '0.24em',
                textTransform: 'uppercase',
                color: 'var(--primary)',
                whiteSpace: 'nowrap',
              }}
            >
              Deutsche Version
            </span>
            <div
              style={{
                flex: 1,
                height: 1,
                background:
                  'linear-gradient(90deg, rgba(174, 137, 255, 0.18), rgba(174, 137, 255, 0.32), transparent)',
              }}
            />
          </div>

          {/* German section */}
          <div id="de" lang="de" style={{ scrollMarginTop: 100 }}>
            <DocsMarkdown content={deContent} />
          </div>

          {/* Back to top */}
          <div
            style={{
              marginTop: 72,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <a
              href="#en"
              className="nm-legal-pill"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 18px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(174, 137, 255, 0.08)',
                border: '1px solid rgba(174, 137, 255, 0.22)',
                color: 'var(--on-surface)',
                textDecoration: 'none',
                fontSize: 12,
                fontFamily: 'var(--font-brand)',
                fontWeight: 600,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16 }}
              >
                arrow_upward
              </span>
              Back to top
            </a>
          </div>
        </article>
      </section>

      <LandingFooter />

      <style>{`
        .nm-legal .nm-legal-pill {
          transition:
            transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
            background 0.35s cubic-bezier(0.22, 1, 0.36, 1),
            border-color 0.35s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .nm-legal .nm-legal-pill:hover {
          transform: translateY(-2px);
          background: rgba(174, 137, 255, 0.18);
          border-color: rgba(174, 137, 255, 0.4);
        }
        .nm-legal a:focus-visible,
        .nm-legal button:focus-visible {
          outline: 2px solid #ffde59;
          outline-offset: 3px;
          border-radius: 8px;
        }
        .nm-legal a:focus:not(:focus-visible),
        .nm-legal button:focus:not(:focus-visible) {
          outline: none;
        }
      `}</style>
    </main>
  );
}
