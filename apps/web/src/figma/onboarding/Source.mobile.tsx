'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ONB, OnbButton, OnbMobileFrame } from './shell';

/**
 * 02 Source — mobile (Figma 1:19 / inner 36:*). 393×852, warm/cream.
 * Back arrow + progress bar · Mage avatar + chat bubble · headline · subtitle ·
 * four source-type option cards (PDF selected by default) · Continue CTA.
 * Selecting a card highlights it with a purple ring + lavender fill;
 * CTA → 03-sample.
 */

type SourceOption = 'pdf' | 'notes' | 'images' | 'demo';

// ─── Icon components (SVG, no extra libs) ────────────────────────────────────

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

function SparkleIcon() {
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

// ─── Option card ─────────────────────────────────────────────────────────────

interface CardProps {
  id: SourceOption;
  selected: boolean;
  onSelect: (id: SourceOption) => void;
  iconBg: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  /** Optional badge top-right (e.g. "Recommended"). */
  badge?: React.ReactNode;
}

function OptionCard({ id, selected, onSelect, iconBg, icon, label, description, badge }: CardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={selected}
      style={{
        display: 'flex',
        alignItems: 'center',
        width: '100%',
        height: 78,
        borderRadius: 20,
        border: selected ? `2px solid ${ONB.primary}` : `1.4px solid ${ONB.line}`,
        background: selected ? ONB.lavender : ONB.white,
        boxShadow: selected ? 'none' : '0px 5px 14px rgba(58,46,102,0.06)',
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
          width: 46,
          height: 46,
          borderRadius: 13,
          background: selected ? ONB.white : iconBg,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          marginLeft: 14,
          transition: 'background 0.15s',
        }}
      >
        {icon}
      </div>

      {/* Text */}
      <div style={{ marginLeft: 14, flex: 1, minWidth: 0 }}>
        <span
          style={{
            fontFamily: ONB.font,
            fontWeight: 600,
            fontSize: 16.5,
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
            fontSize: 13,
            color: ONB.muted,
            lineHeight: 1.26,
            display: 'block',
            marginTop: 4,
          }}
        >
          {description}
        </span>
      </div>

      {/* Unselected: empty circle checkmark */}
      {!selected && !badge && (
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 12,
            border: `1.6px solid ${ONB.paperLine}`,
            flexShrink: 0,
            marginRight: 14,
          }}
        />
      )}

      {/* Badge (top-right, absolute) */}
      {badge && (
        <div style={{ position: 'absolute', top: 9, right: 10 }}>
          {badge}
        </div>
      )}
    </button>
  );
}

// ─── Screen ──────────────────────────────────────────────────────────────────

export default function SourceMobile() {
  const router = useRouter();
  const [selected, setSelected] = useState<SourceOption>('pdf');

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
          onClick={() => router.push('/figma/onboarding/01-welcome')}
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

        {/* Progress track — step 1/4, ~19% (65 / 345px) */}
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
              width: '18.8%',
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
          }}
        >
          <img
            src="/figma/onboarding/mage-avatar.png"
            alt="Mage"
            width={44}
            height={44}
            style={{ display: 'block', objectFit: 'contain' }}
          />
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
          What should we turn into a path first?
        </div>
      </div>

      {/* Headline */}
      <h1
        style={{
          margin: '22px 24px 0',
          fontFamily: ONB.font,
          fontWeight: 700,
          fontSize: 27,
          lineHeight: 1.14,
          letterSpacing: '-0.405px',
          color: ONB.ink,
        }}
      >
        Add your study material
      </h1>

      {/* Subtitle */}
      <p
        style={{
          margin: '8px 24px 0',
          fontFamily: ONB.font,
          fontWeight: 400,
          fontSize: 15.5,
          lineHeight: 1.42,
          color: ONB.muted,
          maxWidth: 336,
        }}
      >
        Use your own material, or try a sample path before uploading anything.
      </p>

      {/* Source cards */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          padding: '22px 24px 0',
        }}
      >
        <OptionCard
          id="pdf"
          selected={selected === 'pdf'}
          onSelect={setSelected}
          iconBg={ONB.lavender}
          icon={<PdfIcon color={ONB.primaryInk} />}
          label="Upload PDF or slides"
          description="Best for school notes and presentations"
          badge={
            <div
              style={{
                background: ONB.gold,
                borderRadius: 10.5,
                padding: '4px 8px',
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
          }
        />

        <OptionCard
          id="notes"
          selected={selected === 'notes'}
          onSelect={setSelected}
          iconBg={ONB.lavender}
          icon={<NotesIcon color={ONB.primaryInk} />}
          label="Paste notes"
          description="Paste copied text or summaries"
        />

        <OptionCard
          id="images"
          selected={selected === 'images'}
          onSelect={setSelected}
          iconBg={ONB.lavender}
          icon={<ImageIcon color={ONB.primaryInk} />}
          label="Upload images"
          description="Use photos of worksheets or handwritten notes"
        />

        <OptionCard
          id="demo"
          selected={selected === 'demo'}
          onSelect={setSelected}
          iconBg="#fff3d6"
          icon={<SparkleIcon />}
          label="See 2-minute demo"
          description="Experience a full path before uploading"
        />
      </div>

      {/* CTA pinned to bottom */}
      <div style={{ marginTop: 'auto', padding: '24px 24px 10px' }}>
        <OnbButton block radius={18} height={56} onClick={() => router.push('/figma/onboarding/03-sample')}>
          Continue
        </OnbButton>
      </div>
    </OnbMobileFrame>
  );
}
