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
    description:
      'Your notebook follows you. Everything syncs instantly, offline-friendly.',
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

export default function BentoFeatures() {
  return (
    <section
      style={{
        position: 'relative',
        padding: '128px 32px',
        background: '#09081a',
      }}
    >
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <SectionHeader
          eyebrow="And the rest"
          title={
            <>
              Built like an app{' '}
              <span
                style={{
                  background:
                    'linear-gradient(135deg, #ae89ff 0%, #ffde59 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                you’ll actually open.
              </span>
            </>
          }
          description="The small things that don’t fit on a carousel but make the day-to-day feel good."
        />

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gridTemplateRows: 'auto',
            gap: 22,
          }}
          className="bento-grid"
        >
          {cells.map((c) => (
            <div
              key={c.title}
              className="bento-cell"
              style={{
                position: 'relative',
                padding: 28,
                borderRadius: 'var(--radius-xl)',
                background:
                  'linear-gradient(180deg, rgba(28, 24, 56, 0.7) 0%, rgba(16, 14, 34, 0.75) 100%)',
                border: `1px solid ${c.accent}33`,
                boxShadow:
                  '0 24px 60px rgba(140, 82, 255, 0.06), 0 4px 16px rgba(0,0,0,0.35)',
                minHeight: 240,
                overflow: 'hidden',
                transition:
                  'transform 0.45s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.45s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.45s cubic-bezier(0.22, 1, 0.36, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-4px)';
                e.currentTarget.style.borderColor = `${c.accent}77`;
                e.currentTarget.style.boxShadow = `0 36px 80px ${c.accent}1a, 0 12px 28px rgba(0,0,0,0.4)`;
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.borderColor = `${c.accent}33`;
                e.currentTarget.style.boxShadow =
                  '0 24px 60px rgba(140, 82, 255, 0.06), 0 4px 16px rgba(0,0,0,0.35)';
              }}
            >
              {/* Decorative glow */}
              <div
                aria-hidden
                style={{
                  position: 'absolute',
                  top: -40,
                  right: -40,
                  width: 180,
                  height: 180,
                  borderRadius: '50%',
                  background: `radial-gradient(circle, ${c.accent}22 0%, transparent 65%)`,
                  pointerEvents: 'none',
                }}
              />

              <div
                style={{
                  position: 'relative',
                  width: 48,
                  height: 48,
                  borderRadius: 'var(--radius-md)',
                  background: `${c.accent}14`,
                  border: `1px solid ${c.accent}44`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: 22,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 24, color: c.accent }}
                >
                  {c.icon}
                </span>
              </div>

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
                  fontSize: 22,
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
                  fontSize: 14,
                  lineHeight: 1.6,
                  color: 'rgba(237, 233, 255, 0.6)',
                  fontFamily: 'var(--font-sans)',
                }}
              >
                {c.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 1023px) {
          .bento-grid {
            grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) !important;
          }
        }
        @media (max-width: 639px) {
          .bento-grid {
            grid-template-columns: minmax(0, 1fr) !important;
          }
        }
      `}</style>
    </section>
  );
}
