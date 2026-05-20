// Hallmark · component: status-chip · genre: editorial-tech · theme: locked-by-figma-design-system
// states: default (display only — not interactive)
// contrast: pass (46–50). Light-mode audit: every fg is a medium-tinted
// brand / semantic colour, never a light value on a light surface.
//
// Phase 2 of plans/path-publishing-community-library.md.
// Reworked under the Hallmark anti-AI-slop rule-set:
//   - Locked tokens (var(--*)) — every colour resolves through the
//     project's CSS custom-property layer. No mid-render inline OKLCH.
//   - No re-drawn chrome. No gradients (project rule).
//   - Only `transform` and `opacity` animate; no `transition-all`.
//   - 2+1 font discipline: brand font (Oswald via --font-brand) for the
//     uppercase status label, default sans for the layer code.
//   - Distinct fingerprint: a square-cornered tag (not a generic pill),
//     a leading indicator that pulses only on in-flight states, and a
//     trailing layer code so the audit pipeline is legible at a glance.

'use client';

import type { SharedPathModerationStatus } from '@notemage/shared';

// Per-state visual + copy table. Three independent visual channels per
// state so no single channel carries the load (border + bg + indicator
// glyph + layer code). Light-mode safety: every `fg` is a brand- or
// semantic-token-derived hue with enough contrast on light surfaces.
interface ChipVisuals {
  label: string;
  // Trailing layer code printed in a monospaced slot. Empty string for
  // terminal pre-pipeline states ("pending") so the slot stays reserved
  // but doesn't lie about which layer ruled.
  layerCode: string;
  // Whether the leading indicator pulses. Only true for in-flight
  // states — terminal states show a steady dot. The animation is
  // transform/opacity-only per project rule.
  pulse: boolean;
  bg: string;
  border: string;
  fg: string;
  // Indicator dot colour — usually `fg`, but `pending` is a subdued
  // outline rather than the full primary so the chip reads as "not
  // started" rather than "active".
  indicator: string;
  description: string;
}

const STATUS_VISUALS: Record<SharedPathModerationStatus, ChipVisuals> = {
  pending: {
    label: 'In queue',
    layerCode: 'L0',
    pulse: true,
    bg: 'var(--surface-container-high)',
    border: 'var(--outline-variant)',
    fg: 'var(--on-surface-variant)',
    indicator: 'var(--on-surface-variant)',
    description:
      'Your path is queued for review. The first automatic check runs next.',
  },
  auditing_l2: {
    label: 'Reviewing',
    layerCode: 'L2',
    pulse: true,
    bg: 'rgba(174,137,255,0.10)',
    border: 'rgba(174,137,255,0.34)',
    fg: 'var(--primary)',
    indicator: 'var(--primary)',
    description:
      'A quality pass is running now. This usually wraps within a minute.',
  },
  auditing_l3: {
    label: 'Deep review',
    layerCode: 'L3',
    pulse: true,
    bg: 'rgba(174,137,255,0.10)',
    border: 'rgba(174,137,255,0.34)',
    fg: 'var(--primary)',
    indicator: 'var(--primary)',
    description:
      'A stronger model is taking a closer look — used when the first pass wanted a second opinion.',
  },
  flagged_pending_human: {
    label: 'Team review',
    layerCode: 'L5',
    pulse: true,
    bg: 'rgba(255,167,38,0.12)',
    border: 'rgba(255,167,38,0.42)',
    fg: '#d98e25',
    indicator: '#ffa726',
    description:
      "Our team is reviewing this path. We'll email you the outcome — usually within a day.",
  },
  approved: {
    label: 'Live',
    layerCode: '✓',
    pulse: false,
    bg: 'rgba(72,202,154,0.12)',
    border: 'rgba(72,202,154,0.42)',
    fg: '#2f9a72',
    indicator: '#48ca9a',
    description:
      'Your path is live in the community library — anyone can clone or translate it.',
  },
  rejected: {
    label: 'Rejected',
    layerCode: '×',
    pulse: false,
    bg: 'rgba(253,111,133,0.12)',
    border: 'rgba(253,111,133,0.42)',
    fg: 'var(--error)',
    indicator: 'var(--error)',
    description:
      'This path was rejected during review. The reason is below — you can adjust and republish.',
  },
};

