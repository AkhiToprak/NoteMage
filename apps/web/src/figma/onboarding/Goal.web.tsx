'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbWebFrame, Sparkle } from './shell';

/**
 * 04 Goal — web (Figma 48:8). 1440-designed cream canvas.
 * Left lavender rail (480px): logo + Mage mascot (thinking) + sparkles +
 * speech bubble + step tracker (step 1 done green, step 2 active purple,
 * 3+4 inactive).
 * Right content: "STEP 2 OF 4" · headline · subtitle · 3×2 goal card grid ·
 * lavender context banner · Back / Continue footer.
 * Selecting a card highlights it (purple border + lavender fill + checkmark).
 * Continue → 05-intensity.
 */

type GoalOption = 'exam' | 'test-prep' | 'understand' | 'memorize' | 'weak-points' | 'homework';

// ─── Inline icon SVGs ─────────────────────────────────────────────────────────

function ExamIcon({ color = ONB.primaryInk }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <circle cx={12} cy={12} r={4.5} stroke={color} strokeWidth={2} />
      <circle cx={12} cy={12} r={1.5} fill={color} />
    </svg>
  );
}

function TestPrepIcon({ color = ONB.primaryInk }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={4} y={2} width={16} height={20} rx={3} stroke={color} strokeWidth={2} />
      <rect x={7} y={0.5} width={10} height={4} rx={2} fill={color} />
      <rect x={8} y={9} width={9} height={1.8} rx={1.2} fill={color} />
      <rect x={8} y={13} width={9} height={1.8} rx={1.2} fill={color} />
      <rect x={8} y={17} width={6} height={1.8} rx={1.2} fill={color} />
    </svg>
  );
}

function UnderstandIcon({ color = ONB.primaryInk }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2a7 7 0 0 1 5.292 11.584C16.5 14.5 16 15.5 16 17H8c0-1.5-.5-2.5-1.292-3.416A7 7 0 0 1 12 2Z"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
      />
      <rect x={9} y={18} width={6} height={2} rx={1} fill={color} />
      <rect x={10} y={21} width={4} height={1.5} rx={0.75} fill={color} />
    </svg>
  );
}

function MemorizeIcon({ color = ONB.primaryInk }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={8} y={2} width={13} height={16} rx={3} stroke={color} strokeWidth={2} />
      <rect x={3} y={6} width={13} height={16} rx={3} stroke={color} strokeWidth={2} />
    </svg>
  );
}

function WeakPointsIcon({ color = ONB.primaryInk }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx={10} cy={10} r={5} stroke={color} strokeWidth={2} />
      <line x1={14} y1={14} x2={20} y2={20} stroke={color} strokeWidth={2} strokeLinecap="round" />
      <line x1={7} y1={10} x2={13} y2={10} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <line x1={10} y1={7} x2={10} y2={13} stroke={color} strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}

function HomeworkIcon({ color = ONB.primaryInk }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={2} y={3} width={20} height={13} rx={2} stroke={color} strokeWidth={2} />
      <rect x={6} y={7} width={12} height={1.6} rx={1.2} fill={color} />
      <rect x={6} y={10.5} width={8} height={1.6} rx={1.2} fill={color} />
      <rect x={10.6} y={16} width={2.4} height={4} rx={1} fill={color} />
      <rect x={7} y={20} width={9} height={2} rx={1} fill={color} />
    </svg>
  );
}

// ─── Goal card (web — 242×152) ────────────────────────────────────────────────

interface GoalCardProps {
  id: GoalOption;
  selected: boolean;
  onSelect: (id: GoalOption) => void;
  icon: React.ReactNode;
  label: string;
  description: string;
}

function GoalCard({ id, selected, onSelect, icon, label, description }: GoalCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: 152,
        borderRadius: 20,
        border: selected ? `2px solid ${ONB.primary}` : `1.4px solid ${ONB.line}`,
        background: selected ? ONB.lavender : ONB.white,
        boxShadow: selected ? 'none' : '0px 6px 18px rgba(58,46,102,0.07)',
        padding: '18px 18px 0',
        overflow: 'hidden',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Icon tile */}
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          background: selected ? ONB.white : ONB.lavender,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          transition: 'background 0.15s',
        }}
      >
        {icon}
      </div>

      {/* Label */}
      <span
        style={{
          display: 'block',
          fontFamily: ONB.font,
          fontWeight: 600,
          fontSize: 18,
          color: ONB.ink,
          lineHeight: 1.3,
          marginTop: 4,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>

      {/* Description */}
      <span
        style={{
          display: 'block',
          fontFamily: ONB.font,
          fontWeight: 400,
          fontSize: 13.5,
          color: ONB.muted,
          lineHeight: 1.32,
          marginTop: 4,
          maxWidth: 202,
        }}
      >
        {description}
      </span>

      {/* Selected checkmark — top-right */}
      {selected && (
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            width: 24,
            height: 24,
            borderRadius: 12,
            background: ONB.primary,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              color: ONB.white,
              fontSize: 12,
              fontWeight: 700,
              lineHeight: 1,
              fontFamily: ONB.font,
            }}
          >
            ✓
          </span>
        </div>
      )}
    </button>
  );
}

// ─── Step tracker (left rail) ─────────────────────────────────────────────────

type StepState = 'done' | 'active' | 'inactive';

interface Step {
  label: string;
  state: StepState;
}

const STEPS: Step[] = [
  { label: 'Add material', state: 'done' },
  { label: 'Set your goal', state: 'active' },
  { label: 'Pick your rhythm', state: 'inactive' },
  { label: 'Build your path', state: 'inactive' },
];

