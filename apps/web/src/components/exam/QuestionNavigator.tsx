'use client';

import * as React from 'react';
import s from './atoms.module.css';

/* Exam Mode (Phase 0) — question-navigator grid for the timed mock-exam player.
   One cell per question (answered / current / flagged / not-answered); click a
   cell to jump. `flagged` overlays its own state on top of answered/unanswered
   so the learner can find flagged questions at a glance. Renders inside the
   cream AppShell. */

export type QuestionCellState = 'answered' | 'current' | 'unanswered';

export interface QuestionNavigatorItem {
  /** 0-based question index. Displayed as index + 1. */
  index: number;
  state: QuestionCellState;
  /** Flag overlay — independent of answered/unanswered. */
  flagged?: boolean;
}

export interface QuestionNavigatorProps {
  items: QuestionNavigatorItem[];
  onJump?: (index: number) => void;
  /** Disable jumping (e.g. after submit). */
  disabled?: boolean;
  showLegend?: boolean;
}

function cellClass(item: QuestionNavigatorItem): string {
  if (item.state === 'current') return `${s.navCell} ${s.navCurrent}`;
  if (item.flagged) return `${s.navCell} ${s.navFlagged}`;
  if (item.state === 'answered') return `${s.navCell} ${s.navAnswered}`;
  return s.navCell;
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--on-surface-variant)' }}>
      <span className={className} style={{ width: 14, height: 14, borderRadius: 4, minHeight: 0, aspectRatio: 'auto' }} />
      {label}
    </span>
  );
}

export function QuestionNavigator({ items, onJump, disabled = false, showLegend = false }: QuestionNavigatorProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className={s.navGrid} role="list" aria-label="Question navigator">
        {items.map((item) => {
          const n = item.index + 1;
          const labelParts = [`Question ${n}`, item.state, item.flagged ? 'flagged' : '']
            .filter(Boolean)
            .join(', ');
          return (
            <button
              key={item.index}
              type="button"
              role="listitem"
              className={cellClass(item)}
              aria-label={labelParts}
              aria-current={item.state === 'current' ? 'true' : undefined}
              disabled={disabled}
              onClick={onJump ? () => onJump(item.index) : undefined}
            >
              {n}
              {item.flagged && item.state !== 'current' && (
                <span className={`material-symbols-outlined ${s.navFlag}`} aria-hidden>
                  flag
                </span>
              )}
            </button>
          );
        })}
      </div>

      {showLegend && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14 }}>
          <LegendSwatch className={`${s.navCell} ${s.navCurrent}`} label="Current" />
          <LegendSwatch className={`${s.navCell} ${s.navAnswered}`} label="Answered" />
          <LegendSwatch className={`${s.navCell} ${s.navFlagged}`} label="Flagged" />
          <LegendSwatch className={s.navCell} label="Not answered" />
        </div>
      )}
    </div>
  );
}

export default QuestionNavigator;
