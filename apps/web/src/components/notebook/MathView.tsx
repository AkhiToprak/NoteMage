'use client';

import { NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useEffect, useRef } from 'react';
import katex from 'katex';
import { useMathModal } from './math-modal-context';

/**
 * Editable NodeView for the KaTeX math nodes (`inlineMath` / `blockMath`).
 *
 * The rendered formula shows by default; double-clicking it (when the editor is
 * editable) opens the shared equation modal seeded with the current LaTeX. The
 * modal writes back to the node's `latex` attribute via `updateAttributes` —
 * the same attribute the read-only theory viewer uses, so imported and
 * AI-generated equations stay interchangeable.
 */
export default function MathView({ node, updateAttributes, editor }: NodeViewProps) {
  const latex = String(node.attrs.latex ?? '');
  const isBlock = node.type.name === 'blockMath';
  const renderRef = useRef<HTMLSpanElement>(null);
  const openMathModal = useMathModal();

  // Render the formula whenever the source changes.
  useEffect(() => {
    if (!renderRef.current) return;
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
  }, [latex, isBlock]);

  const openEditor = () => {
    if (!editor.isEditable) return;
    openMathModal({
      initialLatex: latex,
      isBlock,
      onSubmit: (next) => updateAttributes({ latex: next }),
    });
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
      <span
        ref={renderRef}
        onDoubleClick={openEditor}
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
        {empty ? (isBlock ? 'Empty equation — double-click to edit' : '∅') : null}
      </span>
    </NodeViewWrapper>
  );
}
