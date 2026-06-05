'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import QuizSetCreator from '@/components/notebook/QuizSetCreator';
import { formatRelativeTime } from '@/lib/relative-time';

// Phase 9.4 (Agent C) — /learn/quizzes hub. Grouped grid of every quiz set
// the current user owns, grouped by source notebook (Inbox first, standard
// notebooks alphabetical, Cross-notebook last). Whole card links to the
// existing per-notebook player URL: /notebooks/[notebookId]/quizzes/[id].
// ?highlight=<id> scrolls and pulses a freshly created set after a redirect
// from the future "Generate quiz from this page" affordance (Phase 9.5).

interface QuizSet {
  id: string;
  title: string;
  notebookId: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { questions: number };
  notebook: {
    id: string;
    name: string;
    color: string | null;
    kind: string;
  } | null;
}

export default function LearnQuizzesPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <LearnQuizzesPageInner />
    </Suspense>
  );
}

function LearnQuizzesPageInner() {
  const searchParams = useSearchParams();
  const highlightId = searchParams?.get('highlight') ?? null;

  const [sets, setSets] = useState<QuizSet[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createNotebookId, setCreateNotebookId] = useState<string | null>(null);
  const [createdHighlightId, setCreatedHighlightId] = useState<string | null>(null);

  const loadSets = useCallback(async () => {
    try {
      const r = await fetch('/api/quiz-sets');
      const res = await r.json();
      if (res?.success) {
        setSets((res.data ?? []) as QuizSet[]);
        setError(null);
      } else {
        setError(res?.error ?? 'Failed to load quizzes');
        setSets((prev) => prev ?? []);
      }
    } catch {
      setError('Failed to load quizzes');
      setSets((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void loadSets();
  }, [loadSets]);

  const groups = useMemo(() => groupSets(sets ?? []), [sets]);
  const effectiveHighlight = createdHighlightId ?? highlightId;

  return (
    <div style={{ maxWidth: '1080px', margin: '0 auto', padding: '8px 0 48px', width: '100%', minWidth: 0 }}>
      <header style={{ marginBottom: '24px', padding: '0 16px' }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '28px',
            fontWeight: 800,
            color: 'var(--on-surface)',
            letterSpacing: '-0.02em',
          }}
        >
          Quizzes
        </h1>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: '14px',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.5,
          }}
        >
          Every quiz set you have made, grouped by the notebook it came from.
        </p>
      </header>

      {sets === null ? (
        <LoadingState />
      ) : sets.length === 0 ? (
        <EmptyState error={error} />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {error && (
            <p
              role="alert"
              style={{
                color: 'var(--error)',
                fontSize: '13px',
                margin: '0 16px',
              }}
            >
              {error}
            </p>
          )}
          {groups.map((group) => (
            <GroupSection
              key={group.key}
              group={group}
              highlightId={effectiveHighlight}
              onCreate={(notebookId) => setCreateNotebookId(notebookId)}
            />
          ))}
        </div>
      )}

      {createNotebookId && (
        <QuizSetCreator
          notebookId={createNotebookId}
          onClose={() => setCreateNotebookId(null)}
          onCreated={(setId) => {
            setCreateNotebookId(null);
            void loadSets().then(() => {
              setCreatedHighlightId(setId);
              window.setTimeout(() => setCreatedHighlightId(null), 2000);
            });
          }}
        />
      )}
    </div>
  );
}

interface SetGroup {
  key: string;
  kind: 'inbox' | 'standard' | 'cross';
  label: string;
  color: string | null;
  sets: QuizSet[];
}

function groupSets(sets: QuizSet[]): SetGroup[] {
  const inbox: QuizSet[] = [];
  const cross: QuizSet[] = [];
  const byNotebookId = new Map<string, { label: string; color: string | null; sets: QuizSet[] }>();

  for (const set of sets) {
    if (!set.notebook || !set.notebookId) {
      cross.push(set);
      continue;
    }
    if (set.notebook.kind === 'inbox') {
      inbox.push(set);
      continue;
    }
    const existing = byNotebookId.get(set.notebookId);
    if (existing) {
      existing.sets.push(set);
    } else {
      byNotebookId.set(set.notebookId, {
        label: set.notebook.name,
        color: set.notebook.color,
        sets: [set],
      });
    }
  }

  const result: SetGroup[] = [];
  if (inbox.length > 0) {
    result.push({ key: 'inbox', kind: 'inbox', label: 'Inbox', color: null, sets: inbox });
  }
  const standardGroups = Array.from(byNotebookId.entries())
    .map(([key, value]) => ({
      key,
      kind: 'standard' as const,
      label: value.label,
      color: value.color,
      sets: value.sets,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  result.push(...standardGroups);
  if (cross.length > 0) {
    result.push({ key: 'cross', kind: 'cross', label: 'Cross-notebook', color: null, sets: cross });
  }
  return result;
}

function GroupSection({
  group,
  highlightId,
  onCreate,
}: {
  group: SetGroup;
  highlightId: string | null;
  onCreate: (notebookId: string) => void;
}) {
  return (
    <section>
      <GroupHeader group={group} onCreate={onCreate} />
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
          gap: '12px',
          padding: '0 16px',
        }}
      >
        {group.sets.map((set) => (
          <SetCard key={set.id} set={set} highlight={highlightId === set.id} />
        ))}
      </div>
    </section>
  );
}

function GroupHeader({
  group,
  onCreate,
}: {
  group: SetGroup;
  onCreate: (notebookId: string) => void;
}) {
  const icon = group.kind === 'inbox' ? 'mail' : group.kind === 'cross' ? 'hub' : 'book_2';
  const swatch =
    group.kind === 'standard'
      ? group.color ?? 'var(--primary)'
      : group.kind === 'inbox'
        ? 'var(--tertiary)'
        : 'var(--secondary)';
  const notebookId = group.kind === 'cross' ? null : group.key;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        padding: '0 16px 12px',
        borderBottom: '1px solid var(--outline-variant)',
        margin: '0 0 16px',
      }}
    >
      <span
        aria-hidden
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: '28px',
          height: '28px',
          borderRadius: 'var(--radius-sm)',
          background: swatch,
          color: 'var(--on-primary)',
          flexShrink: 0,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
          {icon}
        </span>
      </span>
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--font-display)',
          fontSize: '16px',
          fontWeight: 700,
          color: 'var(--on-surface)',
          letterSpacing: '-0.01em',
          flex: 1,
        }}
      >
        {group.label}
      </h2>
      <span
        style={{
          fontSize: '13px',
          color: 'var(--on-surface-variant)',
          fontWeight: 500,
          flexShrink: 0,
        }}
      >
        {group.sets.length} {group.sets.length === 1 ? 'set' : 'sets'}
      </span>
      {notebookId && (
        <button
          type="button"
          onClick={() => onCreate(notebookId)}
          aria-label="New manual quiz"
          title="New manual quiz"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '30px',
            height: '30px',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--outline-variant)',
            background: 'var(--surface-container)',
            color: 'var(--on-surface-variant)',
            cursor: 'pointer',
            flexShrink: 0,
            transition:
              'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), background-color 0.35s cubic-bezier(0.22, 1, 0.36, 1), color 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--surface-container-high)';
            e.currentTarget.style.color = 'var(--on-surface)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--surface-container)';
            e.currentTarget.style.color = 'var(--on-surface-variant)';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden>
            add
          </span>
        </button>
      )}
    </div>
  );
}

