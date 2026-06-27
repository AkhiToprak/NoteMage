/* Hallmark · component: skeleton · genre: editorial · theme: cream app-shell
 * states: static (non-interactive — no 8-state set)
 * contrast: pass — soft warm fill on white/cream surfaces
 */
import type { CSSProperties, ReactNode } from 'react';

// Reusable loading skeletons for the cream app shell (the redesigned logged-in
// screens). Solid neutral blocks with a plain opacity pulse — NO gradients
// (house rule) — disabled under prefers-reduced-motion. Shares the nmSkelPulse
// keyframe + .nm-skel class with src/components/learn/CheckpointSkeleton.tsx.
//
// Block fill is var(--skel-fill) defaulting to the shell's soft warm hairline
// (--border-soft) so blocks read on both white cards and the cream page. These
// must NOT use the dark-theme --surface-container-* tokens, which render as
// dark blocks on cream and are unreadable.

const SKELETON_CSS = `
  @keyframes nmSkelPulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
  .nm-skel { animation: nmSkelPulse 1.4s ease-in-out infinite; }
  @media (prefers-reduced-motion: reduce) { .nm-skel { animation: none; } }
`;

/** Inject the pulse keyframes once near the top of a skeleton tree. */
export function SkeletonStyles() {
  return <style>{SKELETON_CSS}</style>;
}

interface SkeletonProps {
  /** Width — number (px) or any CSS length. Defaults to 100%. */
  w?: number | string;
  /** Height — number (px) or any CSS length. */
  h?: number | string;
  /** Border radius override. Defaults to the shell's small radius. */
  radius?: string;
  /** Render a circle of diameter `h` (ignores `w`). */
  circle?: boolean;
  style?: CSSProperties;
  className?: string;
}

/** A single pulsing block. The atom every route skeleton is composed from. */
export function Skeleton({ w, h = 14, radius, circle, style, className }: SkeletonProps) {
  return (
    <span
      aria-hidden
      className={`nm-skel${className ? ` ${className}` : ''}`}
      style={{
        display: 'block',
        width: circle ? h : (w ?? '100%'),
        height: h,
        borderRadius: circle ? '999px' : (radius ?? 'var(--rs, 10px)'),
        background: 'var(--skel-fill, var(--border-soft, #e7ddca))',
        flexShrink: 0,
        ...style,
      }}
    />
  );
}

/** Several stacked text-line blocks. `lines` widths cycle for a natural look. */
export function SkeletonText({
  lines = 3,
  gap = 10,
  lineHeight = 13,
  widths = ['100%', '92%', '70%'],
  style,
}: {
  lines?: number;
  gap?: number;
  lineHeight?: number;
  widths?: (number | string)[];
  style?: CSSProperties;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap, ...style }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} w={widths[i % widths.length]} h={lineHeight} />
      ))}
    </div>
  );
}

/** A card frame matching the cream app-shell card, holding pulsing inner blocks. */
export function SkeletonCard({ children, style }: { children?: ReactNode; style?: CSSProperties }) {
  return (
    <div
      aria-hidden
      style={{
        background: 'var(--surface, #fff)',
        border: '1px solid var(--border, #d9ccb3)',
        borderRadius: 'var(--rc, 18px)',
        boxShadow: 'var(--shadow, 0 1px 2px rgba(24, 32, 47, 0.04), 0 10px 26px rgba(24, 32, 47, 0.05))',
        padding: 16,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
