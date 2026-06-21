'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbButton, OnbWebFrame, Sparkle, onb } from './shell';

/**
 * 07 Path reveal — web (Figma 48:14). 1440-designed cream layout.
 *
 * Layout:
 *   - Top nav: logo (left) | "Log in" + "Get started" (right)
 *   - Centered two-column content area:
 *       Left:  Mage speech-bubble header + Summary card
 *       Right: "Your learning path" trail of nodes
 *   - Below trail: "Start first section" (filled) + "Edit path" (outline) buttons
 *
 * Interaction: tapping a node selects/highlights it. Primary CTA → 08-study-session.
 */

type NodeKind = 'active' | 'locked' | 'review' | 'exam';

interface PathNode {
  id: number;
  title: string;
  duration: string;
  kind: NodeKind;
  durationColor?: string;
  tag?: { label: string; color: 'purple' | 'gold' };
}

const PATH_NODES: PathNode[] = [
  {
    id: 1,
    title: 'Database basics',
    duration: '10 min',
    kind: 'active',
    tag: { label: 'From pages 2–4', color: 'purple' },
  },
  {
    id: 2,
    title: 'Tables and keys',
    duration: '12 min',
    kind: 'locked',
    tag: { label: 'Appears often', color: 'purple' },
  },
  {
    id: 3,
    title: 'Relationships',
    duration: '15 min',
    kind: 'locked',
    tag: { label: 'From slide 8', color: 'purple' },
  },
  {
    id: 4,
    title: 'Queries',
    duration: '15 min',
    kind: 'locked',
    tag: { label: 'Likely exam topic', color: 'gold' },
  },
  {
    id: 5,
    title: 'Weak-point review',
    duration: 'Adaptive',
    kind: 'review',
    durationColor: '#7a5200',
  },
  {
    id: 6,
    title: 'Exam mode',
    duration: 'Final practice',
    kind: 'exam',
    durationColor: '#b23423',
  },
];

