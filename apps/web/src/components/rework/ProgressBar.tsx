import * as React from 'react';

export interface ProgressBarProps {
  /** 0–100 */
  value: number;
  color?: string;
  height?: number;
  label?: string;
  showPercent?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function ProgressBar({
  value,
  color = 'var(--accent-strong)',
  height = 10,
  label,
  showPercent = false,
  className,
  style,
}: ProgressBarProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const showHeader = label || showPercent;

  return (
    <div className={className} style={style}>
      {showHeader && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 6,
          }}
        >
          {label && (
            <span
              style={{
                fontSize: 'var(--fs-sm)',
                color: 'var(--on-surface-variant)',
                fontFamily: 'var(--font-sans)',
              }}
            >
              {label}
            </span>
          )}
          {showPercent && (
            <span
              style={{
                fontSize: 'var(--fs-sm)',
                color: 'var(--on-surface-variant)',
                fontFamily: 'var(--font-sans)',
                fontWeight: 600,
                marginLeft: 'auto',
              }}
            >
              {Math.round(clamped)}%
            </span>
          )}
        </div>
      )}
      <div
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? `${Math.round(clamped)}% progress`}
        style={{
          background: 'var(--ink-12)',
          borderRadius: 'var(--radius-full)',
          height,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            background: color,
            borderRadius: 'var(--radius-full)',
            height: '100%',
            width: `${clamped}%`,
            transition: 'width var(--dur-normal) ease',
          }}
        />
      </div>
    </div>
  );
}

export default ProgressBar;
