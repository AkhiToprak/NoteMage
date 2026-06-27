import * as React from 'react';

/* Exam Mode (Phase 0) — responsive grid wrapper for DayCards (the study
   calendar / next-N-day strip). Auto-fills columns by `minColumnWidth`, so it
   collapses cleanly from a week-wide row to a couple of cards on mobile.
   Layout-only; callers map their data to <DayCard> children. */

export interface CalendarGridProps {
  children: React.ReactNode;
  /** Minimum day-card width in px (controls how many fit per row). */
  minColumnWidth?: number;
  gap?: number;
  style?: React.CSSProperties;
  className?: string;
}

export function CalendarGrid({
  children,
  minColumnWidth = 132,
  gap = 12,
  style,
  className,
}: CalendarGridProps) {
  return (
    <div
      className={className}
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(auto-fill, minmax(${minColumnWidth}px, 1fr))`,
        gap,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export default CalendarGrid;
