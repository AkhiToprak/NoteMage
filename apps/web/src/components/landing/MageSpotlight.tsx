'use client';

import MockFrame from './MockFrame';
import SectionHeader from './SectionHeader';

export default function MageSpotlight() {
  return (
    <section
      style={{
        position: 'relative',
        padding: '128px 32px',
        background: '#181734',
        overflow: 'hidden',
      }}
    >

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
              <span style={{ color: '#ae89ff' }}>personal tutor.</span>
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
            aspectRatio="3024 / 1668"
          />
        </div>
      </div>
    </section>
  );
}
