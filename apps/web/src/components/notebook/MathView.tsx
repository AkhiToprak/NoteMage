'use client';

import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useEffect, useRef, useState } from 'react';
import katex from 'katex';

/**
 * Editable NodeView for the KaTeX math nodes (`inlineMath` / `blockMath`).
 *
 * The rendered formula shows by default; clicking it (when the editor is
 * editable) swaps in a LaTeX field. Committing writes back to the node's
 * `latex` attribute — the same attribute the read-only theory viewer uses, so
 * imported and AI-generated equations stay interchangeable.
 */
export default function MathView({ node, updateAttributes, editor }: NodeViewProps) {
  const latex = String(node.attrs.latex ?? '');
  const isBlock = node.type.name === 'blockMath';
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(latex);
  const renderRef = useRef<HTMLSpanElement>(null);
  const fieldRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null);

  // Render the formula whenever the source changes and we're not editing.
  useEffect(() => {
    if (editing || !renderRef.current) return;
    if (latex.trim().length === 0) {
      renderRef.current.textContent = '';
      return;
    }
    try {
      katex.render(latex, renderRef.current, {
        displayMode: isBlock,
        throwOnError: false,
        strict: 'ignore',
      });
    } catch {
      renderRef.current.textContent = isBlock ? `$$${latex}$$` : `$${latex}$`;
    }
  }, [latex, isBlock, editing]);

  // Focus the field when entering edit mode (the draft is seeded by the
  // click handler, so this effect is a pure DOM side-effect).
  useEffect(() => {
    if (editing) fieldRef.current?.focus();
  }, [editing]);

  const commit = () => {
    updateAttributes({ latex: draft });
    setEditing(false);
  };
  const cancel = () => {
    setDraft(latex);
    setEditing(false);
  };

  const openEditor = () => {
    if (!editor.isEditable) return;
    setDraft(latex);
    setEditing(true);
  };

  const empty = latex.trim().length === 0;

  return (
    <NodeViewWrapper
      as={isBlock ? 'div' : 'span'}
      data-math={isBlock ? 'block' : 'inline'}
      style={
        isBlock
          ? { display: 'block', textAlign: 'center', margin: '14px 0', overflowX: 'auto' }
          : { display: 'inline-block' }
      }
    >
      {editing ? (
        isBlock ? (
          <textarea
            ref={fieldRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                commit();
              }
            }}
            spellCheck={false}
            rows={Math.min(6, Math.max(2, draft.split('\n').length))}
            placeholder="LaTeX — e.g. x = \\frac{-b}{2a}"
            style={{
              width: '100%',
              maxWidth: 520,
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 13,
              lineHeight: 1.6,
              padding: '8px 10px',
              borderRadius: 8,
              border: '1px solid rgba(174,137,255,0.45)',
              background: 'var(--surface-container-low)',
              color: 'var(--on-surface)',
              resize: 'vertical',
            }}
          />
        ) : (
          <input
            ref={fieldRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.preventDefault();
                cancel();
              } else if (e.key === 'Enter') {
                e.preventDefault();
                commit();
              }
            }}
            spellCheck={false}
            placeholder="LaTeX"
            style={{
              fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
              fontSize: 13,
              padding: '2px 6px',
              borderRadius: 6,
              border: '1px solid rgba(174,137,255,0.45)',
              background: 'var(--surface-container-low)',
              color: 'var(--on-surface)',
            }}
          />
        )
      ) : (
        <span
          ref={renderRef}
          onClick={openEditor}
          role={editor.isEditable ? 'button' : undefined}
          tabIndex={editor.isEditable ? 0 : undefined}
          onKeyDown={(e) => {
            if (editor.isEditable && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              openEditor();
            }
          }}
          style={{
            cursor: editor.isEditable ? 'pointer' : 'default',
            color: empty ? 'var(--ink-40)' : undefined,
            fontFamily: empty ? "'JetBrains Mono', monospace" : undefined,
            fontSize: empty ? 13 : undefined,
          }}
        >
          {empty ? (isBlock ? 'Empty equation — click to edit' : '∅') : null}
        </span>
      )}
    </NodeViewWrapper>
  );
}
