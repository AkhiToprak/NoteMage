'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ONB, OnbButton, OnbHomeIndicator, OnbStatusBar, Sparkle, onb } from './shell';

/**
 * 07 Path reveal — mobile (Figma 1:29). 393-wide, warm cream.
 *
 * Layout:
 *   - Status bar
 *   - Title + sparkles "Your path is ready."
 *   - Mage speech bubble ("I found 6 topics…")
 *   - Summary card: path title, stats grid, estimated time
 *   - "Your learning path" section with trail (vertical connector + nodes)
 *   - Sticky bottom CTA "Start first section" + ghost "Edit path"
 *   - Home indicator
 *
 * Interaction: tapping a node selects it (onb.tap). Primary CTA → 08-study-session.
 * Screen scrolls — content extends beyond one viewport.
 */

/** Node states: active (step 1), locked (steps 2–4), special (review+exam) */
type NodeKind = 'active' | 'locked' | 'review' | 'exam';

interface PathNode {
  id: number;
  title: string;
  duration: string;
  kind: NodeKind;
  tag?: { label: string; color: 'purple' | 'gold' | null };
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
  { id: 5, title: 'Weak-point review', duration: 'Adaptive', kind: 'review' },
  { id: 6, title: 'Exam mode', duration: 'Final practice', kind: 'exam' },
];

