'use client';

import Link from 'next/link';
import { NMCard } from '@/components/rework/NMCard';
import { Button } from '@/components/ui/Button';
import { Mascot } from '@/components/mascot/Mascot';

// Shared scaffolding for the Study Pack flashcard/quiz set-list pages
// (/study-packs/[id]/flashcards and /study-packs/[id]/quizzes). Each page picks
// a set, then routes into the standalone player at .../[setId].

export function SetListShell({
  packId,
  accent,
  icon,
  title,
  subtitle,
  children,
}: {
  packId: string;
  accent: string;
  icon: string;
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="nm-rework"
      style={{
        maxWidth: 'var(--nm-page-max)',
        margin: '0 auto',
        padding: 'clamp(16px,4vw,32px)',
        width: '100%',
        boxSizing: 'border-box',
      }}
    >
      <Link
        href={`/study-packs/${packId}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-sm)',
          color: 'var(--on-surface-variant)',
          textDecoration: 'none',
          marginBottom: 'var(--space-5, 20px)',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
          arrow_back
        </span>
        Back to pack
      </Link>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 'var(--space-6, 24px)' }}>
        <span
          aria-hidden
          style={{
            width: 44,
            height: 44,
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-container)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: accent }}>
            {icon}
          </span>
        </span>
        <div style={{ minWidth: 0 }}>
          <h1
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(20px, 3vw, 28px)',
              fontWeight: 700,
              color: 'var(--on-surface)',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            {title}
          </h1>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>
            {subtitle}
          </p>
        </div>
      </div>

      {children}
    </div>
  );
}

export function SetRow({
  href,
  icon,
  accent,
  title,
  meta,
  cta,
}: {
  href: string;
  icon: string;
  accent: string;
  title: string;
  meta: string;
  cta: string;
}) {
  return (
    <Link href={href} style={{ textDecoration: 'none' }}>
      <NMCard
        as="div"
        interactive
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-4, 16px)',
        }}
      >
        <span
          aria-hidden
          style={{
            width: 40,
            height: 40,
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-container-high)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: accent }}>
            {icon}
          </span>
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'var(--fs-base)',
              fontWeight: 700,
              color: 'var(--on-surface)',
              margin: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {title}
          </h3>
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', margin: '2px 0 0' }}>
            {meta}
          </p>
        </div>
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            fontSize: 'var(--fs-sm)',
            fontWeight: 600,
            color: accent,
            flexShrink: 0,
          }}
        >
          {cta}
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            arrow_forward
          </span>
        </span>
      </NMCard>
    </Link>
  );
}

export function SetListEmpty({ message, packId }: { message: string; packId: string }) {
  return (
    <NMCard
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 'var(--space-4, 16px)',
        padding: 'var(--space-8, 32px)',
        textAlign: 'center',
      }}
    >
      <Mascot pose="sleeping" size="md" idle="sway" />
      <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', margin: 0, maxWidth: 320 }}>
        {message}
      </p>
      <Button href={`/study-packs/${packId}`} variant="secondary" shape="pill" leadingIcon="folder_open">
        View material
      </Button>
    </NMCard>
  );
}

export const setListLoadingStyle: React.CSSProperties = {
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--fs-sm)',
  color: 'var(--on-surface-variant)',
  margin: 0,
};
