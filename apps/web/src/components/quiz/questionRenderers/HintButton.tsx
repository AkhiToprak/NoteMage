'use client';

import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import type { QuizRenderMode } from './types';

// Shared hint affordance for the question renderers — the toggle button plus the
// revealed hint panel, previously duplicated inline in ~10 renderers. On coarse
// (touch) pointers the toggle grows to a ≥44px target; on fine pointers it keeps the
// original compact sizing, so the desktop layout is unchanged. The gating condition
// (`hint && !isAnswered && mode === 'quiz'` for the button; `showHint` for the panel)
// is encapsulated here so callers just drop <HintButton …/> where the inline block was.
export default function HintButton({
  hint,
  showHint,
  onToggle,
  isAnswered,
  mode,
  coarsePointer,
}: {
  hint: string | null;
  showHint: boolean;
  onToggle: () => void;
  isAnswered: boolean;
  mode: QuizRenderMode;
  coarsePointer: boolean;
}) {
  if (!hint) return null;
  return (
    <>
      {!isAnswered && mode === 'quiz' && (
        <button
          onClick={onToggle}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: coarsePointer ? '11px 16px' : '8px 14px',
            minHeight: coarsePointer ? '44px' : undefined,
            borderRadius: '10px',
            border: '1px solid rgba(251,191,36,0.2)',
            background: showHint ? 'rgba(251,191,36,0.08)' : 'transparent',
            color: 'var(--warning)',
            fontSize: coarsePointer ? '13px' : '12px',
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: '12px',
            fontFamily: 'inherit',
            transition: 'background 0.12s',
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: coarsePointer ? 16 : 13 }}
            aria-hidden
          >
            lightbulb
          </span>
          {showHint ? 'Hide Hint' : 'Show Hint'}
        </button>
      )}
      {showHint && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '10px',
            background: 'var(--ink-08)',
            border: '1px solid rgba(251,191,36,0.15)',
            fontSize: '13px',
            color: 'var(--warning)',
            marginBottom: '12px',
            lineHeight: 1.6,
          }}
        >
          <MarkdownRenderer content={hint} />
        </div>
      )}
    </>
  );
}