function StepTracker() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {STEPS.map((step, i) => {
        const isLast = i === STEPS.length - 1;
        return (
          <div key={step.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
            {/* Connector column */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28 }}>
              {/* Node */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  background:
                    step.state === 'done' ? '#2fa968' : step.state === 'active' ? ONB.primary : ONB.white,
                  border:
                    step.state === 'done' || step.state === 'active'
                      ? 'none'
                      : `2px solid #d9cef2`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                {step.state === 'done' ? (
                  <span
                    style={{
                      color: ONB.white,
                      fontSize: 13,
                      fontWeight: 700,
                      fontFamily: ONB.font,
                      lineHeight: 1,
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
                      color: step.state === 'active' ? ONB.white : '#a1a7b3',
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
                fontWeight: step.state === 'active' ? 600 : 500,
                fontSize: 15,
                color: step.state === 'active' ? ONB.ink : '#a1a7b3',
                lineHeight: 1.3,
                paddingTop: 5,
              }}
            >
              {step.label}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Context banner copy ──────────────────────────────────────────────────────

const CONTEXT: Record<GoalOption, string> = {
  exam: 'Mage will prioritize likely exam questions and weak-point reviews.',
  'test-prep': 'Mage will build a focused revision path with timed drills.',
  understand: 'Mage will explain concepts deeply and provide worked examples.',
  memorize: 'Mage will create spaced-repetition flashcards for quick recall.',
  'weak-points': 'Mage will zero in on the topics where you struggle most.',
  homework: 'Mage will structure talking points and help you work through exercises.',
};

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function GoalWeb() {
  const router = useRouter();
  const [selected, setSelected] = useState<GoalOption>('exam');

  const goals: { id: GoalOption; icon: React.ReactNode; label: string; description: string }[] = [
    { id: 'exam', icon: <ExamIcon />, label: 'Exam', description: 'Prioritize high-yield questions' },
    { id: 'test-prep', icon: <TestPrepIcon />, label: 'Test prep', description: 'Build a compact revision path' },
    { id: 'understand', icon: <UnderstandIcon />, label: 'Understand', description: 'Deeper explanations and examples' },
    { id: 'memorize', icon: <MemorizeIcon />, label: 'Memorize', description: 'Flashcards and recall practice' },
    { id: 'weak-points', icon: <WeakPointsIcon />, label: 'Weak points', description: 'Train what you struggle with' },
    { id: 'homework', icon: <HomeworkIcon />, label: 'Homework', description: 'Clear talking points and structure' },
  ];

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
          {/* Logo top-left */}
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
            <Mage pose="thinking" size={244} alt="Mage" priority />

            {/* Sparkles */}
            <Sparkle size={22} color={ONB.gold} rotate={-15} style={{ position: 'absolute', right: -40, top: -6 }} />
            <Sparkle size={14} color={ONB.gold} style={{ position: 'absolute', left: -22, top: 26 }} />
            <Sparkle size={13} color={ONB.gold} rotate={-20} style={{ position: 'absolute', right: -28, bottom: -18 }} />
          </div>

          {/* Speech bubble — below mascot, upward tail */}
          <div
            style={{
              marginTop: 8,
              marginLeft: 56,
              marginRight: 56,
              position: 'relative',
            }}
          >
            {/* Tail */}
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
              {`I'll use your goal to shape the path.`}
            </div>
          </div>

          {/* Step tracker pinned toward bottom */}
          <div style={{ marginTop: 'auto', padding: '0 56px 60px' }}>
            <StepTracker />
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
          {/* Content centered vertically — slight offset toward top */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', paddingTop: 40 }}>
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
              Step 2 of 4
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
              What are you preparing for?
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
              Mage will use this to decide what to explain, quiz, and review.
            </p>

            {/* 3×2 goal card grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 20,
                marginTop: 36,
                maxWidth: 790,
              }}
            >
              {goals.map((g) => (
                <GoalCard
                  key={g.id}
                  id={g.id}
                  selected={selected === g.id}
                  onSelect={setSelected}
                  icon={g.icon}
                  label={g.label}
                  description={g.description}
                />
              ))}
            </div>

            {/* Context banner */}
            <div
              style={{
                marginTop: 20,
                maxWidth: 790,
                background: ONB.lavender,
                borderRadius: 16,
                padding: '14px 18px',
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                minHeight: 52,
              }}
            >
              <svg
                width={18}
                height={18}
                viewBox="0 0 24 24"
                fill="none"
                aria-hidden
                style={{ flexShrink: 0 }}
              >
                <path
                  d="M12 2c.6 4.4 2.9 6.7 7.3 7.3-4.4.6-6.7 2.9-7.3 7.3-.6-4.4-2.9-6.7-7.3-7.3C9.1 8.7 11.4 6.4 12 2Z"
                  fill={ONB.primaryInk}
                />
              </svg>
              <p
                style={{
                  margin: 0,
                  fontFamily: ONB.font,
                  fontWeight: 500,
                  fontSize: 14,
                  color: ONB.primaryInk,
                  lineHeight: 1.4,
                }}
              >
                {CONTEXT[selected]}
              </p>
            </div>
          </div>

          {/* Footer: Back / Continue */}
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
              onClick={() => router.push('/figma/onboarding/03-sample')}
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
              style={{ padding: '0 40px', minWidth: 220 }}
              onClick={() => router.push('/figma/onboarding/05-intensity')}
            >
              Continue
            </OnbButton>
          </div>
        </div>
      </div>
    </OnbWebFrame>
  );
}