function NodeMarker({ node }: { node: PathNode }) {
  const size = 44;
  if (node.kind === 'active') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 22,
          background: ONB.primary,
          boxShadow: '0px 6px 7px rgba(124,92,255,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ color: ONB.white, fontSize: 14, fontWeight: 700, fontFamily: ONB.font }}>▶</span>
      </div>
    );
  }
  if (node.kind === 'review') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 22,
          background: ONB.gold,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ color: '#7a5200', fontSize: 18, fontWeight: 700, fontFamily: ONB.font }}>↺</span>
      </div>
    );
  }
  if (node.kind === 'exam') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 22,
          background: '#ef6351',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span style={{ color: ONB.white, fontSize: 17, fontWeight: 700, fontFamily: ONB.font }}>★</span>
      </div>
    );
  }
  /* locked */
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 22,
        background: ONB.white,
        border: `2px solid ${ONB.paperLine}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span style={{ color: '#a1a7b3', fontSize: 17, fontWeight: 700, fontFamily: ONB.font }}>
        {node.id}
      </span>
    </div>
  );
}

function NodeTag({ label, color }: { label: string; color: 'purple' | 'gold' }) {
  const isPurple = color === 'purple';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        height: 24,
        paddingInline: 10,
        borderRadius: 12,
        background: isPurple ? ONB.lavender : '#fff3d6',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: isPurple ? ONB.primary : '#ffc83d',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          color: isPurple ? ONB.primaryInk : '#7a5200',
          fontSize: 12,
          fontWeight: 600,
          fontFamily: ONB.font,
          lineHeight: 1.3,
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </span>
    </div>
  );
}

export default function PathRevealWeb() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number>(1);

  return (
    <OnbWebFrame>
      {/* ── Top nav ── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '46px 64px 0',
          maxWidth: 1440,
          marginInline: 'auto',
        }}
      >
        <Mage pose="logo-color" size={150} alt="NoteMage" priority />
        <div style={{ display: 'flex', alignItems: 'center', gap: 36 }}>
          <button
            type="button"
            style={{
              border: 'none',
              background: 'transparent',
              color: ONB.muted,
              fontFamily: ONB.font,
              fontSize: 16,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Log in
          </button>
          <OnbButton radius={16} height={58} style={{ padding: '0 32px' }}>
            Get started
          </OnbButton>
        </div>
      </header>

      {/* ── Main content ── */}
      <main
        style={{
          maxWidth: 1312,
          marginInline: 'auto',
          padding: '60px 64px 100px',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 64,
        }}
      >
        {/* ── Left column: heading + summary card ── */}
        <div style={{ flex: '0 0 440px', maxWidth: 440 }}>
          {/* Title */}
          <div style={{ position: 'relative', marginBottom: 24 }}>
            <Sparkle
              size={22}
              color={ONB.gold}
              rotate={-12}
              style={{ position: 'absolute', right: -10, top: -6 }}
            />
            <Sparkle
              size={16}
              color={ONB.primary}
              style={{ position: 'absolute', left: -10, top: 8 }}
            />
            <h1
              style={{
                margin: 0,
                color: ONB.ink,
                fontFamily: ONB.font,
                fontWeight: 700,
                fontSize: 46,
                lineHeight: 1.3,
                letterSpacing: '-1.15px',
                textAlign: 'center',
              }}
            >
              Your path is ready.
            </h1>
          </div>

          {/* Mage speech bubble */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 20,
            }}
          >
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                background: ONB.lavender,
                border: `2px solid ${ONB.white}`,
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              <img
                src="/figma/onboarding/mage-avatar.png"
                alt="Mage"
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            </div>
            <div
              style={{
                flex: 1,
                background: ONB.white,
                border: `1px solid ${ONB.line}`,
                borderRadius: 18,
                padding: '14px 17px',
                boxShadow: '0px 5px 7px rgba(58,46,102,0.07)',
                height: 52,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <p
                style={{
                  margin: 0,
                  color: ONB.ink,
                  fontFamily: ONB.font,
                  fontSize: 16,
                  fontWeight: 500,
                  lineHeight: 1.38,
                  whiteSpace: 'nowrap',
                }}
              >
                I found 6 topics, pulled the key ideas from your material, and prepared your first session.
              </p>
            </div>
          </div>

          {/* Summary card */}
          <div
            style={{
              background: ONB.white,
              border: `1.2px solid ${ONB.line}`,
              borderRadius: 24,
              overflow: 'hidden',
              boxShadow: '0px 8px 24px rgba(58,46,102,0.08)',
            }}
          >
            {/* Card header */}
            <div style={{ padding: '26.8px 26.8px 0' }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                {/* Icon tile */}
                <div
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 16,
                    background: ONB.lavender,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <span className="material-symbols-outlined filled" style={{ fontSize: 24, color: ONB.primary }}>
                    database
                  </span>
                </div>
                <div style={{ flex: 1 }}>
                  <div
                    style={{
                      display: 'inline-block',
                      background: '#fff3d6',
                      borderRadius: 12,
                      padding: '5px 9px',
                      marginBottom: 5,
                    }}
                  >
                    <span
                      style={{
                        color: '#7a5200',
                        fontSize: 11,
                        fontWeight: 600,
                        fontFamily: ONB.font,
                        lineHeight: 1.3,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      Built from your material
                    </span>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      color: ONB.ink,
                      fontFamily: ONB.font,
                      fontSize: 24,
                      fontWeight: 700,
                      lineHeight: 1.3,
                    }}
                  >
                    SQL Databases
                  </p>
                  <p
                    style={{
                      margin: '4px 0 0',
                      color: ONB.muted,
                      fontFamily: ONB.font,
                      fontSize: 14,
                      fontWeight: 500,
                      lineHeight: 1.3,
                    }}
                  >
                    Generated from Sample Material
                  </p>
                  <p
                    style={{
                      margin: '3px 0 0',
                      color: ONB.primaryInk,
                      fontFamily: ONB.font,
                      fontSize: 14,
                      fontWeight: 600,
                      lineHeight: 1.3,
                    }}
                  >
                    Based on your goal: Exam
                  </p>
                </div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: '#e3dccd', margin: '20px 26.8px 0' }} />

            {/* Stats 2×2 grid */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '20px 0',
                padding: '20px 26.8px 0',
              }}
            >
              {[
                { val: '6', label: 'Topics' },
                { val: '34', label: 'Key ideas' },
                { val: '18', label: 'Questions' },
                { val: '4', label: 'Reviews' },
              ].map(({ val, label }) => (
                <div key={label}>
                  <p
                    style={{
                      margin: 0,
                      color: ONB.ink,
                      fontFamily: ONB.font,
                      fontSize: 26,
                      fontWeight: 800,
                      lineHeight: 1.3,
                    }}
                  >
                    {val}
                  </p>
                  <p
                    style={{
                      margin: '3px 0 0',
                      color: ONB.muted,
                      fontFamily: ONB.font,
                      fontSize: 13,
                      fontWeight: 500,
                      lineHeight: 1.3,
                    }}
                  >
                    {label}
                  </p>
                </div>
              ))}
            </div>

            {/* Estimated time */}
            <div style={{ padding: '20px 26.8px 26.8px' }}>
              <div
                style={{
                  background: ONB.lavender,
                  borderRadius: 14,
                  height: 46,
                  display: 'flex',
                  alignItems: 'center',
                  paddingInline: 18,
                  gap: 10,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: ONB.primaryInk }}>
                  schedule
                </span>
                <span
                  style={{
                    color: ONB.primaryInk,
                    fontFamily: ONB.font,
                    fontSize: 14.5,
                    fontWeight: 600,
                    lineHeight: 1.3,
                  }}
                >
                  Estimated time · 2h 20m
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right column: trail + CTA ── */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Section header */}
          <p
            style={{
              margin: '0 0 4px',
              color: ONB.ink,
              fontFamily: ONB.font,
              fontSize: 20,
              fontWeight: 700,
              lineHeight: 1.3,
            }}
          >
            Your learning path
          </p>
          <p
            style={{
              margin: '0 0 24px',
              color: ONB.muted,
              fontFamily: ONB.font,
              fontSize: 14,
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            6 steps · tap any node to preview
          </p>

          {/* Trail */}
          <div style={{ position: 'relative' }}>
            {/* Vertical connector line */}
            <div
              style={{
                position: 'absolute',
                left: 21, /* center of 44px marker */
                top: 44,
                width: 2,
                background: ONB.paperLine,
                borderRadius: 1,
                height: 440,
              }}
            />

            {PATH_NODES.map((node, idx) => {
              const isActive = node.kind === 'active';
              return (
                <div
                  key={node.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 20,
                    marginBottom: idx < PATH_NODES.length - 1 ? 20 : 0,
                    position: 'relative',
                    zIndex: 1,
                  }}
                >
                  <NodeMarker node={node} />

                  {/* Node card */}
                  <button
                    type="button"
                    className={onb.tap}
                    onClick={() => setSelectedId(node.id)}
                    style={{
                      flex: 1,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      height: 68,
                      borderRadius: 18,
                      padding: '0 18px',
                      border: isActive
                        ? `2px solid ${ONB.primary}`
                        : `1.3px solid ${ONB.line}`,
                      background: isActive ? ONB.lavender : ONB.white,
                      boxShadow: isActive ? 'none' : '0px 8px 12px rgba(58,46,102,0.08)',
                      cursor: 'pointer',
                      textAlign: 'left',
                      opacity: node.kind === 'locked' ? 0.95 : 1,
                      transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
                    }}
                  >
                    <div>
                      <p
                        style={{
                          margin: 0,
                          color: isActive ? ONB.primaryInk : ONB.ink,
                          fontFamily: ONB.font,
                          fontSize: 17.5,
                          fontWeight: 600,
                          lineHeight: 1.3,
                        }}
                      >
                        {node.title}
                      </p>
                      <p
                        style={{
                          margin: '3px 0 0',
                          color: node.durationColor ?? ONB.muted,
                          fontFamily: ONB.font,
                          fontSize: 13.5,
                          fontWeight: 500,
                          lineHeight: 1.3,
                        }}
                      >
                        {node.duration}
                      </p>
                    </div>
                    {node.tag && <NodeTag label={node.tag.label} color={node.tag.color} />}
                  </button>
                </div>
              );
            })}
          </div>

          {/* CTA row */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 16,
              marginTop: 32,
            }}
          >
            <OnbButton
              radius={16}
              height={58}
              style={{ padding: '0 40px' }}
              onClick={() => router.push('/figma/onboarding/08-study-session')}
            >
              Start first section
            </OnbButton>
            <button
              type="button"
              style={{
                height: 58,
                padding: '0 40px',
                borderRadius: 16,
                border: `1.6px solid ${ONB.paperLine}`,
                background: 'transparent',
                color: ONB.primary,
                fontFamily: ONB.font,
                fontSize: 17,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Edit path
            </button>
          </div>
        </div>
      </main>
    </OnbWebFrame>
  );
}
