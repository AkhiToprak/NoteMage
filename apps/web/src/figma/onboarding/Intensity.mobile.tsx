'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbMobileFrame } from './shell';

/**
 * 05 Intensity — mobile (Figma 1:25). 393-wide cream frame.
 *
 * Layout (top → bottom):
 *   StatusBar (from OnbMobileFrame) → back + progress bar (75% filled, step 3/4) →
 *   Mage avatar + speech bubble → headline → subtitle →
 *   2×2 rhythm grid (5 / 10 / 15★ / 30 min) →
 *   "When do you need this?" + deadline chips →
 *   lavender context banner →
 *   "Build my path" CTA
 *
 * Interaction:
 *   • rhythmSel: one of the four duration cards; selecting highlights it
 *     (lavender fill + purple border). 15 min = default (Recommended badge).
 *   • deadlineSel: one of the four deadline chips; selecting highlights it.
 *   • CTA → /figma/onboarding/06-generating
 *   • Back → /figma/onboarding/04-goal
 */

type Rhythm = '5' | '10' | '15' | '30';
type Deadline = 'today' | 'week' | 'weeks24' | 'none';

// ─── Clock icon (inline SVG — mirrors the Figma `g` asset) ───────────────────

function ClockIcon({ selected = false }: { selected?: boolean }) {
  const color = selected ? ONB.primary : ONB.primary;
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <path d="M12 7.5V12l3 3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Rhythm card ─────────────────────────────────────────────────────────────

interface RhythmCardProps {
  id: Rhythm;
  selected: boolean;
  onSelect: (id: Rhythm) => void;
  label: string;
  sub: string;
  recommended?: boolean;
}

function RhythmCard({ id, selected, onSelect, label, sub, recommended }: RhythmCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      style={{
        position: 'relative',
        width: '100%',
        height: 116,
        borderRadius: 20,
        border: selected ? `2px solid ${ONB.primary}` : `1.4px solid ${ONB.line}`,
        background: selected ? ONB.lavender : ONB.white,
        boxShadow: selected ? 'none' : '0px 5px 14px rgba(58,46,102,0.06)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        overflow: 'hidden',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Recommended pill (absolute, top-center) */}
      {recommended && (
        <div
          style={{
            position: 'absolute',
            top: 9,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#fff3d6',
            borderRadius: 10.5,
            padding: '4px 9px',
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 10,
            color: '#7a5200',
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
          }}
        >
          Recommended
        </div>
      )}

      {/* Clock icon */}
      <div style={{ marginTop: recommended ? 8 : 0 }}>
        <ClockIcon selected={selected} />
      </div>

      {/* Duration label */}
      <span
        style={{
          fontFamily: ONB.font,
          fontWeight: 700,
          fontSize: 21,
          color: ONB.ink,
          lineHeight: 1.3,
          marginTop: 6,
        }}
      >
        {label}
      </span>

      {/* Sub label */}
      <span
        style={{
          fontFamily: ONB.font,
          fontWeight: 500,
          fontSize: 12.5,
          color: ONB.muted,
          lineHeight: 1.3,
          marginTop: 2,
          textAlign: 'center',
        }}
      >
        {sub}
      </span>
    </button>
  );
}

// ─── Deadline chip ────────────────────────────────────────────────────────────

interface ChipProps {
  id: Deadline;
  selected: boolean;
  onSelect: (id: Deadline) => void;
  label: string;
}

function DeadlineChip({ id, selected, onSelect, label }: ChipProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      style={{
        height: 38,
        borderRadius: 19,
        border: selected ? `1.8px solid ${ONB.primary}` : `1.4px solid ${ONB.line}`,
        background: selected ? ONB.lavender : ONB.white,
        padding: '0 13px',
        fontFamily: ONB.font,
        fontWeight: 600,
        fontSize: 13.5,
        color: selected ? ONB.primaryInk : ONB.ink,
        lineHeight: 1.3,
        whiteSpace: 'nowrap',
        cursor: 'pointer',
        transition: 'border-color 0.15s, background 0.15s, color 0.15s',
      }}
    >
      {label}
    </button>
  );
}

// ─── Context banner ───────────────────────────────────────────────────────────

function ContextBanner({ rhythm, deadline }: { rhythm: Rhythm; deadline: Deadline }) {
  const durationLabel: Record<Rhythm, string> = {
    '5': '5-minute',
    '10': '10-minute',
    '15': '15-minute',
    '30': '30-minute',
  };
  const deadlineLabel: Record<Deadline, string> = {
    today: 'for today',
    week: 'for this week',
    weeks24: 'over 2–4 weeks',
    none: 'at your own pace',
  };
  return (
    <div
      style={{
        height: 56,
        borderRadius: 16,
        background: ONB.lavender,
        display: 'flex',
        alignItems: 'center',
        padding: '0 14px',
        overflow: 'hidden',
      }}
    >
      {/* Four-point star sparkle */}
      <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
        <path
          d="M12 0c.9 6.6 4.4 10.1 11 11-6.6.9-10.1 4.4-11 11-.9-6.6-4.4-10.1-11-11C7.6 10.1 11.1 6.6 12 0Z"
          fill={ONB.primaryInk}
        />
      </svg>
      <p
        style={{
          fontFamily: ONB.font,
          fontWeight: 500,
          fontSize: 13,
          color: ONB.primaryInk,
          lineHeight: 1.34,
          marginLeft: 10,
          maxWidth: 287,
        }}
      >
        {`Your path will be split into ${durationLabel[rhythm]} sessions ${deadlineLabel[deadline]}.`}
      </p>
    </div>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function IntensityMobile() {
  const router = useRouter();
  const [rhythmSel, setRhythmSel] = useState<Rhythm>('15');
  const [deadlineSel, setDeadlineSel] = useState<Deadline>('week');

  return (
    <OnbMobileFrame>
      {/* Back + progress bar (step 3/4 → ~75%) */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 20px 0',
        }}
      >
        <button
          type="button"
          onClick={() => router.push('/figma/onboarding/04-goal')}
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

        {/* Progress track — step 3/4 → ~75% */}
        <div
          style={{
            flex: 1,
            height: 6,
            borderRadius: 3,
            background: ONB.line,
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: '75%',
              height: '100%',
              borderRadius: 3,
              background: ONB.primary,
              transition: 'width 0.35s cubic-bezier(0.22,1,0.36,1)',
            }}
          />
        </div>
      </div>

      {/* Mage avatar + speech bubble */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          padding: '18px 24px 0',
        }}
      >
        {/* Avatar circle */}
        <div
          style={{
            width: 46,
            height: 46,
            borderRadius: 23,
            background: ONB.lavender,
            border: `2px solid ${ONB.white}`,
            overflow: 'hidden',
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Mage pose="default" size={44} alt="Mage" />
        </div>

        {/* Bubble */}
        <div
          style={{
            background: ONB.white,
            border: `1px solid ${ONB.line}`,
            borderRadius: 16,
            boxShadow: '0px 4px 6px rgba(58,46,102,0.06)',
            padding: '10px 13px',
            fontFamily: ONB.font,
            fontWeight: 500,
            fontSize: 15,
            color: ONB.ink,
            lineHeight: 1.34,
            maxWidth: 261,
          }}
        >
          How should I split your path into sessions?
        </div>
      </div>

      {/* Headline */}
      <h1
        style={{
          margin: '22px 24px 0',
          fontFamily: ONB.font,
          fontWeight: 700,
          fontSize: 26,
          lineHeight: 1.14,
          letterSpacing: '-0.39px',
          color: ONB.ink,
        }}
      >
        Choose your study rhythm
      </h1>

      {/* Subtitle */}
      <p
        style={{
          margin: '8px 24px 0',
          fontFamily: ONB.font,
          fontWeight: 400,
          fontSize: 15.5,
          lineHeight: 1.4,
          color: ONB.muted,
          maxWidth: 330,
        }}
      >
        Short sessions make it easier to stay consistent.
      </p>

      {/* 2×2 rhythm grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          padding: '22px 24px 0',
        }}
      >
        <RhythmCard id="5" selected={rhythmSel === '5'} onSelect={setRhythmSel} label="5 min" sub="Quick review" />
        <RhythmCard id="10" selected={rhythmSel === '10'} onSelect={setRhythmSel} label="10 min" sub="Small daily session" />
        <RhythmCard
          id="15"
          selected={rhythmSel === '15'}
          onSelect={setRhythmSel}
          label="15 min"
          sub="Just right for daily"
          recommended
        />
        <RhythmCard id="30" selected={rhythmSel === '30'} onSelect={setRhythmSel} label="30 min" sub="Deep focus" />
      </div>

      {/* Deadline section */}
      <p
        style={{
          margin: '22px 24px 0',
          fontFamily: ONB.font,
          fontWeight: 700,
          fontSize: 16.5,
          color: ONB.ink,
          lineHeight: 1.3,
        }}
      >
        When do you need this?
      </p>

      {/* Chips row 1 */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 8,
          padding: '10px 24px 0',
        }}
      >
        <DeadlineChip id="today" selected={deadlineSel === 'today'} onSelect={setDeadlineSel} label="Today" />
        <DeadlineChip id="week" selected={deadlineSel === 'week'} onSelect={setDeadlineSel} label="This week" />
        <DeadlineChip id="weeks24" selected={deadlineSel === 'weeks24'} onSelect={setDeadlineSel} label="2–4 weeks" />
        <DeadlineChip id="none" selected={deadlineSel === 'none'} onSelect={setDeadlineSel} label="No deadline" />
      </div>

      {/* Context banner */}
      <div style={{ padding: '18px 24px 0' }}>
        <ContextBanner rhythm={rhythmSel} deadline={deadlineSel} />
      </div>

      {/* CTA */}
      <div style={{ marginTop: 'auto', padding: '24px 24px 10px' }}>
        <OnbButton
          block
          radius={18}
          height={56}
          onClick={() => router.push('/figma/onboarding/06-generating')}
        >
          Build my path
        </OnbButton>
      </div>
    </OnbMobileFrame>
  );
}
