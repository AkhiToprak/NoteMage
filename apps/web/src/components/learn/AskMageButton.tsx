'use client';

/* Hallmark · component: button · genre: editorial · theme: project (Neon Scholar)
 * states: default · hover · focus · active · disabled(n/a) · loading(n/a) · error(n/a) · success(n/a)
 * contrast: pass (uses --primary / --on-surface tokens)
 *
 * "Ask Mage about this lesson". Mage Revolution Phase 10 folded the old full-page
 * chat into the global panel, so this no longer spins up a CreateChatModal +
 * navigates to /learn/chats — it opens the panel grounded on the path/lesson the
 * learner is looking at. The panel then resumes that surface's persistent thread.
 */

import { useOptionalMage } from '@/components/mage';

interface AskMageButtonProps {
  /** StudyPlan id — grounds the panel on the path's source material. */
  planId: string;
  /** The path's Study Pack notebook (extra grounding + thread home). */
  notebookId: string | null;
  /** Opened lesson/slot title — shown as the panel's context card title. */
  slotTitle: string;
  /** Visual variant: pill (overlay headers) or compact (drawer header). */
  variant?: 'pill' | 'compact';
}

export default function AskMageButton({
  planId,
  notebookId,
  slotTitle,
  variant = 'pill',
}: AskMageButtonProps) {
  const mage = useOptionalMage();
  const compact = variant === 'compact';

  return (
    <>
      <button
        type="button"
        className="ask-mage-btn"
        onClick={() =>
          mage?.open({
            type: 'lesson',
            ids: { pathId: planId, notebookId: notebookId ?? undefined },
            title: slotTitle,
          })
        }
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: compact ? '7px 12px' : '8px 14px',
          borderRadius: 'var(--radius-full)',
          border: '1px solid var(--outline-variant)',
          background: 'var(--surface-container-high)',
          color: 'var(--on-surface)',
          fontFamily: 'inherit',
          fontSize: '12px',
          fontWeight: 700,
          cursor: 'pointer',
          flexShrink: 0,
          whiteSpace: 'nowrap',
        }}
      >
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{ fontSize: '16px', color: 'var(--primary)' }}
        >
          auto_fix_high
        </span>
        {compact ? 'Ask Mage' : 'Ask Mage about this lesson'}
      </button>

      <style>{`
        .ask-mage-btn {
          transition:
            background 0.12s cubic-bezier(0.22, 1, 0.36, 1),
            transform 0.12s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .ask-mage-btn:hover {
          background: var(--surface-bright);
        }
        .ask-mage-btn:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: 2px;
        }
        .ask-mage-btn:active {
          transform: translateY(1px);
        }
        @media (prefers-reduced-motion: reduce) {
          .ask-mage-btn {
            transition: none;
          }
          .ask-mage-btn:active {
            transform: none;
          }
        }
      `}</style>
    </>
  );
}
