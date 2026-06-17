'use client';

import Link from 'next/link';
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import FlashcardSetCreator from '@/components/notebook/FlashcardSetCreator';
import FlashcardSetManager from '@/components/notebook/FlashcardSetManager';
import { formatRelativeTime } from '@/lib/relative-time';

// /practice/flashcards. Grouped grid of every flashcard set the user owns,
// grouped by source notebook. Inbox first, then standard notebooks
// alphabetically, then a Cross-notebook bucket last. Reached from the Practice
// page's "All flashcards" link.
//
// Opening a set still routes to the existing per-notebook player view
// (/notebooks/[id]/flashcards/[setId]).

interface FlashcardSetRow {
  id: string;
  title: string;
  notebookId: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { flashcards: number };
  notebook: { id: string; name: string; color: string | null; kind: string } | null;
}

interface SetGroup {
  key: string;
  label: string;
  color: string | null;
  kind: 'inbox' | 'standard' | 'cross';
  sets: FlashcardSetRow[];
}

const CROSS_GROUP_KEY = '__cross__';

export default function FlashcardsHubPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            maxWidth: '1120px',
            margin: '0 auto',
            padding: '24px 24px 48px',
            width: '100%',
            minWidth: 0,
          }}
        >
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px', margin: 0 }}>
            Loading your flashcards…
          </p>
        </div>
      }
    >
      <FlashcardsHubContent />
    </Suspense>
  );
}

