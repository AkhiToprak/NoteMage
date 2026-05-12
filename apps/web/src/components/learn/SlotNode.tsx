'use client';

import { CheckpointIcon } from '@/components/icons/CheckpointIcons';
import type { PathSlot } from '@/components/learn/PathView';

// Phase 10.5 — Duolingo-style slot node. Rounded square with a flat
// drop-shadow, kind-specific icon, four visual states (locked /
// available / active / completed), an SVG completion ring on the
// active node tracking activities-done / activities-total, and 1–3
// golden stars below assessment slots.
//
// Animations are limited to transform + opacity (per CLAUDE.md). All
// motion respects `prefers-reduced-motion` via shared CSS in
// PathView's <style> block (.learn-path-* classes).

type NodeState = 'locked' | 'available' | 'active' | 'completed';

interface SlotNodeProps {
  slot: PathSlot;
  state: NodeState;
  /** 0-based slot index used to stagger the mount animation. */
  mountIndex: number;
  onClick: () => void;
}

const SIZE = 72;
const BUTTON_RADIUS = 22;
// Ring is a rounded rect that traces the button shape, sitting `RING_PAD`
// px outside the button on every side. Matching the button shape avoids
// the visual mismatch a plain circle creates when set behind a
// rounded-square button (the circle only peeks out at the left/right).
const RING_PAD = 14;
const RING_SIZE = SIZE + RING_PAD * 2;
const RING_STROKE = 5;
const RING_INNER = RING_SIZE - RING_STROKE;
// Path lies along the stroke center, so the corner radius shrinks by
// half the stroke width.
const RING_CORNER_R = BUTTON_RADIUS + RING_PAD - RING_STROKE / 2;
const RING_PERIMETER =
  4 * (RING_INNER - 2 * RING_CORNER_R) + 2 * Math.PI * RING_CORNER_R;

function activityCompletion(slot: PathSlot): { done: number; total: number; ratio: number } {
  const total = slot.activities.length;
  if (total === 0) return { done: 0, total: 0, ratio: 0 };
  const done = slot.activities.filter((a) => a.completed).length;
  return { done, total, ratio: done / total };
}

