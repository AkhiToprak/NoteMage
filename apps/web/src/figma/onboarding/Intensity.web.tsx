'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbWebFrame, Sparkle } from './shell';

/**
 * 05 Intensity — web (Figma 48:10). Cream canvas, 1440-designed.
 *
 * Layout:
 *   Left lavender rail (480px): NoteMage logo → mascot wink pose → sparkles →
 *   chat bubble → step tracker (steps 1–4, step 3 active, 1+2 done).
 *   Right content (flex-1): "STEP 3 OF 4" label → headline → subtitle →
 *   1×4 rhythm cards row (5 / 10 / 15★ / 30 min) →
 *   "When do you need this?" + deadline chips →
 *   lavender context banner →
 *   footer: Back / "Build my path" CTA.
 *
 * Interaction:
 *   • rhythmSel: clicking a card highlights it (lavender fill + purple border).
 *     Default = 15 min (Recommended).
 *   • deadlineSel: clicking a chip highlights it. Default = "This week".
 *   • Back → /figma/onboarding/04-goal
 *   • Build my path → /figma/onboarding/06-generating
 */

type Rhythm = '5' | '10' | '15' | '30';
type Deadline = 'today' | 'week' | 'weeks24' | 'none';

// ─── Clock icon ────────────────────────────────────────────────────────────────

function ClockIcon({ selected = false }: { selected?: boolean }) {
  const color = selected ? ONB.primary : ONB.primary;
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <path d="M12 7.5V12l3 3" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Rhythm card (web — 180×158) ─────────────────────────────────────────────

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
        width: 180,
        height: 158,
        borderRadius: 20,
        border: selected ? `2px solid ${ONB.primary}` : `1.4px solid ${ONB.line}`,
        background: selected ? ONB.lavender : ONB.white,
        boxShadow: selected ? 'none' : '0px 6px 18px rgba(58,46,102,0.07)',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 0,
        overflow: 'hidden',
        transition: 'border-color 0.15s, background 0.15s',
        flexShrink: 0,
      }}
    >
      {/* Recommended pill */}
      {recommended && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            left: '50%',
            transform: 'translateX(-50%)',
            background: '#fff3d6',
            borderRadius: 11,
            padding: '4px 9px',
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 10.5,
            color: '#7a5200',
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
          }}
        >
          Recommended
        </div>
      )}

      {/* Clock icon */}
      <div style={{ marginTop: recommended ? 10 : 0 }}>
        <ClockIcon selected={selected} />
      </div>

      {/* Duration label */}
      <span
        style={{
          fontFamily: ONB.font,
          fontWeight: 700,
          fontSize: 25,
          color: ONB.ink,
          lineHeight: 1.3,
          marginTop: 8,
        }}
      >
        {label}
      </span>

      {/* Sub label */}
      <span
        style={{
          fontFamily: ONB.font,
          fontWeight: 500,
          fontSize: 13,
          color: ONB.muted,
          lineHeight: 1.3,
          marginTop: 4,
          textAlign: 'center',
          maxWidth: 164,
        }}
      >
        {sub}
      </span>
    </button>
  );
}

// ─── Deadline chip (web) ───────────────────────────────────────────────────────

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
        height: 42,
        borderRadius: 21,
        border: selected ? `1.8px solid ${ONB.primary}` : `1.4px solid ${ONB.line}`,
        background: selected ? ONB.lavender : ONB.white,
        padding: '0 14px',
        fontFamily: ONB.font,
        fontWeight: 600,
        fontSize: 14,
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

// ─── Step tracker (left rail) ─────────────────────────────────────────────────

const STEPS = ['Add material', 'Set your goal', 'Pick your rhythm', 'Build your path'];

