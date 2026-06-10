'use client';

import { useEffect, useRef, useState } from 'react';

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
//
// Phase 10.8.1 — S-curve distortion fix. The previous implementation used
// a fixed 100-unit viewBox with `preserveAspectRatio="none"`, which
// horizontally squashed/stretched the bézier control points to match the
// container width, making the curve shape vary wildly with horizontal span.
// Fix: a ResizeObserver measures the SVG element's real pixel width and the
// path is drawn in actual px coordinates. `preserveAspectRatio` is left at
// its default ("xMidYMid meet") and the viewBox matches the measured size,
// so 1 viewBox unit == 1 CSS px — no distortion.

type Align = 'flex-start' | 'center' | 'flex-end';

interface PathConnectorProps {
  fromAlign: Align;
  toAlign: Align;
  /** Upper slot's completion. When true, the segment is primary-tinted. */
  completed: boolean;
  /** Vertical span in px. Defaults to the no-decoration gap. */
  height?: number;
}

// Fraction-of-column X anchors for each alignment. The slot column is
// 608px wide; SlotNode is 96px; the slot row has 8px horizontal padding.
//   flex-start center ≈ 56 / 608 ≈ 0.092
//   center center     = 0.5
//   flex-end center  ≈ 552 / 608 ≈ 0.908
const X_FRAC_BY_ALIGN: Record<Align, number> = {
  'flex-start': 0.092,
  center: 0.5,
  'flex-end': 0.908,
};

const DEFAULT_HEIGHT = 36;

export default function PathConnector({
  fromAlign,
  toAlign,
  completed,
  height = DEFAULT_HEIGHT,
}: PathConnectorProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  // Start with a reasonable fallback width (will be corrected after mount).
  const [width, setWidth] = useState(608);

  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width;
      if (w && w > 0) setWidth(w);
    });
    ro.observe(el);
    // Also capture the initial width synchronously.
    const initial = el.getBoundingClientRect().width;
    if (initial > 0) setWidth(initial);
    return () => ro.disconnect();
  }, []);

  // Compute path endpoints in real px using measured width.
  const x1 = X_FRAC_BY_ALIGN[fromAlign] * width;
  const x2 = X_FRAC_BY_ALIGN[toAlign] * width;
  const stroke = completed ? 'var(--primary)' : 'var(--outline-variant)';

  return (
    <svg
      ref={svgRef}
      aria-hidden
      width="100%"
      height={height}
      // viewBox matches real pixel dimensions — 1 unit == 1 CSS px.
      // No preserveAspectRatio override needed (default "xMidYMid meet"
      // is fine since viewBox already equals the rendered size).
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block', pointerEvents: 'none' }}
    >
      <path
        d={`M ${x1} 0 C ${x1} ${height / 3} ${x2} ${(height * 2) / 3} ${x2} ${height}`}
        stroke={stroke}
        strokeWidth={4}
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