function FlashcardsHubContent() {
  const searchParams = useSearchParams();
  const highlightId = searchParams?.get('highlight') ?? null;

  const [sets, setSets] = useState<FlashcardSetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const highlightedRef = useRef<HTMLAnchorElement | null>(null);
  const [manageNotebookId, setManageNotebookId] = useState<string | null>(null);
  const [createNotebookId, setCreateNotebookId] = useState<string | null>(null);

  const loadSets = useCallback(async () => {
    try {
      const r = await fetch('/api/flashcard-sets');
      const res = await r.json();
      if (res?.success) {
        setSets((res.data ?? []) as FlashcardSetRow[]);
        setError(null);
      } else {
        setError(res?.error ?? 'Failed to load flashcards');
        setSets((prev) => prev ?? []);
      }
    } catch {
      setError('Failed to load flashcards');
      setSets((prev) => prev ?? []);
    }
  }, []);

  useEffect(() => {
    void loadSets();
  }, [loadSets]);

  // Once sets are loaded and we have a highlight target that exists,
  // pulse it and scroll it into view. Clear the pulse after ~2s.
  useEffect(() => {
    if (!highlightId || !sets) return;
    const match = sets.find((s) => s.id === highlightId);
    if (!match) return;
    setPulseId(highlightId);
    const t = window.setTimeout(() => setPulseId(null), 2000);
    return () => window.clearTimeout(t);
  }, [highlightId, sets]);

  useEffect(() => {
    if (!pulseId) return;
    const node = highlightedRef.current;
    if (node) {
      node.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [pulseId]);

  const groups = useMemo<SetGroup[]>(() => {
    if (!sets) return [];
    const byKey = new Map<string, SetGroup>();

    for (const set of sets) {
      let key: string;
      let label: string;
      let color: string | null;
      let kind: SetGroup['kind'];

      if (!set.notebookId || !set.notebook) {
        key = CROSS_GROUP_KEY;
        label = 'Cross-notebook';
        color = null;
        kind = 'cross';
      } else if (set.notebook.kind === 'inbox') {
        key = set.notebook.id;
        label = 'Inbox';
        color = null;
        kind = 'inbox';
      } else {
        key = set.notebook.id;
        label = set.notebook.name || 'Untitled notebook';
        color = set.notebook.color;
        kind = 'standard';
      }

      const existing = byKey.get(key);
      if (existing) {
        existing.sets.push(set);
      } else {
        byKey.set(key, { key, label, color, kind, sets: [set] });
      }
    }

    const list = Array.from(byKey.values());
    list.sort((a, b) => {
      const orderOf = (g: SetGroup) => (g.kind === 'inbox' ? 0 : g.kind === 'standard' ? 1 : 2);
      const ao = orderOf(a);
      const bo = orderOf(b);
      if (ao !== bo) return ao - bo;
      return a.label.localeCompare(b.label);
    });
    return list;
  }, [sets]);

  return (
    <div
      style={{
        maxWidth: '1120px',
        margin: '0 auto',
        padding: '24px 24px 48px',
        width: '100%',
        minWidth: 0,
      }}
    >
      <header style={{ marginBottom: '24px' }}>
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
          Flashcards
        </h1>
      </header>

      {sets === null ? (
        <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px', margin: 0 }}>
          Loading your flashcards…
        </p>
      ) : error && sets.length === 0 ? (
        <ErrorBlock error={error} />
      ) : sets.length === 0 ? (
        <EmptyState />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
          {error && <ErrorBlock error={error} />}
          {groups.map((group) => (
            <GroupSection
              key={group.key}
              group={group}
              pulseId={pulseId}
              highlightedRef={highlightedRef}
              onCreate={(notebookId) => setCreateNotebookId(notebookId)}
              onManage={(notebookId) => setManageNotebookId(notebookId)}
            />
          ))}
        </div>
      )}

      {createNotebookId && (
        <FlashcardSetCreator
          notebookId={createNotebookId}
          onClose={() => setCreateNotebookId(null)}
          onCreated={(setId) => {
            setCreateNotebookId(null);
            void loadSets().then(() => {
              setPulseId(setId);
              window.setTimeout(() => setPulseId(null), 2000);
            });
          }}
        />
      )}

      {manageNotebookId && (
        <FlashcardSetManager
          notebookId={manageNotebookId}
          onClose={() => setManageNotebookId(null)}
          onUpdated={() => {
            void loadSets();
          }}
        />
      )}
    </div>
  );
}

function ErrorBlock({ error }: { error: string }) {
  return (
    <div
      role="alert"
      style={{
        border: '1px solid var(--error)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 14px',
        background: 'var(--surface-container)',
        color: 'var(--error)',
        fontSize: '13px',
        lineHeight: 1.5,
      }}
    >
      {error}
    </div>
  );
}

function EmptyState() {
  return (
    <section
      style={{
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
        style
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
        No flashcard sets yet
      </h2>
      <p
        style={{
          margin: '0 auto 16px',
          maxWidth: '440px',
          fontSize: '14px',
          color: 'var(--on-surface-variant)',
          lineHeight: 1.5,
        }}
      >
        Open a notebook page and use the header{' '}
        <strong style={{ color: 'var(--on-surface)' }}>Generate</strong> dropdown to create a
        flashcard set from any page.
      </p>
      <Link
        href="/study-packs"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '10px 16px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--surface-container-high)',
          color: 'var(--on-surface)',
          border: '1px solid var(--outline-variant)',
          fontSize: '14px',
          fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden>
          arrow_forward
        </span>
        Go to study packs
      </Link>
    </section>
  );
}

function GroupSection({
  group,
  pulseId,
  highlightedRef,
  onCreate,
  onManage,
}: {
  group: SetGroup;
  pulseId: string | null;
  highlightedRef: React.MutableRefObject<HTMLAnchorElement | null>;
  onCreate: (notebookId: string) => void;
  onManage: (notebookId: string) => void;
}) {
  const setCount = group.sets.length;
  const countLabel = `${setCount} ${setCount === 1 ? 'set' : 'sets'}`;
  const notebookId = group.kind === 'cross' ? null : group.key;

  return (
    <section>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          marginBottom: '12px',
          paddingBottom: '8px',
          borderBottom: '1px solid var(--outline-variant)',
        }}
      >
        {group.kind === 'inbox' ? (
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: '20px', color: 'var(--on-surface-variant)' }}
          >
            mail
          </span>
        ) : group.kind === 'cross' ? (
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: '20px', color: 'var(--on-surface-variant)' }}
          >
            hub
          </span>
        ) : (
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: '12px',
              height: '12px',
              borderRadius: 'var(--radius-full)',
              background: group.color ?? 'var(--outline)',
              border: '1px solid var(--outline-variant)',
              flexShrink: 0,
            }}
          />
        )}
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '16px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            letterSpacing: '-0.01em',
            flex: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {group.label}
        </h2>
        <span
          style={{
            fontSize: '12px',
            fontWeight: 600,
            color: 'var(--on-surface-variant)',
            flexShrink: 0,
          }}
        >
          {countLabel}
        </span>
        {notebookId && (
          <div style={{ display: 'flex', gap: '4px', flexShrink: 0 }}>
            <GroupActionButton
              icon="add"
              label="New manual set"
              onClick={() => onCreate(notebookId)}
            />
            <GroupActionButton
              icon="tune"
              label="Manage sets"
              onClick={() => onManage(notebookId)}
            />
          </div>
        )}
      </header>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(min(240px, 100%), 1fr))',
          gap: '16px',
        }}
      >
        {group.sets.map((set) => (
          <SetCard
            key={set.id}
            set={set}
            isPulsing={pulseId === set.id}
            highlightedRef={pulseId === set.id ? highlightedRef : null}
          />
        ))}
      </div>
    </section>
  );
}