function StepTracker({ current }: { current: number }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {STEPS.map((label, i) => {
        const done = i < current;
        const active = i === current;
        const isLast = i === STEPS.length - 1;
        return (
          <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            {/* Connector column */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28 }}>
              {/* Step node */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  background: done ? '#2fa968' : active ? ONB.primary : ONB.white,
                  border: done || active ? 'none' : `2px solid #d9cef2`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {done ? (
                  <span
                    style={{
                      fontFamily: ONB.font,
                      fontWeight: 700,
                      fontSize: 13,
                      color: ONB.white,
                      lineHeight: 1.3,
                    }}
                  >
                    ✓
                  </span>
                ) : (
                  <span
                    style={{
                      fontFamily: ONB.font,
                      fontWeight: 700,
                      fontSize: 13,
                      color: active ? ONB.white : '#a1a7b3',
                      lineHeight: 1.3,
                    }}
                  >
                    {i + 1}
                  </span>
                )}
              </div>
              {/* Vertical connector */}
              {!isLast && (
                <div
                  style={{
                    width: 2,
                    height: 45,
                    background: '#d9cef2',
                    borderRadius: 1,
                  }}
                />
              )}
            </div>

            {/* Label */}
            <span
              style={{
                fontFamily: ONB.font,
                fontWeight: active ? 600 : 500,
                fontSize: 15,
                color: done ? ONB.muted : active ? ONB.ink : '#a1a7b3',
                lineHeight: 1.3,
                paddingTop: 5,
              }}
            >
              {label}
            </span>
          </div>
        );
      })}
    </div>
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
        height: 52,
        borderRadius: 16,
        background: ONB.lavender,
        display: 'flex',
        alignItems: 'center',
        padding: '0 18px',
        overflow: 'hidden',
      }}
    >
      <svg width={18} height={18} viewBox="0 0 24 24" fill="none" aria-hidden style={{ flexShrink: 0 }}>
        <path
          d="M12 0c.9 6.6 4.4 10.1 11 11-6.6.9-10.1 4.4-11 11-.9-6.6-4.4-10.1-11-11C7.6 10.1 11.1 6.6 12 0Z"
          fill={ONB.primaryInk}
        />
      </svg>
      <p
        style={{
          fontFamily: ONB.font,
          fontWeight: 500,
          fontSize: 14,
          color: ONB.primaryInk,
          lineHeight: 1.4,
          marginLeft: 12,
          maxWidth: 710,
        }}
      >
        {`Your path will be split into ${durationLabel[rhythm]} sessions ${deadlineLabel[deadline]}.`}
      </p>
    </div>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function IntensityWeb() {
  const router = useRouter();
  const [rhythmSel, setRhythmSel] = useState<Rhythm>('15');
  const [deadlineSel, setDeadlineSel] = useState<Deadline>('week');

  return (
    <OnbWebFrame>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* ── Left lavender rail ─────────────────────────────────────── */}
        <div
          style={{
            width: 480,
            flexShrink: 0,
            background: '#f1ecfb',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Logo */}
          <div style={{ padding: '48px 0 0 48px' }}>
            <Mage pose="logo-color" size={132} alt="NoteMage" priority />
          </div>

          {/* Mascot illustration zone */}
          <div
            style={{
              position: 'relative',
              width: 244,
              height: 244,
              marginTop: 26,
              marginLeft: 118,
            }}
          >
            <Mage pose="wink" size={244} alt="Mage" priority />

            {/* Sparkles */}
            <Sparkle
              size={22}
              color={ONB.gold}
              rotate={-15}
              style={{ position: 'absolute', right: -40, top: -6 }}
            />
            <Sparkle
              size={14}
              color={ONB.gold}
              style={{ position: 'absolute', left: -22, top: 26 }}
            />
            <Sparkle
              size={13}
              color={ONB.gold}
              rotate={-20}
              style={{ position: 'absolute', right: -28, bottom: -18 }}
            />
          </div>

          {/* Chat bubble with upward tail */}
          <div
            style={{
              marginTop: 8,
              marginLeft: 56,
              marginRight: 56,
              position: 'relative',
            }}
          >
            {/* Tail: border triangle */}
            <div
              style={{
                position: 'absolute',
                top: -9,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '10px solid transparent',
                borderRight: '10px solid transparent',
                borderBottom: `10px solid ${ONB.line}`,
                zIndex: 1,
              }}
            />
            <div
              style={{
                position: 'absolute',
                top: -7,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '9px solid transparent',
                borderRight: '9px solid transparent',
                borderBottom: `9px solid ${ONB.white}`,
                zIndex: 2,
              }}
            />
            <div
              style={{
                background: ONB.white,
                border: `1px solid ${ONB.line}`,
                borderRadius: 20,
                boxShadow: '0px 6px 9px rgba(58,46,102,0.08)',
                padding: '16px 20px',
                fontFamily: ONB.font,
                fontWeight: 500,
                fontSize: 16,
                color: ONB.ink,
                lineHeight: 1.4,
                textAlign: 'center',
              }}
            >
              How should I split your path into sessions?
            </div>
          </div>

          {/* Step tracker pinned to bottom */}
          <div style={{ marginTop: 'auto', padding: '0 56px 60px' }}>
            <StepTracker current={2} />
          </div>
        </div>

        {/* ── Right content area ─────────────────────────────────────── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '0 64px',
          }}
        >
          {/* Content zone */}
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              paddingTop: 40,
            }}
          >
            {/* Step label */}
            <p
              style={{
                margin: 0,
                fontFamily: ONB.font,
                fontWeight: 700,
                fontSize: 13,
                color: ONB.primary,
                letterSpacing: '1.04px',
                textTransform: 'uppercase',
              }}
            >
              Step 3 of 4
            </p>

            {/* Headline */}
            <h1
              style={{
                margin: '14px 0 0',
                fontFamily: ONB.font,
                fontWeight: 700,
                fontSize: 40,
                lineHeight: 1.08,
                letterSpacing: '-0.8px',
                color: ONB.ink,
              }}
            >
              Choose your study rhythm
            </h1>

            {/* Subtitle */}
            <p
              style={{
                margin: '18px 0 0',
                fontFamily: ONB.font,
                fontWeight: 400,
                fontSize: 18,
                lineHeight: 1.46,
                color: ONB.muted,
                maxWidth: 700,
              }}
            >
              Short sessions make it easier to stay consistent.
            </p>

            {/* 1×4 rhythm cards */}
            <div
              style={{
                display: 'flex',
                gap: 16,
                marginTop: 32,
                flexWrap: 'wrap',
              }}
            >
              <RhythmCard id="5" selected={rhythmSel === '5'} onSelect={setRhythmSel} label="5 min" sub="Quick review" />
              <RhythmCard id="10" selected={rhythmSel === '10'} onSelect={setRhythmSel} label="10 min" sub="Small daily" />
              <RhythmCard
                id="15"
                selected={rhythmSel === '15'}
                onSelect={setRhythmSel}
                label="15 min"
                sub="Just right"
                recommended
              />
              <RhythmCard id="30" selected={rhythmSel === '30'} onSelect={setRhythmSel} label="30 min" sub="Deep focus" />
            </div>

            {/* Deadline section */}
            <p
              style={{
                margin: '32px 0 0',
                fontFamily: ONB.font,
                fontWeight: 700,
                fontSize: 20,
                color: ONB.ink,
                lineHeight: 1.3,
              }}
            >
              When do you need this?
            </p>

            {/* Chips */}
            <div
              style={{
                display: 'flex',
                gap: 10,
                marginTop: 14,
                flexWrap: 'wrap',
              }}
            >
              <DeadlineChip id="today" selected={deadlineSel === 'today'} onSelect={setDeadlineSel} label="Today" />
              <DeadlineChip id="week" selected={deadlineSel === 'week'} onSelect={setDeadlineSel} label="This week" />
              <DeadlineChip id="weeks24" selected={deadlineSel === 'weeks24'} onSelect={setDeadlineSel} label="2–4 weeks" />
              <DeadlineChip id="none" selected={deadlineSel === 'none'} onSelect={setDeadlineSel} label="No deadline" />
            </div>

            {/* Context banner */}
            <div style={{ marginTop: 20, maxWidth: 768 }}>
              <ContextBanner rhythm={rhythmSel} deadline={deadlineSel} />
            </div>
          </div>

          {/* Footer: Back / CTA */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 0 56px',
            }}
          >
            <button
              type="button"
              onClick={() => router.push('/figma/onboarding/04-goal')}
              style={{
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                fontFamily: ONB.font,
                fontWeight: 600,
                fontSize: 16,
                color: ONB.muted,
              }}
            >
              Back
            </button>

            <OnbButton
              radius={16}
              height={56}
              style={{ padding: '0 40px', minWidth: 230 }}
              onClick={() => router.push('/figma/onboarding/06-generating')}
            >
              Build my path
            </OnbButton>
          </div>
        </div>
      </div>
    </OnbWebFrame>
  );
}
