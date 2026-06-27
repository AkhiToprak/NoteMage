'use client';

import * as React from 'react';
import Link from 'next/link';
import s from './atoms.module.css';

/* Exam Mode (Phase 0) — a single day in the study calendar / Today's plan. Shows
   the weekday + date, a task/minutes summary and a small completion bar. The
   `exam` status marks the exam day itself (navy, flag). Becomes a button/link
   when `href`/`onClick` is supplied. Renders inside the cream AppShell. */

export type DayStatus = 'past' | 'today' | 'upcoming' | 'exam';

export interface DayCardProps {
  /** The day this card represents (ISO string or Date). */
  date: string | Date;
  /** Override the small top label (defaults to weekday short, or "Today"). */
  label?: string;
  taskCount?: number;
  doneCount?: number;
  totalMinutes?: number;
  status?: DayStatus;
  selected?: boolean;
  href?: string;
  onClick?: () => void;
}

function toDate(d: string | Date): Date {
  return d instanceof Date ? d : new Date(d);
}

export function DayCard({
  date,
  label,
  taskCount = 0,
  doneCount = 0,
  totalMinutes = 0,
  status = 'upcoming',
  selected = false,
  href,
  onClick,
}: DayCardProps) {
  const d = toDate(date);
  const valid = !Number.isNaN(d.getTime());
  const weekday = valid ? d.toLocaleDateString(undefined, { weekday: 'short' }) : '';
  const dayNum = valid ? d.getDate() : '';
  const topLabel = label ?? (status === 'today' ? 'Today' : status === 'exam' ? 'Exam day' : weekday);
  const isExam = status === 'exam';
  const interactive = Boolean(href || onClick);
  const pct = taskCount > 0 ? Math.min(100, Math.round((doneCount / taskCount) * 100)) : 0;
  const allDone = taskCount > 0 && doneCount >= taskCount;

  const cls = [
    s.dayCard,
    interactive ? s.dayCardClickable : '',
    status === 'today' && !isExam ? s.dayCardToday : '',
    selected ? s.dayCardSelected : '',
    isExam ? s.dayCardExam : '',
  ]
    .filter(Boolean)
    .join(' ');

  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
        <span
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            color: isExam ? 'rgba(255,255,255,0.8)' : status === 'today' ? 'var(--accent)' : 'var(--muted)',
          }}
        >
          {topLabel}
        </span>
        {valid && (
          <span style={{ fontSize: 19, fontWeight: 800, lineHeight: 1, color: isExam ? '#fff' : 'var(--ink)' }}>
            {dayNum}
          </span>
        )}
      </div>

      {isExam ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 'auto', color: 'var(--gold)' }}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18 }}>
            flag
          </span>
          <span style={{ fontSize: 12.5, fontWeight: 700, color: 'rgba(255,255,255,0.92)' }}>Exam</span>
        </div>
      ) : taskCount === 0 ? (
        <div style={{ marginTop: 'auto', fontSize: 12.5, color: 'var(--muted)' }}>Rest day</div>
      ) : (
        <>
          <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                fontSize: 12.5,
                fontWeight: 600,
                color: allDone ? 'var(--green-ink)' : 'var(--ink-soft)',
              }}
            >
              {allDone && (
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 15 }}>
                  task_alt
                </span>
              )}
              {taskCount} {taskCount === 1 ? 'task' : 'tasks'}
            </span>
            {totalMinutes > 0 && (
              <span style={{ fontSize: 12, color: 'var(--muted)' }}>· {totalMinutes} min</span>
            )}
          </div>
          <div style={{ width: '100%', height: 5, borderRadius: 999, background: '#eee7da', overflow: 'hidden' }}>
            <div
              style={{
                height: '100%',
                width: `${pct}%`,
                borderRadius: 999,
                background: allDone ? 'var(--green)' : 'var(--primary)',
              }}
            />
          </div>
        </>
      )}
    </>
  );

  if (href) {
    return (
      <Link href={href} className={cls} aria-current={status === 'today' ? 'date' : undefined}>
        {inner}
      </Link>
    );
  }
  if (onClick) {
    return (
      <button type="button" className={cls} onClick={onClick}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

export default DayCard;
