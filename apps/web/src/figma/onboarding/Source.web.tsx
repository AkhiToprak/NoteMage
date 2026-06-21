'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbWebFrame, Sparkle } from './shell';

/**
 * 02 Source — web (Figma 48:4 / inner 53:*). 1440-designed cream canvas.
 * Left lavender rail (480px): mascot illustration + sparkles + chat bubble.
 * Right content area (960px): NoteMage logo top-left, step label, headline,
 * subtitle, 2×2 grid of source cards, footer (Back / Continue).
 * Default selection = PDF. CTA → 03-sample.
 */

type SourceOption = 'pdf' | 'notes' | 'images' | 'demo';

// ─── Icon SVGs (inline, no extra libs) ───────────────────────────────────────

function PdfIcon({ color = ONB.primaryInk }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={4.5} y={2} width={15} height={20} rx={3} stroke={color} strokeWidth={2} />
      <rect x={8} y={8} width={9} height={1.8} rx={1.2} fill={color} />
      <rect x={8} y={12} width={9} height={1.8} rx={1.2} fill={color} />
      <rect x={8} y={16} width={6} height={1.8} rx={1.2} fill={color} />
    </svg>
  );
}

function NotesIcon({ color = ONB.primaryInk }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect x={3} y={4} width={18} height={2.3} rx={1.2} fill={color} />
      <rect x={3} y={9} width={18} height={2.3} rx={1.2} fill={color} />
      <rect x={3} y={14} width={18} height={2.3} rx={1.2} fill={color} />
      <rect x={3} y={19} width={11} height={2.3} rx={1.2} fill={color} />
    </svg>
  );
}

function ImageIcon({ color = ONB.primaryInk }: { color?: string }) {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M5 7h2.5l1.5-2h7l1.5 2H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2Z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
      <circle cx={12} cy={13} r={3} stroke={color} strokeWidth={1.8} />
    </svg>
  );
}

function SparkleIconGold() {
  return (
    <svg width={24} height={24} viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M12 2c.6 4.4 2.9 6.7 7.3 7.3-4.4.6-6.7 2.9-7.3 7.3-.6-4.4-2.9-6.7-7.3-7.3C9.1 8.7 11.4 6.4 12 2Z"
        fill="#b8860b"
      />
      <path
        d="M19.5 15c.25 1.8 1.2 2.75 3 3-1.8.25-2.75 1.2-3 3-.25-1.8-1.2-2.75-3-3 1.8-.25 2.75-1.2 3-3Z"
        fill="#b8860b"
        opacity={0.55}
      />
    </svg>
  );
}

// ─── Source option card (web variant — 372×108) ───────────────────────────────

interface CardProps {
  id: SourceOption;
  selected: boolean;
  onSelect: (id: SourceOption) => void;
  iconBg: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  badge?: React.ReactNode;
}

function SourceCard({ id, selected, onSelect, iconBg, icon, label, description, badge }: CardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: 108,
        borderRadius: 20,
        border: selected ? `2px solid ${ONB.primary}` : `1.4px solid ${ONB.line}`,
        background: selected ? ONB.lavender : ONB.white,
        boxShadow: selected ? 'none' : '0px 6px 18px rgba(58,46,102,0.07)',
        padding: 0,
        overflow: 'hidden',
        cursor: 'pointer',
        textAlign: 'left',
        position: 'relative',
        transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      {/* Icon tile */}
      <div
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          background: selected ? ONB.white : iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginLeft: 18,
          transition: 'background 0.15s',
        }}
      >
        {icon}
      </div>

      {/* Text */}
      <div style={{ marginLeft: 16, flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 19,
            color: ONB.ink,
            lineHeight: 1.3,
            display: 'block',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontFamily: ONB.font,
            fontWeight: 400,
            fontSize: 14,
            color: ONB.muted,
            lineHeight: 1.34,
            display: 'block',
            marginTop: 6,
            maxWidth: 222,
          }}
        >
          {description}
        </span>
      </div>

      {/* Unselected checkmark circle */}
      {!selected && !badge && (
        <div
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            border: `1.8px solid ${ONB.paperLine}`,
            flexShrink: 0,
            marginRight: 18,
          }}
        />
      )}

      {/* Badge absolute top-right */}
      {badge && (
        <div style={{ position: 'absolute', top: 10, right: 10 }}>
          {badge}
        </div>
      )}
    </button>
  );
}

// ─── Step tracker (left rail bottom) ─────────────────────────────────────────

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
            {/* connector column */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: 28 }}>
              {/* Number node */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 14,
                  background: active ? ONB.primary : ONB.white,
                  border: active ? `none` : `2px solid #d9cef2`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
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
              </div>
              {/* Vertical connector line */}
              {!isLast && (
                <div
                  style={{
                    width: 2,
                    height: 45,
                    background: '#d9cef2',
                    borderRadius: 1,
                    marginTop: 0,
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
                color: active ? ONB.ink : '#a1a7b3',
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

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SourceWeb() {
  const router = useRouter();
  const [selected, setSelected] = useState<SourceOption>('pdf');

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
            <Mage pose="default" size={244} alt="Mage" priority />

            {/* Sparkles around mascot */}
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

          {/* Chat bubble below mascot — upward tail pointing to mascot */}
          <div
            style={{
              marginTop: 8,
              marginLeft: 56,
              marginRight: 56,
              position: 'relative',
            }}
          >
            {/* Tail: upward-pointing triangle (sits above the bubble) */}
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
              What should we turn into a path first?
            </div>
          </div>

          {/* Step tracker pinned toward bottom */}
          <div style={{ marginTop: 'auto', padding: '0 56px 60px' }}>
            <StepTracker current={0} />
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
              Step 1 of 4
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
              Add your study material
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
              Use your own material, or try a sample path before uploading anything.
            </p>

            {/* 2×2 card grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 20,
                marginTop: 36,
                maxWidth: 780,
              }}
            >
              <SourceCard
                id="pdf"
                selected={selected === 'pdf'}
                onSelect={setSelected}
                iconBg={ONB.lavender}
                icon={<PdfIcon color={ONB.primaryInk} />}
                label="Upload PDF or slides"
                description="Best for notes, scripts, and slides"
                badge={
                  <div
                    style={{
                      background: ONB.gold,
                      borderRadius: 11,
                      padding: '4px 8px',
                      fontFamily: ONB.font,
                      fontWeight: 600,
                      fontSize: 11,
                      color: '#7a5200',
                      lineHeight: 1.3,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Recommended
                  </div>
                }
              />

              <SourceCard
                id="notes"
                selected={selected === 'notes'}
                onSelect={setSelected}
                iconBg={ONB.lavender}
                icon={<NotesIcon color={ONB.primaryInk} />}
                label="Paste notes"
                description="Paste copied text or summaries"
              />

              <SourceCard
                id="images"
                selected={selected === 'images'}
                onSelect={setSelected}
                iconBg={ONB.lavender}
                icon={<ImageIcon color={ONB.primaryInk} />}
                label="Upload images"
                description="Photos of worksheets or notes"
              />

              <SourceCard
                id="demo"
                selected={selected === 'demo'}
                onSelect={setSelected}
                iconBg="#fff3d6"
                icon={<SparkleIconGold />}
                label="See 2-minute demo"
                description="Experience a full path first"
              />
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
              onClick={() => router.push('/figma/onboarding/01-welcome')}
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
              onClick={() => router.push('/figma/onboarding/03-sample')}
            >
              Continue
            </OnbButton>
          </div>
        </div>
      </div>
    </OnbWebFrame>
  );
}
