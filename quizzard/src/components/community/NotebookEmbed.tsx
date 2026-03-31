'use client';

import { useState, useEffect } from 'react';

interface NotebookEmbedProps {
  notebookId: string;
}

interface NotebookInfo {
  id: string;
  name: string;
  subject: string | null;
  color: string | null;
  _count?: { sections: number };
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  elevated: '#232342',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textMuted: '#8888a8',
  border: '#555578',
} as const;

export default function NotebookEmbed({ notebookId }: NotebookEmbedProps) {
  const [notebook, setNotebook] = useState<NotebookInfo | null>(null);
  const [hovered, setHovered] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}`);
        if (res.ok) {
          const json = await res.json();
          if (json.success && !cancelled) {
            setNotebook(json.data);
          }
        }
      } catch {
        // silently fail
      }
    })();
    return () => { cancelled = true; };
  }, [notebookId]);

  if (!notebook) return null;

  return (
    <a
      href={`/notebooks/${notebookId}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 14px',
        borderRadius: 12,
        background: COLORS.elevated,
        border: `1px solid ${hovered ? 'rgba(174,137,255,0.3)' : COLORS.border}`,
        borderLeft: `3px solid ${notebook.color || COLORS.primary}`,
        textDecoration: 'none',
        transition: `all 0.2s ${EASING}`,
        transform: hovered ? 'translateY(-1px)' : 'none',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.2)' : 'none',
        cursor: 'pointer',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: 22,
          color: notebook.color || COLORS.primary,
          flexShrink: 0,
        }}
      >
        menu_book
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: COLORS.textPrimary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {notebook.name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          {notebook.subject && (
            <span
              style={{
                fontSize: 11,
                color: COLORS.textMuted,
                background: 'rgba(174,137,255,0.08)',
                padding: '1px 6px',
                borderRadius: 4,
              }}
            >
              {notebook.subject}
            </span>
          )}
          {notebook._count && (
            <span style={{ fontSize: 11, color: COLORS.textMuted }}>
              {notebook._count.sections} section{notebook._count.sections !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>
      <span
        className="material-symbols-outlined"
        style={{
          fontSize: 18,
          color: hovered ? COLORS.primary : COLORS.textMuted,
          transition: `color 0.15s ${EASING}`,
        }}
      >
        open_in_new
      </span>
    </a>
  );
}
