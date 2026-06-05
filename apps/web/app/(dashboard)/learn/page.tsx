'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

// Learn dashboard — single page showing the four learning surfaces
// (Paths, Notebooks, Flashcards, Quizzes) as preview sections. Each
// section pulls recent items from its existing list endpoint and
// links out to the dedicated page for the full view.
//
// /dashboard stays as the home; this page is the "dashboard for
// learning" — the place to land when the user wants to study or pick
// up where they left off.

interface PathItem {
  id: string;
  title: string;
  notebookTitle: string | null;
  generationStatus?: string;
  phases: Array<{
    slots: Array<{ activities: Array<{ completed: boolean }> }>;
  }>;
}

interface NotebookItem {
  id: string;
  name: string;
  color: string | null;
  kind: string;
  _count?: { pages?: number; documents?: number };
}

interface FlashcardSetItem {
  id: string;
  title: string;
  notebookId: string | null;
  notebook: { id: string; name: string; color: string | null } | null;
  _count: { flashcards: number };
}

interface QuizSetItem {
  id: string;
  title: string;
  notebookId: string | null;
  notebook: { id: string; name: string; color: string | null } | null;
  _count: { questions: number };
}

type FetchState<T> =
  | { kind: 'loading' }
  | { kind: 'ready'; data: T[] }
  | { kind: 'error' };

const PREVIEW_LIMIT = 4;

export default function LearnDashboardPage() {
  const [paths, setPaths] = useState<FetchState<PathItem>>({ kind: 'loading' });
  const [notebooks, setNotebooks] = useState<FetchState<NotebookItem>>({ kind: 'loading' });
  const [flashcardSets, setFlashcardSets] = useState<FetchState<FlashcardSetItem>>({
    kind: 'loading',
  });
  const [quizSets, setQuizSets] = useState<FetchState<QuizSetItem>>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const wrap = <T,>(
      url: string,
      setter: (s: FetchState<T>) => void,
      pick?: (json: unknown) => T[],
    ) => {
      fetch(url)
        .then((r) => r.json())
        .then((json) => {
          if (cancelled) return;
          if (json?.success) {
            const data = pick
              ? pick(json)
              : (json.data ?? []);
            setter({ kind: 'ready', data: data as T[] });
          } else {
            setter({ kind: 'error' });
          }
        })
        .catch(() => {
          if (!cancelled) setter({ kind: 'error' });
        });
    };
    wrap<PathItem>('/api/learn/paths', setPaths);
    wrap<NotebookItem>('/api/notebooks?folderId=all', setNotebooks);
    wrap<FlashcardSetItem>('/api/flashcard-sets', setFlashcardSets);
    wrap<QuizSetItem>('/api/quiz-sets', setQuizSets);
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll while any path is still generating so the hub resolves "Building…"
  // on its own — without this the badge stuck forever until a manual reload,
  // disagreeing with the paths page (which already polls).
  useEffect(() => {
    if (paths.kind !== 'ready') return;
    const anyInFlight = paths.data.some(
      (p) => p.generationStatus === 'queued' || p.generationStatus === 'generating',
    );
    if (!anyInFlight) return;
    let cancelled = false;
    const id = setInterval(() => {
      fetch('/api/learn/paths')
        .then((r) => r.json())
        .then((json) => {
          if (cancelled) return;
          if (json?.success) setPaths({ kind: 'ready', data: (json.data ?? []) as PathItem[] });
        })
        .catch(() => {});
    }, 3000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [paths]);

  return (
    <div style={{ maxWidth: '960px', width: '100%', minWidth: 0, margin: '0 auto', padding: '24px 16px 48px' }}>
      <header style={{ marginBottom: '28px' }}>
        <h1
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '32px',
            fontWeight: 800,
            color: 'var(--on-surface)',
            letterSpacing: '-0.02em',
          }}
        >
          Learn
        </h1>
        <p
          style={{
            margin: '6px 0 0',
            fontSize: '14px',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.5,
          }}
        >
          Pick up where you left off. Paths, notebooks, flashcards, and quizzes — all in one place.
        </p>
      </header>

      <PathsSection state={paths} />
      <FlashcardsSection state={flashcardSets} />
      <QuizzesSection state={quizSets} />
      <NotebooksSection state={notebooks} />
    </div>
  );
}

// ── Sections ───────────────────────────────────────────────────────

