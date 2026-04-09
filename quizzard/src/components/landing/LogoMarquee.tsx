'use client';

const institutions = [
  'MIT',
  'Stanford',
  'Cambridge',
  'ETH Zürich',
  'TU München',
  'Oxford',
  'UC Berkeley',
  'Imperial',
  'Tsinghua',
  'UCL',
];

export default function LogoMarquee() {
  const loop = [...institutions, ...institutions];

  return (
    <section
      aria-label="Trusted by students"
      style={{
        position: 'relative',
        padding: '56px 0 72px',
        background: '#09081a',
        borderTop: '1px solid rgba(140, 82, 255, 0.1)',
        borderBottom: '1px solid rgba(140, 82, 255, 0.1)',
        overflow: 'hidden',
      }}
    >
      <p
        style={{
          textAlign: 'center',
          fontSize: 11,
          fontFamily: 'var(--font-brand)',
          letterSpacing: '0.2em',
          textTransform: 'uppercase',
          color: 'rgba(237, 233, 255, 0.4)',
          margin: '0 0 28px 0',
        }}
      >
        ✦ Trusted by curious minds at ✦
      </p>

      <div
        style={{
          position: 'relative',
          maskImage:
            'linear-gradient(90deg, transparent 0%, #000 10%, #000 90%, transparent 100%)',
          WebkitMaskImage:
            'linear-gradient(90deg, transparent 0%, #000 10%, #000 90%, transparent 100%)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: 48,
            width: 'max-content',
            animation: 'nm-marquee 42s linear infinite',
          }}
          className="marquee-track"
        >
          {loop.map((name, i) => (
            <div
              key={i}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 22px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(255, 255, 255, 0.025)',
                border: '1px solid rgba(174, 137, 255, 0.15)',
                whiteSpace: 'nowrap',
                backdropFilter: 'blur(6px)',
                WebkitBackdropFilter: 'blur(6px)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 16, color: 'rgba(174, 137, 255, 0.65)' }}
              >
                school
              </span>
              <span
                style={{
                  fontFamily: 'var(--font-brand)',
                  fontSize: 13,
                  fontWeight: 500,
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: 'rgba(237, 233, 255, 0.58)',
                }}
              >
                {name}
              </span>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @keyframes nm-marquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
        .marquee-track:hover {
          animation-play-state: paused;
        }
        @media (prefers-reduced-motion: reduce) {
          .marquee-track {
            animation: none !important;
          }
        }
      `}</style>
    </section>
  );
}
