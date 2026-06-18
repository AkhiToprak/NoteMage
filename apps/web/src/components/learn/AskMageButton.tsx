'use client';

/* Hallmark · component: button · genre: editorial · theme: project (Neon Scholar)
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (uses --primary / --on-primary tokens)
 *
 * Workstream 4 — "Ask Mage about this lesson". A terse action that opens
 * CreateChatModal seeded with the path's Study Pack notebook + the path's
 * source material (via defaultSourcePathId), defaulting the chat title to
 * the lesson. Additive: generic/cross-pack chat is unaffected.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import CreateChatModal from '@/components/learn/CreateChatModal';

interface AskMageButtonProps {
  /** StudyPlan id — seeds the chat's context from the path's source material. */
  planId: string;
  /** The path's Study Pack notebook (default notebook for uploads/picker). */
  notebookId: string | null;
  /** Opened lesson/slot title — used to seed the chat title. */
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
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const compact = variant === 'compact';

  return (
    <>
      <button
        type="button"
        className="ask-mage-btn"
        onClick={() => setOpen(true)}
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
          forum
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

      {/* Portal to <body> so the fixed-position modal escapes the checkpoint
          drawer's transformed containing block (the drawer's slide-in leaves a
          persisting transform that would otherwise trap + mis-center the modal
          and break its backdrop). */}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <CreateChatModal
              defaultNotebookId={notebookId ?? undefined}
              defaultSourcePathId={planId}
              defaultTitle={`Ask about: ${slotTitle}`}
              onClose={() => setOpen(false)}
              onCreate={(chatId) => {
                setOpen(false);
                router.push(`/learn/chats/${chatId}`);
              }}
            />,
            document.body,
          )
        : null}
    </>
  );
}
