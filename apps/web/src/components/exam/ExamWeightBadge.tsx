import * as React from 'react';

/* Exam Mode (Phase 0) — exam-weight badge. Signals how heavily a topic / node
   weighs on the exam, as a 3-segment bar + label. Used on the Exam Path hub,
   missions and weak-areas. Presentational; renders inside the cream AppShell. */

export type ExamWeight = 'high' | 'medium' | 'low';

export interface ExamWeightBadgeProps {
  level: ExamWeight;
  /** Optional explicit share-of-exam percent, e.g. 25 → appends "· 25%". */
  pct?: number;
  size?: 'sm' | 'md';
}

interface WeightConfig {
  label: string;
  bars: number; // filled segments (1–3)
  bg: string;
  ink: string;
  bar: string;
}

const WEIGHT_CONFIG: Record<ExamWeight, WeightConfig> = {
  high: { label: 'High weight', bars: 3, bg: 'var(--lilac)', ink: 'var(--accent)', bar: 'var(--accent)' },
  medium: { label: 'Medium weight', bars: 2, bg: 'var(--amber-soft)', ink: 'var(--amber-ink)', bar: 'var(--amber)' },
  // Faint chip (matches the count-badge fill) for the lightest weight.
  low: { label: 'Low weight', bars: 1, bg: 'var(--badge)', ink: 'var(--body)', bar: 'var(--muted)' },
};

export function ExamWeightBadge({ level, pct, size = 'md' }: ExamWeightBadgeProps) {
  const cfg = WEIGHT_CONFIG[level];
  const isSm = size === 'sm';

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: isSm ? 6 : 7,
        borderRadius: 999,
        padding: isSm ? '3px 9px' : '5px 11px',
        background: cfg.bg,
        color: cfg.ink,
        fontSize: isSm ? 12 : 12.5,
        fontWeight: 600,
        lineHeight: 1,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <span aria-hidden style={{ display: 'inline-flex', alignItems: 'flex-end', gap: 2, height: isSm ? 9 : 11 }}>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            style={{
              width: 3,
              height: `${40 + i * 30}%`,
              borderRadius: 1,
              background: i < cfg.bars ? cfg.bar : `color-mix(in srgb, ${cfg.ink} 22%, transparent)`,
            }}
          />
        ))}
      </span>
      <span>
        {cfg.label}
        {typeof pct === 'number' && Number.isFinite(pct) && (
          <span style={{ opacity: 0.75, fontWeight: 700 }}> · {Math.round(pct)}%</span>
        )}
      </span>
    </span>
  );
}

export default ExamWeightBadge;
