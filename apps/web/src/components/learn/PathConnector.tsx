'use client';

// Phase 10.8 — connector between two adjacent path slots. Draws a soft
// S-curve from the bottom-center of the upper slot to the top-center of
// the lower slot. The slot column is rhythmically aligned via
// `idx % 3` (flex-start / center / flex-end), so the connector receives
// the alignments of both endpoints and picks X coordinates accordingly.
//
// Color is driven by the upper slot's `completed` state — primary when
// done, outline-variant when still ahead. This produces the
// "trail fills with color as you progress" effect the user asked for.
//
// The `height` prop lets the caller stretch the connector so it spans
// the full gap between checkpoints — including a decoration mascot's
// gutter slot — instead of stopping short in mid-air.

type Align = 'flex-start' | 'center' | 'flex-end';

interface PathConnectorProps {
  fromAlign: Align;
  toAlign: Align;
  /** Upper slot's completion. When true, the segment is primary-tinted. */
  completed: boolean;
  /** Vertical span in px. Defaults to the no-decoration gap. */
  height?: number;
}

// Percent-of-column X anchors for each alignment. The slot column is
// 608px wide; SlotNode is 96px; the slot row has 8px horizontal padding.
//   flex-start center ≈ 56 / 608 ≈ 9.2%
//   center center     = 50%
//   flex-end center  ≈ 552 / 608 ≈ 90.8%
const X_BY_ALIGN: Record<Align, number> = {
  'flex-start': 9.2,
  center: 50,
  'flex-end': 90.8,
};

const DEFAULT_HEIGHT = 36;

export default function PathConnector({
  fromAlign,
  toAlign,
  completed,
  height = DEFAULT_HEIGHT,
}: PathConnectorProps) {
  const x1 = X_BY_ALIGN[fromAlign];
  const x2 = X_BY_ALIGN[toAlign];
  const stroke = completed ? 'var(--primary)' : 'var(--outline-variant)';

  return (
    <svg
      aria-hidden
      width="100%"
      height={height}
      viewBox={`0 0 100 ${height}`}
      preserveAspectRatio="none"
      style={{ display: 'block', pointerEvents: 'none' }}
    >
      <path
        d={`M ${x1} 0 C ${x1} ${height / 3} ${x2} ${(height * 2) / 3} ${x2} ${height}`}
        stroke={stroke}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