/** Marker circle for each step in the trail */
function NodeMarker({ node, active }: { node: PathNode; active: boolean }) {
  const size = 38;
  if (node.kind === 'active') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 19,
          background: ONB.primary,
          boxShadow: '0px 5px 6px rgba(124,92,255,0.55)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: ONB.white,
            fontSize: 13,
            fontWeight: 700,
            fontFamily: ONB.font,
            lineHeight: 1,
          }}
        >
          ▶
        </span>
      </div>
    );
  }
  if (node.kind === 'review') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 19,
          background: ONB.gold,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: '#7a5200',
            fontSize: 17,
            fontWeight: 700,
            fontFamily: ONB.font,
            lineHeight: 1,
          }}
        >
          ↺
        </span>
      </div>
    );
  }
  if (node.kind === 'exam') {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: 19,
          background: '#ef6351',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <span
          style={{
            color: ONB.white,
            fontSize: 16,
            fontWeight: 700,
            fontFamily: ONB.font,
            lineHeight: 1,
          }}
        >
          ★
        </span>
      </div>
    );
  }
  /* locked */
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: 19,
        background: ONB.white,
        border: `2px solid ${ONB.paperLine}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          color: '#a1a7b3',
          fontSize: 15,
          fontWeight: 700,
          fontFamily: ONB.font,
          lineHeight: 1,
        }}
      >
        {node.id}
      </span>
    </div>
  );
}

/** Tag pill inside a node card */
function NodeTag({ label, color }: { label: string; color: 'purple' | 'gold' | null }) {
  if (!color) return null;
  const isPurple = color === 'purple';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        height: 22,
        paddingInline: 9,
        borderRadius: 11,
        background: isPurple ? ONB.lavender : '#fff3d6',
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 5,
          height: 5,
          borderRadius: '50%',
          background: isPurple ? ONB.primary : '#ffc83d',
          flexShrink: 0,
        }}
      />
      <span
        style={{
          color: isPurple ? ONB.primaryInk : '#7a5200',
          fontSize: 11,
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

export default function PathRevealMobile() {
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<number>(1);

  return (
    /* We use a plain scrollable column, not OnbMobileFrame, so we control the
       sticky footer ourselves. OnbMobileFrame sets overflow:hidden which stops
       scrolling of long content. */
    <div
      style={{
        width: '100%',
        maxWidth: 393,
        marginInline: 'auto',
        minHeight: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: ONB.cream,
        color: ONB.ink,
        fontFamily: ONB.font,
        position: 'relative',
      }}
    >
      {/* Status bar */}
      <OnbStatusBar />

      {/* Scrollable content */}
      <div style={{ flex: '1 0 auto', paddingBottom: 120 }}>
        {/* ── Title section ── */}
        <div style={{ position: 'relative', padding: '10px 24px 0' }}>
          {/* gold sparkle top-right of heading */}
          <Sparkle
            size={16}
            color={ONB.gold}
            rotate={-12}
            style={{ position: 'absolute', right: 68, top: 16 }}
          />
          <Sparkle
            size={11}
            color={ONB.primary}
            style={{ position: 'absolute', left: 24, top: 52 }}
          />
          <h1
            style={{
              margin: 0,
              color: ONB.ink,
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 30,
              lineHeight: 1.12,
              letterSpacing: '-0.6px',
            }}
          >
            Your path is ready.
          </h1>
        </div>

        {/* ── Mage speech bubble ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 0,
            marginTop: 16,
            padding: '0 24px',
          }}
        >
          {/* Mage avatar bubble */}
          <div
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              background: ONB.lavender,
              border: `2px solid ${ONB.white}`,
              overflow: 'hidden',
              flexShrink: 0,
              position: 'relative',
            }}
          >
            <img
              src="/figma/onboarding/mage-avatar.png"
              alt="Mage"
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                objectFit: 'contain',
              }}
            />
          </div>

          {/* Speech bubble */}
          <div
            style={{
              marginLeft: 10,
              flex: 1,
              background: ONB.white,
              border: `1px solid ${ONB.line}`,
              borderRadius: 16,
              padding: '10px 14px',
              boxShadow: '0px 4px 6px rgba(58,46,102,0.06)',
              minHeight: 82,
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <p
              style={{
                margin: 0,
                color: ONB.ink,
                fontFamily: ONB.font,
                fontSize: 15,
                fontWeight: 500,
                lineHeight: 1.34,
              }}
            >
              I found 6 topics, pulled the key ideas from your material, and prepared your first session.
            </p>
          </div>
        </div>

        {/* ── Summary card ── */}
        <div
          style={{
            margin: '16px 24px 0',
            background: ONB.white,
            border: `1.2px solid ${ONB.line}`,
            borderRadius: 24,
            overflow: 'hidden',
            boxShadow: '0px 5px 16px rgba(58,46,102,0.07)',
          }}
        >
          {/* Card header */}
          <div style={{ padding: '16.8px 16.8px 0' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              {/* Icon tile */}
              <div
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 13,
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
              <div style={{ flex: 1, minWidth: 0 }}>
                {/* "Built from your material" pill */}
                <div
                  style={{
                    display: 'inline-block',
                    background: '#fff3d6',
                    borderRadius: 11,
                    padding: '4px 8px',
                    marginBottom: 4,
                  }}
                >
                  <span
                    style={{
                      color: '#7a5200',
                      fontSize: 10.5,
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
                    fontSize: 20,
                    fontWeight: 700,
                    lineHeight: 1.3,
                    whiteSpace: 'nowrap',
                  }}
                >
                  SQL Databases
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    color: ONB.muted,
                    fontFamily: ONB.font,
                    fontSize: 12.5,
                    fontWeight: 500,
                    lineHeight: 1.3,
                  }}
                >
                  Generated from Sample Material
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    color: ONB.primaryInk,
                    fontFamily: ONB.font,
                    fontSize: 12.5,
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
          <div
            style={{
              height: 1,
              background: '#e3dccd',
              margin: '13px 16.8px 0',
            }}
          />

          {/* Stats row */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr 1fr',
              padding: '14px 16.8px 0',
              gap: 0,
            }}
          >
            {[
              { val: '6', label: 'Topics' },
              { val: '34', label: 'Key ideas' },
              { val: '18', label: 'Questions' },
              { val: '4', label: 'Reviews' },
            ].map(({ val, label }) => (
              <div key={label} style={{ textAlign: 'center' }}>
                <p
                  style={{
                    margin: 0,
                    color: ONB.ink,
                    fontFamily: ONB.font,
                    fontSize: 20,
                    fontWeight: 800,
                    lineHeight: 1.3,
                  }}
                >
                  {val}
                </p>
                <p
                  style={{
                    margin: '4px 0 0',
                    color: ONB.muted,
                    fontFamily: ONB.font,
                    fontSize: 11.5,
                    fontWeight: 500,
                    lineHeight: 1.3,
                  }}
                >
                  {label}
                </p>
              </div>
            ))}
          </div>

          {/* Estimated time pill */}
          <div
            style={{
              margin: '14px 16.8px 16.8px',
              background: ONB.lavender,
              borderRadius: 12,
              height: 40,
              display: 'flex',
              alignItems: 'center',
              paddingInline: 14,
              gap: 8,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: ONB.primaryInk }}>
              schedule
            </span>
            <span
              style={{
                color: ONB.primaryInk,
                fontFamily: ONB.font,
                fontSize: 13.5,
                fontWeight: 600,
                lineHeight: 1.3,
              }}
            >
              Estimated time · 2h 20m
            </span>
          </div>
        </div>

        {/* ── Path section header ── */}
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            padding: '24px 24px 0',
          }}
        >
          <span
            style={{
              color: ONB.ink,
              fontFamily: ONB.font,
              fontSize: 17,
              fontWeight: 700,
              lineHeight: 1.3,
            }}
          >
            Your learning path
          </span>
          <span
            style={{
              color: ONB.muted,
              fontFamily: ONB.font,
              fontSize: 13.5,
              fontWeight: 500,
              lineHeight: 1.3,
            }}
          >
            6 steps
          </span>
        </div>

        {/* ── Trail ── */}
        <div
          style={{
            position: 'relative',
            padding: '12px 24px 0',
          }}
        >
          {/* Vertical connector line: from first node marker center down to last marker */}
          <div
            style={{
              position: 'absolute',
              left: 43, /* 24px padding + 19px = center of 38px marker */
              top: 31, /* 12px + ~19px marker half-height */
              width: 2,
              background: ONB.paperLine,
              borderRadius: 1,
              /* Height calculated: 5 connectors × 78px spacing ≈ 390 */
              height: 390,
            }}
          />

          {PATH_NODES.map((node, idx) => {
            const isSelected = selectedId === node.id;
            const isActive = node.kind === 'active';
            return (
              <div
                key={node.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  marginBottom: idx < PATH_NODES.length - 1 ? 20 : 0,
                  position: 'relative',
                  zIndex: 1,
                }}
              >
                <NodeMarker node={node} active={isActive} />

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
                    height: 58,
                    borderRadius: 16,
                    padding: '0 14px',
                    border: isActive
                      ? `2px solid ${ONB.primary}`
                      : `1.3px solid ${ONB.line}`,
                    background: isActive ? ONB.lavender : ONB.white,
                    boxShadow: isActive ? 'none' : '0px 5px 8px rgba(58,46,102,0.07)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), opacity 0.2s cubic-bezier(0.22,1,0.36,1)',
                    opacity: node.kind === 'locked' ? 0.94 : 1,
                  }}
                >
                  <div>
                    <p
                      style={{
                        margin: 0,
                        color: isActive ? ONB.primaryInk : ONB.ink,
                        fontFamily: ONB.font,
                        fontSize: 15.5,
                        fontWeight: 600,
                        lineHeight: 1.3,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {node.title}
                    </p>
                    <p
                      style={{
                        margin: '2px 0 0',
                        color: node.kind === 'review'
                          ? '#7a5200'
                          : node.kind === 'exam'
                            ? '#b23423'
                            : ONB.muted,
                        fontFamily: ONB.font,
                        fontSize: 12.5,
                        fontWeight: 500,
                        lineHeight: 1.3,
                      }}
                    >
                      {node.duration}
                    </p>
                  </div>
                  {node.tag && (
                    <NodeTag label={node.tag.label} color={node.tag.color} />
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Sticky bottom CTA ── */}
      <div
        style={{
          position: 'sticky',
          bottom: 0,
          left: 0,
          right: 0,
          background: ONB.cream,
          padding: '12px 24px 10px',
          borderTop: `1px solid ${ONB.line}`,
        }}
      >
        <OnbButton
          block
          radius={18}
          height={56}
          onClick={() => router.push('/figma/onboarding/08-study-session')}
        >
          Start first section
        </OnbButton>
        <button
          type="button"
          style={{
            display: 'block',
            width: '100%',
            marginTop: 10,
            border: 'none',
            background: 'transparent',
            color: ONB.primary,
            fontFamily: ONB.font,
            fontSize: 16,
            fontWeight: 600,
            textAlign: 'center',
            cursor: 'pointer',
          }}
        >
          Edit path
        </button>
      </div>

      {/* Home indicator */}
      <OnbHomeIndicator />
    </div>
  );
}
