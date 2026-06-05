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
        padding: 'var(--space-section) var(--space-page)',
        background: 'transparent',
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
        }}
      />

      <div style={{ position: 'relative', maxWidth: 1120, margin: '0 auto' }}>
        <SectionHeader
          align="left"
          title={
            <>
              Three steps to your <span style={{ color: 'var(--brand-purple)' }}>first spell.</span>
            </>
          }
          description="No tutorial hell. You'll be studying with AI in under 60 seconds."
        />

        {/* Left-aligned numbered sequence — each step led by a ghost numeral */}
        <div
          style={{
            position: 'relative',
            display: 'grid',
            gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
            gap: 40,
          }}
          className="steps-grid"
        >
          {steps.map((s) => (
            <div
              key={s.number}
              style={{
                position: 'relative',
                borderTop: '1px solid rgba(174, 137, 255, 0.30)',
                paddingTop: 24,
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  marginBottom: 18,
                }}
              >
                <span
                  aria-hidden
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 56,
                    lineHeight: 0.9,
                    fontWeight: 800,
                    color: 'var(--on-surface)',
                    opacity: 0.16,
                    letterSpacing: '-0.04em',
                  }}
                >
                  {s.number}
                </span>
                <span
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(174, 137, 255, 0.12)',
                    border: '1px solid rgba(174, 137, 255, 0.40)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 24, color: 'var(--primary)' }}
                  >
                    {s.icon}
                  </span>
                </span>
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
            gap: 28px !important;
          }
        }
      `}</style>
    </section>
  );
}
