'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app/AppShell';
import MageTip from '@/components/app/MageTip';
import { UltraBadge } from '@/components/learn/UltraBadge';
import { SubjectIcon } from '@/components/learn/SubjectIcon';
import { derivePathStats, findContinueSlot } from '@/lib/path-stats';
import type { SerializedPath } from '@/lib/path-loader';
import type { PathPlan } from '@/components/learn/PathView';
import { DeletePathDialog } from '@/components/learn/DeletePathDialog';
import { ResetPathDialog } from '@/components/learn/ResetPathDialog';
import { TranslatePathDialog } from '@/components/learn/TranslatePathDialog';
import { CancelPathDialog } from '@/components/learn/CancelPathDialog';
import ui from '@/components/app/ui.module.css';
import styles from './Paths.module.css';

/* Learning paths (Web). Figma redesign shell, wired to the learner's real
   paths via /api/learn/paths. Mirrors the dashboard fetch/state pattern. */

// Mirrors STALE_GENERATION_MS in src/lib/path-loader.ts. A `generating` path
// with no heartbeat for this long has a dead orchestrator and is safe to force-stop.
const STALE_GENERATION_MS = 15 * 60 * 1000;

function isStuckGenerating(p: SerializedPath): boolean {
  const s = p.generationStatus;
  if ((s !== 'generating' && s !== 'cancelling') || !p.updatedAt) return false;
  return Date.now() - new Date(p.updatedAt).getTime() > STALE_GENERATION_MS;
}

type TabKey = 'all' | 'inprogress' | 'completed';

function MsIcon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <span className="material-symbols-outlined" style={{ fontSize: size, color: 'inherit' }} aria-hidden>
      {name}
    </span>
  );
}

function sourceLabel(p: SerializedPath): string {
  if (p.notebookTitle) return `From ${p.notebookTitle}`;
  switch (p.source) {
    case 'sample':
      return 'From sample material';
    case 'import':
      return 'From your upload';
    default:
      return 'AI-generated path';
  }
}

/** "units · lessons" line, singular-aware. Lessons = total activities across
 *  the path (same accounting as the dashboard's lessonCount in dashboard-data.ts). */
function unitsLessonsLabel(p: SerializedPath): string {
  const units = p.phases.length;
  const lessons = p.phases.reduce(
    (n, ph) => n + ph.slots.reduce((m, s) => m + (s.activities?.length ?? 0), 0),
    0,
  );
  return `${units} ${units === 1 ? 'unit' : 'units'} · ${lessons} ${lessons === 1 ? 'lesson' : 'lessons'}`;
}

/** Card metadata line. Drop a notebook title that just echoes the card title
 *  (case-insensitive equal, or one contains the other) — show units · lessons
 *  instead. Keep a genuinely different notebook title; keep the sample/import/AI
 *  fallbacks for paths without a notebook. */
function metaLabel(p: SerializedPath): string {
  const nb = p.notebookTitle?.trim();
  if (nb) {
    const a = nb.toLowerCase();
    const b = p.title.trim().toLowerCase();
    const redundant = a === b || a.includes(b) || b.includes(a);
    return redundant ? unitsLessonsLabel(p) : `From ${nb}`;
  }
  return sourceLabel(p);
}

function isPathDone(p: SerializedPath): boolean {
  return derivePathStats(p as unknown as PathPlan).progressPct >= 100;
}

// ── Overflow menu ─────────────────────────────────────────────────────────

type MoreMenuItem = {
  key: string;
  icon: string;
  label: string;
  href?: string;
  onSelect?: () => void;
  danger?: boolean;
};

