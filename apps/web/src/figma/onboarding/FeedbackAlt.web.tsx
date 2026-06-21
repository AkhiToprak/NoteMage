'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbWebFrame } from './shell';

/**
 * 10b Feedback (alt) — INCORRECT state — web (Figma 48:22).
 * "Not quite yet." — centered single-column layout; red ✕ icon above heading;
 * Mage avatar + chat bubble; explanation card with red left-bar + source citation;
 * amber hint strip; "Try again" (primary) + "Reveal answer" (ghost outline) side by side.
 * Continue (Try again) → /figma/onboarding/11-weak-point.
 */
export default function FeedbackAltWeb() {
  const router = useRouter();
  const [revealed, setRevealed] = useState(false);

  return (
    <OnbWebFrame>
      {/* Top nav — logo only (no nav links on feedback screens per Figma) */}
      <header
        style={{
          padding: '46px 64px 0',
          maxWidth: 1440,
          marginInline: 'auto',
        }}
      >
        <Mage pose="logo-color" size={150} alt="NoteMage" priority />
      </header>

      {/* Center column — vertically centered on page */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flex: 1, minHeight: 0,
          padding: '40px 64px 60px',
        }}
      >
      <div
        style={{
          maxWidth: 720,
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 0,
        }}
      >
        {/* Red ✕ circle */}
        <div
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            background: '#ef6351',
            boxShadow: '0px 10px 12px rgba(239,99,81,0.38)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 22,
          }}
        >
          <span
            style={{
              color: ONB.white,
              fontSize: 34,
              fontWeight: 700,
              fontFamily: ONB.font,
              lineHeight: 1,
            }}
          >
            ✕
          </span>
        </div>

        {/* Headline */}
        <h1
          style={{
            margin: '0 0 42px',
            color: '#b23423',
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 42,
            lineHeight: 1.3,
            letterSpacing: '-0.84px',
            textAlign: 'center',
            width: 700,
          }}
        >
          Not quite yet.
        </h1>

        {/* Mage avatar + chat bubble */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            width: '100%',
            maxWidth: 640,
            marginBottom: 22,
          }}
        >
          {/* Avatar */}
          <div
            style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              background: ONB.lavender,
              border: `2px solid ${ONB.white}`,
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <Mage pose="thinking" size={50} alt="Mage" />
          </div>
          {/* Bubble */}
          <div
            style={{
              flex: 1,
              background: ONB.white,
              border: `1px solid ${ONB.line}`,
              borderRadius: 18,
              padding: '14px 17px',
              boxShadow: '0px 5px 7px rgba(58,46,102,0.07)',
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: ONB.font,
                fontWeight: 500,
                fontSize: 16,
                lineHeight: 1.38,
                color: ONB.ink,
                whiteSpace: 'nowrap',
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
            width: '100%',
            maxWidth: 640,
            background: ONB.white,
            border: `1.2px solid ${ONB.line}`,
            borderRadius: 22,
            overflow: 'hidden',
            boxShadow: '0px 8px 24px rgba(58,46,102,0.08)',
            padding: '27px 31px 27px 36px',
            marginBottom: 18,
          }}
        >
          {/* Red left bar */}
          <div
            style={{
              position: 'absolute',
              left: -1.2,
              top: -1.2,
              width: 5,
              bottom: -1.2,
              borderRadius: 2,
              background: '#ef6351',
            }}
          />
          {/* Label */}
          <p
            style={{
              margin: '0 0 12px',
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 14,
              lineHeight: 1.3,
              letterSpacing: '0.14px',
              color: '#b23423',
            }}
          >
            {"Here's the difference"}
          </p>
          {/* Body */}
          <p
            style={{
              margin: '0 0 26px',
              fontFamily: ONB.font,
              fontWeight: 400,
              fontSize: 17,
              lineHeight: 1.52,
              color: ONB.ink,
              maxWidth: 576,
            }}
          >
            A row is one record. A column is one type of information, like name or date.
          </p>
          {/* Citation pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 9,
              background: '#f3ede1',
              border: `1px solid ${ONB.line}`,
              borderRadius: 17,
              padding: '0 14px',
              height: 34,
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 14, height: 17, flexShrink: 0 }}>
              <svg width="14" height="17" viewBox="0 0 14 17" fill="none" aria-hidden>
                <rect x="0.8" y="0.8" width="12.4" height="15.4" rx="2" stroke="#6b7280" strokeWidth="1.6" />
                <rect x="4" y="6" width="7" height="1.6" rx="0.8" fill="#6b7280" />
                <rect x="4" y="10" width="7" height="1.6" rx="0.8" fill="#6b7280" />
              </svg>
            </span>
            <span
              style={{
                fontFamily: ONB.font,
                fontWeight: 600,
                fontSize: 13.5,
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
            width: '100%',
            maxWidth: 640,
            display: 'flex',
            alignItems: 'center',
            background: '#fcefd9',
            borderRadius: 16,
            padding: '0 22px',
            height: 52,
            marginBottom: 32,
            gap: 12,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 20,
              color: '#8a5a12',
              flexShrink: 0,
            }}
          >
            lightbulb
          </span>
          <p
            style={{
              margin: 0,
              fontFamily: ONB.font,
              fontWeight: 500,
              fontSize: 15,
              lineHeight: 1.4,
              color: '#8a5a12',
            }}
          >
            Hint: Think of one row as one item in the table.
          </p>
        </div>

        {/* Action row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            width: '100%',
            maxWidth: 640,
          }}
        >
          {/* Try again — primary */}
          <button
            type="button"
            onClick={() => router.push('/figma/onboarding/11-weak-point')}
            style={{
              flex: '0 0 300px',
              height: 58,
              borderRadius: 16,
              background: ONB.primary,
              color: ONB.white,
              border: 'none',
              cursor: 'pointer',
              fontFamily: ONB.font,
              fontWeight: 600,
              fontSize: 17,
              boxShadow: '0px 12px 28px rgba(124,92,255,0.34)',
              transition: 'opacity 0.2s ease, transform 0.2s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.9'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
          >
            Try again
          </button>

          {/* Reveal answer — ghost outline */}
          <button
            type="button"
            onClick={() => setRevealed(!revealed)}
            style={{
              flex: '0 0 200px',
              height: 58,
              borderRadius: 16,
              background: 'transparent',
              border: `1.6px solid ${ONB.paperLine}`,
              cursor: 'pointer',
              fontFamily: ONB.font,
              fontWeight: 600,
              fontSize: 17,
              color: ONB.primary,
              transition: 'opacity 0.2s ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.7'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
          >
            Reveal answer
          </button>
        </div>

        {/* Revealed answer (mock state only) */}
        {revealed && (
          <div
            style={{
              marginTop: 20,
              width: '100%',
              maxWidth: 640,
              background: ONB.greenSoft,
              border: `1.2px solid ${ONB.green}`,
              borderRadius: 16,
              padding: '16px 20px',
            }}
          >
            <p
              style={{
                margin: 0,
                fontFamily: ONB.font,
                fontWeight: 600,
                fontSize: 15,
                color: ONB.green,
              }}
            >
              Answer: A row is one record (one item). A column is one field (one type of data).
            </p>
          </div>
        )}
      </div>
      </div>
    </OnbWebFrame>
  );
}
