'use client';

import SectionHeader from './SectionHeader';

const cells = [
  {
    icon: 'groups',
    tag: 'Community',
    title: 'Friends + study groups',
    description:
      'Send friend requests, build study groups, and share notebooks with the people who are actually in your class.',
    accent: '#ae89ff',
  },
  {
    icon: 'phone_iphone',
    tag: 'Cross-device',
    title: 'Phone + laptop + tablet',
    description: 'Your notebook follows you. Everything syncs instantly, offline-friendly.',
    accent: '#b9c3ff',
  },
  {
    icon: 'download',
    tag: 'Export everything',
    title: 'PDF, PPTX, Markdown',
    description:
      'Never locked in. Export any notebook as PDF, PowerPoint, or plain markdown — including your flashcards, quizzes, and mind maps.',
    accent: '#8ce5a7',
  },
];

type Cell = (typeof cells)[number];

export default function BentoFeatures() {
  const [hero, ...rest] = cells;

  return (
    <section
      style={{
        position: 'relative',
        padding: '128px 32px',
        background: 'transparent',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <SectionHeader
          eyebrow="And the rest"
          title={
            <>
              Built like an app <span style={{ color: '#ae89ff' }}>you’ll actually open.</span>
            </>
          }
          description="The small things that don’t fit on a carousel but make the day-to-day feel good."
        />

        {/* Asymmetric bento: one wide hero card + a two-up row below */}
        <div style={{ display: 'grid', gap: 22 }}>
          <BentoCell cell={hero} wide />
          <div
            className="bento-subgrid"
            style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 22 }}
          >
            {rest.map((c) => (
              <BentoCell key={c.title} cell={c} />
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 639px) {
          .bento-subgrid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </section>
  );
}

function BentoCell({ cell: c, wide = false }: { cell: Cell; wide?: boolean }) {
  return (
    <div
      className="bento-cell"
      style={{
        position: 'relative',
        padding: wide ? 36 : 28,
        borderRadius: 'var(--radius-xl)',
        background: 'rgba(22, 20, 44, 0.72)',
        border: `1px solid ${c.accent}33`,
        boxShadow: '0 24px 60px rgba(140, 82, 255, 0.06), 0 4px 16px var(--bento-rest-shadow)',
        minHeight: wide ? 188 : 240,
        overflow: 'hidden',
        transition:
          'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.45s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-4px)';
        e.currentTarget.style.borderColor = `${c.accent}77`;
        e.currentTarget.style.boxShadow = `0 36px 80px ${c.accent}1a, 0 12px 28px var(--bento-hover-shadow)`;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        e.currentTarget.style.borderColor = `${c.accent}33`;
        e.currentTarget.style.boxShadow =
          '0 24px 60px rgba(140, 82, 255, 0.06), 0 4px 16px var(--bento-rest-shadow)';
      }}
    >
      <div
        className={wide ? 'bento-wide' : undefined}
        style={wide ? { display: 'flex', alignItems: 'center', gap: 32 } : undefined}
      >
        <div
          style={{
            position: 'relative',
            width: wide ? 64 : 48,
            height: wide ? 64 : 48,
            flexShrink: 0,
            borderRadius: 'var(--radius-md)',
            background: `${c.accent}14`,
            border: `1px solid ${c.accent}44`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: wide ? 0 : 22,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: wide ? 30 : 24, color: c.accent }}>
            {c.icon}
          </span>
        </div>

        <div style={{ minWidth: 0 }}>
          <span
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-brand)',
              fontSize: 10,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: c.accent,
              fontWeight: 600,
              marginBottom: 8,
            }}
          >
            {c.tag}
          </span>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: wide ? 28 : 22,
              lineHeight: 1.15,
              letterSpacing: '-0.02em',
              fontWeight: 800,
              color: 'var(--on-surface)',
              margin: '0 0 10px 0',
            }}
          >
            {c.title}
          </h3>
          <p
            style={{
              margin: 0,
              fontSize: wide ? 15 : 14,
              lineHeight: 1.6,
              color: 'var(--ink-60)',
              fontFamily: 'var(--font-sans)',
              maxWidth: wide ? 560 : undefined,
            }}
          >
            {c.description}
          </p>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 639px) {
          .bento-wide {
            flex-direction: column !important;
            align-items: flex-start !important;
          }
        }
      `}</style>
    </div>
  );
}
