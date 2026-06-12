'use client';

import { useId, useState } from 'react';
import { PathDiagramSchema, type PathDiagram as PathDiagramData } from '@notemage/shared';
import PathDiagram from '@/components/learn/PathDiagram';

// Path-diagrams revival (Phase 3): collapsed-by-default reference panel that
// reuses a slot's theory diagrams on its flashcard / quiz activities. The
// diagrams come straight from the content-route payload as loose JSON; we
// validate each with PathDiagramSchema before rendering (mirrors
// TheoryViewer's defensive parse), so a malformed entry is silently skipped
// rather than crashing the viewer. Inline-style idiom + design tokens to match
// the checkpoint viewers; no gradients, no transition-all, expand/collapse is
// a no-animation height swap (preferred per the design rules).

export default function DiagramReferencePanel({ diagrams }: { diagrams: unknown }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  if (!Array.isArray(diagrams) || diagrams.length === 0) return null;
  const valid: PathDiagramData[] = [];
  for (const raw of diagrams) {
    const parsed = PathDiagramSchema.safeParse(raw);
    if (parsed.success) valid.push(parsed.data);
    if (valid.length >= 2) break;
  }
  if (valid.length === 0) return null;

  // Terse label: the (first) diagram's title when present, else a single word.
  const label = valid[0].title?.trim() || 'Diagram';

  return (
    <section
      style={{
        width: '100%',
        maxWidth: '720px',
        margin: '0 auto 16px',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-container-low)',
        overflow: 'hidden',
      }}
    >
      <style>{`
        .diagram-ref-toggle:hover {
          background: var(--surface-container);
        }
        .diagram-ref-toggle:focus-visible {
          outline: 2px solid var(--primary);
          outline-offset: -2px;
        }
        .diagram-ref-toggle:active .diagram-ref-chevron {
          transform: translateY(1px);
        }
      `}</style>
      <button
        type="button"
        className="diagram-ref-toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        style={{
          width: '100%',
          minHeight: '44px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 16px',
          background: 'transparent',
          border: 'none',
          color: 'var(--on-surface)',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
        }}
      >
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{ fontSize: '20px', color: 'var(--primary)' }}
        >
          schema
        </span>
        <span
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {label}
        </span>
        <span
          className="material-symbols-outlined diagram-ref-chevron"
          aria-hidden
          style={{ fontSize: '22px', color: 'var(--on-surface-variant)', flexShrink: 0 }}
        >
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </button>
      {open ? (
        <div id={panelId} style={{ padding: '0 16px 12px' }}>
          {valid.map((d, i) => (
            <PathDiagram key={i} diagram={d} />
          ))}
        </div>
      ) : null}
    </section>
  );
}
