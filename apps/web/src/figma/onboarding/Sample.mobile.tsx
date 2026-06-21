'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbMobileFrame, onb } from './shell';

/**
 * 03 Sample — mobile (Figma 1:21 / inner 35:*). 393×852, warm/cream.
 *
 * User selects one of three sample study paths (Biology, History, Computer
 * Science). The third card (Computer Science) starts pre-selected, matching
 * the Figma default. Selecting a card highlights it with a purple ring +
 * check badge. CTA routes to 04-goal; back arrow routes to 02-source.
 */

const SAMPLES = [
  {
    id: 'biology',
    subject: 'Biology',
    topic: 'Cell Structure',
    pillText: 'Great for diagrams',
    pillBg: '#e2f5eb',
    pillColor: '#0f6b3d',
    tileBg: '#e2f5eb',
    icon: 'radio_button_checked',
    iconColor: '#0f6b3d',
    description: 'Learn from definitions, diagrams, and short practice questions.',
  },
  {
    id: 'history',
    subject: 'History',
    topic: 'Industrialisation',
    pillText: 'Great for essay prep',
    pillBg: '#fff3d6',
    pillColor: '#7a5200',
    tileBg: '#fff3d6',
    icon: 'account_balance',
    iconColor: '#7a5200',
    description: 'Turn dense notes into timelines, causes, effects, and quiz practice.',
  },
  {
    id: 'cs',
    subject: 'Computer Science',
    topic: 'SQL Databases',
    pillText: 'Great for technical topics',
    pillBg: ONB.lavender,
    pillColor: ONB.primaryInk,
    tileBg: ONB.lavender,
    icon: 'storage',
    iconColor: ONB.primaryInk,
    description: 'Study core concepts, worked examples, and common exam-style questions.',
  },
] as const;

type SampleId = (typeof SAMPLES)[number]['id'];