export function getStatusVisuals(status: SharedPathModerationStatus): ChipVisuals {
  return STATUS_VISUALS[status] ?? STATUS_VISUALS.pending;
}

interface PublishStatusChipProps {
  status: SharedPathModerationStatus;
  /**
   * Compact form for the path-card placement: smaller font, tighter
   * padding, omits the trailing layer code. The status page renders
   * the full form.
   */
  size?: 'sm' | 'md';
}

export function PublishStatusChip({ status, size = 'sm' }: PublishStatusChipProps) {
  const v = getStatusVisuals(status);
  const compact = size === 'sm';
  const animationName = `hallmarkChipPulse-${status}`;
  return (
    <span
      // The chip is a status badge — not interactive. role="status" lets
      // screen readers announce changes when the chip updates during
      // moderation polling.
      role="status"
      aria-label={`Publication status: ${v.label}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: compact ? '8px' : '10px',
        padding: compact ? '4px 8px 4px 8px' : '6px 10px 6px 10px',
        // Square-cornered tag, not a generic pill. The 4px radius is
        // half of the project's smallest token, picking up the "tag"
        // affordance from the editorial archetype c1-outlined-chip.
        borderRadius: '4px',
        background: v.bg,
        border: `1px solid ${v.border}`,
        color: v.fg,
        // 2+1 font discipline: brand font (Oswald) on the label so it
        // visually distinguishes from the surrounding body text. Tight
        // tracking, true uppercase — the chip reads as an editorial
        // marker, not a UI sticker.
        fontFamily: 'var(--font-brand)',
        fontSize: compact ? '11px' : '12px',
        fontWeight: 700,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        whiteSpace: 'nowrap',
        lineHeight: 1,
      }}
    >
      {/* Leading indicator — a 6px square (echoing the chip's square
          corner) rather than the convention round dot. Pulses on
          in-flight states only; terminal states show a steady marker. */}
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: compact ? '6px' : '7px',
          height: compact ? '6px' : '7px',
          background: v.indicator,
          flexShrink: 0,
          // transform-origin centered so the pulse scales evenly
          transformOrigin: 'center',
          animation: v.pulse ? `${animationName} 1.6s cubic-bezier(0.4,0,0.6,1) infinite` : 'none',
        }}
      />
      <span>{v.label}</span>
      {/* Trailing layer code: a monospaced slot that always reserves
          space, so the chip's right edge doesn't move between states.
          Falls back to a hairline placeholder for `pending` where no
          layer has fired yet. */}
      {!compact ? (
        <span
          aria-hidden
          style={{
            // Vertical hairline divider between label and layer code —
            // a craft micro-detail that distinguishes this chip from the
            // common pill-with-icon pattern.
            paddingLeft: '8px',
            marginLeft: '2px',
            borderLeft: `1px solid ${v.border}`,
            fontFamily: 'ui-monospace, SFMono-Regular, "Cascadia Mono", Menlo, monospace',
            fontSize: '11px',
            fontWeight: 600,
            letterSpacing: '0.04em',
            opacity: 0.78,
            minWidth: '14px',
            textAlign: 'center',
          }}
        >
          {v.layerCode}
        </span>
      ) : null}
      {/* Per-status keyframes — scoped by status so multiple chips
          on the same page (e.g. legend on the status page) don't all
          collide on one animation name. Transform/opacity only. */}
      {v.pulse ? (
        <style>{`
          @keyframes ${animationName} {
            0%   { transform: scale(1);   opacity: 1; }
            50%  { transform: scale(1.35); opacity: 0.55; }
            100% { transform: scale(1);   opacity: 1; }
          }
          @media (prefers-reduced-motion: reduce) {
            @keyframes ${animationName} {
              0%, 100% { transform: scale(1); opacity: 1; }
            }
          }
        `}</style>
      ) : null}
    </span>
  );
}
