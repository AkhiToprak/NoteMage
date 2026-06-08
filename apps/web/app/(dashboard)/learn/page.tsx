'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { UltraBadge } from '@/components/learn/UltraBadge';

// Learn dashboard (/learn Overview). A resume-and-start surface, NOT a clone of
// the sub-pages: a "Continue" rail of in-progress paths, quick actions, an
// in-flight generation banner, and a library-counts row that links into each
// sub-page. The full lists live on /learn/{paths,flashcards,quizzes} and are
// reached via the tab strip (learn/layout.tsx) — this page no longer mirrors
// them, which removes the old preview/"See all" duplication.

interface PathItem {
  id: string;
  title: string;
  notebookTitle: string | null;
  ultra?: boolean;
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

const CONTINUE_LIMIT = 3;

function isInFlight(p: PathItem): boolean {
  return p.generationStatus === 'queued' || p.generationStatus === 'generating';
}

function pathProgress(path: PathItem): { total: number; done: number; pct: number } {
  const all = path.phases.flatMap((p) => p.slots.flatMap((s) => s.activities));
  const total = all.length;
  const done = all.filter((a) => a.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { total, done, pct };
}

function countOf<T>(state: FetchState<T>): number | null {
  return state.kind === 'ready' ? state.data.length : null;
}

export default function LearnDashboardPage() {
  const [paths, setPaths] = useState<FetchState<PathItem>>({ kind: 'loading' });
  const [notebooks, setNotebooks] = useState<FetchState<NotebookItem>>({ kind: 'loading' });
  const [flashcardSets, setFlashcardSets] = useState<FetchState<FlashcardSetItem>>({
    kind: 'loading',
  });
  const [quizSets, setQuizSets] = useState<FetchState<QuizSetItem>>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    const wrap = <T,>(url: string, setter: (s: FetchState<T>) => void) => {
      fetch(url)
        .then((r) => r.json())
        .then((json) => {
          if (cancelled) return;
          if (json?.success) {
            setter({ kind: 'ready', data: (json.data ?? []) as T[] });
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

  // Poll while any path is still generating so the banner resolves on its own.
  useEffect(() => {
    if (paths.kind !== 'ready') return;
    if (!paths.data.some(isInFlight)) return;
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

  const readyPaths = paths.kind === 'ready' ? paths.data : [];
  const generating = readyPaths.filter(isInFlight);
  const inProgress = readyPaths
    .filter((p) => !isInFlight(p))
    .map((p) => ({ path: p, ...pathProgress(p) }))
    .filter((x) => x.total > 0 && x.done > 0 && x.done < x.total)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, CONTINUE_LIMIT);

  return (
    <div style={{ maxWidth: '960px', width: '100%', minWidth: 0, margin: '0 auto', padding: '32px 16px 48px' }}>
      {/* No visible page title in the design — keep an h1 for the heading
          outline / screen readers, but hide it visually. */}
      <h1 className="sr-only">Learn</h1>

      {generating.length > 0 && <GeneratingBanner paths={generating} />}

      <section style={{ marginBottom: '44px' }}>
        <SectionHeading title="Continue" />
        {paths.kind === 'loading' ? (
          <ContinueSkeleton />
        ) : inProgress.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
              gap: '12px',
            }}
          >
            {inProgress.map((x) => (
              <ContinueCard key={x.path.id} path={x.path} pct={x.pct} done={x.done} total={x.total} />
            ))}
          </div>
        ) : (
          <ContinueEmpty hasPaths={readyPaths.length > 0} error={paths.kind === 'error'} />
        )}
      </section>

      <section style={{ marginBottom: '44px' }}>
        <SectionHeading title="Start something" />
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
          <QuickAction icon="add" label="New path" href="/learn/paths" primary />
          <QuickAction icon="public" label="Browse community" href="/learn/community" />
          <QuickAction icon="chat" label="New chat" href="/learn/chats" />
          <QuickAction icon="menu_book" label="Open notebooks" href="/notebooks" />
        </div>
      </section>

      <section>
        <SectionHeading title="Your library" />
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(160px, 100%), 1fr))',
            gap: '12px',
          }}
        >
          <CountChip icon="stacks" label="Paths" count={countOf(paths)} href="/learn/paths" />
          <CountChip icon="style" label="Flashcards" count={countOf(flashcardSets)} href="/learn/flashcards" />
          <CountChip icon="quiz" label="Quizzes" count={countOf(quizSets)} href="/learn/quizzes" />
          <CountChip icon="menu_book" label="Notebooks" count={countOf(notebooks)} href="/notebooks" />
        </div>
      </section>
    </div>
  );
}

// ── Components ──────────────────────────────────────────────────────

function SectionHeading({ title }: { title: string }) {
  return (
    <h2
      style={{
        margin: '0 0 12px',
        fontFamily: 'var(--font-display)',
        fontSize: '18px',
        fontWeight: 800,
        color: 'var(--on-surface)',
        letterSpacing: '-0.01em',
      }}
    >
      {title}
    </h2>
  );
}

