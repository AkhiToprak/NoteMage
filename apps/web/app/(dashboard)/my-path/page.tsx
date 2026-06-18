'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { NMCard } from '@/components/rework/NMCard';
import { SectionHeading } from '@/components/rework/SectionHeading';
import { ProgressBar } from '@/components/rework/ProgressBar';
import { ReadinessRing } from '@/components/rework/ReadinessRing';
import { readinessColor } from '@/components/rework/tokens';
import { Mascot } from '@/components/mascot/Mascot';
import { Button } from '@/components/ui/Button';
import { UltraBadge } from '@/components/learn/UltraBadge';
import PublishDialog from '@/components/path-publish/PublishDialog';
import { DeletePathDialog } from '@/components/learn/DeletePathDialog';
import { ResetPathDialog } from '@/components/learn/ResetPathDialog';
import { TranslatePathDialog } from '@/components/learn/TranslatePathDialog';
import { CancelPathDialog } from '@/components/learn/CancelPathDialog';
import type { PathPlan } from '@/components/learn/PathView';
import { derivePathStats, findContinueSlot } from '@/lib/path-stats';
import { SUBJECT_REGISTRY, isSubjectId, type SubjectId } from '@/lib/path-subjects';

// /my-path — "My Paths".
//
// Two separated stages:
//   1. SELECTION — a grid of the user's paths (the same card style as the
//      Learn paths list). Skipped when the user has exactly one path.
//   2. OVERVIEW  — a path-specific progress dashboard (the analogue of the
//      global Progress page, scoped to one path): readiness, subject,
//      checkpoint counts, topic mastery, and weak spots — topped by a big
//      "Continue path" button that drops into the study experience at the
//      next checkpoint.
//
// Data: GET /api/learn/paths (list, drives selection + header chrome) and
// GET /api/learn/paths/[id] (full plan with slot.activities, drives the
// overview stats + the resume deep-link).

// ── types ──────────────────────────────────────────────────────────────

type PathListItem = PathPlan & {
  generationStatus?: string;
  subjects?: string[];
  updatedAt?: string;
  /** Ultra (Pro-tier) path — drives the gold accent + badge. */
  ultra?: boolean;
  /** Current content language (BCP-47). Defaults to 'en' when absent. */
  language?: string;
  /** 'translate' while an in-place translation is running; else absent. */
  generationMode?: string | null;
  /** Set once the path has been published to the community library. */
  publication?: { shareId: string; moderationStatus: string } | null;
};

// Fill the screen like the dashboard / progress pages.
const PAGE_MAX = 'var(--nm-page-max)';

// Poll the list while any path is still generating / translating.
const POLL_INTERVAL_MS = 3000;

// Mirrors STALE_GENERATION_MS in src/lib/path-loader.ts. A `generating` path
// with no heartbeat for this long has a dead orchestrator (e.g. a redeploy
// killed the detached worker) and is safe to force-stop. The server DELETE
// enforces the same window — this only gates whether the Stop affordance shows.
const STALE_GENERATION_MS = 15 * 60 * 1000;

function isInFlight(plan: PathListItem): boolean {
  const status = plan.generationStatus;
  return status === 'queued' || status === 'generating' || status === 'cancelling';
}

function isStuckGenerating(plan: PathListItem): boolean {
  const s = plan.generationStatus;
  if ((s !== 'generating' && s !== 'cancelling') || !plan.updatedAt) return false;
  return Date.now() - new Date(plan.updatedAt).getTime() > STALE_GENERATION_MS;
}

// ── root page component ────────────────────────────────────────────────

