'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbMobileFrame } from './shell';

/**
 * 04 Goal — mobile (Figma 1:23). 393×852, warm/cream.
 * Back arrow + progress bar (50%) · Mage avatar + speech bubble ·
 * headline · subtitle · 3×2 goal card grid · lavender context banner ·
 * Continue CTA → 05-intensity.
 * Selecting a card highlights it (purple border + lavender fill + checkmark).
 */

type GoalOption = 'exam' | 'test-prep' | 'understand' | 'memorize' | 'weak-points' | 'homework';

// ─── Inline icon SVGs (faithful to Figma node geometry) ──────────────────────

function ExamIcon({ color = ONB.primaryInk }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      {/* Target / crosshair shape from Figma imgG */}
      <circle cx={12} cy={12} r={9} stroke={color} strokeWidth={2} />
      <circle cx={12} cy={12} r={4.5} stroke={color} strokeWidth={2} />
      <circle cx={12} cy={12} r={1.5} fill={color} />
    </svg>
  );
}

function TestPrepIcon({ color = ONB.primaryInk }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      {/* Clipboard with text lines — faithful to Figma inline rects */}
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
      {/* Light bulb shape (Figma imgG1) */}
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
      {/* Two overlapping card rects — Figma rects at 8,2 / 3,6 */}
      <rect x={8} y={2} width={13} height={16} rx={3} stroke={color} strokeWidth={2} />
      <rect x={3} y={6} width={13} height={16} rx={3} stroke={color} strokeWidth={2} />
    </svg>
  );
}

function WeakPointsIcon({ color = ONB.primaryInk }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      {/* Key / magnifier (Figma imgG2) */}
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
      {/* Monitor / presentation screen — Figma inline rects */}
      <rect x={2} y={3} width={20} height={13} rx={2} stroke={color} strokeWidth={2} />
      <rect x={6} y={7} width={12} height={1.6} rx={1.2} fill={color} />
      <rect x={6} y={10.5} width={8} height={1.6} rx={1.2} fill={color} />
      <rect x={10.6} y={16} width={2.4} height={4} rx={1} fill={color} />
      <rect x={7} y={20} width={9} height={2} rx={1} fill={color} />
    </svg>
  );
}

// ─── Goal card ───────────────────────────────────────────────────────────────

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
        height: 130,
        borderRadius: 20,
        border: selected ? `2px solid ${ONB.primary}` : `1.4px solid ${ONB.line}`,
        background: selected ? ONB.lavender : ONB.white,
        boxShadow: selected ? 'none' : '0px 5px 14px rgba(58,46,102,0.06)',
        padding: '12px 12px 0',
        overflow: 'hidden',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Icon tile */}
      <div
        style={{
          width: 42,
          height: 42,
          borderRadius: 12,
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
          fontSize: 16,
          color: ONB.ink,
          lineHeight: 1.16,
          marginTop: 4,
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
          fontSize: 12.5,
          color: ONB.muted,
          lineHeight: 1.3,
          marginTop: 4,
        }}
      >
        {description}
      </span>

      {/* Selected checkmark — top-right */}
      {selected && (
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            width: 22,
            height: 22,
            borderRadius: 11,
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

// ─── Context banner (dynamic copy based on selected goal) ─────────────────────

const CONTEXT: Record<GoalOption, string> = {
  exam: 'Mage will prioritize likely exam questions and weak-point reviews.',
  'test-prep': 'Mage will build a focused revision path with timed drills.',
  understand: 'Mage will explain concepts deeply and provide worked examples.',
  memorize: 'Mage will create spaced-repetition flashcards for quick recall.',
  'weak-points': 'Mage will zero in on the topics where you struggle most.',
  homework: 'Mage will structure talking points and help you work through exercises.',
};

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function GoalMobile() {
  const router = useRouter();
  const [selected, setSelected] = useState<GoalOption>('exam');

  const goals: { id: GoalOption; icon: React.ReactNode; label: string; description: string }[] = [
    {
      id: 'exam',
      icon: <ExamIcon color={selected === 'exam' ? ONB.primaryInk : ONB.primaryInk} />,
      label: 'Exam',
      description: 'Prioritize high-yield questions',
    },
    {
      id: 'test-prep',
      icon: <TestPrepIcon color={ONB.primaryInk} />,
      label: 'Test prep',
      description: 'Build a compact revision path',
    },
    {
      id: 'understand',
      icon: <UnderstandIcon color={ONB.primaryInk} />,
      label: 'Understand',
      description: 'Deeper explanations and examples',
    },
    {
      id: 'memorize',
      icon: <MemorizeIcon color={ONB.primaryInk} />,
      label: 'Memorize',
      description: 'Flashcards and recall practice',
    },
    {
      id: 'weak-points',
      icon: <WeakPointsIcon color={ONB.primaryInk} />,
      label: 'Weak points',
      description: 'Train what you struggle with',
    },
    {
      id: 'homework',
      icon: <HomeworkIcon color={ONB.primaryInk} />,
      label: 'Homework',
      description: 'Clear talking points and structure',
    },
  ];

  return (
    <OnbMobileFrame>
      {/* Back + progress bar */}
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
          onClick={() => router.push('/figma/onboarding/03-sample')}
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

        {/* Progress track — step 2/4, ~50% */}
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
              width: '50%',
              height: '100%',
              borderRadius: 3,
              background: ONB.primary,
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
          <Mage pose="thinking" size={40} alt="Mage" />
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
          {`I'll use your goal to shape the path.`}
        </div>
      </div>

      {/* Headline */}
      <h1
        style={{
          margin: '22px 24px 0',
          fontFamily: ONB.font,
          fontWeight: 700,
          fontSize: 25,
          lineHeight: 1.14,
          letterSpacing: '-0.375px',
          color: ONB.ink,
        }}
      >
        What are you preparing for?
      </h1>

      {/* Subtitle */}
      <p
        style={{
          margin: '8px 24px 0',
          fontFamily: ONB.font,
          fontWeight: 400,
          fontSize: 15,
          lineHeight: 1.4,
          color: ONB.muted,
          maxWidth: 330,
        }}
      >
        Mage will use this to decide what to explain, quiz, and review.
      </p>

      {/* 3×2 goal card grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          padding: '18px 24px 0',
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
          margin: '16px 24px 0',
          background: ONB.lavender,
          borderRadius: 16,
          padding: '11px 14px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          minHeight: 56,
        }}
      >
        {/* Sparkle icon */}
        <svg
          width={16}
          height={16}
          viewBox="0 0 24 24"
          fill="none"
          aria-hidden
          style={{ flexShrink: 0, marginTop: 1 }}
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
            fontSize: 13,
            color: ONB.primaryInk,
            lineHeight: 1.34,
          }}
        >
          {CONTEXT[selected]}
        </p>
      </div>

      {/* CTA pinned to bottom */}
      <div style={{ marginTop: 'auto', padding: '16px 24px 10px' }}>
        <OnbButton block radius={18} height={56} onClick={() => router.push('/figma/onboarding/05-intensity')}>
          Continue
        </OnbButton>
      </div>
    </OnbMobileFrame>
  );
}
