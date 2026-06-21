'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbWebFrame, Sparkle } from './shell';

/**
 * W03 Sample — web (Figma 48:6 / inner 54:*). 1440-designed, cream.
 *
 * Left rail (lavender #f1ecfb) shows the mascot illustration + speech bubble.
 * Right content area has: headline, subtitle, three sample cards (vertical),
 * step list at bottom-left, and CTA at bottom-right.
 * Computer Science pre-selected; clicking any card toggles selection.
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
    description: 'Definitions, diagrams, and short practice questions.',
  },
  {
    id: 'history',
    subject: 'History',
    topic: 'Industrialisation',
    pillText: 'Great for essays',
    pillBg: '#fff3d6',
    pillColor: '#7a5200',
    tileBg: '#fff3d6',
    icon: 'account_balance',
    iconColor: '#7a5200',
    description: 'Timelines, causes, effects, and quiz practice.',
  },
  {
    id: 'cs',
    subject: 'Computer Science',
    topic: 'SQL Databases',
    pillText: 'Great for technical',
    pillBg: ONB.lavender,
    pillColor: ONB.primaryInk,
    tileBg: ONB.lavender,
    icon: 'storage',
    iconColor: ONB.primaryInk,
    description: 'Core concepts, worked examples, and exam-style questions.',
  },
] as const;

type SampleId = (typeof SAMPLES)[number]['id'];

const STEPS = [
  { n: 1, label: 'Add material', active: true },
  { n: 2, label: 'Set your goal', active: false },
  { n: 3, label: 'Pick your rhythm', active: false },
  { n: 4, label: 'Build your path', active: false },
];

export default function SampleWeb() {
  const router = useRouter();
  const [selected, setSelected] = useState<SampleId>('cs');

  return (
    <OnbWebFrame>
      <div style={{ display: 'flex', flex: 1, minHeight: 0 }}>
        {/* ── Left lavender rail (480px) ── */}
        <div
          style={{
            width: 480,
            flexShrink: 0,
            background: '#f1ecfb',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            paddingTop: 48,
          }}
        >
          {/* Logo */}
          <div style={{ position: 'absolute', top: 48, left: 48 }}>
            <Mage pose="logo-color" size={132} alt="NoteMage" priority />
          </div>

          {/* Sparkles around the mascot */}
          <Sparkle
            size={22}
            color={ONB.gold}
            rotate={-15}
            style={{ position: 'absolute', left: 372, top: 144 }}
          />
          <Sparkle
            size={14}
            color={ONB.gold}
            style={{ position: 'absolute', left: 96, top: 176 }}
          />
          <Sparkle
            size={13}
            color={ONB.gold}
            rotate={-20}
            style={{ position: 'absolute', left: 388, top: 368 }}
          />

          {/* Mascot illustration — centered in rail */}
          <div style={{ marginTop: 150, position: 'relative' }}>
            <Mage pose="default" size={244} alt="Mage" priority />
          </div>

          {/* Speech bubble */}
          <div
            style={{
              position: 'relative',
              marginTop: 20,
              marginLeft: 56,
              marginRight: 56,
              width: 368,
              background: ONB.white,
              border: `1px solid ${ONB.line}`,
              borderRadius: 20,
              boxShadow: '0px 6px 9px rgba(58,46,102,0.08)',
              padding: '16px 20px',
              minHeight: 78,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            {/* Triangle pointer (upward) */}
            <div
              style={{
                position: 'absolute',
                top: -12,
                left: '50%',
                transform: 'translateX(-50%)',
                width: 0,
                height: 0,
                borderLeft: '11px solid transparent',
                borderRight: '11px solid transparent',
                borderBottom: `12px solid ${ONB.white}`,
              }}
            />
            <p
              style={{
                margin: 0,
                fontFamily: ONB.font,
                fontWeight: 500,
                fontSize: 16,
                lineHeight: 1.4,
                color: ONB.ink,
                textAlign: 'center',
                width: '100%',
              }}
            >
              Pick a sample. I'll build a path, quiz you, and show how weak points work.
            </p>
          </div>

          {/* Step list */}
          <div
            style={{
              position: 'absolute',
              bottom: 80,
              left: 72,
              display: 'flex',
              flexDirection: 'column',
              gap: 0,
            }}
          >
            {STEPS.map((step, i) => (
              <div key={step.n} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, paddingBottom: i < STEPS.length - 1 ? 44 : 0 }}>
                {/* Vertical connector line (between steps) */}
                {i < STEPS.length - 1 && (
                  <div
                    style={{
                      position: 'absolute',
                      left: 13,
                      top: 28,
                      width: 2,
                      height: 36,
                      background: '#d9cef2',
                      borderRadius: 1,
                    }}
                  />
                )}
                {/* Step badge */}
                <div
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    background: step.active ? ONB.primary : ONB.white,
                    border: step.active ? 'none' : `2px solid #d9cef2`,
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
                      lineHeight: 1.3,
                      color: step.active ? ONB.white : '#a1a7b3',
                    }}
                  >
                    {step.n}
                  </span>
                </div>
                {/* Label */}
                <span
                  style={{
                    fontFamily: ONB.font,
                    fontWeight: step.active ? 600 : 500,
                    fontSize: 15,
                    lineHeight: 1.3,
                    color: step.active ? ONB.ink : '#a1a7b3',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {step.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ── Right content area ── */}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            padding: '108px 64px 80px 96px',
            minWidth: 0,
          }}
        >
          {/* "No upload needed" pill */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              height: 25,
              paddingLeft: 8,
              paddingRight: 12,
              borderRadius: 12.5,
              background: '#e2f5eb',
              alignSelf: 'flex-start',
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

          {/* Headline */}
          <h1
            style={{
              margin: '16px 0 0',
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 40,
              lineHeight: 1.08,
              letterSpacing: '-0.8px',
              color: ONB.ink,
              maxWidth: 768,
            }}
          >
            Choose a sample path
          </h1>

          {/* Subtitle */}
          <p
            style={{
              margin: '16px 0 0',
              fontFamily: ONB.font,
              fontWeight: 400,
              fontSize: 18,
              lineHeight: 1.46,
              color: ONB.muted,
              maxWidth: 700,
            }}
          >
            Each sample is a real, ready-made path so you can feel the full experience.
          </p>

          {/* Sample cards — horizontal row of 3 */}
          <div
            style={{
              display: 'flex',
              gap: 18.5,
              marginTop: 40,
              flexWrap: 'wrap',
            }}
          >
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
                    width: 243,
                    height: 268,
                    borderRadius: 22,
                    background: ONB.white,
                    border: isSelected ? `2px solid ${ONB.primary}` : `1.4px solid ${ONB.line}`,
                    boxShadow: isSelected
                      ? '0px 10px 28px 0px rgba(124,92,255,0.20)'
                      : '0px 6px 18px 0px rgba(58,46,102,0.07)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    textAlign: 'left',
                    padding: 0,
                    transition:
                      'box-shadow 0.2s cubic-bezier(0.22,1,0.36,1), border-color 0.2s cubic-bezier(0.22,1,0.36,1)',
                  }}
                >
                  {/* Icon tile */}
                  <div
                    style={{
                      position: 'absolute',
                      left: 20.6,
                      top: 20.6,
                      width: 58,
                      height: 58,
                      borderRadius: 16,
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
                      left: 20.6,
                      top: 92.6,
                      margin: 0,
                      fontFamily: ONB.font,
                      fontWeight: 700,
                      fontSize: 19,
                      lineHeight: 1.16,
                      color: ONB.ink,
                      width: 199,
                    }}
                  >
                    {s.subject}
                  </p>

                  {/* Topic */}
                  <p
                    style={{
                      position: 'absolute',
                      left: 20.6,
                      top: 122.6,
                      margin: 0,
                      fontFamily: ONB.font,
                      fontWeight: 500,
                      fontSize: 14,
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
                      left: 20.6,
                      top: 148.6,
                      height: 24,
                      paddingLeft: 8,
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
                      left: 20.6,
                      top: 186.6,
                      width: 199,
                      margin: 0,
                      fontFamily: ONB.font,
                      fontWeight: 400,
                      fontSize: 14,
                      lineHeight: 1.44,
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
                        right: 20,
                        top: 20,
                        width: 28,
                        height: 28,
                        borderRadius: 14,
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

          {/* ── Bottom bar: Back + CTA ── */}
          <div
            style={{
              marginTop: 'auto',
              paddingTop: 60,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <button
              type="button"
              onClick={() => router.push('/figma/onboarding/02-source')}
              style={{
                border: 'none',
                background: 'transparent',
                fontFamily: ONB.font,
                fontWeight: 600,
                fontSize: 16,
                lineHeight: 1.3,
                color: ONB.muted,
                cursor: 'pointer',
              }}
            >
              Back
            </button>

            <OnbButton
              radius={16}
              height={56}
              style={{ width: 240 }}
              onClick={() => router.push('/figma/onboarding/04-goal')}
            >
              Use this sample
            </OnbButton>
          </div>
        </div>
      </div>
    </OnbWebFrame>
  );
}
