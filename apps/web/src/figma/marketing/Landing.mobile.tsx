'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbMobileFrame, Sparkle, mkt } from './shell';

/**
 * Landing — mobile reflow (derived; no Figma mobile frame exists).
 * Single-column 393px layout: logo pill → hero headline → simplified hero card
 * (stacked input + button + compact dropzone) → chip row → 5 feature cards
 * (vertical, no trail) → final CTA → compact footer.
 */
export default function LandingMobile() {
  const router = useRouter();
  const [link, setLink] = useState('');

  const goCreate = () => router.push('/figma/marketing/link-bridge');
  const goBrowse = () => router.push('/figma/marketing/link-bridge');

  return (
    <OnbMobileFrame>
      {/* ── Mini top bar ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '14px 20px 0',
        }}
      >
        <Mage pose="logo-color" size={110} alt="NoteMage" priority />
        <button
          type="button"
          onClick={() => router.push('/figma/marketing/login')}
          className={mkt.tapPill}
          style={{
            height: 38,
            padding: '0 16px',
            borderRadius: 99,
            border: `1.4px solid ${ONB.line}`,
            background: ONB.white,
            color: ONB.muted,
            fontFamily: ONB.font,
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Log in
        </button>
      </div>

      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section style={{ padding: '32px 20px 0', textAlign: 'center', position: 'relative' }}>
        {/* decorative sparkles */}
        <Sparkle size={20} color={ONB.gold} rotate={-15} style={{ position: 'absolute', left: 20, top: 10 }} />
        <Sparkle size={14} color={ONB.primary} rotate={10} style={{ position: 'absolute', right: 22, top: 20 }} />

        <h1
          style={{
            margin: 0,
            color: ONB.ink,
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 32,
            lineHeight: 1.1,
            letterSpacing: '-0.8px',
          }}
        >
          Turn anything into a learning path.
        </h1>
        <p
          style={{
            margin: '14px 0 0',
            color: ONB.muted,
            fontFamily: ONB.font,
            fontSize: 16,
            lineHeight: 1.55,
          }}
        >
          Paste a YouTube link or drop your PDF, slides, or notes. Mage builds your path in minutes.
        </p>
      </section>

      {/* ── Compact hero card ────────────────────────────────────────── */}
      <div
        style={{
          margin: '24px 16px 0',
          borderRadius: 22,
          border: `1.4px solid ${ONB.line}`,
          background: ONB.white,
          boxShadow: '0px 4px 14px rgba(26,19,48,0.06), 0px 14px 36px rgba(124,92,255,0.14)',
          padding: '20px',
        }}
      >
        {/* Link input */}
        <div
          style={{
            height: 54,
            borderRadius: 14,
            border: `1.2px solid ${ONB.line}`,
            background: '#f6f2ea',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '0 14px',
            boxSizing: 'border-box',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 20, color: ONB.primaryInk, flexShrink: 0 }}
          >
            play_circle
          </span>
          <input
            type="url"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="Paste a YouTube link…"
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              color: ONB.ink,
              fontFamily: ONB.font,
              fontSize: 15,
              fontWeight: 500,
              outline: 'none',
            }}
          />
        </div>

        {/* CTA button — full width on mobile */}
        <button
          type="button"
          onClick={goCreate}
          className={mkt.tapPill}
          style={{
            width: '100%',
            height: 54,
            borderRadius: 14,
            border: 'none',
            background: ONB.primary,
            color: ONB.white,
            fontFamily: ONB.font,
            fontSize: 16,
            fontWeight: 600,
            boxShadow: ONB.btnShadow,
            cursor: 'pointer',
            marginTop: 10,
            boxSizing: 'border-box',
          }}
        >
          Create my path
        </button>

        {/* "or" divider */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            margin: '16px 0',
          }}
        >
          <span style={{ flex: 1, height: 1.2, background: ONB.paperLine, display: 'block' }} />
          <span
            style={{
              color: ONB.muted2,
              fontFamily: ONB.font,
              fontSize: 13,
              fontWeight: 500,
            }}
          >
            or
          </span>
          <span style={{ flex: 1, height: 1.2, background: ONB.paperLine, display: 'block' }} />
        </div>

        {/* Compact dropzone */}
        <div
          style={{
            borderRadius: 14,
            border: `1.6px dashed ${ONB.paperLine}`,
            background: '#fbf9f4',
            padding: '16px 16px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 22, color: ONB.primaryInk, flexShrink: 0 }}
            >
              upload_file
            </span>
            <p
              style={{
                margin: 0,
                color: ONB.ink,
                fontFamily: ONB.font,
                fontSize: 14,
                fontWeight: 600,
                lineHeight: 1.3,
              }}
            >
              Drop a PDF, slides,
              <br />
              <span style={{ color: ONB.muted, fontWeight: 400, fontSize: 13 }}>or click to browse</span>
            </p>
          </div>
          <button
            type="button"
            onClick={goBrowse}
            className={mkt.tapPill}
            style={{
              flexShrink: 0,
              height: 40,
              padding: '0 16px',
              borderRadius: 12,
              border: `1.4px solid ${ONB.paperLine}`,
              background: 'transparent',
              color: ONB.primary,
              fontFamily: ONB.font,
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Browse
          </button>
        </div>
      </div>

      {/* ── Helper text ──────────────────────────────────────────────── */}
      <p
        style={{
          margin: '12px 0 0',
          textAlign: 'center',
          color: ONB.muted2,
          fontFamily: ONB.font,
          fontSize: 13,
          fontWeight: 500,
        }}
      >
        No sign-up needed to try
      </p>

      {/* ── Source chips ─────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexWrap: 'wrap',
          gap: 8,
          margin: '14px 20px 0',
        }}
      >
        {['YouTube', 'PDF', 'Slides', 'Notes', 'Images'].map((chip) => (
          <span
            key={chip}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 30,
              padding: '0 12px',
              borderRadius: 99,
              border: `1.2px solid ${ONB.line}`,
              background: ONB.white,
              color: ONB.muted,
              fontFamily: ONB.font,
              fontSize: 12.5,
              fontWeight: 500,
            }}
          >
            {chip}
          </span>
        ))}
      </div>

      {/* ── Feature cards stacked vertically ────────────────────────── */}
      <section style={{ padding: '40px 16px 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {FEATURE_CARDS_MOBILE.map((card, i) => (
            <MobileFeatureCard key={i} card={card} />
          ))}
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────────────────────── */}
      <section
        style={{
          textAlign: 'center',
          padding: '52px 20px 48px',
          position: 'relative',
        }}
      >
        <Sparkle size={20} color={ONB.gold} rotate={18} style={{ position: 'absolute', left: 30, top: 30 }} />
        <Sparkle size={14} color={ONB.primary} rotate={-10} style={{ position: 'absolute', right: 28, top: 44 }} />

        <h2
          style={{
            margin: 0,
            color: ONB.ink,
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 32,
            letterSpacing: '-0.7px',
            lineHeight: 1.1,
          }}
        >
          Try it out for{' '}
          <span style={{ color: ONB.primary }}>FREE</span>
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 28 }}>
          <button
            type="button"
            onClick={goCreate}
            className={mkt.tapPill}
            style={{
              height: 56,
              width: '100%',
              borderRadius: 16,
              border: 'none',
              background: ONB.primary,
              color: ONB.white,
              fontFamily: ONB.font,
              fontSize: 16,
              fontWeight: 600,
              boxShadow: ONB.btnShadow,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxSizing: 'border-box',
            }}
          >
            Start free
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_forward</span>
          </button>
          <button
            type="button"
            onClick={() => router.push('/figma/marketing/pricing')}
            className={mkt.tapPill}
            style={{
              height: 56,
              width: '100%',
              borderRadius: 16,
              border: `1.6px solid ${ONB.line}`,
              background: ONB.white,
              color: ONB.ink,
              fontFamily: ONB.font,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
              boxSizing: 'border-box',
            }}
          >
            See pricing
          </button>
        </div>
      </section>

      {/* ── Compact footer ───────────────────────────────────────────── */}
      <footer
        style={{
          borderTop: `1px solid ${ONB.line}`,
          padding: '28px 20px 40px',
          textAlign: 'center',
        }}
      >
        <Mage pose="logo-color" size={110} alt="NoteMage" />
        <p
          style={{
            margin: '12px 0 0',
            color: ONB.muted2,
            fontFamily: ONB.font,
            fontSize: 13,
            fontWeight: 500,
          }}
        >
          © 2026 Notemage
        </p>
      </footer>
    </OnbMobileFrame>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Feature cards data + mobile card component
 * ──────────────────────────────────────────────────────────────────────── */