export default function SampleMobile() {
  const router = useRouter();
  const [selected, setSelected] = useState<SampleId>('cs');

  return (
    <OnbMobileFrame>
      {/* ── Status-bar row: back button + progress bar ── */}
      <div style={{ position: 'relative', height: 54, flexShrink: 0, marginTop: 10 }}>
        {/* Back button */}
        <button
          type="button"
          aria-label="Go back"
          className={onb.tap}
          onClick={() => router.push('/figma/onboarding/02-source')}
          style={{
            position: 'absolute',
            left: 20,
            top: 0,
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
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 18, color: ONB.ink, fontVariationSettings: "'wght' 600" }}
          >
            arrow_back
          </span>
        </button>

        {/* Progress track */}
        <div
          style={{
            position: 'absolute',
            left: 72,
            top: 17,
            width: 297,
            height: 6,
            borderRadius: 3,
            background: ONB.line,
          }}
        />
        {/* Progress fill — step 1 of ~4 ≈ 65px */}
        <div
          style={{
            position: 'absolute',
            left: 72,
            top: 17,
            width: 65,
            height: 6,
            borderRadius: 3,
            background: ONB.primary,
          }}
        />
      </div>

      {/* ── Mascot speech bubble ── */}
      {/* Figma: av at left:24,top:104; bub at left:80,top:86 (bubble is 18px higher) */}
      <div
        style={{
          position: 'relative',
          height: 104, // room for bubble (top:86 + h:82 - top:104 = starts at 86, ends at 168, outer = 82+18=100px)
          flexShrink: 0,
          marginTop: 8,
        }}
      >
        {/* Avatar circle — left:24, top:18 relative (Figma: top 104, bubble top 86, delta=18) */}
        <div
          style={{
            position: 'absolute',
            left: 24,
            top: 18,
            width: 46,
            height: 46,
            borderRadius: 23,
            background: ONB.lavender,
            border: `2px solid ${ONB.white}`,
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Mage pose="default" size={44} alt="Mage" priority />
        </div>

        {/* Bubble — left:80, top:0 (relative to this container's top:86) */}
        <div
          style={{
            position: 'absolute',
            left: 80,
            top: 0,
            width: 289,
            minHeight: 82,
            background: ONB.white,
            border: `1px solid ${ONB.line}`,
            borderRadius: 16,
            boxShadow: '0px 4px 6px rgba(58,46,102,0.06)',
            padding: '10px 13px',
            display: 'flex',
            alignItems: 'center',
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
              width: 261,
            }}
          >
            Pick a sample. I'll build a path, quiz you, and show how weak points work.
          </p>
        </div>
      </div>

      {/* ── Headline + pill ── */}
      <div style={{ padding: '0 24px', marginTop: 24, flexShrink: 0 }}>
        <h1
          style={{
            margin: 0,
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 27,
            lineHeight: 1.14,
            letterSpacing: '-0.405px',
            color: ONB.ink,
          }}
        >
          Choose a sample path
        </h1>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            marginTop: 16,
            height: 25,
            paddingLeft: 9,
            paddingRight: 12,
            borderRadius: 12.5,
            background: '#e2f5eb',
          }}
        >
          <span
            style={{
              fontFamily: ONB.font,
              fontWeight: 600,
              fontSize: 12,
              lineHeight: 1.3,
              color: '#0f6b3d',
              whiteSpace: 'nowrap',
            }}
          >
            No upload needed
          </span>
        </div>
      </div>

      {/* ── Sample cards ── */}
      <div style={{ padding: '16px 24px 0', display: 'flex', flexDirection: 'column', gap: 16, flexShrink: 0 }}>
        {SAMPLES.map((s) => {
          const isSelected = selected === s.id;
          return (
            <button
              key={s.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => setSelected(s.id)}
              style={{
                position: 'relative',
                width: '100%',
                height: 153,
                borderRadius: 22,
                background: ONB.white,
                border: isSelected ? `2px solid ${ONB.primary}` : `1.4px solid ${ONB.line}`,
                boxShadow: isSelected
                  ? '0px 8px 24px 0px rgba(124,92,255,0.22)'
                  : '0px 5px 14px 0px rgba(58,46,102,0.06)',
                overflow: 'hidden',
                cursor: 'pointer',
                textAlign: 'left',
                padding: 0,
                transition: 'box-shadow 0.2s cubic-bezier(0.22,1,0.36,1), border-color 0.2s cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              {/* Icon tile */}
              <div
                style={{
                  position: 'absolute',
                  left: 14.6,
                  top: 14.6,
                  width: 52,
                  height: 52,
                  borderRadius: 15,
                  background: s.tileBg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 24, color: s.iconColor }}
                >
                  {s.icon}
                </span>
              </div>

              {/* Subject */}
              <p
                style={{
                  position: 'absolute',
                  left: 78.6,
                  top: 14.6,
                  margin: 0,
                  fontFamily: ONB.font,
                  fontWeight: 700,
                  fontSize: 17,
                  lineHeight: 1.3,
                  color: ONB.ink,
                  whiteSpace: 'nowrap',
                }}
              >
                {s.subject}
              </p>

              {/* Topic */}
              <p
                style={{
                  position: 'absolute',
                  left: 78.6,
                  top: 39.6,
                  margin: 0,
                  fontFamily: ONB.font,
                  fontWeight: 500,
                  fontSize: 13.5,
                  lineHeight: 1.3,
                  color: ONB.muted,
                  whiteSpace: 'nowrap',
                }}
              >
                {s.topic}
              </p>

              {/* Badge pill */}
              <div
                style={{
                  position: 'absolute',
                  left: 78.6,
                  top: 65.6,
                  height: 24,
                  paddingLeft: 9,
                  paddingRight: 10,
                  borderRadius: 12,
                  background: s.pillBg,
                  display: 'inline-flex',
                  alignItems: 'center',
                }}
              >
                <span
                  style={{
                    fontFamily: ONB.font,
                    fontWeight: 600,
                    fontSize: 11.5,
                    lineHeight: 1.3,
                    color: s.pillColor,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {s.pillText}
                </span>
              </div>

              {/* Description */}
              <p
                style={{
                  position: 'absolute',
                  left: 14.6,
                  top: 100.6,
                  width: 313,
                  margin: 0,
                  fontFamily: ONB.font,
                  fontWeight: 400,
                  fontSize: 13.5,
                  lineHeight: 1.36,
                  color: ONB.muted,
                }}
              >
                {s.description}
              </p>

              {/* Selected check badge */}
              {isSelected && (
                <div
                  style={{
                    position: 'absolute',
                    right: 14,
                    top: 14,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    background: ONB.primary,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    style={{
                      fontFamily: ONB.font,
                      fontWeight: 700,
                      fontSize: 14,
                      color: ONB.white,
                      lineHeight: 1,
                    }}
                  >
                    ✓
                  </span>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* ── CTA ── */}
      <div style={{ padding: '20px 24px 10px', marginTop: 'auto', flexShrink: 0 }}>
        <OnbButton
          block
          radius={18}
          height={56}
          onClick={() => router.push('/figma/onboarding/04-goal')}
        >
          Use this sample
        </OnbButton>
      </div>
    </OnbMobileFrame>
  );
}
