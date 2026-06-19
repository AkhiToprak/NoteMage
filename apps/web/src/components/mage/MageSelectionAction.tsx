'use client';

/* Hallmark · component: floating action · genre: editorial · theme: project (Neon Scholar)
 * states: default · hover · focus · active
 * contrast: pass (uses --primary / --on-primary tokens)
 *
 * Mage Revolution Phase 10 — the selected-text "Ask Mage" action. Highlight any
 * text on a dashboard surface and a small CTA appears above the selection; click
 * it to open the panel with the selection seeded into the composer (so one send
 * asks about exactly what was highlighted) plus attached to the context. Skipped
 * on touch / coarse pointers (which have a native selection menu) and inside the
 * panel, inputs, and editable fields. Motion is opacity-only and collapses under
 * prefers-reduced-motion.
 */

import { useEffect, useRef, useState } from 'react';
import { useMage } from './MageProvider';

const MIN_LEN = 3;
const MAX_LEN = 2000;

export function MageSelectionAction() {
  const { open, context, isOpen } = useMage();
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const textRef = useRef('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    // Fine-pointer (desktop) only — touch devices surface their own selection
    // menu, and a floating CTA fights it.
    if (!window.matchMedia?.('(pointer: fine)').matches) return;

    const clear = () => {
      setPos(null);
      textRef.current = '';
    };

    const evaluate = () => {
      if (isOpen) return clear(); // panel already open → no floating CTA
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed || sel.rangeCount === 0) return clear();
      const text = sel.toString().trim();
      if (text.length < MIN_LEN || text.length > MAX_LEN) return clear();
      // Ignore selections inside the panel, inputs, or editable regions.
      const anchor = sel.anchorNode;
      const el =
        anchor instanceof Element ? anchor : (anchor?.parentElement ?? null);
      if (el?.closest('.mage-panel, input, textarea, [contenteditable="true"]')) return clear();
      const r = sel.getRangeAt(0).getBoundingClientRect();
      if (r.width === 0 && r.height === 0) return clear();
      textRef.current = text;
      setPos({ top: r.top, left: r.left + r.width / 2 });
    };

    const onSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || sel.isCollapsed) clear();
    };

    document.addEventListener('mouseup', evaluate);
    document.addEventListener('keyup', evaluate);
    document.addEventListener('selectionchange', onSelectionChange);
    window.addEventListener('scroll', clear, true);
    return () => {
      document.removeEventListener('mouseup', evaluate);
      document.removeEventListener('keyup', evaluate);
      document.removeEventListener('selectionchange', onSelectionChange);
      window.removeEventListener('scroll', clear, true);
    };
  }, [isOpen]);

  if (!pos) return null;

  return (
    <button
      type="button"
      className="mage-selection-cta"
      // Keep the selection alive through the click so the seeded text survives.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        open({ ...context, selectedText: textRef.current });
        setPos(null);
      }}
      style={{
        position: 'fixed',
        top: Math.max(8, pos.top - 46),
        left: pos.left,
        transform: 'translateX(-50%)',
        zIndex: 1180,
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '8px 14px',
        borderRadius: 'var(--radius-full)',
        border: 'none',
        background: 'var(--primary)',
        color: 'var(--on-primary)',
        fontFamily: 'inherit',
        fontSize: '12px',
        fontWeight: 700,
        cursor: 'pointer',
        boxShadow: '0 8px 24px rgba(174, 137, 255, 0.28), 0 2px 8px rgba(0, 0, 0, 0.35)',
        whiteSpace: 'nowrap',
      }}
    >
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '16px' }}>
        auto_fix_high
      </span>
      Ask Mage
      <style>{`
        .mage-selection-cta {
          animation: mage-cta-in 0.14s cubic-bezier(0.22, 1, 0.36, 1);
          transition: transform 0.12s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .mage-selection-cta:hover { background: var(--primary-dim); }
        .mage-selection-cta:focus-visible { outline: 2px solid var(--primary); outline-offset: 3px; }
        .mage-selection-cta:active { transform: translateX(-50%) scale(0.94); }
        @keyframes mage-cta-in { from { opacity: 0; } to { opacity: 1; } }
        @media (prefers-reduced-motion: reduce) {
          .mage-selection-cta { animation: none; transition: none; }
          .mage-selection-cta:active { transform: translateX(-50%); }
        }
      `}</style>
    </button>
  );
}

export default MageSelectionAction;
