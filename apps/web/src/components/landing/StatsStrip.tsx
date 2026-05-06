'use client';

interface Claim {
  icon: string;
  headline: string;
  label: string;
  accent: string;
}

const claims: Claim[] = [
  {
    icon: 'all_inclusive',
    headline: 'Unlimited',
    label: 'notebooks, pages & canvas',
    accent: '#ae89ff',
  },
  {
    icon: 'format_quote',
    headline: 'Cited',
    label: 'AI answers grounded in your notes',
    accent: '#ffde59',
  },
  {
    icon: 'devices',
    headline: 'Everywhere',
    label: 'phone, tablet, laptop — synced',
    accent: '#b9c3ff',
  },
];

export default function StatsStrip() {
  return (
    <section
      aria-label="What Notemage actually delivers"
      style={{
        position: 'relative',
        padding: '72px 32px',
        background: '#15142e',
        borderTop: '1px solid rgba(140, 82, 255, 0.12)',
        borderBottom: '1px solid rgba(140, 82, 255, 0.12)',
      }}
    >
      <div
        style={{
          maxWidth: 1120,
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 32,
          alignItems: 'center',
        }}
        className="stats-grid"
      >
        {claims.map((c) => (
          <ClaimBlock key={c.headline} claim={c} />
        ))}
      </div>

      <style jsx>{`
        @media (max-width: 767px) {
          .stats-grid {
            grid-template-columns: 1fr !important;
            gap: 40px !important;
            text-align: center;
          }
        }
      `}</style>
    </section>
  );
}

function ClaimBlock({ claim }: { claim: Claim }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 20,
      }}
      className="claim-block"
    >
      <div
        style={{
          flexShrink: 0,
          width: 56,
          height: 56,
          borderRadius: 'var(--radius-lg)',
          background: `${claim.accent}14`,
          border: `1px solid ${claim.accent}44`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: `0 0 28px ${claim.accent}22`,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: claim.accent }}>
          {claim.icon}
        </span>
      </div>
      <div>
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(24px, 3vw, 34px)',
            lineHeight: 1.05,
            letterSpacing: '-0.025em',
            fontWeight: 800,
            color: 'var(--on-surface)',
            marginBottom: 4,
          }}
        >
          {claim.headline}
        </div>
        <div
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: 'rgba(237, 233, 255, 0.52)',
            fontWeight: 500,
          }}
        >
          {claim.label}
        </div>
      </div>
      <style jsx>{`
        @media (max-width: 767px) {
          .claim-block {
            flex-direction: column;
            text-align: center;
          }
        }
      `}</style>
    </div>
  );
}
