'use client';

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

        {/* Chat mockup */}
        <ChatMockup />
      </div>
    </section>
  );
}

function ChatMockup() {
  return (
    <div
      style={{
        position: 'relative',
        maxWidth: 780,
        margin: '0 auto',
        padding: 28,
        borderRadius: 'var(--radius-xl)',
        background:
          'linear-gradient(180deg, rgba(28, 24, 56, 0.72) 0%, rgba(16, 14, 34, 0.85) 100%)',
        border: '1px solid rgba(174, 137, 255, 0.28)',
        boxShadow:
          '0 48px 120px rgba(140, 82, 255, 0.18), 0 16px 48px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Chat header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          paddingBottom: 22,
          borderBottom: '1px solid rgba(174, 137, 255, 0.14)',
          marginBottom: 26,
        }}
      >
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: '50%',
            background:
              'linear-gradient(135deg, #ae89ff 0%, #6040cc 100%)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 32px rgba(174, 137, 255, 0.5)',
            flexShrink: 0,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 22, color: '#fff' }}
          >
            auto_awesome
          </span>
        </div>
        <div style={{ textAlign: 'left', flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontFamily: 'var(--font-brand)',
              fontSize: 14,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--on-surface)',
            }}
          >
            Your Mage
          </div>
          <div
            style={{
              fontSize: 12,
              color: 'rgba(237, 233, 255, 0.5)',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginTop: 4,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: '#8ce5a7',
                boxShadow: '0 0 8px #8ce5a7',
              }}
            />
            Reading 3 pages from <em style={{ color: 'var(--primary)' }}>Anatomy</em>
          </div>
        </div>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 20, color: 'rgba(237, 233, 255, 0.35)' }}
        >
          more_horiz
        </span>
      </div>

      {/* Messages */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
          textAlign: 'left',
        }}
      >
        <Bubble
          role="user"
          content="Explain the difference between arteries and veins using my notes from Chapter 4."
        />
        <Bubble
          role="mage"
          content={
            <>
              Based on{' '}
              <Citation label="Ch 4 · page 12" />, arteries carry oxygenated
              blood <em>away</em> from the heart under high pressure, while
              veins return deoxygenated blood back to it under lower pressure.
              The walls of arteries are thicker and more elastic to handle that
              pressure — see{' '}
              <Citation label="Ch 4 · diagram 2" /> for the cross-section.
            </>
          }
        />
        <Bubble
          role="user"
          content="Perfect. Turn this into 8 flashcards."
        />
        <Bubble
          role="mage"
          content={
            <>
              Creating 8 flashcards from Ch 4 now…
              <div
                style={{
                  marginTop: 14,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                }}
              >
                {[
                  'Artery wall structure',
                  'Vein valves & flow',
                  'Capillary exchange',
                  '+ 5 more',
                ].map((chip) => (
                  <span
                    key={chip}
                    style={{
                      padding: '5px 12px',
                      borderRadius: 'var(--radius-full)',
                      background: 'rgba(255, 222, 89, 0.14)',
                      border: '1px solid rgba(255, 222, 89, 0.3)',
                      fontSize: 11,
                      color: '#ffe487',
                      fontFamily: 'var(--font-brand)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            </>
          }
        />
      </div>

      {/* Input */}
      <div
        style={{
          marginTop: 28,
          padding: '14px 18px',
          borderRadius: 'var(--radius-lg)',
          background: 'rgba(8, 8, 22, 0.7)',
          border: '1px solid rgba(174, 137, 255, 0.2)',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 20, color: 'var(--primary)' }}
        >
          attach_file
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 14,
            color: 'rgba(237, 233, 255, 0.4)',
            fontFamily: 'var(--font-sans)',
            textAlign: 'left',
          }}
        >
          Ask anything about your notes…
        </span>
        <span
          style={{
            width: 36,
            height: 36,
            borderRadius: 'var(--radius-md)',
            background:
              'linear-gradient(135deg, #ae89ff 0%, #8c52ff 100%)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 4px 12px rgba(174, 137, 255, 0.4)',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18, color: '#fff' }}
          >
            send
          </span>
        </span>
      </div>
    </div>
  );
}

function Bubble({
  role,
  content,
}: {
  role: 'user' | 'mage';
  content: React.ReactNode;
}) {
  const isUser = role === 'user';
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
      }}
    >
      <div
        style={{
          maxWidth: '86%',
          padding: '14px 18px',
          borderRadius: isUser
            ? 'var(--radius-xl) var(--radius-xl) 6px var(--radius-xl)'
            : 'var(--radius-xl) var(--radius-xl) var(--radius-xl) 6px',
          background: isUser
            ? 'linear-gradient(135deg, rgba(255, 222, 89, 0.12) 0%, rgba(255, 222, 89, 0.06) 100%)'
            : 'rgba(255, 255, 255, 0.04)',
          border: isUser
            ? '1px solid rgba(255, 222, 89, 0.28)'
            : '1px solid rgba(174, 137, 255, 0.2)',
          fontSize: 14,
          lineHeight: 1.6,
          color: isUser ? '#ffe487' : 'rgba(237, 233, 255, 0.85)',
          fontFamily: 'var(--font-sans)',
        }}
      >
        {content}
      </div>
    </div>
  );
}

function Citation({ label }: { label: string }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 8px',
        borderRadius: 'var(--radius-full)',
        background: 'rgba(174, 137, 255, 0.18)',
        border: '1px solid rgba(174, 137, 255, 0.35)',
        fontSize: 11,
        color: 'var(--primary)',
        fontFamily: 'var(--font-brand)',
        letterSpacing: '0.05em',
        fontWeight: 600,
        verticalAlign: 'middle',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 11 }}>
        menu_book
      </span>
      {label}
    </span>
  );
}