function SectionShell({
  title,
  icon,
  href,
  count,
  children,
}: {
  title: string;
  icon: string;
  href: string;
  count: number | null;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginBottom: '28px' }}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '12px',
          gap: '12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <span
            aria-hidden
            style={{
              width: '32px',
              height: '32px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-container-high)',
              color: 'var(--primary)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              {icon}
            </span>
          </span>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '20px',
              fontWeight: 800,
              color: 'var(--on-surface)',
              letterSpacing: '-0.01em',
            }}
          >
            {title}
          </h2>
          {count !== null ? (
            <span
              style={{
                fontSize: '12px',
                fontWeight: 700,
                color: 'var(--on-surface-variant)',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {count}
            </span>
          ) : null}
        </div>
        <Link
          href={href}
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--primary)',
            textDecoration: 'none',
            flexShrink: 0,
          }}
        >
          View all →
        </Link>
      </header>
      {children}
    </section>
  );
}

function Skeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))',
        gap: '12px',
      }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          style={{
            height: '80px',
            background: 'var(--surface-container-low)',
            border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-md)',
          }}
        />
      ))}
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: '16px 18px',
        background: 'var(--surface-container-low)',
        border: '1px dashed var(--outline-variant)',
        borderRadius: 'var(--radius-md)',
        color: 'var(--on-surface-variant)',
        fontSize: '13px',
      }}
    >
      {message}
    </div>
  );
}

function PathsSection({ state }: { state: FetchState<PathItem> }) {
  const total = state.kind === 'ready' ? state.data.length : null;
  return (
    <SectionShell title="Learning paths" icon="school" href="/learn/paths" count={total}>
      {state.kind === 'loading' ? (
        <Skeleton rows={2} />
      ) : state.kind === 'error' ? (
        <EmptyRow message="Could not load paths." />
      ) : state.data.length === 0 ? (
        <EmptyRow message="No paths yet. Open a notebook and generate one." />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
            gap: '12px',
          }}
        >
          {state.data.slice(0, PREVIEW_LIMIT).map((path) => (
            <PathCard key={path.id} path={path} />
          ))}
        </div>
      )}
    </SectionShell>
  );
}