function MoreMenu({ label, items }: { label: string; items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        ref={triggerRef}
        type="button"
        className={styles.moreBtn}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((p) => !p)}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18, color: 'inherit' }}>
          more_vert
        </span>
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className={styles.morePopover}
        >
          {items.map((item) => {
            const cls = item.danger ? `${styles.moreItem} ${styles.moreItemDanger}` : styles.moreItem;
            const inner = (
              <>
                <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>
                  {item.icon}
                </span>
                {item.label}
              </>
            );
            if (item.href) {
              return (
                <Link key={item.key} href={item.href} role="menuitem" className={cls} onClick={close}>
                  {inner}
                </Link>
              );
            }
            return (
              <button
                key={item.key}
                type="button"
                role="menuitem"
                className={cls}
                onClick={() => { close(); item.onSelect?.(); }}
              >
                {inner}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/** A single studyable path card. `isGenerating` marks a path that already has a
 *  studyable checkpoint but is still building the rest. */
function PathCard({
  p,
  isActive,
  isGenerating = false,
  compact = false,
  onDelete,
  onReset,
  onTranslate,
  onCancel,
}: {
  p: SerializedPath;
  isActive: boolean;
  isGenerating?: boolean;
  compact?: boolean;
  onDelete: (p: SerializedPath) => void;
  onReset: (p: SerializedPath) => void;
  onTranslate: (p: SerializedPath) => void;
  onCancel: (p: SerializedPath) => void;
}) {
  const stats = derivePathStats(p as unknown as PathPlan);
  const nextSlot = findContinueSlot(p as unknown as PathPlan);
  const isAssessment = nextSlot?.kind === 'assessment' || nextSlot?.kind === 'final_exam';
  const isDone = stats.progressPct >= 100;
  const isUltra = p.ultra === true;

  const ctaHref = nextSlot
    ? `/learn/paths/${encodeURIComponent(p.id)}?slot=${encodeURIComponent(nextSlot.id)}`
    : `/learn/paths/${encodeURIComponent(p.id)}`;

  // While generating: "Continue" if there's a built checkpoint to resume, else
  // "Open" the path map (the next checkpoint is still building).
  const ctaLabel = isDone
    ? 'Review'
    : nextSlot
      ? isAssessment
        ? 'Take checkpoint'
        : 'Continue'
      : isGenerating
        ? 'Open'
        : 'Review';

  // Title-row chip: "Current path" for the active path, "Completed" when done.
  // Checkpoint-ready inactive cards get a separate "Checkpoint ready" chip below.
  const chip: 'current' | 'done' | null =
    isDone ? 'done' : isActive ? 'current' : null;
  const showCheckpointChip = !isActive && !isDone && isAssessment;

  // Total checkpoints drive the "X / N steps" progress count.
  const steps = stats.totalCheckpoints;

  // CTA weight: the active card is the only filled purple button in the grid;
  // checkpoint-ready inactive cards get a middle-weight (tinted/outlined) button;
  // everything else gets a quiet ghost button.
  const ctaClass = isActive
    ? styles.ctaPrimary
    : showCheckpointChip
      ? styles.ctaTinted
      : styles.ctaGhost;

  // While still generating, Reset/Translate don't apply to a half-built path —
  // offer only "Stop generating" (the cancel flow handles a live/stuck build).
  const menuItems: MoreMenuItem[] = isGenerating
    ? [
        {
          key: 'cancel',
          icon: 'close',
          label: 'Stop generating',
          danger: true,
          onSelect: () => onCancel(p),
        },
      ]
    : [
        {
          key: 'translate',
          icon: 'translate',
          label: 'Translate',
          onSelect: () => onTranslate(p),
        },
        {
          key: 'reset',
          icon: 'restart_alt',
          label: 'Reset',
          onSelect: () => onReset(p),
        },
        {
          key: 'delete',
          icon: 'delete',
          label: 'Delete',
          danger: true,
          onSelect: () => onDelete(p),
        },
      ];

  return (
    <article
      className={`${styles.pathCard} ${isActive ? styles.pathActive : ''} ${compact ? styles.pathCompact : ''}`}
    >
      <div className={styles.cardTop}>
        <div className={styles.cardHeader}>
          <SubjectIcon subjects={p.subjects} size={compact ? 34 : 44} />
          <div className={styles.headerMeta}>
            <div className={styles.titleRow}>
              <h2 className={styles.pathTitle}>{p.title}</h2>
              {chip === 'current' && (
                <span className={`${styles.chip} ${styles.chipCurrent}`}>Current path</span>
              )}
              {chip === 'done' && (
                <span className={`${styles.chip} ${styles.chipDone}`}>Completed</span>
              )}
            </div>
            <div className={styles.sourceLine}>
              {isUltra && <UltraBadge fontSize={10.5} iconSize={12} />}
              {isUltra && <span className={styles.metaDot} aria-hidden>·</span>}
              <span className={styles.sourceText}>
                {metaLabel(p)}
                {isGenerating ? ' · Still building…' : ''}
              </span>
              {showCheckpointChip && (
                <span className={styles.chipCheckpoint}>Checkpoint ready</span>
              )}
            </div>
          </div>
          <div className={styles.cardMenu}>
            <MoreMenu label={`More actions for ${p.title}`} items={menuItems} />
          </div>
        </div>
      </div>

      <div className={styles.progressSpine}>
        <div
          className={styles.progressBar}
          role="progressbar"
          aria-valuenow={stats.progressPct}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${stats.progressPct}% complete`}
        >
          <span
            className={styles.progressFill}
            style={{ width: `${stats.progressPct}%` }}
          />
        </div>
        <span
          className={`${styles.progressCount} ${stats.doneCheckpoints === 0 ? styles.progressCountZero : ''}`}
        >
          {stats.doneCheckpoints} / {steps} steps · {stats.progressPct}%
        </span>
      </div>

      <div className={styles.cardDivider} />

      <div className={styles.cardFooter}>
        <span className={styles.nextStep}>
          {nextSlot ? (
            <>
              <span className={styles.nextLabel}>Next</span>
              <span className={styles.nextText}>{nextSlot.title}</span>
            </>
          ) : isGenerating ? (
            <span className={styles.nextText}>Building your next checkpoint…</span>
          ) : (
            <span className={styles.nextText}>Completed · Review anytime</span>
          )}
        </span>
        <Link href={ctaHref} className={ctaClass}>
          {ctaLabel}
          <MsIcon name="arrow_forward" size={16} />
        </Link>
      </div>
    </article>
  );
}

/** Shown while a path is still generating — no slot data yet. */
function GeneratingCard({
  p,
  stuck,
  onRequestCancel,
}: {
  p: SerializedPath;
  stuck: boolean;
  onRequestCancel: (p: SerializedPath) => void;
}) {
  const isTranslate = (p as { generationMode?: string | null }).generationMode === 'translate';
  const cancelling = p.generationStatus === 'cancelling' && !stuck;
  // Generations always get a stop/cancel affordance; a translation only gets
  // Restore once stuck (a live translation is non-destructive and self-finishes).
  const showButton = !cancelling && (stuck || !isTranslate);
  const buttonLabel = isTranslate ? 'Restore' : stuck ? 'Stop' : 'Cancel';

  return (
    <article className={`${styles.pathCard} ${styles.pathGenerating}`}>
      <div className={styles.cardTop}>
        <div className={styles.cardHeader}>
          <span className={styles.iconTile}>
            {stuck ? (
              <MsIcon name="sync_problem" size={24} />
            ) : (
              <MsIcon name="hourglass_top" size={24} />
            )}
          </span>
          <div className={styles.headerMeta}>
            <div className={styles.titleRow}>
              <h2 className={styles.pathTitle}>{p.title || 'Generating…'}</h2>
            </div>
            <div className={styles.sourceLine}>
              <span className={styles.sourceText}>
                {cancelling
                  ? 'Cancelling…'
                  : stuck
                    ? isTranslate
                      ? 'Translation stalled — your path is intact.'
                      : "Stuck — won't finish. Stop it to start fresh."
                    : isTranslate
                      ? `${sourceLabel(p)} · Translating your path…`
                      : `${sourceLabel(p)} · Building your path`}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className={styles.progressSpine}>
        <div className={styles.progressBar} aria-hidden>
          <span className={styles.progressIndeterminate} />
        </div>
        <span className={`${styles.progressCount} ${styles.progressCountZero}`}>
          {stuck ? '— steps' : 'Building…'}
        </span>
      </div>

      <div className={styles.cardDivider} />

      <div className={styles.cardFooter}>
        {cancelling ? (
          <span className={styles.nextText} aria-live="polite">Cancelling…</span>
        ) : (
          <span className={styles.nextText}>
            {stuck ? 'Path generation is stuck' : 'Mage is building this path…'}
          </span>
        )}
        {showButton && (
          <button
            type="button"
            className={styles.cancelBtn}
            onClick={() => onRequestCancel(p)}
            aria-label={`${buttonLabel} generating ${p.title}`}
          >
            <MsIcon name={isTranslate ? 'restart_alt' : 'close'} size={14} />
            {buttonLabel}
          </button>
        )}
      </div>
    </article>
  );
}

// ── Dialog target types ──────────────────────────────────────────────────

type DialogTarget = SerializedPath | null;

interface PathsViewProps {
  paths: SerializedPath[];
  errored: boolean;
}

export default function PathsView({ paths: initialPaths, errored }: PathsViewProps) {
  const [paths, setPaths] = useState<SerializedPath[]>(initialPaths);
  // Mirrors the old client page's error card: seeded from the server's errored
  // flag, and re-raised if a post-mutation refresh() fails (rather than silently
  // leaving a stale list with no feedback).
  const [fetchError, setFetchError] = useState(errored);
  const [tab, setTab] = useState<TabKey>('all');
  const [query, setQuery] = useState('');

  // Per-path action dialog state.
  const [deleteTarget, setDeleteTarget] = useState<DialogTarget>(null);
  const [resetTarget, setResetTarget] = useState<DialogTarget>(null);
  const [translateTarget, setTranslateTarget] = useState<DialogTarget>(null);
  const [cancelTarget, setCancelTarget] = useState<SerializedPath | null>(null);

  // Re-fetch after a mutating dialog action (delete/reset/translate/cancel).
  const refresh = () => {
    fetch('/api/learn/paths')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(String(res.status)))))
      .then((body) => {
        const next: SerializedPath[] = Array.isArray(body?.data) ? body.data : [];
        setPaths(next);
        setFetchError(false);
      })
      .catch(() => setFetchError(true));
  };

  const derived = useMemo(() => {
    // A path is studyable the moment any checkpoint has built activities — even
    // while the rest of the path is still generating.
    const isStudyable = (p: SerializedPath) =>
      p.phases.some((ph) => ph.slots.some((s) => s.activities.length > 0));
    // Cards the learner can open: settled paths with slots, PLUS generating
    // paths that already have a studyable checkpoint (so they can return to
    // continue checkpoint 1 while Stage B finishes the rest).
    const ready = paths.filter((p) =>
      p.generationStatus !== 'generating'
        ? p.phases.some((ph) => ph.slots.length > 0)
        : isStudyable(p),
    );
    // Paths still generating with nothing to study yet (skeleton only).
    const generating = paths.filter(
      (p) => p.generationStatus === 'generating' && !isStudyable(p),
    );

    // The "active" path for badge + MageTip: most-recently-updated in-progress path.
    const inProgress = ready.filter((p) => !isPathDone(p));
    const activePath = inProgress.length > 0
      ? inProgress.reduce((a, b) => (a.updatedAt > b.updatedAt ? a : b))
      : null;

    const inProgressCount = inProgress.length;

    // MageTip text.
    const activeStats = activePath
      ? derivePathStats(activePath as unknown as PathPlan)
      : null;
    const tipText =
      inProgressCount > 1
        ? `You have ${inProgressCount} active paths — continue ${activePath!.title} to keep your streak.`
        : activeStats?.weakTopicName
          ? `Review ${activeStats.weakTopicName} — it needs the most attention.`
          : inProgressCount === 1
            ? `Continue ${activePath!.title} to keep your streak.`
            : 'All paths look great — keep it up.';

    return { ready, generating, activePath, inProgressCount, tipText };
  }, [paths]);

  // ── Error ────────────────────────────────────────────────────────────────
  if (fetchError) {
    return (
      <AppShell>
        <header className={ui.header}>
          <div>
            <h1 className={ui.h1}>Learning paths</h1>
          </div>
        </header>
        <div className={ui.card} style={{ marginTop: 30, padding: '52px 32px', textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/holding-wand-v2.png" alt="" style={{ height: 72, margin: '0 auto 12px', display: 'block' }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>
            Could not load your paths
          </div>
          <p style={{ marginTop: 6, fontSize: 14, color: 'var(--body)' }}>
            Refresh the page to try again.
          </p>
        </div>
      </AppShell>
    );
  }

  const { ready, generating, activePath, tipText } = derived;

  // ── Empty (no paths at all yet) ───────────────────────────────────────────
  if (ready.length === 0 && generating.length === 0) {
    return (
      <AppShell>
        <header className={ui.header}>
          <div>
            <h1 className={ui.h1}>Learning paths</h1>
            <p className={ui.sub}>No paths yet</p>
          </div>
          <Link href="/paths/new" className={`${ui.btn} ${ui.ghost} ${ui.small}`}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }} aria-hidden>
              add
            </span>
            New path
          </Link>
        </header>
        <div className={ui.card} style={{ marginTop: 30, padding: '52px 32px', textAlign: 'center' }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/holding-wand-v2.png" alt="" style={{ height: 72, margin: '0 auto 12px', display: 'block' }} />
          <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>No paths yet</div>
          <p style={{ marginTop: 6, fontSize: 14, color: 'var(--body)' }}>
            Upload your material and Mage will build a learning path from it.
          </p>
          <Link href="/paths/new" className={`${ui.btn} ${ui.primary}`} style={{ marginTop: 18 }}>
            Create your first path
          </Link>
        </div>
      </AppShell>
    );
  }

  // ── Ready ────────────────────────────────────────────────────────────────

  // Client-side title search, layered on top of the tab filter.
  const q = query.trim().toLowerCase();
  const matchesQuery = (p: SerializedPath) =>
    q === '' || p.title.toLowerCase().includes(q);

  // Filter ready paths by active tab, then by search query.
  const visibleReady = (() => {
    const byTab =
      tab === 'inprogress'
        ? ready.filter((p) => !isPathDone(p))
        : tab === 'completed'
          ? ready.filter(isPathDone)
          : ready; // 'all'
    return byTab.filter(matchesQuery);
  })();

  // Generating cards are always shown in 'all' and 'inprogress' tabs (also search-filtered).
  const showGenerating = tab === 'all' || tab === 'inprogress';
  const visibleGenerating = generating.filter(matchesQuery);
  const nothingMatches = q !== '' && visibleReady.length === 0 &&
    (!showGenerating || visibleGenerating.length === 0);

  // Completed paths get their own quieter section below the main grid — separated
  // rather than mixed in at equal visual weight with what's still in progress.
  const visibleNotDone = visibleReady.filter((p) => !isPathDone(p));
  const visibleDone = visibleReady.filter(isPathDone);
  const hasMainGrid = (showGenerating && visibleGenerating.length > 0) || visibleNotDone.length > 0;

  // Header subtitle: match count while searching, else whole-library counts.
  const totalReady = ready.length;
  const matchCount = visibleReady.length + (showGenerating ? visibleGenerating.length : 0);
  const subtitle =
    q !== ''
      ? `${matchCount} match${matchCount === 1 ? '' : 'es'}`
      : generating.length > 0
        ? `${totalReady} ready · ${generating.length} generating`
        : `${totalReady} path${totalReady === 1 ? '' : 's'}`;

  return (
    <AppShell>
      <header className={ui.header}>
        <div>
          <h1 className={ui.h1}>Learning paths</h1>
          <p className={ui.sub}>{subtitle}</p>
        </div>
        <Link href="/paths/new" className={`${ui.btn} ${ui.ghost} ${ui.small}`}>
          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }} aria-hidden>
            add
          </span>
          New path
        </Link>
      </header>

      <div className={styles.controls}>
        {/* Filter toggles, not ARIA tabs — no tabpanel/arrow-key semantics here. */}
        <div className={styles.tabs} role="group" aria-label="Filter paths">
          <button
            type="button"
            aria-pressed={tab === 'all'}
            className={`${styles.tab} ${tab === 'all' ? styles.tabActive : ''}`}
            onClick={() => setTab('all')}
          >
            All
          </button>
          <button
            type="button"
            aria-pressed={tab === 'inprogress'}
            className={`${styles.tab} ${tab === 'inprogress' ? styles.tabActive : ''}`}
            onClick={() => setTab('inprogress')}
          >
            In progress
          </button>
          <button
            type="button"
            aria-pressed={tab === 'completed'}
            className={`${styles.tab} ${tab === 'completed' ? styles.tabActive : ''}`}
            onClick={() => setTab('completed')}
          >
            Completed
          </button>
        </div>
        <div className={styles.search}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18, color: 'var(--muted)' }}>
            search
          </span>
          <input
            type="search"
            className={styles.searchInput}
            placeholder="Search paths"
            aria-label="Search paths by title"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </div>

      {nothingMatches ? (
        <p className={styles.noMatch}>No paths match “{query.trim()}”.</p>
      ) : (
        <>
          {hasMainGrid && (
            <div className={styles.grid}>
              {/* Generating cards first (only in all/inprogress tabs) */}
              {showGenerating && visibleGenerating.map((p) => (
                <GeneratingCard
                  key={p.id}
                  p={p}
                  stuck={isStuckGenerating(p)}
                  onRequestCancel={setCancelTarget}
                />
              ))}

              {/* Ready, not-yet-done path cards */}
              {visibleNotDone.map((p) => (
                <PathCard
                  key={p.id}
                  p={p}
                  isActive={activePath?.id === p.id}
                  isGenerating={p.generationStatus === 'generating'}
                  onDelete={setDeleteTarget}
                  onReset={setResetTarget}
                  onTranslate={setTranslateTarget}
                  onCancel={setCancelTarget}
                />
              ))}
            </div>
          )}

          {/* Completed — separated, smaller, quieter than the active library. */}
          {visibleDone.length > 0 && (
            <section className={styles.doneSection}>
              <h2 className={styles.doneHeading}>
                Completed
                <span className={styles.doneCount}>{visibleDone.length}</span>
              </h2>
              <div className={styles.doneGrid}>
                {visibleDone.map((p) => (
                  <PathCard
                    key={p.id}
                    p={p}
                    isActive={false}
                    isGenerating={false}
                    compact
                    onDelete={setDeleteTarget}
                    onReset={setResetTarget}
                    onTranslate={setTranslateTarget}
                    onCancel={setCancelTarget}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}

      <div className={styles.tipWrap}>
        <MageTip
          text={tipText}
          mascot="/mascot/holding-flashcards-v2.png"
        />
      </div>

      {/* ── Per-path action dialogs ───────────────────────────────────────── */}
      {cancelTarget && (
        <CancelPathDialog
          planId={cancelTarget.id}
          planTitle={cancelTarget.title}
          generationMode={(cancelTarget as { generationMode?: string | null }).generationMode}
          stuck={isStuckGenerating(cancelTarget)}
          ultra={(cancelTarget as { ultra?: boolean }).ultra === true}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => { setCancelTarget(null); refresh(); }}
        />
      )}
      {deleteTarget && (
        <DeletePathDialog
          planId={deleteTarget.id}
          planTitle={deleteTarget.title}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => {
            setDeleteTarget(null);
            setPaths((prev) => prev.filter((p) => p.id !== deleteTarget.id));
          }}
        />
      )}
      {resetTarget && (
        <ResetPathDialog
          planId={resetTarget.id}
          planTitle={resetTarget.title}
          onClose={() => setResetTarget(null)}
          onReset={() => { setResetTarget(null); refresh(); }}
        />
      )}
      {translateTarget && (
        <TranslatePathDialog
          planId={translateTarget.id}
          planTitle={translateTarget.title}
          currentLanguage={(translateTarget as { language?: string }).language ?? 'en'}
          onClose={() => setTranslateTarget(null)}
          onTranslated={() => { setTranslateTarget(null); refresh(); }}
        />
      )}
    </AppShell>
  );
}