const FEATURE_CARDS_MOBILE = [
  {
    eyebrow: 'BRING ANYTHING',
    title: 'Upload your material',
    body: 'Drop a PDF, slides, notes, or images — or paste a YouTube link. Mage works straight from your own material.',
    bullets: ['PDFs, slides & images', 'Paste notes or a video link', 'No messy reformatting'],
    pose: 'default' as const,
  },
  {
    eyebrow: 'THE AHA MOMENT',
    title: 'Get your learning path',
    body: 'Mage turns your material into a multi-phase path — theory, quizzes, and checkpoints, all grounded in your sources.',
    bullets: ['Phased units & sections', 'Source-cited lessons', 'Built around your goal'],
    pose: 'thinking' as const,
  },
  {
    eyebrow: 'GUIDED SESSIONS',
    title: 'Study with Mage',
    body: 'Short, focused sessions: read a little, then Mage checks your understanding and explains every answer.',
    bullets: ['Bite-size lessons', 'Source-grounded answers', 'Ask Mage anything'],
    pose: 'flashcards' as const,
  },
  {
    eyebrow: 'WEAK-POINT TRAINING',
    title: 'Practise what you miss',
    body: 'Mage spots your weak points and brings them back at the right time — so you fix what actually trips you up.',
    bullets: ['Automatic weak-point tracking', 'A smart review queue', 'Flashcards & quizzes'],
    pose: 'wink' as const,
  },
  {
    eyebrow: 'STAY CONSISTENT',
    title: 'Stay on track until exam day',
    body: 'Daily goals, streaks, and an exam countdown keep you moving — right up to the day it counts.',
    bullets: ['Daily goals & streaks', 'Exam countdown', 'Gentle reminders'],
    pose: 'graduation' as const,
  },
] as const;

