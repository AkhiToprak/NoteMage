'use client';

import SectionHeader from './SectionHeader';

const steps = [
  {
    number: '01',
    icon: 'menu_book',
    title: 'Create a notebook',
    description:
      'Start from a template or a blank page. Group your notebooks into folders, tag them, pick a cover.',
  },
  {
    number: '02',
    icon: 'upload_file',
    title: 'Upload your material',
    description:
      'Drop in PDFs, slides, Word docs, or paste text. Notemage parses them and makes them searchable.',
  },
  {
    number: '03',
    icon: 'auto_awesome',
    title: 'Study with your Mage',
    description:
      'Ask questions, generate flashcards, build quizzes, export slides. Your personal tutor lives here.',
  },
];

export default function HowItWorks() {
  return (
    <section
      id="how-it-works"
      style={{
        position: 'relative',
        padding: '128px 32px',
        background: '#161534',
      }}
    >
      {/* dot grid overlay */}
      <div
        aria-hidden
        className="notebook-pattern"
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.4,
          pointerEvents: 'none',
          maskImage: 'radial-gradient(ellipse at center, #000 30%, transparent 75%)',
          WebkitMaskImage: 'radial-gradient(ellipse at center, #000 30%, transparent 75%)',
        }}
      />

      <div style={{ position: 'relative', maxWidth: 1120, margin: '0 auto' }}>
        <SectionHeader
          eyebrow="How it works"
          title={
            <>
              Three steps to your{' '}
              <span style={{ color: '#ae89ff' }}>first spell.</span>
            </>
          }
          description="No tutorial hell. You'll be studying with AI in under 60 seconds."
        />

        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 20,
          }}
          className="steps-grid"
        >
          {/* Horizontal connector line (desktop) */}
          <div
            aria-hidden
            className="hide-tablet-down"
            style={{
              position: 'absolute',
              top: 52,
              left: '12%',
              right: '12%',
              height: 2,
              background: 'rgba(174, 137, 255, 0.25)',
              pointerEvents: 'none',
            }}
          />

          {steps.map((s) => (
            <div
              key={s.number}
              style={{
                position: 'relative',
                padding: 28,
                borderRadius: 'var(--radius-xl)',
                background: '#16142e',
                border: '1px solid rgba(174, 137, 255, 0.2)',
                boxShadow: '0 32px 64px rgba(140, 82, 255, 0.08), 0 8px 24px rgba(0,0,0,0.35)',
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  margin: '0 auto 22px',
                  width: 72,
                  height: 72,
                  borderRadius: '50%',
                  background: 'rgba(174, 137, 255, 0.14)',
                  border: '1px solid rgba(174, 137, 255, 0.4)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  position: 'relative',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 32, color: 'var(--primary)' }}
                >
                  {s.icon}
                </span>
              </div>
              <div
                style={{
                  fontFamily: 'var(--font-brand)',
                  fontSize: 11,
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: 'var(--primary)',
                  marginBottom: 10,
                  fontWeight: 600,
                }}
              >
                Step {s.number}
              </div>
              <h3
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 22,
                  lineHeight: 1.15,
                  letterSpacing: '-0.02em',
                  fontWeight: 800,
                  color: 'var(--on-surface)',
                  margin: '0 0 12px 0',
                }}
              >
                {s.title}
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
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 1023px) {
          .steps-grid {
            grid-template-columns: 1fr !important;
            gap: 22px !important;
          }
        }
      `}</style>
    </section>
  );
}
