'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbMobileFrame, onb } from './shell';

/**
 * 09 Quiz — mobile (Figma 1:33). 393×852, warm/cream.
 * Back arrow + "Question N of 3" header + 3-segment progress bar +
 * Mage sticker top-right · question prompt · source citation chip ·
 * four A–D answer option cards (A selected by default) · "Check answer" CTA.
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
        width: 24,
        height: 24,
        borderRadius: 12,
        border: selected ? `none` : `1.8px solid ${ONB.paperLine}`,
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
            width: 9,
            height: 9,
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
        height: 60,
        borderRadius: 16,
        border: selected ? `2px solid ${ONB.primary}` : `1.4px solid ${ONB.line}`,
        background: selected ? ONB.lavender : ONB.white,
        boxShadow: selected ? 'none' : '0px 5px 16px rgba(58,46,102,0.07)',
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
          width: 34,
          height: 34,
          borderRadius: 10,
          background: selected ? ONB.primary : ONB.lavender,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginLeft: 11,
          transition: 'background 0.15s',
        }}
      >
        <span
          style={{
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 15,
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
          marginLeft: 14,
          flex: 1,
          fontFamily: ONB.font,
          fontWeight: 500,
          fontSize: 15.5,
          color: ONB.ink,
          lineHeight: 1.22,
        }}
      >
        {label}
      </span>

      {/* Radio indicator */}
      <div style={{ marginRight: 14 }}>
        <RadioCircle selected={selected} />
      </div>
    </button>
  );
}

export default function QuizMobile() {
  const router = useRouter();
  const [selected, setSelected] = useState<Option | null>(null);

  return (
    <OnbMobileFrame>
      {/* ── Header row: back + "Question N of 3" + Mage sticker ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 20px 0',
          position: 'relative',
        }}
      >
        {/* Back button */}
        <button
          type="button"
          onClick={() => router.push('/figma/onboarding/08-study-session')}
          aria-label="Go back"
          style={{
            width: 40,
            height: 40,
            borderRadius: 20,
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
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: ONB.ink }}>
            arrow_back
          </span>
        </button>

        {/* "Question N of 3" label — centered absolutely */}
        <span
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 14.5,
            color: ONB.muted,
            whiteSpace: 'nowrap',
          }}
        >
          Question 1 of 3
        </span>

        {/* Mage sticker — top-right, overlaps the progress bar area */}
        <div style={{ marginLeft: 'auto', width: 58, height: 58, flexShrink: 0 }}>
          <Mage pose="quizzing" size={58} alt="Mage" />
        </div>
      </div>

      {/* ── 3-segment progress bar ── */}
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '8px 24px 0',
        }}
      >
        {[true, false, false].map((active, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 6,
              borderRadius: 3,
              background: active ? ONB.primary : ONB.line,
            }}
          />
        ))}
      </div>

      {/* ── Question prompt ── */}
      <h2
        style={{
          margin: '24px 24px 0',
          fontFamily: ONB.font,
          fontWeight: 700,
          fontSize: 21,
          lineHeight: 1.24,
          letterSpacing: '-0.21px',
          color: ONB.ink,
        }}
      >
        What does a row usually represent in a database table?
      </h2>

      {/* ── Source citation chip ── */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          margin: '14px 24px 0',
          height: 30,
          borderRadius: 15,
          border: `1px solid ${ONB.line}`,
          background: '#f3ede1',
          padding: '0 10px',
          maxWidth: 268,
        }}
      >
        {/* Mini doc icon */}
        <svg width={13} height={16} viewBox="0 0 13 16" fill="none" aria-hidden style={{ flexShrink: 0 }}>
          <rect x={1} y={1} width={11} height={14} rx={2} stroke={ONB.muted} strokeWidth={1.5} />
          <rect x={4} y={6} width={6} height={1.4} rx={1} fill={ONB.muted} />
          <rect x={4} y={9} width={6} height={1.4} rx={1} fill={ONB.muted} />
        </svg>
        <span
          style={{
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 12.5,
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
          gap: 10,
          padding: '18px 24px 0',
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

      {/* ── Submit CTA pinned to bottom ── */}
      <div style={{ marginTop: 'auto', padding: '24px 24px 10px' }}>
        <OnbButton
          block
          radius={18}
          height={56}
          disabled={selected === null}
          style={selected === null ? { opacity: 0.45 } : undefined}
          onClick={() => router.push('/figma/onboarding/10-feedback')}
        >
          Check answer
        </OnbButton>
      </div>
    </OnbMobileFrame>
  );
}