function GeneratingBanner({ paths }: { paths: PathItem[] }) {
  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
        padding: '14px 16px',
        marginBottom: '24px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
      }}
    >
      {paths.map((p) => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: '18px', color: 'var(--md-h4)', animation: 'nm-spin 1s linear infinite', flexShrink: 0 }}
          >
            progress_activity
          </span>
          <span
            style={{
              fontSize: '13px',
              color: 'var(--on-surface)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            Generating <strong style={{ fontWeight: 700 }}>{p.title}</strong>…
          </span>
        </div>
      ))}
    </div>
  );
}

function ContinueCard({
  path,
  pct,
  done,
  total,
}: {
  path: PathItem;
  pct: number;
  done: number;
  total: number;
}) {
  const ultra = path.ultra === true;
  // Gold fills/borders use the constant --brand-gold; gold text/icons use
  // --ultra-ink so they stay readable when the surface flips to light.
  const ink = ultra ? 'var(--ultra-ink)' : 'var(--md-h4)';
  const fill = ultra ? 'var(--brand-gold)' : 'var(--accent-strong)';
  return (
    <Link
      href={`/learn/paths/${encodeURIComponent(path.id)}`}
      className={ultra ? 'learn-hub-card learn-hub-card--gold' : 'learn-hub-card'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        padding: '16px',
        background: 'var(--surface-container)',
        border: ultra ? '1.5px solid var(--brand-gold)' : '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        textDecoration: 'none',
        color: 'var(--on-surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
        <span
          aria-hidden
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-container-high)',
            color: ink,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            {ultra ? 'school' : 'stacks'}
          </span>
        </span>
        <span
          style={{
            flex: '1 1 auto',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            minWidth: 0,
          }}
        >
          {path.title}
        </span>
        {ultra && <UltraBadge />}
      </div>
      <span
        style={{
          fontSize: '12px',
          color: 'var(--on-surface-variant)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {path.notebookTitle ?? 'Cross-notebook'}
      </span>
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
        <div style={{ width: `${pct}%`, height: '100%', background: fill, borderRadius: '999px' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '11px', color: 'var(--on-surface-variant)', fontVariantNumeric: 'tabular-nums' }}>
          {pct}% · {done}/{total} steps
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '12px', fontWeight: 700, color: ink }}>
          Resume
          <span className="material-symbols-outlined" style={{ fontSize: '16px' }} aria-hidden>
            arrow_forward
          </span>
        </span>
      </div>
    </Link>
  );
}

function ContinueEmpty({ hasPaths, error }: { hasPaths: boolean; error: boolean }) {
  const message = error
    ? 'Could not load your paths. Try refreshing.'
    : hasPaths
      ? 'Nothing in progress right now. Jump back into a path or start a new one.'
      : 'No learning paths yet. Generate your first one to start studying.';
  return (
    <div
      style={{
        padding: '24px 20px',
        textAlign: 'center',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-container-low)',
        border: '1px dashed var(--outline-variant)',
      }}
    >
      <p style={{ margin: '0 0 12px', fontSize: '14px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
        {message}
      </p>
      <Link
        href="/learn/paths"
        className="learn-hub-card learn-hub-card--gold"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 18px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--brand-gold)',
          color: 'var(--brand-gold-ink)',
          fontWeight: 700,
          fontSize: '14px',
          textDecoration: 'none',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden>
          add
        </span>
        New path
      </Link>
    </div>
  );
}

function ContinueSkeleton() {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
        gap: '12px',
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: '124px',
            background: 'var(--surface-container-low)',
            border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-lg)',
          }}
        />
      ))}
    </div>
  );
}

function QuickAction({
  icon,
  label,
  href,
  primary,
}: {
  icon: string;
  label: string;
  href: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={primary ? 'learn-hub-card learn-hub-card--gold' : 'learn-hub-card'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '12px 16px',
        borderRadius: 'var(--radius-md)',
        textDecoration: 'none',
        fontSize: '14px',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        background: primary ? 'var(--brand-gold)' : 'var(--surface-container)',
        color: primary ? 'var(--brand-gold-ink)' : 'var(--on-surface)',
        border: primary ? '1px solid var(--brand-gold)' : '1px solid var(--outline-variant)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden>
        {icon}
      </span>
      {label}
    </Link>
  );
}

function CountChip({
  icon,
  label,
  count,
  href,
}: {
  icon: string;
  label: string;
  count: number | null;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="learn-hub-card"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        padding: '14px 16px',
        borderRadius: 'var(--radius-lg)',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        textDecoration: 'none',
        color: 'var(--on-surface)',
        minWidth: 0,
      }}
    >
      <span
        aria-hidden
        style={{
          width: '36px',
          height: '36px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--surface-container-high)',
          color: 'var(--md-h4)',
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
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span
          style={{
            fontSize: '18px',
            fontWeight: 800,
            color: 'var(--on-surface)',
            fontFamily: 'var(--font-display)',
            fontVariantNumeric: 'tabular-nums',
            lineHeight: 1.1,
          }}
        >
          {count ?? '·'}
        </span>
        <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>{label}</span>
      </span>
    </Link>
  );
}