function SetCard({ set, highlight }: { set: QuizSet; highlight: boolean }) {
  const cardRef = useRef<HTMLDivElement | null>(null);
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    if (!highlight) return;
    const node = cardRef.current;
    if (!node) return;
    node.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setPulse(true);
    const timer = window.setTimeout(() => setPulse(false), 2000);
    return () => window.clearTimeout(timer);
  }, [highlight]);

  const count = set._count.questions;
  const countLabel = count === 1 ? '1 question' : `${count} questions`;
  const canOpen = Boolean(set.notebookId);

  const cardStyle: React.CSSProperties = {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '14px',
    background: 'var(--surface-container)',
    border: pulse ? '1px solid var(--primary)' : '1px solid var(--outline-variant)',
    borderRadius: 'var(--radius-md)',
    boxShadow: pulse
      ? '0 0 0 3px rgba(174,137,255,0.25), 0 8px 24px rgba(174,137,255,0.18)'
      : 'none',
    transition:
      'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
    cursor: canOpen ? 'pointer' : 'not-allowed',
    opacity: canOpen ? 1 : 0.6,
    textDecoration: 'none',
    color: 'inherit',
    minHeight: '120px',
  };

  const inner = (
    <>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
        <span
          aria-hidden
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-container-high)',
            color: 'var(--primary)',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            quiz
          </span>
        </span>
        <h3
          style={{
            margin: 0,
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            lineHeight: 1.35,
            letterSpacing: '-0.01em',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
            wordBreak: 'break-word',
          }}
        >
          {set.title || 'Untitled quiz'}
        </h3>
      </div>
      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          fontSize: '12px',
          color: 'var(--on-surface-variant)',
        }}
      >
        <span style={{ fontWeight: 600 }}>{countLabel}</span>
        <span>{formatRelativeTime(set.updatedAt)}</span>
      </div>
    </>
  );

  if (!canOpen) {
    return (
      <div
        ref={cardRef}
        title="No home notebook"
        aria-disabled
        style={cardStyle}
      >
        {inner}
      </div>
    );
  }

  return (
    <Link
      href={`/notebooks/${set.notebookId}/quizzes/${set.id}`}
      ref={cardRef as unknown as React.RefObject<HTMLAnchorElement>}
      style={cardStyle}
      onMouseEnter={(e) => {
        e.currentTarget.style.transform = 'translateY(-2px)';
        if (!pulse) {
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
        }
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.transform = 'translateY(0)';
        if (!pulse) {
          e.currentTarget.style.boxShadow = 'none';
        }
      }}
    >
      {inner}
    </Link>
  );
}

function LoadingState() {
  return (
    <p
      style={{
        color: 'var(--on-surface-variant)',
        fontSize: '14px',
        padding: '0 16px',
      }}
    >
      Loading your quizzes…
    </p>
  );
}

function EmptyState({ error }: { error: string | null }) {
  return (
    <section
      style={{
        margin: '0 16px',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: '32px',
        textAlign: 'center',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: '40px', color: 'var(--on-surface-variant)' }}
        aria-hidden
      >
        quiz
      </span>
      <h2
        style={{
          margin: '12px 0 6px',
          fontFamily: 'var(--font-display)',
          fontSize: '18px',
          fontWeight: 700,
          color: 'var(--on-surface)',
        }}
      >
        {error ? 'Could not load your quizzes' : 'No quiz sets yet'}
      </h2>
      <p
        style={{
          margin: '0 0 16px',
          fontSize: '14px',
          color: 'var(--on-surface-variant)',
          lineHeight: 1.5,
        }}
      >
        {error
          ? error
          : 'Open a notebook page and use the header Generate dropdown to create a quiz from any page.'}
      </p>
      <Link
        href="/notebooks"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '10px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--primary)',
          color: 'var(--on-primary)',
          fontSize: '14px',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden>
          arrow_forward
        </span>
        Go to notebooks
      </Link>
    </section>
  );
}
