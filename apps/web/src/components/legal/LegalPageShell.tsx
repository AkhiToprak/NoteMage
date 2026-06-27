/* Hallmark · light legal shell — cream surface, ink headings, bilingual hero.
 * Recolour-only adaptation of the prior dark shell: same structure (eyebrow,
 * EN title + DE subtitle, language jump links, EN content → divider → DE
 * content, back-to-top), now on the redesigned cream system with the shared
 * MageNav + MageFooter. Content (privacy/terms/refund/legal-notice .md) renders
 * through the already-light DocsMarkdown — unchanged. Server component.
 */

import MageNav from '@/components/landing/MageNav';
import MageFooter from '@/components/landing/MageFooter';
import DocsMarkdown from '@/components/docs/DocsMarkdown';

interface LegalPageShellProps {
  eyebrow: string;
  titleEn: string;
  titleDe: string;
  enContent: string;
  deContent: string;
}

const jumpPill: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 8,
  padding: '10px 18px',
  borderRadius: 999,
  background: '#f1edfb',
  border: '1px solid #e3dbf7',
  color: '#4326b8',
  textDecoration: 'none',
  fontSize: 12,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
};

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
        isolation: 'isolate',
        background: '#faf7f0',
        color: '#18202f',
        minHeight: '100vh',
        fontFamily:
          "var(--font-inter), 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        WebkitFontSmoothing: 'antialiased',
        overflowX: 'clip',
      }}
    >
      <MageNav />

      {/* ───────────── HERO ───────────── */}
      <section style={{ position: 'relative', padding: '150px 24px 44px' }}>
        <div style={{ maxWidth: 760, margin: '0 auto', textAlign: 'center' }}>
          {/* Eyebrow pill */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              padding: '7px 16px',
              borderRadius: 999,
              background: '#ece3ff',
              color: '#4326b8',
              fontSize: 12,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              marginBottom: 26,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
              shield
            </span>
            {eyebrow}
          </span>

          {/* English title — primary */}
          <h1
            style={{
              fontSize: 'clamp(40px, 6vw, 66px)',
              fontWeight: 800,
              letterSpacing: '-0.03em',
              lineHeight: 1.04,
              margin: 0,
              color: '#18202f',
            }}
          >
            {titleEn}
          </h1>

          {/* German title — secondary, italic, muted */}
          <p
            lang="de"
            style={{
              margin: '14px 0 0',
              fontSize: 'clamp(17px, 2vw, 21px)',
              fontWeight: 500,
              fontStyle: 'italic',
              color: '#6b7280',
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
              marginTop: 34,
              flexWrap: 'wrap',
            }}
          >
            <a href="#en" className="nm-legal-pill" style={jumpPill}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
                arrow_downward
              </span>
              English
            </a>
            <a href="#de" className="nm-legal-pill" style={jumpPill}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
                arrow_downward
              </span>
              Deutsch
            </a>
          </div>
        </div>
      </section>

      {/* ───────────── CONTENT ───────────── */}
      <section style={{ position: 'relative', padding: '16px 24px 120px' }}>
        <article style={{ maxWidth: 720, margin: '0 auto' }}>
          {/* English section */}
          <div id="en" style={{ scrollMarginTop: 100 }}>
            <DocsMarkdown content={enContent} />
          </div>

          {/* Editorial section divider */}
          <div
            aria-hidden
            style={{ display: 'flex', alignItems: 'center', gap: 20, margin: '88px 0 52px' }}
          >
            <div style={{ flex: 1, height: 1, background: '#e0d9c9' }} />
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: '#7c5cff',
                whiteSpace: 'nowrap',
              }}
            >
              Deutsche Version
            </span>
            <div style={{ flex: 1, height: 1, background: '#e0d9c9' }} />
          </div>

          {/* German section */}
          <div id="de" lang="de" style={{ scrollMarginTop: 100 }}>
            <DocsMarkdown content={deContent} />
          </div>

          {/* Back to top */}
          <div style={{ marginTop: 64, display: 'flex', justifyContent: 'center' }}>
            <a href="#en" className="nm-legal-pill" style={jumpPill}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
                arrow_upward
              </span>
              Back to top
            </a>
          </div>
        </article>
      </section>

      <MageFooter />

      <style>{`
        .nm-legal .nm-legal-pill {
          transition:
            transform 0.3s cubic-bezier(0.22, 1, 0.36, 1),
            background 0.3s cubic-bezier(0.22, 1, 0.36, 1),
            border-color 0.3s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .nm-legal .nm-legal-pill:hover {
          background: #ece3ff;
          border-color: #c9bcf7;
          transform: translateY(-1px);
        }
        .nm-legal a:focus-visible,
        .nm-legal button:focus-visible {
          outline: 3px solid #7c5cff;
          outline-offset: 3px;
          border-radius: 10px;
        }
        .nm-legal a:focus:not(:focus-visible),
        .nm-legal button:focus:not(:focus-visible) {
          outline: none;
        }
      `}</style>
    </main>
  );
}
