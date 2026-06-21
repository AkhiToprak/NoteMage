'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbMobileFrame } from './shell';

/**
 * 10b Feedback (alt) — INCORRECT state — mobile (Figma 27:34).
 * "Not quite yet." — red ✕ icon, Mage chat-bubble feedback, explanation card
 * with red left-bar, hint strip, "Try again" CTA + "Reveal answer" ghost link.
 * Continue (Try again) → /figma/onboarding/11-weak-point.
 */
export default function FeedbackAltMobile() {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);

  return (
    <OnbMobileFrame>
      {/* ── Status bar already rendered by OnbMobileFrame ── */}

      {/* Body scroll area */}
      <div
        style={{
          flex: '1 0 auto',
          display: 'flex',
          flexDirection: 'column',
          padding: '52px 24px 0',
          gap: 0,
          minHeight: 0,
        }}
      >
        {/* Header row: red ✕ circle + headline */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            marginBottom: 26,
          }}
        >
          {/* Red ✕ icon */}
          <div
            style={{
              width: 60,
              height: 60,
              borderRadius: 30,
              background: '#ef6351',
              boxShadow: '0px 8px 9px rgba(239,99,81,0.38)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                color: ONB.white,
                fontSize: 26,
                fontWeight: 700,
                fontFamily: ONB.font,
                lineHeight: 1,
                /* ✕ character */
              }}
            >
              ✕
            </span>
          </div>
          {/* Headline */}
          <h1
            style={{
              margin: 0,
              color: '#b23423',
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 30,
              lineHeight: 1.1,
              letterSpacing: '-0.6px',
            }}
          >
            Not quite yet.
          </h1>
        </div>

        {/* Mage chat bubble */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            marginBottom: 18,
          }}
        >
          {/* Mage avatar */}
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              background: ONB.lavender,
              border: `2px solid ${ONB.white}`,
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <Mage pose="thinking" size={44} alt="Mage" />
          </div>
          {/* Bubble */}
          <div
            style={{
              flex: 1,
              background: ONB.white,
              border: `1px solid ${ONB.line}`,
              borderRadius: 16,
              padding: '10px 13px',
              boxShadow: '0px 4px 6px rgba(58,46,102,0.06)',
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: ONB.font,
                fontWeight: 500,
                fontSize: 15,
                lineHeight: 1.34,
                color: ONB.ink,
              }}
            >
              Good attempt. You mixed up rows and columns.
            </p>
          </div>
        </div>

        {/* Explanation card */}
        <div
          style={{
            position: 'relative',
            background: ONB.white,
            border: `1.2px solid ${ONB.line}`,
            borderRadius: 22,
            overflow: 'hidden',
            boxShadow: '0px 5px 16px rgba(58,46,102,0.07)',
            padding: '17px 20px 20px 25px',
            marginBottom: 14,
          }}
        >
          {/* Red left bar */}
          <div
            style={{
              position: 'absolute',
              left: -1.2,
              top: -1.2,
              width: 4,
              bottom: -1.2,
              borderRadius: 2,
              background: '#ef6351',
            }}
          />
          {/* Label */}
          <p
            style={{
              margin: '0 0 8px',
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 13.5,
              lineHeight: 1.3,
              color: '#b23423',
            }}
          >
            {"Here's the difference"}
          </p>
          {/* Body text */}
          <p
            style={{
              margin: '0 0 20px',
              fontFamily: ONB.font,
              fontWeight: 400,
              fontSize: 15.5,
              lineHeight: 1.52,
              color: ONB.ink,
            }}
          >
            A row is one record. A column is one type of information, like name or date.
          </p>
          {/* Citation pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: '#f3ede1',
              border: `1px solid ${ONB.line}`,
              borderRadius: 15,
              padding: '0 12px',
              height: 30,
            }}
          >
            {/* Mini doc icon */}
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 13, height: 16, flexShrink: 0 }}>
              <svg width="13" height="16" viewBox="0 0 13 16" fill="none" aria-hidden>
                <rect x="0.75" y="0.75" width="11.5" height="14.5" rx="2" stroke="#6b7280" strokeWidth="1.5" />
                <rect x="4" y="6" width="6" height="1.4" rx="0.7" fill="#6b7280" />
                <rect x="4" y="9" width="6" height="1.4" rx="0.7" fill="#6b7280" />
              </svg>
            </span>
            <span
              style={{
                fontFamily: ONB.font,
                fontWeight: 600,
                fontSize: 12.5,
                lineHeight: 1.3,
                color: ONB.muted,
                whiteSpace: 'nowrap',
              }}
            >
              Source: Sample SQL Notes · page 2
            </span>
          </div>
        </div>

        {/* Hint strip */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 0,
            background: '#fcefd9',
            borderRadius: 16,
            overflow: 'hidden',
            minHeight: 62,
            marginBottom: 0,
            padding: '12px 16px',
          }}
        >
          {/* Lightbulb icon (Material Symbol) */}
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 18,
              color: '#8a5a12',
              flexShrink: 0,
              marginRight: 10,
              marginTop: 2,
            }}
          >
            lightbulb
          </span>
          <p
            style={{
              margin: 0,
              fontFamily: ONB.font,
              fontWeight: 500,
              fontSize: 13.5,
              lineHeight: 1.38,
              color: '#8a5a12',
            }}
          >
            Hint: Think of one row as one item in the table.
          </p>
        </div>
      </div>

      {/* Bottom actions — pinned to bottom */}
      <div
        style={{
          marginTop: 'auto',
          padding: '20px 24px 10px',
          display: 'flex',
          flexDirection: 'column',
          gap: 0,
          flexShrink: 0,
        }}
      >
        {/* Try again CTA */}
        <button
          type="button"
          onClick={() => router.push('/figma/onboarding/11-weak-point')}
          style={{
            width: '100%',
            height: 56,
            borderRadius: 18,
            background: ONB.primary,
            color: ONB.white,
            border: 'none',
            cursor: 'pointer',
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 17,
            letterSpacing: 0,
            boxShadow: '0px 10px 22px rgba(124,92,255,0.34)',
            transition: 'opacity 0.2s ease, transform 0.2s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.92'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        >
          Try again
        </button>

        {/* Reveal answer ghost */}
        <button
          type="button"
          onClick={() => setRevealed(!revealed)}
          style={{
            width: '100%',
            marginTop: 8,
            height: 40,
            background: 'transparent',
            border: 'none',
            cursor: 'pointer',
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 16,
            color: ONB.primary,
            textAlign: 'center',
            transition: 'opacity 0.2s ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        >
          Reveal answer
        </button>
      </div>
    </OnbMobileFrame>
  );
}
