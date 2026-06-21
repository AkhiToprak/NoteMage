'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbWebFrame, onb } from './shell';

/**
 * 09 Quiz — web (Figma 48:18). 1440-designed cream canvas.
 * Left top: logo + back arrow · "Question N of 3" label + 3-segment bar +
 * Mage sticker top-right · question heading · source citation chip ·
 * four A–D answer option cards · "Check answer" CTA.
 *
 * Interaction: tap any option to select it (purple ring + lavender fill);
 * "Check answer" is disabled until a selection is made; submits → 10-feedback.
 * Back → 08-study-session.
 */

type Option = 'A' | 'B' | 'C' | 'D';

const OPTIONS: { id: Option; label: string }[] = [
  { id: 'A', label: 'A single record' },
  { id: 'B', label: 'A column name' },
  { id: 'C', label: 'A database password' },
  { id: 'D', label: 'A relationship between tables' },
];

/** Inline radio-button circle — filled (selected) or empty ring (unselected). */
function RadioCircle({ selected }: { selected: boolean }) {
  return (
    <div
      style={{
        width: 26,
        height: 26,
        borderRadius: 13,
        border: selected ? 'none' : `1.8px solid ${ONB.paperLine}`,
        background: selected ? ONB.primary : 'transparent',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      {selected && (
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: 5,
            background: ONB.white,
          }}
        />
      )}
    </div>
  );
}

/** Single answer option card. */
function AnswerCard({
  id,
  label,
  selected,
  onSelect,
}: {
  id: Option;
  label: string;
  selected: boolean;
  onSelect: (id: Option) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      className={onb.tap}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: 68,
        borderRadius: 18,
        border: selected ? `2px solid ${ONB.primary}` : `1.4px solid ${ONB.line}`,
        background: selected ? ONB.lavender : ONB.white,
        boxShadow: selected ? 'none' : '0px 8px 24px rgba(58,46,102,0.08)',
        padding: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Letter badge */}
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 11,
          background: selected ? ONB.primary : ONB.lavender,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginLeft: 14,
          transition: 'background 0.15s',
        }}
      >
        <span
          style={{
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 16,
            color: selected ? ONB.white : ONB.primaryInk,
            lineHeight: 1,
          }}
        >
          {id}
        </span>
      </div>

      {/* Answer text */}
      <span
        style={{
          marginLeft: 16,
          flex: 1,
          fontFamily: ONB.font,
          fontWeight: 500,
          fontSize: 17,
          color: ONB.ink,
          lineHeight: 1.3,
        }}
      >
        {label}
      </span>

      {/* Radio indicator */}
      <div style={{ marginRight: 18 }}>
        <RadioCircle selected={selected} />
      </div>
    </button>
  );
}

export default function QuizWeb() {
  const router = useRouter();
  const [selected, setSelected] = useState<Option | null>(null);

  return (
    <OnbWebFrame>
      {/* Full-page centered column, max 1080px content */}
      <div
        style={{
          maxWidth: 1080,
          marginInline: 'auto',
          padding: '46px 64px 80px',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* ── Top bar: logo ── */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 56 }}>
          <Mage pose="logo-color" size={132} alt="NoteMage" priority />
        </div>

        {/* ── Header row: back + "Question N of 3" + progress bar + Mage sticker ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            marginBottom: 12,
          }}
        >
          {/* Back button */}
          <button
            type="button"
            onClick={() => router.push('/figma/onboarding/08-study-session')}
            aria-label="Go back"
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              background: ONB.white,
              border: `1px solid ${ONB.line}`,
              boxShadow: '0px 4px 5px rgba(58,46,102,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: ONB.ink }}>
              arrow_back
            </span>
          </button>

          {/* "Question N of 3" label */}
          <span
            style={{
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 15,
              color: ONB.muted,
              letterSpacing: '0.3px',
              whiteSpace: 'nowrap',
            }}
          >
            Question 1 of 3
          </span>

          {/* 3-segment progress bar */}
          <div style={{ flex: 1, display: 'flex', gap: 8 }}>
            {[true, false, false].map((active, i) => (
              <div
                key={i}
                style={{
                  flex: 1,
                  height: 7,
                  borderRadius: 3.5,
                  background: active ? ONB.primary : ONB.line,
                }}
              />
            ))}
          </div>

          {/* Mage sticker */}
          <div style={{ width: 72, height: 72, flexShrink: 0 }}>
            <Mage pose="quizzing" size={72} alt="Mage" />
          </div>
        </div>

        {/* ── Question prompt ── */}
        <h2
          style={{
            margin: '28px 0 0',
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 30,
            lineHeight: 1.22,
            letterSpacing: '-0.3px',
            color: ONB.ink,
            maxWidth: 630,
          }}
        >
          What does a row usually represent in a database table?
        </h2>

        {/* ── Source citation chip ── */}
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 20,
            height: 34,
            borderRadius: 17,
            border: `1px solid ${ONB.line}`,
            background: '#f3ede1',
            padding: '0 14px',
          }}
        >
          {/* Mini doc icon */}
          <svg width={14} height={17} viewBox="0 0 14 17" fill="none" aria-hidden style={{ flexShrink: 0 }}>
            <rect x={1} y={1} width={12} height={15} rx={2} stroke={ONB.muted} strokeWidth={1.6} />
            <rect x={4} y={6} width={7} height={1.6} rx={1} fill={ONB.muted} />
            <rect x={4} y={10} width={7} height={1.6} rx={1} fill={ONB.muted} />
          </svg>
          <span
            style={{
              fontFamily: ONB.font,
              fontWeight: 600,
              fontSize: 13.5,
              color: ONB.muted,
              whiteSpace: 'nowrap',
            }}
          >
            Based on: Sample SQL Notes · page 2
          </span>
        </div>

        {/* ── Answer option cards ── */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            marginTop: 32,
          }}
        >
          {OPTIONS.map((opt) => (
            <AnswerCard
              key={opt.id}
              id={opt.id}
              label={opt.label}
              selected={selected === opt.id}
              onSelect={setSelected}
            />
          ))}
        </div>

        {/* ── Submit CTA ── */}
        <div style={{ marginTop: 32 }}>
          <OnbButton
            block
            radius={16}
            height={58}
            disabled={selected === null}
            style={selected === null ? { opacity: 0.45 } : undefined}
            onClick={() => router.push('/figma/onboarding/10-feedback')}
          >
            Check answer
          </OnbButton>
        </div>
      </div>
    </OnbWebFrame>
  );
}