export default function MyPathsPage() {
  const router = useRouter();
  const [listItems, setListItems] = useState<PathListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // The path the user has chosen to view (null = selection grid / auto).
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  // Full plan detail (with activities) for the active path.
  const [plan, setPlan] = useState<PathPlan | null>(null);

  // Creation moved out to the dedicated Study Pack wizard (/study-packs/new) —
  // the "New path" CTA just navigates there.
  // The in-flight path the user is stopping / restoring (null = no dialog).
  const [cancelTarget, setCancelTarget] = useState<PathListItem | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep the browser tab title (page metadata) in sync with the page name.
  useEffect(() => {
    const previous = document.title;
    document.title = 'My Paths';
    return () => {
      document.title = previous;
    };
  }, []);

  // Load (and re-load) the path list. Reused by the poll loop and after every
  // create / cancel / reset / translate so the grid reflects the new state.
  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/learn/paths');
      const j = await res.json();
      if (j?.success) {
        setListItems((j.data ?? []) as PathListItem[]);
        setListError(null);
      } else {
        setListError(j?.error ?? 'Could not load your paths');
        setListItems([]);
      }
    } catch {
      setListError('Could not load your paths');
      setListItems([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // The create CTA navigates to the dedicated Study Pack wizard. That flow's
  // own backend gates (and the server-side 402) handle FREE-tier blocking.
  const handleCreateClick = useCallback(() => {
    router.push('/study-packs/new');
  }, [router]);

  const readyItems = useMemo(() => {
    if (!listItems) return [];
    return listItems.filter((p) => p.generationStatus === 'ready' || !p.generationStatus);
  }, [listItems]);

  // Paths still generating / translating — rendered as Stop/Restore cards in the
  // grid so an in-flight (or stuck) path is never hidden behind a ready one.
  const inFlightItems = useMemo(
    () => (listItems ? listItems.filter(isInFlight) : []),
    [listItems],
  );

  // Re-fetch every 3s while anything is in flight; stop once it settles.
  useEffect(() => {
    if (!listItems) return;
    if (!listItems.some(isInFlight)) {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      return;
    }
    const t = setTimeout(() => {
      void refresh();
    }, POLL_INTERVAL_MS);
    pollTimerRef.current = t;
    return () => clearTimeout(t);
  }, [listItems, refresh]);

  // The path whose overview is shown. A lone ready path opens directly — but
  // only when nothing else is in flight, so a generating sibling stays visible
  // in the grid (and its Stop control reachable).
  const activePlanMeta = useMemo<PathListItem | null>(() => {
    if (readyItems.length === 0) return null;
    if (selectedPlanId) return readyItems.find((p) => p.id === selectedPlanId) ?? null;
    if (readyItems.length === 1 && inFlightItems.length === 0) return readyItems[0];
    return null; // grid mode
  }, [readyItems, inFlightItems, selectedPlanId]);

  // Fetch the full detail plan for the active path. Guarded by id rather than
  // a synchronous reset so we never call setState directly in the effect body
  // (and never flash a stale path's stats).
  useEffect(() => {
    if (!activePlanMeta) return;
    let cancelled = false;
    const id = activePlanMeta.id;
    fetch(`/api/learn/paths/${encodeURIComponent(id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.success && j.data) setPlan(j.data as PathPlan);
      })
      .catch(() => {
        /* overview falls back to its loading state */
      });
    return () => {
      cancelled = true;
    };
  }, [activePlanMeta]);

  // Only treat the detail plan as usable when it matches the active path.
  const detailPlan = plan && activePlanMeta && plan.id === activePlanMeta.id ? plan : null;

  // Drop a deleted path from the list and fall back to the grid / empty state.
  const handleDeleted = (planId: string) => {
    setListItems((prev) => (prev ? prev.filter((p) => p.id !== planId) : prev));
    setSelectedPlanId(null);
    setPlan(null);
  };

  // Stamp the publication onto the path so the action toolbar flips from
  // "Publish" to "Publication status".
  const handlePublished = (planId: string, shareId: string, moderationStatus: string) => {
    setListItems((prev) =>
      prev
        ? prev.map((p) =>
            p.id === planId ? { ...p, publication: { shareId, moderationStatus } } : p,
          )
        : prev,
    );
  };

  // ── Body: one of loading / empty / overview / selection-grid ──
  let body: React.ReactNode;

  if (listItems === null) {
    body = <LoadingLine label="Loading your paths…" />;
  } else if (listItems.length === 0) {
    body = (
      <>
        <SectionHeading title="My Paths" icon="route" action={<CommunityLink />} />
        <EmptyState onCreate={handleCreateClick} />
      </>
    );
  } else if (activePlanMeta) {
    // OVERVIEW — a path is active (lone ready path, or one chosen from the grid).
    body = (
      <PathOverview
        meta={activePlanMeta}
        detailPlan={detailPlan}
        showBack={readyItems.length > 1 || inFlightItems.length > 0}
        onBack={() => setSelectedPlanId(null)}
        onCreate={handleCreateClick}
        onDeleted={handleDeleted}
        onPublished={handlePublished}
        onRefresh={refresh}
      />
    );
  } else {
    // SELECTION — several ready paths and/or in-flight paths; none chosen yet.
    const subtitle =
      readyItems.length === 0
        ? `Generating your ${inFlightItems.length === 1 ? 'path' : 'paths'}…`
        : inFlightItems.length > 0
          ? `${readyItems.length} ready · ${inFlightItems.length} generating`
          : `${readyItems.length} active paths · pick one to see your progress`;
    body = (
      <>
        <SectionHeading
          title="My Paths"
          subtitle={subtitle}
          icon="route"
          action={<HeaderActions onCreate={handleCreateClick} />}
        />
        {listError && (
          <p role="alert" style={{ fontSize: '13px', color: 'var(--error)' }}>
            {listError}
          </p>
        )}
        <div
          role="group"
          aria-label="Choose a path"
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(340px, 100%), 1fr))',
            gap: 'var(--space-4)',
          }}
        >
          {inFlightItems.map((item) => (
            <GeneratingCard
              key={item.id}
              plan={item}
              stuck={isStuckGenerating(item)}
              onRequestCancel={setCancelTarget}
            />
          ))}
          {readyItems.map((item) => (
            <PathSelectCard key={item.id} plan={item} onSelect={() => setSelectedPlanId(item.id)} />
          ))}
        </div>
      </>
    );
  }

  return (
    <Shell>
      {body}
      {cancelTarget ? (
        <CancelPathDialog
          planId={cancelTarget.id}
          planTitle={cancelTarget.title}
          generationMode={cancelTarget.generationMode}
          stuck={isStuckGenerating(cancelTarget)}
          ultra={cancelTarget.ultra === true}
          onClose={() => setCancelTarget(null)}
          onCancelled={() => {
            setCancelTarget(null);
            void refresh();
          }}
        />
      ) : null}
    </Shell>
  );
}

// ── Layout shell ─────────────────────────────────────────────────────────

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="nm-rework"
      style={{
        maxWidth: PAGE_MAX,
        margin: '0 auto',
        width: '100%',
        padding: 'clamp(16px, 4vw, 32px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-8)',
      }}
    >
      {children}
      <PageStyles />
    </div>
  );
}

function LoadingLine({ label }: { label: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-3)',
        color: 'var(--on-surface-variant)',
        fontSize: 'var(--fs-sm)',
        padding: 'var(--space-8) 0',
      }}
    >
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 20 }}>
        hourglass_empty
      </span>
      {label}
    </div>
  );
}

// ── Selection card ─────────────────────────────────────────────────────
// The Learn-paths card style, as an entry into the path overview. Hover-lift,
// focus ring, and the gold Ultra treatment mirror the Learn paths list.

function PathSelectCard({ plan, onSelect }: { plan: PathListItem; onSelect: () => void }) {
  const allSlots = plan.phases.flatMap((p) => p.slots);
  const total = allSlots.length;
  const done = allSlots.filter((s) => s.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const ultra = plan.ultra === true;
  const ink = ultra ? 'var(--ultra-ink)' : 'var(--md-h4)';
  const accent = ultra ? 'var(--brand-gold)' : 'var(--primary)';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-label={`Open ${plan.title}`}
      className={ultra ? 'my-path-select-card my-path-select-card--gold' : 'my-path-select-card'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '18px',
        padding: 'clamp(20px, 1.6vw, 26px)',
        textAlign: 'left',
        fontFamily: 'inherit',
        cursor: 'pointer',
        background: 'var(--surface-container)',
        border: `${ultra ? '1.5px' : '1px'} solid ${ultra ? 'var(--brand-gold)' : 'var(--outline-variant)'}`,
        borderRadius: 'var(--radius-lg)',
        color: 'var(--on-surface)',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <span
          aria-hidden
          style={{
            width: '56px',
            height: '56px',
            borderRadius: 'var(--radius-lg)',
            background: 'var(--surface-container-high)',
            color: ink,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '30px' }}>
            school
          </span>
        </span>
        <span style={{ display: 'block', minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: 'block',
              fontSize: '18px',
              fontWeight: 700,
              color: 'var(--on-surface)',
              letterSpacing: '-0.01em',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {plan.title}
          </span>
          <span
            style={{
              display: 'block',
              marginTop: '3px',
              fontSize: '13px',
              color: 'var(--on-surface-variant)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {plan.notebookTitle ?? 'Multi-pack path'}
          </span>
        </span>
      </span>

      {ultra ? (
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
          <UltraBadge fontSize={13} iconSize={15} />
        </span>
      ) : null}

      <span
        aria-hidden
        style={{
          display: 'block',
          width: '100%',
          height: '10px',
          background: 'var(--surface-container-high)',
          borderRadius: '999px',
          overflow: 'hidden',
        }}
      >
        <span
          style={{
            display: 'block',
            width: `${pct}%`,
            height: '100%',
            background: accent,
            borderRadius: '999px',
          }}
        />
      </span>

      <span
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '13px',
          color: 'var(--on-surface-variant)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>
          {done} / {total} checkpoints
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: ink, fontWeight: 700 }}>
          View
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
            chevron_right
          </span>
        </span>
      </span>
    </button>
  );
}

// ── Subject chip ─────────────────────────────────────────────────────────

function SubjectChip({ subject }: { subject: SubjectId }) {
  const def = SUBJECT_REGISTRY[subject];
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: 'var(--radius-full)',
        background: 'var(--surface-container-high)',
        color: 'var(--on-surface-variant)',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
      }}
    >
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '14px' }}>
        {def.icon}
      </span>
      {def.shortLabel}
    </span>
  );
}

// ── Community link (shared toolbar/header action) ────────────────────────

function CommunityLink() {
  return (
    <Link href="/learn/community" className="my-path-toolbtn">
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
        explore
      </span>
      Browse community
    </Link>
  );
}

// ── Overflow ("More") menu ───────────────────────────────────────────────
// A minimal, accessible kebab menu for the secondary path actions. Built
// inline (no shared menu primitive in the codebase is token-clean enough to
// reuse) with the page's own toolbar tokens. Closes on click-outside and
// Escape; every item carries a :focus-visible ring. Each item is either a
// Link (navigates) or a button (fires a dialog open) — behavior is unchanged
// from the old inline toolbar buttons.

type MoreMenuItem = {
  key: string;
  icon: string;
  label: string;
  /** Navigation item — rendered as a Next.js Link. */
  href?: string;
  /** Action item — rendered as a button that fires this on select. */
  onSelect?: () => void;
  /** Danger styling (Delete) — keeps the red treatment within the menu. */
  danger?: boolean;
};

function MoreMenu({ label, items }: { label: string; items: MoreMenuItem[] }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on outside pointer (mouse + touch) and on Escape; restore focus to
  // the trigger when Escape closes the menu.
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
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
        className="my-path-toolbtn my-path-more-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((p) => !p)}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
          more_vert
        </span>
        More
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          className="my-path-more-popover"
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            right: 0,
            zIndex: 40,
            minWidth: '212px',
            padding: '6px',
            display: 'flex',
            flexDirection: 'column',
            gap: '2px',
            background: 'var(--surface-container-high)',
            border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 12px 32px rgb(0 0 0 / 0.28)',
          }}
        >
          {items.map((item) => {
            const cls = item.danger
              ? 'my-path-more-item my-path-more-item--danger'
              : 'my-path-more-item';
            const inner = (
              <>
                <span
                  className="material-symbols-outlined"
                  aria-hidden
                  style={{ fontSize: '18px' }}
                >
                  {item.icon}
                </span>
                {item.label}
              </>
            );
            if (item.href) {
              return (
                <Link
                  key={item.key}
                  href={item.href}
                  role="menuitem"
                  className={cls}
                  onClick={close}
                >
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
                onClick={() => {
                  close();
                  item.onSelect?.();
                }}
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

// ── Stat tile ──────────────────────────────────────────────────────────

function StatCard({
  icon,
  value,
  label,
  accent,
}: {
  icon: string;
  value: string | number;
  label: string;
  accent?: string;
}) {
  return (
    <NMCard
      style={{
        padding: 'clamp(14px, 2vw, 20px)',
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        minWidth: 0,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{ fontSize: 18, color: accent ?? 'var(--primary)' }}
        >
          {icon}
        </span>
        <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--on-surface-variant)', fontWeight: 600 }}>
          {label}
        </span>
      </span>
      <p
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(var(--fs-2xl), 4vw, 32px)',
          fontWeight: 800,
          color: 'var(--on-surface)',
          margin: 0,
          letterSpacing: '-0.03em',
        }}
      >
        {value}
      </p>
    </NMCard>
  );
}

// ── Path overview (progress-style, scoped to one path) ───────────────────

function PathOverview({
  meta,
  detailPlan,
  showBack,
  onBack,
  onCreate,
  onDeleted,
  onPublished,
  onRefresh,
}: {
  meta: PathListItem;
  detailPlan: PathPlan | null;
  showBack: boolean;
  onBack: () => void;
  onCreate: () => void;
  onDeleted: (planId: string) => void;
  onPublished: (planId: string, shareId: string, moderationStatus: string) => void;
  onRefresh: () => void;
}) {
  const ultra = meta.ultra === true;
  const subjects = (meta.subjects ?? []).filter(isSubjectId) as SubjectId[];
  const stats = detailPlan ? derivePathStats(detailPlan) : null;

  // Per-path actions (new path / publish / translate / reset / delete) live in
  // the toolbar below. A path can be published once it is ready and not already
  // shared; the OVERVIEW only renders for ready paths, so eligibility is just
  // "not yet published".
  const [publishOpen, setPublishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [translateOpen, setTranslateOpen] = useState(false);
  const publication = meta.publication ?? null;

  // The first unlocked, incomplete checkpoint — drives both the resume
  // deep-link and the "up next" line. The study page honours `?slot=&activity=`.
  const nextSlot = detailPlan ? findContinueSlot(detailPlan) : null;
  let continueHref = `/learn/paths/${encodeURIComponent(meta.id)}`;
  if (nextSlot) {
    const params = new URLSearchParams({ slot: nextSlot.id });
    const nextActivity = nextSlot.activities.find((a) => !a.completed) ?? nextSlot.activities[0];
    if (nextActivity) params.set('activity', nextActivity.id);
    continueHref += `?${params.toString()}`;
  }

  const allDone = stats !== null && stats.totalCheckpoints > 0 && stats.doneCheckpoints === stats.totalCheckpoints;
  const noneStarted = stats !== null && stats.doneCheckpoints === 0;
  const continueLabel = allDone ? 'Review path' : noneStarted ? 'Start path' : 'Continue path';
  const continueIcon = allDone ? 'replay' : 'play_arrow';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-8)' }}>
      {/* Top toolbar: back (when several paths) on the left; the primary
          "New path" CTA plus a "More" overflow menu (browse community, publish /
          publication status, translate, reset, delete) on the right. */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-3)',
          flexWrap: 'wrap',
        }}
      >
        {showBack ? (
          <button
            type="button"
            onClick={onBack}
            className="my-path-back"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '8px 12px',
              background: 'transparent',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'var(--on-surface-variant)',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
              arrow_back
            </span>
            All paths
          </button>
        ) : (
          <span aria-hidden />
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            flexWrap: 'wrap',
            justifyContent: 'flex-end',
          }}
        >
          <button
            type="button"
            className="my-path-toolbtn my-path-toolbtn--primary"
            onClick={onCreate}
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
              add
            </span>
            New path
          </button>
          <MoreMenu
            label="More path actions"
            items={[
              {
                key: 'community',
                icon: 'explore',
                label: 'Browse community',
                href: '/learn/community',
              },
              publication
                ? {
                    key: 'publication',
                    icon: 'fact_check',
                    label: 'Publication status',
                    href: `/learn/paths/${encodeURIComponent(meta.id)}/publication`,
                  }
                : {
                    key: 'publish',
                    icon: 'rocket_launch',
                    label: 'Publish',
                    onSelect: () => setPublishOpen(true),
                  },
              {
                key: 'translate',
                icon: 'translate',
                label: 'Translate',
                onSelect: () => setTranslateOpen(true),
              },
              {
                key: 'reset',
                icon: 'restart_alt',
                label: 'Reset',
                onSelect: () => setResetOpen(true),
              },
              {
                key: 'delete',
                icon: 'delete',
                label: 'Delete',
                danger: true,
                onSelect: () => setDeleteOpen(true),
              },
            ]}
          />
        </div>
      </div>

      {/* ── Header: identity + the big Continue CTA ── */}
      <NMCard
        style={{
          padding: 'clamp(18px, 3vw, 28px)',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 'var(--space-5)',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 280px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: 'clamp(var(--fs-xl), 4vw, var(--fs-3xl))',
                fontWeight: 800,
                color: 'var(--on-surface)',
                letterSpacing: '-0.02em',
                lineHeight: 1.1,
                overflowWrap: 'anywhere',
                minWidth: 0,
              }}
            >
              {meta.title}
            </h1>
            {ultra && <UltraBadge />}
          </div>
          {(subjects.length > 0 || meta.notebookTitle) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', alignItems: 'center' }}>
              {subjects.map((s) => (
                <SubjectChip key={s} subject={s} />
              ))}
              {meta.notebookTitle && (
                <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)' }}>
                  {meta.notebookTitle}
                </span>
              )}
            </div>
          )}
        </div>

        {stats && (
          <div className="my-path-continue-wrap">
            <Link
              href={continueHref}
              className="my-path-continue-btn"
              aria-label={`${continueLabel}: ${meta.title}`}
            >
              <span className="my-path-continue-ico" aria-hidden>
                <span className="material-symbols-outlined filled" style={{ fontSize: 18 }}>
                  {continueIcon}
                </span>
              </span>
              {continueLabel}
            </Link>
          </div>
        )}
      </NMCard>

      {!stats ? (
        <LoadingLine label="Loading this path…" />
      ) : (
        <>
          {/* ── Readiness ── */}
          <NMCard
            style={{
              padding: 'clamp(20px, 3vw, 32px)',
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 'var(--space-8)',
              flexWrap: 'wrap',
            }}
          >
            <ReadinessRing
              value={stats.progressPct}
              size={180}
              strokeWidth={16}
              label="done"
              color="var(--accent-strong)"
            />
            <div style={{ flex: 1, minWidth: 220, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
              <p
                style={{
                  fontSize: 'var(--fs-xs)',
                  fontWeight: 700,
                  color: 'var(--on-surface-variant)',
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.08em',
                }}
              >
                {allDone ? 'Progress' : 'Up next'}
              </p>
              <h2
                style={{
                  fontFamily: 'var(--font-display)',
                  fontSize: 'clamp(var(--fs-2xl), 4vw, var(--fs-3xl))',
                  fontWeight: 800,
                  color: 'var(--on-surface)',
                  margin: 0,
                  letterSpacing: '-0.02em',
                  lineHeight: 1.15,
                  overflowWrap: 'anywhere',
                }}
              >
                {allDone ? 'Path complete' : (nextSlot?.title ?? 'Keep going')}
              </h2>
              <p style={{ fontSize: 'var(--fs-base)', color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.6, maxWidth: 460 }}>
                {allDone
                  ? 'Every checkpoint cleared. Revisit any time to stay sharp.'
                  : 'Pick up right where you left off.'}
              </p>
            </div>
          </NMCard>

          {/* ── Overview tiles ── */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <SectionHeading title="Overview" icon="bar_chart" />
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))',
                gap: 'var(--space-4)',
              }}
            >
              <StatCard icon="flag" value={`${stats.doneCheckpoints}/${stats.totalCheckpoints}`} label="Checkpoints done" />
              <StatCard icon="layers" value={stats.sections} label="Sections" />
              <StatCard icon="menu_book" value={stats.lessonsCompleted} label="Lessons completed" />
              <StatCard icon="quiz" value={stats.quizzesTaken} label="Quizzes taken" />
              <StatCard icon="fort" value={stats.bossTestsPassed} label="Boss tests passed" />
              <StatCard icon="star" value={stats.starsEarned} label="Stars earned" accent="var(--brand-gold)" />
            </div>
          </section>

          {/* ── Topic mastery ── */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <SectionHeading title="Topic mastery" icon="workspace_premium" />
            <NMCard style={{ padding: 'clamp(16px, 2.5vw, 24px)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-5)' }}>
                {stats.topics.map((topic, i) => (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
                    <span
                      style={{
                        fontSize: 'var(--fs-sm)',
                        fontWeight: 600,
                        color: 'var(--on-surface)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {topic.title}
                    </span>
                    <ProgressBar value={topic.pct} color={readinessColor(topic.pct)} height={8} showPercent />
                  </div>
                ))}
              </div>
            </NMCard>
          </section>

          {/* ── Weak spots ── */}
          <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <SectionHeading title="Weak spots" icon="priority_high" />
            <NMCard accent="review" style={{ padding: 'clamp(16px, 2.5vw, 24px)' }}>
              {stats.weakCheckpoints.length === 0 && stats.weakTopicName === null ? (
                <p style={{ fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.6 }}>
                  {allDone
                    ? 'No weak spots. Every checkpoint is cleared. Revisit any time to stay sharp.'
                    : 'No weak spots yet. They appear after assessments reveal gaps.'}
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-3)' }}>
                    {stats.weakCheckpoints.map((wc, i) => (
                      <span
                        key={i}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          minHeight: 40,
                          padding: '8px 14px',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--nm-review-soft)',
                          border: '1px solid var(--nm-review)',
                          color: 'var(--nm-review)',
                          fontSize: 'var(--fs-sm)',
                          fontWeight: 600,
                          maxWidth: '100%',
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>
                          priority_high
                        </span>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {wc.title}
                        </span>
                        <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{wc.pct}%</span>
                      </span>
                    ))}
                    {stats.weakCheckpoints.length === 0 && stats.weakTopicName && (
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          minHeight: 40,
                          padding: '8px 14px',
                          borderRadius: 'var(--radius-full)',
                          background: 'var(--nm-review-soft)',
                          border: '1px solid var(--nm-review)',
                          color: 'var(--nm-review)',
                          fontSize: 'var(--fs-sm)',
                          fontWeight: 600,
                        }}
                      >
                        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>
                          priority_high
                        </span>
                        {stats.weakTopicName}
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: 'var(--fs-xs)', color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
                    {stats.weakCheckpoints.length > 0
                      ? 'Assessments you scored below the 70% pass mark. Retake them from the path to raise your readiness.'
                      : 'Your lowest-progress section so far. Keep going to close the gap.'}
                  </p>
                </div>
              )}
            </NMCard>
          </section>
        </>
      )}

      {publishOpen ? (
        <PublishDialog
          planId={meta.id}
          defaultTitle={meta.title}
          defaultDescription={meta.description ?? null}
          onClose={() => setPublishOpen(false)}
          onPublished={(shareId, moderationStatus) => {
            setPublishOpen(false);
            onPublished(meta.id, shareId, moderationStatus);
          }}
        />
      ) : null}

      {deleteOpen ? (
        <DeletePathDialog
          planId={meta.id}
          planTitle={meta.title}
          onClose={() => setDeleteOpen(false)}
          onDeleted={() => {
            setDeleteOpen(false);
            onDeleted(meta.id);
          }}
        />
      ) : null}

      {resetOpen ? (
        <ResetPathDialog
          planId={meta.id}
          planTitle={meta.title}
          onClose={() => setResetOpen(false)}
          onReset={() => {
            setResetOpen(false);
            onRefresh();
          }}
        />
      ) : null}

      {translateOpen ? (
        <TranslatePathDialog
          planId={meta.id}
          planTitle={meta.title}
          currentLanguage={meta.language ?? 'en'}
          onClose={() => setTranslateOpen(false)}
          onTranslated={() => {
            setTranslateOpen(false);
            onRefresh();
          }}
        />
      ) : null}
    </div>
  );
}

// ── Empty / generating states ────────────────────────────────────────────

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <NMCard
      style={{
        maxWidth: '480px',
        margin: '24px auto 0',
        padding: '40px 32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '16px',
      }}
    >
      <Mascot pose="thinking" size="lg" idle="float" />
      <div>
        <h2
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--font-display)',
            fontSize: '22px',
            fontWeight: 800,
            color: 'var(--on-surface)',
            letterSpacing: '-0.01em',
          }}
        >
          No paths yet
        </h2>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--on-surface-variant)', lineHeight: 1.65 }}>
          Pick your material and Notemage builds a step-by-step path: lessons, quizzes, reviews,
          and a final boss test.
        </p>
      </div>
      <Button onClick={onCreate} variant="primary" size="lg">
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
          add
        </span>
        New path
      </Button>
    </NMCard>
  );
}

// Header action cluster for the selection grid — a primary "New path" plus the
// community link. Mirrors the OVERVIEW toolbar.
function HeaderActions({ onCreate }: { onCreate: () => void }) {
  return (
    <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
      <button type="button" className="my-path-toolbtn my-path-toolbtn--primary" onClick={onCreate}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
          add
        </span>
        New path
      </button>
      <CommunityLink />
    </div>
  );
}

// In-flight card for a generating / translating (or stuck) path. Offers a
// Cancel / Stop / Restore affordance so a wedged generation is never a dead-end.
function GeneratingCard({
  plan,
  stuck,
  onRequestCancel,
}: {
  plan: PathListItem;
  stuck: boolean;
  onRequestCancel: (plan: PathListItem) => void;
}) {
  const isTranslate = plan.generationMode === 'translate';
  // A cancel is already in flight — show a passive "Cancelling…" pill, unless it
  // has gone stale (writer died mid-cancel), which routes to the force-stop.
  const cancelling = plan.generationStatus === 'cancelling' && !stuck;
  // Generations always get a stop/cancel affordance; a translation only gets
  // Restore once stuck (a live translation is non-destructive and self-finishes).
  const showButton = !cancelling && (stuck || !isTranslate);
  const buttonLabel = isTranslate ? 'Restore' : stuck ? 'Stop' : 'Cancel';
  const buttonAria = isTranslate
    ? `Restore ${plan.title}`
    : stuck
      ? `Stop generating ${plan.title}`
      : `Cancel generating ${plan.title}`;
  return (
    <section
      style={{
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: '16px',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        minHeight: '108px',
      }}
    >
      {stuck ? (
        <span
          aria-hidden
          style={{
            width: '32px',
            height: '32px',
            borderRadius: 'var(--radius-full)',
            background: 'var(--tertiary-container)',
            color: 'var(--on-tertiary-container)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
            sync_problem
          </span>
        </span>
      ) : (
        <span
          aria-hidden
          className="my-path-spinner"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: '3px solid var(--outline-variant)',
            borderTopColor: 'var(--primary)',
            animation: 'myPathSpin 0.9s linear infinite',
            flexShrink: 0,
          }}
        />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '15px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {plan.title}
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: '12px', color: 'var(--on-surface-variant)', lineHeight: 1.4 }}>
          {cancelling
            ? 'Cancelling…'
            : stuck
              ? isTranslate
                ? 'Translation stalled — your path is intact.'
                : "This path got stuck and won't finish. Stop it to start fresh."
              : isTranslate
                ? 'Translating your path…'
                : 'Generating your path…'}
        </p>
      </div>
      {cancelling ? (
        <span
          aria-live="polite"
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-container-high)',
            color: 'var(--on-surface-variant)',
            border: '1px solid var(--outline-variant)',
            fontSize: '12px',
            fontWeight: 700,
            opacity: 0.7,
          }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '16px' }}>
            hourglass_empty
          </span>
          Cancelling…
        </span>
      ) : showButton ? (
        <button
          type="button"
          className="my-path-stop-btn"
          onClick={() => onRequestCancel(plan)}
          aria-label={buttonAria}
          style={{
            flexShrink: 0,
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-container-high)',
            color: 'var(--on-surface-variant)',
            border: '1px solid var(--outline-variant)',
            fontFamily: 'inherit',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '16px' }}>
            {isTranslate ? 'restart_alt' : 'close'}
          </span>
          {buttonLabel}
        </button>
      ) : null}
    </section>
  );
}

// ── Shared page styles ─────────────────────────────────────────────────

function PageStyles() {
  return (
    <style>{`
      @keyframes myPathSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      .my-path-select-card {
        transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.22s cubic-bezier(0.22, 1, 0.36, 1);
      }
      .my-path-select-card:hover { transform: translateY(-2px); border-color: var(--primary); }
      .my-path-select-card:active { transform: translateY(0); }
      .my-path-select-card:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
      .my-path-select-card--gold:hover { border-color: var(--brand-gold); }
      .my-path-select-card--gold:focus-visible { outline-color: var(--brand-gold); }
      .my-path-back:hover { background: var(--surface-container); color: var(--on-surface); }
      .my-path-back:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
      /* Per-path action toolbar buttons (community / publish / status / delete). */
      .my-path-toolbtn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        min-height: 40px;
        padding: 8px 14px;
        border-radius: var(--radius-md);
        background: var(--surface-container);
        color: var(--on-surface);
        border: 1px solid var(--outline-variant);
        font-family: inherit;
        font-size: 13px;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
        transition: transform var(--dur-fast) var(--ease-spring), border-color var(--dur-fast) var(--ease-spring);
      }
      .my-path-toolbtn:hover { border-color: var(--primary); transform: translateY(-1px); }
      .my-path-toolbtn:active { transform: translateY(0); }
      .my-path-toolbtn:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
      .my-path-toolbtn--danger { color: var(--error); }
      .my-path-toolbtn--danger:hover { border-color: var(--error); }
      .my-path-toolbtn--danger:focus-visible { outline-color: var(--error); }
      /* Primary toolbar button — the "New path" create CTA. */
      .my-path-toolbtn--primary {
        background: var(--accent-strong);
        color: var(--on-primary-container);
        border-color: var(--accent-strong);
      }
      .my-path-toolbtn--primary:hover { border-color: var(--accent-strong); }
      .my-path-toolbtn--primary:focus-visible { outline-color: var(--accent-strong); }
      /* "More" overflow menu — trigger reuses the toolbtn shell; popover +
         items get their own surface + focus rings. Only opacity/transform
         animate, with the project spring easing. */
      .my-path-more-popover {
        transform-origin: top right;
        animation: myPathMenuIn 0.16s cubic-bezier(0.22, 1, 0.36, 1);
      }
      @keyframes myPathMenuIn {
        from { opacity: 0; transform: translateY(-4px) scale(0.98); }
        to   { opacity: 1; transform: translateY(0) scale(1); }
      }
      .my-path-more-item {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        width: 100%;
        min-height: 40px;
        padding: 8px 12px;
        border: none;
        border-radius: var(--radius-sm);
        background: transparent;
        color: var(--on-surface);
        font-family: inherit;
        font-size: 13px;
        font-weight: 600;
        text-align: left;
        text-decoration: none;
        cursor: pointer;
        transition: background-color var(--dur-fast) var(--ease-spring);
      }
      .my-path-more-item:hover { background: var(--surface-container-highest); }
      .my-path-more-item:focus-visible { outline: 3px solid var(--primary); outline-offset: -1px; }
      .my-path-more-item--danger { color: var(--error); }
      .my-path-more-item--danger:hover { background: var(--error-container, var(--surface-container-highest)); }
      .my-path-more-item--danger:focus-visible { outline-color: var(--error); }
      /* Stop/Cancel/Restore control on in-flight cards. */
      .my-path-stop-btn {
        transition: border-color var(--dur-fast) var(--ease-spring), color var(--dur-fast) var(--ease-spring);
      }
      .my-path-stop-btn:hover { border-color: var(--primary); color: var(--on-surface); }
      .my-path-stop-btn:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
      /* Continue CTA — comfortably sized on desktop, full-width on phones. */
      .my-path-continue-wrap { width: 280px; max-width: 100%; flex-shrink: 0; }
      @media (max-width: 640px) { .my-path-continue-wrap { width: 100%; } }
      .my-path-continue-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        width: 100%;
        padding: 16px 26px;
        background: var(--accent-strong);
        color: var(--on-primary-container);
        border: none;
        border-radius: 999px;
        font-family: var(--font-display);
        font-weight: 800;
        font-size: 17px;
        letter-spacing: -0.01em;
        text-decoration: none;
        cursor: pointer;
        box-shadow: 0 4px 0 var(--primary-container, var(--outline)), 0 10px 24px rgb(var(--accent-strong-rgb) / 0.35);
        transition: transform var(--dur-fast) var(--ease-spring), box-shadow var(--dur-fast) var(--ease-spring);
      }
      .my-path-continue-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 6px 0 var(--primary-container, var(--outline)), 0 16px 34px rgb(var(--accent-strong-rgb) / 0.5);
      }
      .my-path-continue-btn:active {
        transform: translateY(2px);
        box-shadow: 0 1px 0 var(--primary-container, var(--outline)), 0 4px 12px rgb(var(--accent-strong-rgb) / 0.4);
      }
      .my-path-continue-btn:focus-visible { outline: 3px solid var(--accent-strong); outline-offset: 3px; }
      .my-path-continue-ico {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 30px;
        height: 30px;
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.22);
        animation: myPathPulse 2.4s var(--ease-spring) infinite;
      }
      @keyframes myPathPulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.14); } }
      @media (prefers-reduced-motion: reduce) {
        .my-path-select-card { transition: none; }
        .my-path-select-card:hover { transform: none; }
        .my-path-spinner { animation: none !important; }
        .my-path-continue-btn { transition: none; }
        .my-path-continue-ico { animation: none !important; }
        .my-path-toolbtn { transition: none; }
        .my-path-toolbtn:hover { transform: none; }
        .my-path-more-popover { animation: none; }
        .my-path-more-item { transition: none; }
      }
    `}</style>
  );
}
