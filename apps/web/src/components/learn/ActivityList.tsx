'use client';

import type { PathActivity, PathSlot } from '@/components/learn/PathView';

// Phase 10.6 — list view shown inside the checkpoint drawer when no
// activity is selected. One row per activity (theory / flashcards /
// quiz) with status + Start CTA on the next incomplete one. Clicking
// a row tells the drawer to open that activity (drawer manages URL +
// the inner view).

const ACTIVITY_ICONS: Record<string, string> = {
  theory: 'auto_stories',
  flashcards: 'style',
  quiz: 'quiz',
};

const ACTIVITY_LABELS: Record<string, string> = {
  theory: 'Theory',
  flashcards: 'Flashcards',
  quiz: 'Quiz',
};

interface ActivityListProps {
  slot: PathSlot;
  onOpenActivity: (activity: PathActivity) => void;
}

export default function ActivityList({ slot, onOpenActivity }: ActivityListProps) {
  // The "next" activity is the first incomplete row — that's where we
  // show the primary Start CTA. Subsequent incomplete rows show a
  // secondary "Open" button so the learner can jump around if they
  // want to revisit.
  const firstIncompleteIdx = slot.activities.findIndex((a) => !a.completed);

  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {slot.activities.map((activity, idx) => {
        const isNext = idx === firstIncompleteIdx;
        const isCompleted = activity.completed;
        const label = ACTIVITY_LABELS[activity.kind] ?? activity.kind;
        const icon = ACTIVITY_ICONS[activity.kind] ?? 'task_alt';
        const status = isCompleted
          ? 'Done'
          : isNext
            ? 'Up next'
            : 'Not started';
        return (
          <li
            key={activity.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              padding: '12px 14px',
              background: isNext
                ? 'var(--surface-container-high)'
                : 'var(--surface-container-low)',
              border: `1px solid ${isNext ? 'var(--outline)' : 'var(--outline-variant)'}`,
              borderRadius: 'var(--radius-md)',
            }}
          >
            <span
              aria-hidden
              style={{
                width: '36px',
                height: '36px',
                borderRadius: 'var(--radius-md)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: isCompleted
                  ? 'var(--primary)'
                  : 'var(--surface-container)',
                color: isCompleted ? 'var(--on-primary)' : 'var(--on-surface)',
                flexShrink: 0,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '20px' }}
                aria-hidden
              >
                {isCompleted ? 'check' : icon}
              </span>
            </span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--on-surface)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {label}
              </p>
              <p
                style={{
                  margin: '2px 0 0',
                  fontSize: '11px',
                  color: isCompleted ? 'var(--primary)' : 'var(--on-surface-variant)',
                  fontWeight: 600,
                  letterSpacing: '0.04em',
                  textTransform: 'uppercase',
                }}
              >
                {status}
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenActivity(activity)}
              style={{
                padding: '8px 14px',
                background: isNext ? 'var(--primary)' : 'transparent',
                color: isNext ? 'var(--on-primary)' : 'var(--on-surface)',
                border: isNext ? 'none' : '1px solid var(--outline-variant)',
                borderRadius: 'var(--radius-full)',
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              {isCompleted ? 'Revisit' : isNext ? 'Start' : 'Open'}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
