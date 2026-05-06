'use client';

import MockFrame from './MockFrame';

export default function CoworkSpotlight() {
  return (
    <section
      style={{
        position: 'relative',
        padding: '128px 32px',
        background: '#15142e',
        overflow: 'hidden',
      }}
    >

      <div
        style={{
          position: 'relative',
          maxWidth: 1280,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 0.9fr)',
          gap: 72,
          alignItems: 'center',
        }}
        className="cowork-grid"
      >
        {/* LEFT — mockup */}
        <div
          style={{
            position: 'relative',
            minWidth: 0,
            overflow: 'hidden',
            borderRadius: 'var(--radius-xl)',
          }}
        >
          <MockFrame
            image="/screenshots/live-session_screenshot.png"
            alt="Notemage live co-working session"
            urlLabel="notemage.app/live/zurich-bio"
            cornerLabel="Live session"
            accent="rgba(81, 112, 255, 0.35)"
            aspectRatio="3024 / 1668"
          />
        </div>

        {/* RIGHT — copy */}
        <div>
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '7px 14px',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(81, 112, 255, 0.14)',
              border: '1px solid rgba(81, 112, 255, 0.3)',
              marginBottom: 20,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#8ce5a7',
                boxShadow: '0 0 10px #8ce5a7',
              }}
            />
            <span
              style={{
                fontFamily: 'var(--font-brand)',
                fontSize: 11,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: '#b9c3ff',
                fontWeight: 600,
              }}
            >
              Now live · Co-working
            </span>
          </div>

          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(32px, 4.6vw, 56px)',
              lineHeight: 1.02,
              letterSpacing: '-0.03em',
              fontWeight: 800,
              color: 'var(--on-surface)',
              margin: '0 0 20px 0',
            }}
          >
            Study alone.{' '}
            <span style={{ color: '#b9c3ff', fontStyle: 'italic' }}>Together.</span>
          </h2>

          <p
            style={{
              fontSize: 17,
              lineHeight: 1.65,
              color: 'rgba(237, 233, 255, 0.62)',
              margin: '0 0 32px 0',
              maxWidth: 500,
              fontFamily: 'var(--font-sans)',
            }}
          >
            Host a session, share a link, and watch your friends move through the notebook with you.
            Live cursors, page locks, and side chat — all in the same notebook. Available today.
          </p>

          <ul
            style={{
              listStyle: 'none',
              margin: 0,
              padding: 0,
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 14,
            }}
          >
            {[
              { icon: 'visibility', text: 'Live presence dots' },
              { icon: 'lock', text: 'Page locking' },
              { icon: 'chat', text: 'Side chat + reactions' },
              { icon: 'link', text: 'One-link invites' },
            ].map((b) => (
              <li
                key={b.text}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  padding: '12px 14px',
                  borderRadius: 'var(--radius-md)',
                  background: 'rgba(81, 112, 255, 0.06)',
                  border: '1px solid rgba(81, 112, 255, 0.18)',
                  fontSize: 13,
                  color: 'rgba(237, 233, 255, 0.8)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18, color: '#b9c3ff' }}
                >
                  {b.icon}
                </span>
                {b.text}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 1023px) {
          .cowork-grid {
            grid-template-columns: minmax(0, 1fr) !important;
            gap: 56px !important;
          }
        }
      `}</style>
    </section>
  );
}
