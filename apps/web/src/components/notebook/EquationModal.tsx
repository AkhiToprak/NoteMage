'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import katex from 'katex';
import { useModalDimensions } from '@/hooks/useModalDimensions';

interface Props {
  /** Current LaTeX (empty string for a fresh insert). */
  initialLatex: string;
  /** Block (display) vs inline rendering for the live preview. */
  isBlock: boolean;
  /** Commit the typed LaTeX. The parent is responsible for closing. */
  onSubmit: (latex: string) => void;
  /** Dismiss without committing (Cancel / Esc / backdrop). */
  onClose: () => void;
}

/**
 * Equation-input mask. Mounted only while open (PageEditor renders it from
 * `mathReq && <EquationModal/>`), so `draft` seeds from `initialLatex` on mount
 * and resets naturally between opens. Live KaTeX preview, Esc to cancel,
 * Cmd/Ctrl+Enter to save. Styling mirrors SkipConfirmDialog.
 */
export default function EquationModal({ initialLatex, isBlock, onSubmit, onClose }: Props) {
  const [draft, setDraft] = useState(initialLatex);
  const [opacity, setOpacity] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  const dims = useModalDimensions(560, { fullScreenOnPhone: false });

  useEffect(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- read media query once on mount
      setReduceMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    }
    const id = requestAnimationFrame(() => setOpacity(1));
    fieldRef.current?.focus();
    return () => cancelAnimationFrame(id);
  }, []);

  const submit = () => onSubmit(draft);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
        e.stopPropagation();
        e.preventDefault();
        onSubmit(draft);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [draft, onClose, onSubmit]);

  // Live KaTeX preview. throwOnError:false renders a partial result; a hard
  // failure falls back to the raw source in the same error style MathView uses.
  const preview = useMemo(() => {
    const src = draft.trim();
    if (src.length === 0) return { html: '', ok: true, empty: true };
    try {
      const html = katex.renderToString(src, {
        displayMode: isBlock,
        throwOnError: false,
        strict: 'ignore',
      });
      return { html, ok: true, empty: false };
    } catch {
      return { html: '', ok: false, empty: false };
    }
  }, [draft, isBlock]);

  return (
    <div
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="equation-modal-title"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1200,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(2px)',
        WebkitBackdropFilter: 'blur(2px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        paddingTop: 'max(16px, env(safe-area-inset-top, 0px))',
        paddingBottom: 'max(16px, env(safe-area-inset-bottom, 0px))',
        paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
        paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
        opacity,
        transition: reduceMotion ? 'none' : 'opacity 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          ...dims,
          background: 'var(--surface-container)',
          border: '1px solid var(--outline-variant)',
          borderRadius: 'var(--radius-xl)',
          padding: 24,
          boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
          transform: opacity === 0 ? 'translateY(8px)' : 'translateY(0)',
          transition: reduceMotion ? 'none' : 'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
        }}
      >
        <h3
          id="equation-modal-title"
          style={{
            margin: '0 0 12px',
            fontFamily: 'var(--font-display)',
            fontSize: 18,
            fontWeight: 700,
            color: 'var(--on-surface)',
            letterSpacing: '-0.01em',
          }}
        >
          Equation
        </h3>

        <textarea
          ref={fieldRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          rows={Math.min(8, Math.max(3, draft.split('\n').length))}
          placeholder={'LaTeX — e.g. x = \\frac{-b \\pm \\sqrt{b^2 - 4ac}}{2a}'}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
            fontSize: 13,
            lineHeight: 1.6,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid rgba(174,137,255,0.45)',
            background: 'var(--surface-container-low)',
            color: 'var(--on-surface)',
            resize: 'vertical',
          }}
        />

        <div
          style={{
            marginTop: 12,
            padding: '14px 12px',
            minHeight: 56,
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-container-low)',
            border: '1px solid var(--outline-variant)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflowX: 'auto',
          }}
        >
          {preview.empty ? (
            <span style={{ fontSize: 13, color: 'var(--ink-40)' }}>Preview</span>
          ) : preview.ok ? (
            <span dangerouslySetInnerHTML={{ __html: preview.html }} />
          ) : (
            <span
              style={{
                fontFamily: "'JetBrains Mono', monospace",
                fontSize: 13,
                color: 'rgba(252,165,165,0.85)',
              }}
            >
              {isBlock ? `$$${draft}$$` : `$${draft}$`}
            </span>
          )}
        </div>

        <div
          style={{
            marginTop: 20,
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
          }}
        >
          <button
            onClick={onClose}
            style={{
              padding: '10px 18px',
              minHeight: 44,
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              color: 'var(--on-surface)',
              border: '1px solid var(--outline)',
              fontSize: 14,
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={submit}
            style={{
              padding: '10px 18px',
              minHeight: 44,
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary)',
              color: 'var(--background)',
              border: 'none',
              fontSize: 14,
              fontWeight: 700,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
