'use client';

import * as React from 'react';
import { readinessColor } from './tokens';

export interface ReadinessRingProps {
  /** 0–100 */
  value: number;
  size?: number;
  strokeWidth?: number;
  label?: string;
  sublabel?: string;
  /**
   * Progress stroke color. Defaults to the readiness scale (red→amber→green
   * by value). Pass a fixed token (e.g. the accent) when the ring shows neutral
   * completion rather than a graded score.
   */
  color?: string;
}

export function ReadinessRing({
  value,
  size = 140,
  strokeWidth = 12,
  label = 'Exam Ready',
  sublabel,
  color,
}: ReadinessRingProps) {
  const clamped = Math.min(100, Math.max(0, value));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashoffset = circumference - (clamped / 100) * circumference;
  const center = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${Math.round(clamped)}% ${label}`}
      style={{ display: 'block', flexShrink: 0 }}
    >
      {/* Track */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--ink-12)"
        strokeWidth={strokeWidth}
      />
      {/* Progress */}
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color ?? readinessColor(clamped)}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={dashoffset}
        style={{
          transformOrigin: `${center}px ${center}px`,
          transform: 'rotate(-90deg)',
          transition: 'stroke-dashoffset var(--dur-normal) var(--ease-spring)',
        }}
      />
      {/* Center: value */}
      <text
        x={center}
        y={center - (sublabel ? 8 : label ? 4 : 0)}
        textAnchor="middle"
        dominantBaseline="middle"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-3xl)',
          fontWeight: 700,
          fill: 'var(--on-surface)',
        }}
      >
        {Math.round(clamped)}%
      </text>
      {/* Label */}
      {label && (
        <text
          x={center}
          y={center + (sublabel ? 20 : 18)}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-sm)',
            fill: 'var(--on-surface-variant)',
          }}
        >
          {label}
        </text>
      )}
      {/* Sublabel */}
      {sublabel && (
        <text
          x={center}
          y={center + 36}
          textAnchor="middle"
          dominantBaseline="middle"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-sm)',
            fill: 'var(--on-surface-variant)',
          }}
        >
          {sublabel}
        </text>
      )}
    </svg>
  );
}

export default ReadinessRing;