export default function SlotNode({ slot, state, mountIndex, onClick }: SlotNodeProps) {
  const isLocked = state === 'locked';
  const isCompleted = state === 'completed';
  const isActive = state === 'active';
  const { done, total, ratio } = activityCompletion(slot);

  // Background / border / icon color for each state. Always tokenized so
  // dark + light themes both work (per memory:
  // `feedback_light_mode_no_light_text`).
  const bg = isCompleted || isActive
    ? 'var(--primary)'
    : isLocked
      ? 'var(--surface-container-low)'
      : 'var(--surface-container)';
  const borderColor = isCompleted || isActive
    ? 'var(--primary)'
    : isLocked
      ? 'var(--outline-variant)'
      : 'var(--outline)';
  const iconColor = isCompleted || isActive
    ? 'var(--on-primary)'
    : isLocked
      ? 'var(--on-surface-variant)'
      : 'var(--on-surface)';
  // Layered drop-shadow — darker primary tint when filled, neutral
  // outline tint when not. Matches the Phase 10.5 spec's flat
  // `0 4px 0 <darker-of-bg>` look.
  const shadow = isCompleted || isActive
    ? '0 4px 0 var(--primary-container, var(--outline))'
    : isLocked
      ? '0 3px 0 var(--outline-variant)'
      : '0 3px 0 var(--outline-variant)';

  return (
    <div
      className="learn-path-slot-mount"
      style={{
        position: 'relative',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
        // Stagger mount animation by index (200ms total, ~30ms apart).
        // PathView's stylesheet defines the keyframes.
        animationDelay: `${mountIndex * 30}ms`,
      }}
    >
      {/* START speech bubble — only on the active slot. Sits in normal
          flow above the icon so it never crashes into the sticky section
          banner sitting above the slot column. */}
      {isActive ? (
        <span
          aria-hidden
          className="learn-path-start-bubble"
          style={{
            background: 'var(--primary)',
            color: 'var(--on-primary)',
            padding: '3px 10px',
            borderRadius: 'var(--radius-full)',
            fontSize: '10px',
            fontWeight: 800,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            boxShadow: '0 2px 0 var(--primary-container, var(--outline))',
          }}
        >
          Start
        </span>
      ) : null}

      <div
        style={{
          position: 'relative',
          width: `${RING_SIZE}px`,
          height: `${RING_SIZE}px`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* Completion ring — active slot only. SVG so we can drive
            stroke-dasharray off activity completion. */}
        {isActive && total > 0 ? (
          <svg
            aria-hidden
            width={RING_SIZE}
            height={RING_SIZE}
            viewBox={`0 0 ${RING_SIZE} ${RING_SIZE}`}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              pointerEvents: 'none',
            }}
          >
            <rect
              x={RING_STROKE / 2}
              y={RING_STROKE / 2}
              width={RING_INNER}
              height={RING_INNER}
              rx={RING_CORNER_R}
              fill="none"
              stroke="var(--outline-variant)"
              strokeWidth={RING_STROKE}
            />
            <rect
              x={RING_STROKE / 2}
              y={RING_STROKE / 2}
              width={RING_INNER}
              height={RING_INNER}
              rx={RING_CORNER_R}
              fill="none"
              stroke="var(--primary)"
              strokeWidth={RING_STROKE}
              strokeLinecap="round"
              strokeDasharray={RING_PERIMETER}
              strokeDashoffset={RING_PERIMETER * (1 - ratio)}
              style={{
                transition: 'stroke-dashoffset 0.45s cubic-bezier(0.34, 1.56, 0.64, 1)',
              }}
            />
          </svg>
        ) : null}

        {/* The node button itself. */}
        <button
          type="button"
          onClick={isLocked ? undefined : onClick}
          aria-label={`${slot.title}${isLocked ? ' (locked)' : ''}`}
          aria-disabled={isLocked || undefined}
          // Phase 10.7 — surface the "current step" to assistive tech.
          // The Duolingo-style path is a stepped sequence, so the
          // first unlocked-and-incomplete slot maps to aria-current=step.
          aria-current={isActive ? 'step' : undefined}
          className="learn-path-node-btn"
          style={{
            width: `${SIZE}px`,
            height: `${SIZE}px`,
            borderRadius: `${BUTTON_RADIUS}px`,
            background: bg,
            border: `2px solid ${borderColor}`,
            boxShadow: shadow,
            color: iconColor,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: isLocked ? 'default' : 'pointer',
            padding: 0,
            fontFamily: 'inherit',
            position: 'relative',
            // Spring scale on hover via inline transform (avoids
            // transition-all per CLAUDE.md).
          }}
        >
          <CheckpointIcon kind={slot.kind} size={34} color={iconColor} />

          {/* Completed badge — small check pill in the top-right corner
              so the user knows the slot is done at a glance. */}
          {isCompleted ? (
            <span
              aria-hidden
              style={{
                position: 'absolute',
                top: '-6px',
                right: '-6px',
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                background: 'var(--tertiary-container)',
                color: 'var(--on-tertiary-container)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid var(--surface)',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '14px', color: 'var(--on-tertiary-container)' }}
              >
                check
              </span>
            </span>
          ) : null}
        </button>
      </div>

      {/* Slot title. Wraps for readability. */}
      <span
        style={{
          maxWidth: `${RING_SIZE + 40}px`,
          fontSize: '13px',
          textAlign: 'center',
          color: isLocked ? 'var(--on-surface-variant)' : 'var(--on-surface)',
          lineHeight: 1.3,
        }}
      >
        {slot.title}
      </span>

      {/* Stars — only on completed graded slots (assessment + final exam). */}
      {isCompleted && (slot.kind === 'assessment' || slot.kind === 'final_exam') ? (
        <div
          aria-label={`${slot.starsEarned} of 3 stars earned`}
          style={{ display: 'flex', gap: '2px', marginTop: '-4px' }}
        >
          {[0, 1, 2].map((i) => {
            const earned = i < slot.starsEarned;
            return (
              <span
                key={i}
                aria-hidden
                className="material-symbols-outlined"
                style={{
                  fontSize: '18px',
                  color: earned ? 'var(--tertiary-container)' : 'var(--outline-variant)',
                  // The filled vs outlined star is driven by font-variation
                  // (the project's `.filled` rule handles this in
                  // globals.css for Material Symbols).
                  fontVariationSettings: earned ? '"FILL" 1' : '"FILL" 0',
                }}
              >
                star
              </span>
            );
          })}
        </div>
      ) : null}

      {/* Activity progress chip — only on the active slot. Tells the
          learner how far along they are inside the bundle. */}
      {isActive && total > 0 ? (
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--on-surface-variant)',
            fontVariantNumeric: 'tabular-nums',
            marginTop: '-2px',
          }}
        >
          {done} / {total}
        </span>
      ) : null}
    </div>
  );
}
