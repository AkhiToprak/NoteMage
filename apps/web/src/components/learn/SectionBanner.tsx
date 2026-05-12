'use client';

import Link from 'next/link';
import { LockIcon } from '@/components/icons/CheckpointIcons';

// Phase 10.5 — sticky section header rendered above each section's slot
// column. Pins to the viewport top while the section scrolls past so
// the learner always sees which section they're in (Duolingo's section
// banner pattern).
//
// Phase 10.8 — locked sections now render a greyed surface variant with
// a lock icon instead of the live notebook deep-link. A section is
// unlocked exactly when the previous section's assessment slot has been
// passed (≥1 star) — see `path-gating.ts:annotatePhases`.
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
   * present (and the section is unlocked), the right-side icon button
   * deep-links to it so the learner can jump back to the underlying
   * note.
   */
  notebookId: string | null;
  notebookTitle: string | null;
  /**
   * False when the previous section's assessment hasn't been passed
   * yet. Greys the banner and swaps the notebook icon for a lock.
   */
  unlocked: boolean;
}

export default function SectionBanner({
  index,
  title,
  description,
  notebookId,
  notebookTitle,
  unlocked,
}: SectionBannerProps) {
  const bg = unlocked ? 'var(--primary)' : 'var(--surface-container)';
  const fg = unlocked ? 'var(--on-primary)' : 'var(--on-surface-variant)';
  const subFg = unlocked ? 'var(--on-primary)' : 'var(--on-surface-variant)';
  const trailingBg = unlocked
    ? 'rgba(255, 255, 255, 0.18)'
    : 'var(--surface-container-high)';

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        marginTop: '24px',
        marginBottom: '16px',
        background: bg,
        color: fg,
        borderRadius: 'var(--radius-lg)',
        padding: '14px 16px',
        boxShadow: unlocked
          ? '0 4px 0 rgba(0, 0, 0, 0.18)'
          : '0 2px 0 var(--outline-variant)',
        border: unlocked ? 'none' : '1px solid var(--outline-variant)',
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
            color: subFg,
            opacity: unlocked ? 0.85 : 1,
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
            color: fg,
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
              color: subFg,
              opacity: unlocked ? 0.85 : 1,
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

      {unlocked && notebookId ? (
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
            background: trailingBg,
            color: fg,
            textDecoration: 'none',
          }}
        >
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: '20px', color: fg }}
          >
            menu_book
          </span>
        </Link>
      ) : !unlocked ? (
        <span
          aria-label="Section locked"
          role="img"
          style={{
            flexShrink: 0,
            width: '36px',
            height: '36px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-full)',
            background: trailingBg,
            color: fg,
          }}
        >
          <LockIcon size={20} color={fg} />
        </span>
      ) : null}
    </header>
  );
}
