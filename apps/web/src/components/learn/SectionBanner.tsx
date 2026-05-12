'use client';

import Link from 'next/link';

// Phase 10.5 — sticky section header rendered above each section's slot
// column. Pins to the viewport top while the section scrolls past so
// the learner always sees which section they're in (Duolingo's section
// banner pattern).
//
// Theme tokens only — no hex literals, no gradients (per CLAUDE.md
// + project memory: `feedback_no_gradients`,
// `feedback_light_mode_no_light_text`).

interface SectionBannerProps {
  index: number;
  title: string;
  description?: string | null;
  /**
   * Notebook the section's primary backing material belongs to. When
   * present, the right-side icon button deep-links to it so the
   * learner can jump back to the underlying note.
   */
  notebookId: string | null;
  notebookTitle: string | null;
}

export default function SectionBanner({
  index,
  title,
  description,
  notebookId,
  notebookTitle,
}: SectionBannerProps) {
  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        marginTop: '24px',
        marginBottom: '16px',
        background: 'var(--primary)',
        color: 'var(--on-primary)',
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
        boxShadow: '0 4px 0 rgba(0, 0, 0, 0.18)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: '11px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: 'var(--on-primary)',
            opacity: 0.85,
          }}
        >
          Section {index + 1}
        </p>
        <h2
          style={{
            margin: '2px 0 0',
            fontFamily: 'var(--font-display)',
            fontSize: '18px',
            fontWeight: 800,
            color: 'var(--on-primary)',
            letterSpacing: '-0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {title}
        </h2>
        {description ? (
          <p
            style={{
              margin: '2px 0 0',
              fontSize: '12px',
              color: 'var(--on-primary)',
              opacity: 0.85,
              lineHeight: 1.4,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {description}
          </p>
        ) : null}
      </div>

      {notebookId ? (
        <Link
          href={`/notebooks/${notebookId}`}
          aria-label={`Open notebook ${notebookTitle ?? ''}`.trim()}
          style={{
            flexShrink: 0,
            width: '36px',
            height: '36px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-full)',
            background: 'rgba(255, 255, 255, 0.18)',
            color: 'var(--on-primary)',
            textDecoration: 'none',
          }}
        >
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: '20px', color: 'var(--on-primary)' }}
          >
            menu_book
          </span>
        </Link>
      ) : null}
    </header>
  );
}
