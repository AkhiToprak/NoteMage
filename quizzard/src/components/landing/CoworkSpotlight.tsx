'use client';

import MockFrame from './MockFrame';

export default function CoworkSpotlight() {
  return (
    <section
      style={{
        position: 'relative',
        padding: '128px 32px',
        background:
          'linear-gradient(180deg, #09081a 0%, #0c0a24 50%, #09081a 100%)',
        overflow: 'hidden',
      }}
    >
      {/* blue tinted glow */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '20%',
          right: '-10%',
          width: 640,
          height: 480,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(81, 112, 255, 0.15) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

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
        <div style={{ position: 'relative', minWidth: 0, overflow: 'hidden', borderRadius: 'var(--radius-xl)' }}>
          <MockFrame
            image="/screenshots/live-session_screenshot.png"
            alt="Notemage live co-working session"
            urlLabel="notemage.app/live/zurich-bio"
            cornerLabel="Live session"
            accent="rgba(81, 112, 255, 0.35)"
            aspectRatio="4 / 3"
          />

          {/* Floating chat bubble */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              bottom: -24,
              right: -20,
              padding: '12px 16px',
              borderRadius: 'var(--radius-lg)',
              background: 'rgba(20, 18, 44, 0.92)',
              border: '1px solid rgba(174, 137, 255, 0.3)',
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              boxShadow:
                '0 16px 40px rgba(140, 82, 255, 0.2), 0 4px 12px rgba(0,0,0,0.4)',
              maxWidth: 240,
              animation: 'nm-float 6s ease-in-out infinite 0.5s',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                marginBottom: 6,
              }}
            >
              <div
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: '50%',
                  background:
                    'linear-gradient(135deg, #ffde59 0%, #ffc94a 100%)',
                  fontSize: 10,
                  fontWeight: 700,
                  color: '#2a2200',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontFamily: 'var(--font-brand)',
                }}
              >
                A
              </div>
              <span
                style={{
                  fontFamily: 'var(--font-brand)',
                  fontSize: 11,
                  letterSpacing: '0.08em',
                  color: '#ffde59',
                  textTransform: 'uppercase',
                }}
              >
                Ana
              </span>
            </div>
            <p
              style={{
                margin: 0,
                fontSize: 12,
                color: 'rgba(237, 233, 255, 0.85)',
                lineHeight: 1.5,
              }}
            >
              Can someone explain mitosis step 3? 🤔
            </p>
          </div>
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
            <span
              style={{
                background:
                  'linear-gradient(135deg, #b9c3ff 0%, #5170ff 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
                fontStyle: 'italic',
              }}
            >
              Together.
            </span>
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
            Host a session, share a link, and watch your friends move
            through the notebook with you. Live cursors, page locks, and
            side chat — all in the same notebook. Available today.
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