function MobileFeatureCard({
  card,
}: {
  card: (typeof FEATURE_CARDS_MOBILE)[number];
}) {
  return (
    <div
      style={{
        background: ONB.white,
        borderRadius: 20,
        border: `1.4px solid ${ONB.line}`,
        boxShadow: '0px 4px 16px rgba(58,46,102,0.07)',
        padding: '20px 20px 22px',
      }}
    >
      {/* Mage pose small header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 14,
        }}
      >
        <div>
          <p
            style={{
              margin: 0,
              color: ONB.primaryInk,
              fontFamily: ONB.font,
              fontSize: 11.5,
              fontWeight: 700,
              letterSpacing: '1px',
              lineHeight: 1.3,
            }}
          >
            {card.eyebrow}
          </p>
          <p
            style={{
              margin: '6px 0 0',
              color: ONB.ink,
              fontFamily: ONB.font,
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1.2,
            }}
          >
            {card.title}
          </p>
        </div>
        {/* Lavender Mage tile */}
        <div
          style={{
            flexShrink: 0,
            width: 72,
            height: 72,
            borderRadius: 18,
            background: ONB.lavender,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Mage pose={card.pose} size={58} alt={card.title} />
        </div>
      </div>

      <p
        style={{
          margin: 0,
          color: ONB.muted,
          fontFamily: ONB.font,
          fontSize: 14,
          fontWeight: 400,
          lineHeight: 1.55,
        }}
      >
        {card.body}
      </p>

      {/* Bullets */}
      <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {card.bullets.map((bullet, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
            <span
              style={{
                color: ONB.gold,
                fontFamily: ONB.font,
                fontSize: 12,
                fontWeight: 700,
                flexShrink: 0,
                marginTop: 1,
              }}
            >
              ✦
            </span>
            <span
              style={{
                color: ONB.ink,
                fontFamily: ONB.font,
                fontSize: 13.5,
                fontWeight: 500,
                lineHeight: 1.3,
              }}
            >
              {bullet}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
