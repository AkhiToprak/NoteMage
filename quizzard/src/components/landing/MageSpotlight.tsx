'use client';

import MockFrame from './MockFrame';
import SectionHeader from './SectionHeader';

export default function MageSpotlight() {
  return (
    <section
      style={{
        position: 'relative',
        padding: '128px 32px',
        background:
          'radial-gradient(1000px 600px at 50% 0%, rgba(140, 82, 255, 0.12) 0%, transparent 60%), #09081a',
        overflow: 'hidden',
      }}
    >
      {/* Decorative orb */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: 640,
          height: 640,
          transform: 'translate(-50%, -30%)',
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(140, 82, 255, 0.15) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      <div
        style={{
          position: 'relative',
          maxWidth: 1080,
          margin: '0 auto',
          textAlign: 'center',
        }}
      >
        <SectionHeader
          eyebrow="Personal Mage"
          title={
            <>
              Meet your{' '}
              <span
                style={{
                  background:
                    'linear-gradient(135deg, #ae89ff 0%, #c9a6ff 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                personal tutor.
              </span>
            </>
          }
          description="Ask anything, anywhere in your notebook. Mage reads your pages, your PDFs, your slides — and answers with citations you can actually trust."
        />

        {/* Tag pills */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            flexWrap: 'wrap',
            gap: 10,
            marginBottom: 56,
          }}
        >
          {[
            { icon: 'bolt', label: 'Powered by Claude' },
            { icon: 'format_quote', label: 'Cites your pages' },
            { icon: 'quiz', label: 'Generates quizzes + flashcards' },
          ].map((t) => (
            <span
              key={t.label}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 14px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(174, 137, 255, 0.1)',
                border: '1px solid rgba(174, 137, 255, 0.22)',
                fontSize: 12,
                color: 'rgba(237, 233, 255, 0.75)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 15, color: 'var(--primary)' }}
              >
                {t.icon}
              </span>
              {t.label}
            </span>
          ))}
        </div>

        {/* Chat screenshot */}
        <div style={{ maxWidth: 960, margin: '0 auto' }}>
          <MockFrame
            image="/screenshots/ai_chat_screenshot.png"
            alt="Notemage AI chat with your notes"
            urlLabel="notemage.app/notebooks/anatomy/chats"
            cornerLabel="Personal Mage"
            accent="rgba(174, 137, 255, 0.35)"
            aspectRatio="16 / 10"
          />
        </div>
      </div>
    </section>
  );
}