function PathCard({ path }: { path: PathItem }) {
  const allActivities = path.phases.flatMap((p) =>
    p.slots.flatMap((s) => s.activities),
  );
  const total = allActivities.length;
  const done = allActivities.filter((a) => a.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const inFlight =
    path.generationStatus === 'queued' || path.generationStatus === 'generating';
  return (
    <Link
      href={`/learn/paths/${encodeURIComponent(path.id)}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '14px 16px',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        textDecoration: 'none',
        color: 'var(--on-surface)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
        <span
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {path.title}
        </span>
        {inFlight ? (
          <span
            style={{
              fontSize: '10px',
              fontWeight: 800,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              color: 'var(--primary)',
              flexShrink: 0,
            }}
          >
            Building…
          </span>
        ) : null}
      </div>
      <p
        style={{
          margin: 0,
          fontSize: '12px',
          color: 'var(--on-surface-variant)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {path.notebookTitle ?? 'Cross-notebook'}
      </p>
      <div
        aria-hidden
        style={{
          width: '100%',
          height: '6px',
          background: 'var(--surface-container-high)',
          borderRadius: '999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: '100%',
            background: 'var(--primary)',
            borderRadius: '999px',
          }}
        />
      </div>
      <span
        style={{
          fontSize: '11px',
          color: 'var(--on-surface-variant)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pct}% — {done}/{total} steps
      </span>
    </Link>
  );
}

function NotebooksSection({ state }: { state: FetchState<NotebookItem> }) {
  const total = state.kind === 'ready' ? state.data.length : null;
  return (
    <SectionShell title="Notebooks" icon="menu_book" href="/notebooks" count={total}>
      {state.kind === 'loading' ? (
        <Skeleton rows={3} />
      ) : state.kind === 'error' ? (
        <EmptyRow message="Could not load notebooks." />
      ) : state.data.length === 0 ? (
        <EmptyRow message="No notebooks yet." />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(200px, 100%), 1fr))',
            gap: '12px',
          }}
        >
          {state.data.slice(0, PREVIEW_LIMIT).map((nb) => (
            <NotebookCard key={nb.id} notebook={nb} />
          ))}
        </div>
      )}
    </SectionShell>
  );
}

function NotebookCard({ notebook }: { notebook: NotebookItem }) {
  const pageCount = notebook._count?.pages ?? 0;
  const docCount = notebook._count?.documents ?? 0;
  return (
    <Link
      href={`/notebooks/${encodeURIComponent(notebook.id)}`}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '14px 16px',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderLeft: notebook.color
          ? `4px solid ${notebook.color}`
          : '4px solid var(--primary)',
        borderRadius: 'var(--radius-lg)',
        textDecoration: 'none',
        color: 'var(--on-surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
        {notebook.kind === 'inbox' ? (
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '16px', color: 'var(--primary)' }}
            aria-hidden
          >
            inbox
          </span>
        ) : null}
        <span
          style={{
            fontSize: '14px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            flex: 1,
            minWidth: 0,
          }}
        >
          {notebook.name}
        </span>
      </div>
      <span
        style={{
          fontSize: '11px',
          color: 'var(--on-surface-variant)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {pageCount} page{pageCount === 1 ? '' : 's'}
        {docCount > 0 ? ` · ${docCount} doc${docCount === 1 ? '' : 's'}` : ''}
      </span>
    </Link>
  );
}

function FlashcardsSection({ state }: { state: FetchState<FlashcardSetItem> }) {
  const total = state.kind === 'ready' ? state.data.length : null;
  return (
    <SectionShell title="Flashcards" icon="style" href="/learn/flashcards" count={total}>
      {state.kind === 'loading' ? (
        <Skeleton rows={2} />
      ) : state.kind === 'error' ? (
        <EmptyRow message="Could not load flashcards." />
      ) : state.data.length === 0 ? (
        <EmptyRow message="No flashcard sets yet." />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))',
            gap: '12px',
          }}
        >
          {state.data.slice(0, PREVIEW_LIMIT).map((set) => (
            <FlashcardSetCard key={set.id} set={set} />
          ))}
        </div>
      )}
    </SectionShell>
  );
}

function FlashcardSetCard({ set }: { set: FlashcardSetItem }) {
  // Path-generated sets may have null notebookId; surface that politely.
  const href = set.notebook?.id
    ? `/notebooks/${encodeURIComponent(set.notebook.id)}/flashcards/${encodeURIComponent(set.id)}`
    : '/learn/flashcards';
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '14px 16px',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        textDecoration: 'none',
        color: 'var(--on-surface)',
      }}
    >
      <span
        style={{
          fontSize: '14px',
          fontWeight: 700,
          color: 'var(--on-surface)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {set.title}
      </span>
      <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>
        {set._count.flashcards} card{set._count.flashcards === 1 ? '' : 's'}
        {set.notebook?.name ? ` · ${set.notebook.name}` : ''}
      </span>
    </Link>
  );
}

function QuizzesSection({ state }: { state: FetchState<QuizSetItem> }) {
  const total = state.kind === 'ready' ? state.data.length : null;
  return (
    <SectionShell title="Quizzes" icon="quiz" href="/learn/quizzes" count={total}>
      {state.kind === 'loading' ? (
        <Skeleton rows={2} />
      ) : state.kind === 'error' ? (
        <EmptyRow message="Could not load quizzes." />
      ) : state.data.length === 0 ? (
        <EmptyRow message="No quizzes yet." />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))',
            gap: '12px',
          }}
        >
          {state.data.slice(0, PREVIEW_LIMIT).map((set) => (
            <QuizSetCard key={set.id} set={set} />
          ))}
        </div>
      )}
    </SectionShell>
  );
}

function QuizSetCard({ set }: { set: QuizSetItem }) {
  const href = set.notebook?.id
    ? `/notebooks/${encodeURIComponent(set.notebook.id)}/quizzes/${encodeURIComponent(set.id)}`
    : '/learn/quizzes';
  return (
    <Link
      href={href}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '14px 16px',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        textDecoration: 'none',
        color: 'var(--on-surface)',
      }}
    >
      <span
        style={{
          fontSize: '14px',
          fontWeight: 700,
          color: 'var(--on-surface)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {set.title}
      </span>
      <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)' }}>
        {set._count.questions} question{set._count.questions === 1 ? '' : 's'}
        {set.notebook?.name ? ` · ${set.notebook.name}` : ''}
      </span>
    </Link>
  );
}
