'use client';

import { useState } from 'react';
import LandingNavbar from '@/components/landing/LandingNavbar';
import LandingFooter from '@/components/landing/LandingFooter';

const TOPICS = [
  { value: 'bug', label: 'Bug report' },
  { value: 'feature', label: 'Feature idea' },
  { value: 'general', label: 'Just saying hi' },
  { value: 'other', label: 'Something else' },
];

const CONTACT_EMAIL = 'notemage.app@gmail.com';

export default function ContactPage() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [topic, setTopic] = useState('bug');
  const [message, setMessage] = useState('');
  const [focusedField, setFocusedField] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;

    const topicLabel =
      TOPICS.find((t) => t.value === topic)?.label ?? 'Message';
    const subject = `[${topicLabel}] From ${name.trim() || 'Notemage'}`;
    const body = [
      `Name: ${name || '(not provided)'}`,
      `Reply-to: ${email || '(not provided)'}`,
      `Topic: ${topicLabel}`,
      '',
      '---',
      '',
      message,
    ].join('\n');

    const mailto = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      subject,
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  };

  const baseField: React.CSSProperties = {
    width: '100%',
    padding: '14px 18px',
    borderRadius: 'var(--radius-md)',
    background: 'rgba(22, 22, 48, 0.72)',
    border: '1px solid rgba(140, 82, 255, 0.22)',
    color: 'var(--on-surface)',
    fontSize: 15,
    fontFamily: 'var(--font-sans)',
    outline: 'none',
    transition:
      'border-color 0.35s cubic-bezier(0.22, 1, 0.36, 1), background 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
  };

  const focusedField_s = (id: string): React.CSSProperties =>
    focusedField === id
      ? {
          borderColor: 'rgba(174, 137, 255, 0.7)',
          background: 'rgba(28, 28, 56, 0.85)',
          boxShadow:
            '0 0 0 4px rgba(174, 137, 255, 0.14), 0 8px 24px rgba(174, 137, 255, 0.12)',
        }
      : {};

  const label: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--font-brand)',
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: '0.2em',
    textTransform: 'uppercase',
    color: 'var(--primary)',
    marginBottom: 10,
  };

  return (
    <main
      className="nm-contact"
      style={{
        position: 'relative',
        background: '#09081a',
        color: '#ede9ff',
        fontFamily: 'var(--font-sans)',
        minHeight: '100vh',
        overflow: 'hidden',
      }}
    >
      <LandingNavbar />

      {/* ───────────── HERO ───────────── */}
      <section
        style={{
          position: 'relative',
          paddingTop: 180,
          paddingBottom: 60,
          overflow: 'hidden',
        }}
      >
        {/* Radial glows */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: [
              'radial-gradient(900px 700px at 50% -10%, rgba(140, 82, 255, 0.16) 0%, transparent 55%)',
              'radial-gradient(600px 480px at 88% 10%, rgba(255, 222, 89, 0.07) 0%, transparent 60%)',
              'radial-gradient(420px 380px at 6% 85%, rgba(81, 112, 255, 0.09) 0%, transparent 60%)',
            ].join(','),
          }}
        />
        {/* Grain */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            opacity: 0.05,
            mixBlendMode: 'overlay',
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='240' height='240'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        {/* Sparkles */}
        {[
          { top: '28%', left: '14%', size: 16, delay: '0s' },
          { top: '66%', left: '10%', size: 12, delay: '1.4s' },
          { top: '32%', left: '84%', size: 18, delay: '0.8s' },
          { top: '72%', left: '86%', size: 14, delay: '2.2s' },
        ].map((s, i) => (
          <div
            key={i}
            aria-hidden
            style={{
              position: 'absolute',
              top: s.top,
              left: s.left,
              width: s.size,
              height: s.size,
              animation: `nm-contact-twinkle 3.6s ease-in-out infinite ${s.delay}`,
              pointerEvents: 'none',
            }}
          >
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 0 L13.5 10.5 L24 12 L13.5 13.5 L12 24 L10.5 13.5 L0 12 L10.5 10.5 Z"
                fill="#ffde59"
              />
            </svg>
          </div>
        ))}

        <div
          style={{
            position: 'relative',
            zIndex: 2,
            maxWidth: 960,
            margin: '0 auto',
            padding: '0 32px',
            textAlign: 'center',
          }}
        >
          {/* Eyebrow */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 10,
              padding: '8px 18px',
              borderRadius: 'var(--radius-full)',
              background:
                'linear-gradient(135deg, rgba(174, 137, 255, 0.18) 0%, rgba(255, 222, 89, 0.12) 100%)',
              border: '1px solid rgba(174, 137, 255, 0.3)',
              marginBottom: 40,
              backdropFilter: 'blur(10px)',
              WebkitBackdropFilter: 'blur(10px)',
            }}
          >
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 16, color: 'var(--tertiary-container)' }}
            >
              mail
            </span>
            <span
              style={{
                fontFamily: 'var(--font-brand)',
                fontSize: 12,
                fontWeight: 600,
                letterSpacing: '0.2em',
                textTransform: 'uppercase',
                color: 'var(--on-surface)',
              }}
            >
              Contact
            </span>
          </div>

          {/* Headline */}
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(56px, 10vw, 132px)',
              fontWeight: 800,
              letterSpacing: '-0.035em',
              lineHeight: 0.95,
              margin: 0,
              color: 'var(--on-surface)',
            }}
          >
            Say{' '}
            <span style={{ position: 'relative', display: 'inline-block' }}>
              hi
              <span style={{ color: 'var(--tertiary-container)' }}>.</span>
              {/* Brush-stroke underline */}
              <svg
                aria-hidden
                viewBox="0 0 200 24"
                preserveAspectRatio="none"
                style={{
                  position: 'absolute',
                  left: '-4%',
                  right: 0,
                  bottom: '-0.18em',
                  width: '108%',
                  height: '0.22em',
                  pointerEvents: 'none',
                }}
              >
                <path
                  d="M4 14 C 44 4, 84 22, 124 10 S 188 6, 196 14"
                  fill="none"
                  stroke="#ffde59"
                  strokeWidth="5"
                  strokeLinecap="round"
                  opacity="0.9"
                />
              </svg>
            </span>
          </h1>

          {/* Subtitle */}
          <p
            style={{
              maxWidth: 620,
              margin: '44px auto 0',
              fontSize: 19,
              lineHeight: 1.6,
              color: 'rgba(237, 233, 255, 0.72)',
              fontFamily: 'var(--font-sans)',
            }}
          >
            Found a bug? Got a feature idea? Just want to chat? Drop a line and
            I&apos;ll get back to you as soon as I can.
          </p>
        </div>
      </section>

      {/* ───────────── FORM ───────────── */}
      <section
        style={{
          position: 'relative',
          padding: '40px 32px 120px',
        }}
      >
        {/* Ambient side glows */}
        <div
          aria-hidden
          style={{
            position: 'absolute',
            top: '0%',
            left: '-10%',
            width: 600,
            height: 600,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(174, 137, 255, 0.08) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />
        <div
          aria-hidden
          style={{
            position: 'absolute',
            bottom: '10%',
            right: '-8%',
            width: 500,
            height: 500,
            borderRadius: '50%',
            background:
              'radial-gradient(circle, rgba(255, 222, 89, 0.05) 0%, transparent 70%)',
            pointerEvents: 'none',
          }}
        />

        <div
          style={{
            position: 'relative',
            maxWidth: 680,
            margin: '0 auto',
          }}
        >
          {/* Glass form panel */}
          <form
            onSubmit={handleSubmit}
            style={{
              position: 'relative',
              padding: '48px 44px',
              borderRadius: 'var(--radius-xl)',
              background:
                'linear-gradient(180deg, rgba(28, 28, 56, 0.72) 0%, rgba(22, 22, 48, 0.6) 100%)',
              border: '1px solid rgba(140, 82, 255, 0.22)',
              backdropFilter: 'blur(24px) saturate(140%)',
              WebkitBackdropFilter: 'blur(24px) saturate(140%)',
              boxShadow:
                '0 32px 64px rgba(174,137,255,0.08), 0 8px 24px rgba(0,0,0,0.4)',
            }}
            className="nm-contact-form"
          >
            {/* Small header inside card */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                marginBottom: 36,
                paddingBottom: 24,
                borderBottom: '1px solid rgba(140, 82, 255, 0.18)',
              }}
            >
              <div
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 'var(--radius-md)',
                  background:
                    'linear-gradient(135deg, rgba(174, 137, 255, 0.25) 0%, rgba(255, 222, 89, 0.14) 100%)',
                  border: '1px solid rgba(174, 137, 255, 0.32)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--tertiary-container)',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                  edit_note
                </span>
              </div>
              <div>
                <div
                  style={{
                    fontFamily: 'var(--font-display)',
                    fontSize: 22,
                    fontWeight: 700,
                    letterSpacing: '-0.018em',
                    color: 'var(--on-surface)',
                  }}
                >
                  Write me a message
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: 'rgba(237, 233, 255, 0.55)',
                    marginTop: 2,
                  }}
                >
                  Goes straight to{' '}
                  <span
                    style={{
                      fontFamily: 'var(--font-brand)',
                      letterSpacing: '0.04em',
                      color: 'var(--primary)',
                    }}
                  >
                    {CONTACT_EMAIL}
                  </span>
                </div>
              </div>
            </div>

            {/* Name + Email row */}
            <div
              className="nm-contact-row"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 20,
                marginBottom: 22,
              }}
            >
              <div>
                <label htmlFor="nm-name" style={label}>
                  Your name
                </label>
                <input
                  id="nm-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onFocus={() => setFocusedField('name')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
                  style={{ ...baseField, ...focusedField_s('name') }}
                />
              </div>
              <div>
                <label htmlFor="nm-email" style={label}>
                  Email
                </label>
                <input
                  id="nm-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={() => setFocusedField('email')}
                  onBlur={() => setFocusedField(null)}
                  placeholder="ada@example.com"
                  autoComplete="email"
                  style={{ ...baseField, ...focusedField_s('email') }}
                />
              </div>
            </div>

            {/* Topic chips */}
            <div style={{ marginBottom: 22 }}>
              <div style={label}>What&apos;s this about?</div>
              <div
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                {TOPICS.map((t) => {
                  const active = topic === t.value;
                  return (
                    <button
                      key={t.value}
                      type="button"
                      onClick={() => setTopic(t.value)}
                      style={{
                        padding: '10px 18px',
                        borderRadius: 'var(--radius-full)',
                        background: active
                          ? 'linear-gradient(135deg, rgba(174, 137, 255, 0.28) 0%, rgba(255, 222, 89, 0.18) 100%)'
                          : 'rgba(22, 22, 48, 0.6)',
                        border: active
                          ? '1px solid rgba(174, 137, 255, 0.55)'
                          : '1px solid rgba(140, 82, 255, 0.22)',
                        color: active
                          ? 'var(--on-surface)'
                          : 'rgba(237, 233, 255, 0.72)',
                        fontFamily: 'var(--font-sans)',
                        fontSize: 13,
                        fontWeight: 600,
                        letterSpacing: '0.01em',
                        cursor: 'pointer',
                        transition:
                          'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), background 0.35s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.35s cubic-bezier(0.22, 1, 0.36, 1), color 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
                        boxShadow: active
                          ? '0 6px 20px rgba(174, 137, 255, 0.18)'
                          : 'none',
                      }}
                      onMouseEnter={(e) => {
                        if (!active) {
                          e.currentTarget.style.transform = 'translateY(-1px)';
                          e.currentTarget.style.borderColor =
                            'rgba(174, 137, 255, 0.4)';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!active) {
                          e.currentTarget.style.transform = 'translateY(0)';
                          e.currentTarget.style.borderColor =
                            'rgba(140, 82, 255, 0.22)';
                        }
                      }}
                    >
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message */}
            <div style={{ marginBottom: 32 }}>
              <label htmlFor="nm-message" style={label}>
                Message
              </label>
              <textarea
                id="nm-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onFocus={() => setFocusedField('message')}
                onBlur={() => setFocusedField(null)}
                placeholder="Tell me what's on your mind…"
                rows={7}
                required
                style={{
                  ...baseField,
                  ...focusedField_s('message'),
                  resize: 'vertical',
                  minHeight: 160,
                  lineHeight: 1.6,
                  fontFamily: 'var(--font-sans)',
                }}
              />
            </div>

            {/* Submit */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 16,
                flexWrap: 'wrap',
              }}
              className="nm-contact-submit-row"
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: 'rgba(237, 233, 255, 0.4)',
                  maxWidth: 260,
                  lineHeight: 1.5,
                }}
              >
                Opens your email client with everything prefilled — no magic
                tracking, I promise.
              </p>
              <button
                type="submit"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '14px 28px',
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--tertiary-container)',
                  color: '#2a2200',
                  fontSize: 15,
                  fontWeight: 700,
                  border: 'none',
                  cursor: 'pointer',
                  fontFamily: 'var(--font-sans)',
                  boxShadow:
                    '0 8px 24px rgba(255, 222, 89, 0.18), 0 2px 8px rgba(0,0,0,0.3)',
                  transition:
                    'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'translateY(-2px)';
                  e.currentTarget.style.boxShadow =
                    '0 16px 36px rgba(255, 222, 89, 0.28), 0 4px 12px rgba(0,0,0,0.4)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow =
                    '0 8px 24px rgba(255, 222, 89, 0.18), 0 2px 8px rgba(0,0,0,0.3)';
                }}
              >
                Send message
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 18 }}
                >
                  send
                </span>
              </button>
            </div>
          </form>

          {/* Direct email fallback */}
          <p
            style={{
              marginTop: 28,
              textAlign: 'center',
              fontSize: 13,
              color: 'rgba(237, 233, 255, 0.5)',
            }}
          >
            Prefer plain email? Write to{' '}
            <a
              href={`mailto:${CONTACT_EMAIL}`}
              style={{
                color: 'var(--tertiary-container)',
                textDecoration: 'underline',
                textDecorationColor: 'rgba(255, 222, 89, 0.4)',
                textUnderlineOffset: '3px',
                fontFamily: 'var(--font-brand)',
                letterSpacing: '0.04em',
              }}
            >
              {CONTACT_EMAIL}
            </a>
            .
          </p>
        </div>
      </section>

      <LandingFooter />

      <style jsx global>{`
        @keyframes nm-contact-twinkle {
          0%,
          100% {
            opacity: 0.25;
            transform: scale(0.9);
          }
          50% {
            opacity: 1;
            transform: scale(1.15);
          }
        }

        .nm-contact a:focus-visible,
        .nm-contact button:focus-visible,
        .nm-contact input:focus-visible,
        .nm-contact textarea:focus-visible {
          outline: 2px solid #ffde59;
          outline-offset: 3px;
          border-radius: 8px;
        }
        .nm-contact a:focus:not(:focus-visible),
        .nm-contact button:focus:not(:focus-visible) {
          outline: none;
        }

        .nm-contact input::placeholder,
        .nm-contact textarea::placeholder {
          color: rgba(237, 233, 255, 0.32);
        }

        @media (max-width: 640px) {
          .nm-contact .nm-contact-form {
            padding: 32px 24px !important;
          }
          .nm-contact .nm-contact-row {
            grid-template-columns: 1fr !important;
          }
        }
      `}</style>
    </main>
  );
}