function GroupActionButton({
  icon,
  label,
  onClick,
}: {
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
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
        {icon}
      </span>
    </button>
  );
}

function SetCard({
  set,
  isPulsing,
  highlightedRef,
}: {
  set: FlashcardSetRow;
  isPulsing: boolean;
  highlightedRef: React.MutableRefObject<HTMLAnchorElement | null> | null;
}) {
  const cardCount = set._count.flashcards;
  const cardCountLabel = `${cardCount} ${cardCount === 1 ? 'card' : 'cards'}`;
  const updatedLabel = formatRelativeTime(set.updatedAt);

  // The card is clickable only when we have a home notebook to route to.
  // Cross-notebook sets (notebookId null) sit at this page until a future
  // phase introduces a hub-level player.
  const canOpen = Boolean(set.notebookId);
  const href = canOpen ? `/notebooks/${set.notebookId}/flashcards/${set.id}` : null;

  const cardStyle: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '16px',
    minHeight: '96px',
    borderRadius: 'var(--radius-md)',
    background: 'var(--surface-container)',
    border: isPulsing ? '1px solid var(--primary)' : '1px solid var(--outline-variant)',
    boxShadow: isPulsing ? '0 0 0 3px color-mix(in srgb, var(--primary) 30%, transparent)' : 'none',
    color: 'var(--on-surface)',
    textDecoration: 'none',
    cursor: canOpen ? 'pointer' : 'default',
    transition:
      'transform 0.35s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.35s cubic-bezier(0.22, 1, 0.36, 1)',
  };

  const titleEl = (
    <h3
      style={{
        margin: 0,
        fontSize: '15px',
        fontWeight: 700,
        color: 'var(--on-surface)',
        lineHeight: 1.35,
        display: '-webkit-box',
        WebkitBoxOrient: 'vertical',
        WebkitLineClamp: 2,
        overflow: 'hidden',
        wordBreak: 'break-word',
      }}
    >
      {set.title || 'Untitled set'}
    </h3>
  );

  const metaEl = (
    <div
      style={{
        marginTop: 'auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
      }}
    >
      <span
        style={{
          fontSize: '13px',
          fontWeight: 600,
          color: 'var(--on-surface-variant)',
        }}
      >
        {cardCountLabel}
      </span>
      <span
        style={{
          fontSize: '12px',
          color: 'var(--on-surface-variant)',
          opacity: 0.85,
        }}
      >
        Updated {updatedLabel}
      </span>
    </div>
  );

  if (href) {
    return (
      <Link
        ref={highlightedRef}
        href={href}
        style={cardStyle}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'translateY(-2px)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'translateY(0)';
        }}
      >
        {titleEl}
        {metaEl}
      </Link>
    );
  }

  return (
    <div
      ref={(node) => {
        if (highlightedRef) {
          highlightedRef.current = node as unknown as HTMLAnchorElement | null;
        }
      }}
      title="This set has no home notebook yet."
      style={cardStyle}
    >
      {titleEl}
      {metaEl}
    </div>
  );
}
