'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LearnPathSetup from '@/components/learn/LearnPathSetup';
import type { PathPlan } from '@/components/learn/PathView';
import {
  SUBJECT_REGISTRY,
  isSubjectId,
  type SubjectId,
} from '@/lib/path-subjects';
import {
  PATH_LANGUAGES,
  pathLanguageName,
  isPathLanguage,
  type PathLanguageCode,
} from '@/lib/path-languages';
import { PublishStatusChip } from '@/components/path-publish/PublishStatusChip';
import PublishDialog from '@/components/path-publish/PublishDialog';
import { UltraBadge } from '@/components/learn/UltraBadge';
import type { SharedPathModerationStatus } from '@notemage/shared';

// Phase 2 of plans/path-publishing-community-library.md — the list
// endpoint now returns a `publication` companion for every plan so the
// card can render the chip + Publish/View-status menu items without a
// second fetch per card. See SerializedPath in lib/path-loader.ts.
interface PathPublicationSummary {
  shareId: string;
  moderationStatus: SharedPathModerationStatus;
  rejectionReason: string | null;
  approvedAt: string | null;
  createdAt: string;
}

// Phase 10.8 — /learn/paths list page.
//
// The previous version (Phase 10.4) rendered every plan's full PathView
// stacked vertically. With multiple paths in flight that surface
// became a long, repetitive scroll, so this iteration replaces the
// stack with a grid of compact selector cards. Tapping a card lands on
// `/learn/paths/[planId]` which already renders the full PathView and
// drives checkpoint interaction.
//
// Polling behavior carries over: while any plan reports
// `generationStatus !== 'ready'` we re-fetch every 3s and swap its
// card for the GeneratingCard skeleton until it settles.

const POLL_INTERVAL_MS = 3000;

type PathPlanListItem = PathPlan & {
  generationStatus?: string;
  subjects?: string[];
  /** Ultra (Pro-tier) path — drives the gold accent + badge on the card. */
  ultra?: boolean;
  publication?: PathPublicationSummary | null;
  /** Current content language (BCP-47). Defaults to 'en' when absent. */
  language?: string;
  /** 'translate' while an in-place translation is running; else absent. */
  generationMode?: string | null;
  /** ISO-8601 timestamp of the last write — drives stuck-generation detection. */
  updatedAt?: string;
};

// Mirrors STALE_GENERATION_MS in src/lib/path-loader.ts (kept here to avoid
// pulling server-only code into the client bundle). A `generating` path with
// no heartbeat for this long has a dead orchestrator — e.g. a redeploy killed
// the detached worker — and is safe to stop. The server DELETE enforces the
// same window, so this only gates whether the Stop affordance is shown.
const STALE_GENERATION_MS = 15 * 60 * 1000;

function isStuckGenerating(plan: PathPlanListItem): boolean {
  if (plan.generationStatus !== 'generating' || !plan.updatedAt) return false;
  return Date.now() - new Date(plan.updatedAt).getTime() > STALE_GENERATION_MS;
}

function primarySubjectOf(plan: PathPlanListItem): SubjectId | null {
  const first = plan.subjects?.find((s) => isSubjectId(s));
  return first ? (first as SubjectId) : null;
}

function isInFlight(plan: PathPlanListItem): boolean {
  const status = plan.generationStatus;
  return status === 'queued' || status === 'generating';
}

// Path-publishing P2 — non-terminal moderation states the page polls
// for so the chip can update without a manual refresh.
const PUBLICATION_IN_FLIGHT: Set<SharedPathModerationStatus> = new Set([
  'pending',
  'auditing_l2',
  'auditing_l3',
  'flagged_pending_human',
]);

function hasInFlightPublication(plan: PathPlanListItem): boolean {
  const pub = plan.publication;
  if (!pub) return false;
  return PUBLICATION_IN_FLIGHT.has(pub.moderationStatus);
}

// Shared style for items inside the kebab menu — keeps Publish, View
// status, and Delete visually aligned. `color` lets the destructive
// item ride red.
function menuItemStyle(color: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '9px 10px',
    background: 'transparent',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color,
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: '13px',
    fontWeight: 600,
    textAlign: 'left',
  };
}

export default function LearnPage() {
  const router = useRouter();
  const [plans, setPlans] = useState<PathPlanListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  // Phase 12 — null until the capability probe resolves. false = the
  // FREE-tier switchover is on for this user, so the create CTA routes to
  // the community library instead of opening the generator.
  const [canGenerate, setCanGenerate] = useState<boolean | null>(null);
  const [activeSubject, setActiveSubject] = useState<SubjectId | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PathPlanListItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  // Stop-a-stuck-generation target + in-flight state. A wedged `generating`
  // path can't finish, so stopping it deletes the row (the canonical recovery —
  // mirrors scripts/remove-stuck-path.ts) and lets the user start fresh.
  const [cancelTarget, setCancelTarget] = useState<PathPlanListItem | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState<string | null>(null);
  // Path-publishing P2 — the plan currently being walked through the
  // PublishDialog. null = closed; non-null = modal open for this plan.
  const [publishTarget, setPublishTarget] = useState<PathPlanListItem | null>(null);
  // Reset-progress confirmation target + in-flight state.
  const [resetTarget, setResetTarget] = useState<PathPlanListItem | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);
  // Translate-in-place target + in-flight state.
  const [translateTarget, setTranslateTarget] = useState<PathPlanListItem | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translateError, setTranslateError] = useState<string | null>(null);

  // Distinct subjects present across the user's paths. Drives the filter
  // strip — hidden when only one subject (or zero) is in play.
  const subjectsInUse = useMemo<SubjectId[]>(() => {
    if (!plans) return [];
    const seen = new Set<SubjectId>();
    for (const plan of plans) {
      for (const raw of plan.subjects ?? []) {
        if (isSubjectId(raw)) seen.add(raw);
      }
    }
    return Array.from(seen);
  }, [plans]);

  const filteredPlans = useMemo<PathPlanListItem[] | null>(() => {
    if (!plans) return null;
    if (!activeSubject) return plans;
    return plans.filter((plan) => (plan.subjects ?? []).includes(activeSubject));
  }, [plans, activeSubject]);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/learn/paths');
      const json = await res.json();
      if (json?.success) {
        setPlans((json.data ?? []) as PathPlanListItem[]);
        setError(null);
      } else {
        setError(json?.error ?? 'Failed to load paths');
        setPlans([]);
      }
    } catch {
      setError('Failed to load paths');
      setPlans([]);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Refresh on modal close so a newly created path shows up immediately
  // (LearnPathSetup auto-closes itself once Stage A returns, before the
  // path finishes generating — refresh picks up the `generating` card so
  // the polling loop can take over).
  const handleCreateClose = useCallback(() => {
    setCreateOpen(false);
    void refresh();
  }, [refresh]);

  // Phase 12 — resolve whether this user may still generate AI paths.
  // Fail open to the existing modal flow on error: the modal's own gate
  // and the server-side 402 still protect against a blocked generation.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/learn/paths/access')
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j?.success) setCanGenerate(Boolean(j.data?.canGenerate));
      })
      .catch(() => {
        if (!cancelled) setCanGenerate(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // The create CTA: PRO / admins (and FREE pre-switchover) open the
  // generator; a blocked FREE user lands on the community library with
  // the explainer banner (AC-Switch-3).
  const handleCreateClick = useCallback(() => {
    if (canGenerate === false) {
      router.push('/learn/community?from=create');
      return;
    }
    setCreateOpen(true);
  }, [canGenerate, router]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/learn/paths/${encodeURIComponent(deleteTarget.id)}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json?.success) {
        setDeleteTarget(null);
        await refresh();
      } else {
        setDeleteError(json?.error ?? 'Could not delete the path.');
      }
    } catch {
      setDeleteError('Network error. Try again.');
    }
    setDeleting(false);
  }, [deleteTarget, refresh]);

  const handleCancelDelete = useCallback(() => {
    if (deleting) return;
    setDeleteTarget(null);
    setDeleteError(null);
  }, [deleting]);

  // Stop a wedged generation. Reuses the DELETE endpoint, which already allows
  // removing a `generating` row once its orchestrator has gone stale; refresh()
  // drops the card and the poll loop halts once nothing is in flight.
  const handleConfirmCancel = useCallback(async () => {
    if (!cancelTarget) return;
    // A stuck TRANSLATION leaves the path intact — restore it (POST /cancel)
    // rather than deleting. A stuck GENERATION is incomplete — delete it.
    const isTranslate = cancelTarget.generationMode === 'translate';
    setCancelling(true);
    setCancelError(null);
    try {
      const res = await fetch(
        `/api/learn/paths/${encodeURIComponent(cancelTarget.id)}${isTranslate ? '/cancel' : ''}`,
        { method: isTranslate ? 'POST' : 'DELETE' },
      );
      const json = await res.json();
      if (json?.success) {
        setCancelTarget(null);
        await refresh();
      } else {
        setCancelError(
          json?.error ?? 'Could not stop this path. If it just started, give it a moment.',
        );
      }
    } catch {
      setCancelError('Network error. Try again.');
    }
    setCancelling(false);
  }, [cancelTarget, refresh]);

  const handleCancelCancel = useCallback(() => {
    if (cancelling) return;
    setCancelTarget(null);
    setCancelError(null);
  }, [cancelling]);

  // Close the publish dialog after a successful submit and refresh so
  // the card immediately gets the new chip (no UX flicker waiting for
  // the next poll).
  const handlePublishComplete = useCallback(() => {
    setPublishTarget(null);
    void refresh();
  }, [refresh]);

  const handleConfirmReset = useCallback(async () => {
    if (!resetTarget) return;
    setResetting(true);
    setResetError(null);
    try {
      const res = await fetch(
        `/api/learn/paths/${encodeURIComponent(resetTarget.id)}/reset`,
        { method: 'POST' },
      );
      const json = await res.json();
      if (json?.success) {
        setResetTarget(null);
        await refresh();
      } else {
        setResetError(json?.error ?? 'Could not reset the path.');
      }
    } catch {
      setResetError('Network error. Try again.');
    }
    setResetting(false);
  }, [resetTarget, refresh]);

  const handleCancelReset = useCallback(() => {
    if (resetting) return;
    setResetTarget(null);
    setResetError(null);
  }, [resetting]);

  const handleConfirmTranslate = useCallback(
    async (language: PathLanguageCode) => {
      if (!translateTarget) return;
      setTranslating(true);
      setTranslateError(null);
      try {
        const res = await fetch(
          `/api/learn/paths/${encodeURIComponent(translateTarget.id)}/translate`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ language }),
          },
        );
        const json = await res.json();
        if (json?.success) {
          // The card flips to the "Translating…" state; the poll loop picks
          // up completion and swaps in the translated path.
          setTranslateTarget(null);
          await refresh();
        } else {
          setTranslateError(json?.error ?? 'Could not start translation.');
        }
      } catch {
        setTranslateError('Network error. Try again.');
      }
      setTranslating(false);
    },
    [translateTarget, refresh],
  );

  const handleCancelTranslate = useCallback(() => {
    if (translating) return;
    setTranslateTarget(null);
    setTranslateError(null);
  }, [translating]);

  useEffect(() => {
    if (!plans) return;
    // Two reasons to keep polling: a path is still generating, or a
    // path has a publication that's still moving through moderation.
    // Either way, the next refresh swaps the card's chip / state for
    // the user.
    const anyInFlight = plans.some(
      (p) => isInFlight(p) || hasInFlightPublication(p),
    );
    if (!anyInFlight) {
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
    return () => {
      clearTimeout(t);
    };
  }, [plans, refresh]);

  return (
    <div style={{ maxWidth: '960px', width: '100%', minWidth: 0, margin: '0 auto', padding: '24px 16px 48px' }}>
      <header
        style={{
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ minWidth: 0, flex: '1 1 260px' }}>
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
            Learning paths
          </h1>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: '14px',
              color: 'var(--on-surface-variant)',
              lineHeight: 1.5,
            }}
          >
            Pick a path to open its checkpoints. Pass a checkpoint to unlock the next phase.
          </p>
        </div>
        {/* Path-publishing P8 — the library is the front door for the
            paths-led growth strategy (cf. project_paths_led_growth memory).
            Surfacing it next to the "New path" CTA keeps it discoverable
            from the user's own paths surface, where they're most likely
            to think "what else is out there?". Visually de-emphasised
            relative to the primary CTA so the create flow still leads. */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: '8px',
            minWidth: 0,
          }}
        >
          <Link
            href="/learn/community"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-container)',
              color: 'var(--on-surface)',
              border: '1px solid var(--outline-variant)',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 700,
              textDecoration: 'none',
            }}
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
              explore
            </span>
            Browse community
          </Link>
          <button
            type="button"
            onClick={handleCreateClick}
            data-tutorial="learn-generate-path"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--primary)',
              color: 'var(--on-primary)',
              border: 'none',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 0 var(--primary-container, var(--outline))',
            }}
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
              add
            </span>
            New path
          </button>
        </div>
      </header>

      {/* Phase 12 free-tier switchover — when the capability probe says this
          user can't generate (FREE under the switchover), surface a passive,
          always-visible note that AI path generation is Pro and point at the
          community library, the free way to get the experience (AC-Switch-3,
          mirrors the inline-AI Pro upsell). The "New path" CTA still routes
          here on click; this just sets expectations before the click. */}
      {canGenerate === false && (
        <section
          role="note"
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: '14px',
            padding: '16px 18px',
            marginBottom: '24px',
            background: 'var(--surface-container-high)',
            border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-lg)',
          }}
        >
          <span
            aria-hidden
            style={{
              width: '40px',
              height: '40px',
              flexShrink: 0,
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface-container)',
              color: 'var(--md-h4)',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '22px' }}>
              workspace_premium
            </span>
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h2
              style={{
                margin: '0 0 4px',
                fontFamily: 'var(--font-display)',
                fontSize: '15px',
                fontWeight: 700,
                color: 'var(--on-surface)',
              }}
            >
              Generating paths with AI is part of Pro
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: '13.5px',
                lineHeight: 1.6,
                color: 'var(--on-surface-variant)',
              }}
            >
              Explore paths shared by the community and clone any one to your library —
              free, instantly — to get the full experience.{' '}
              <Link
                href="/learn/community?from=create"
                style={{ color: 'var(--md-h4)', fontWeight: 700, textDecoration: 'none' }}
              >
                Browse community paths
              </Link>{' '}
              or{' '}
              <Link
                href="/pricing"
                style={{ color: 'var(--md-h4)', fontWeight: 700, textDecoration: 'none' }}
              >
                see what Pro includes
              </Link>
              .
            </p>
          </div>
        </section>
      )}

      {subjectsInUse.length >= 2 && (
        <SubjectFilterStrip
          subjects={subjectsInUse}
          activeSubject={activeSubject}
          onChange={setActiveSubject}
        />
      )}

      {plans === null ? (
        <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>Loading your paths…</p>
      ) : plans.length === 0 ? (
        <EmptyState error={error} onCreate={handleCreateClick} />
      ) : filteredPlans && filteredPlans.length === 0 ? (
        <FilterEmptyState onClear={() => setActiveSubject(null)} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(min(260px, 100%), 1fr))',
            gap: '12px',
          }}
        >
          {(filteredPlans ?? []).map((plan) =>
            isInFlight(plan) ? (
              <GeneratingCard
                key={plan.id}
                plan={plan}
                stuck={isStuckGenerating(plan)}
                onRequestCancel={setCancelTarget}
              />
            ) : (
              <PathCard
                key={plan.id}
                plan={plan}
                onRequestDelete={setDeleteTarget}
                onRequestPublish={setPublishTarget}
                onRequestReset={setResetTarget}
                onRequestTranslate={setTranslateTarget}
              />
            ),
          )}
        </div>
      )}

      {createOpen ? <LearnPathSetup onClose={handleCreateClose} /> : null}

      {deleteTarget ? (
        <DeletePathDialog
          plan={deleteTarget}
          deleting={deleting}
          error={deleteError}
          onCancel={handleCancelDelete}
          onConfirm={handleConfirmDelete}
        />
      ) : null}

      {cancelTarget ? (
        <CancelPathDialog
          plan={cancelTarget}
          cancelling={cancelling}
          error={cancelError}
          onCancel={handleCancelCancel}
          onConfirm={handleConfirmCancel}
        />
      ) : null}

      {publishTarget ? (
        <PublishDialog
          planId={publishTarget.id}
          defaultTitle={publishTarget.title}
          defaultDescription={publishTarget.description}
          onClose={() => setPublishTarget(null)}
          onPublished={handlePublishComplete}
        />
      ) : null}

      {resetTarget ? (
        <ResetPathDialog
          plan={resetTarget}
          resetting={resetting}
          error={resetError}
          onCancel={handleCancelReset}
          onConfirm={handleConfirmReset}
        />
      ) : null}

      {translateTarget ? (
        <TranslatePathDialog
          plan={translateTarget}
          translating={translating}
          error={translateError}
          onCancel={handleCancelTranslate}
          onConfirm={handleConfirmTranslate}
        />
      ) : null}

      <style>{`
        @keyframes learnPathSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .learn-paths-card {
          transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .learn-paths-card:hover {
          transform: translateY(-2px);
          border-color: var(--primary);
        }
        .learn-paths-card:focus-visible {
          outline: 3px solid var(--primary);
          outline-offset: 2px;
        }
        .learn-paths-card--gold:hover {
          border-color: var(--brand-gold);
        }
        .learn-paths-card--gold:focus-visible {
          outline-color: var(--brand-gold);
        }
        .learn-path-stop-btn {
          transition: transform 0.12s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .learn-path-stop-btn:hover {
          background: var(--surface-container-highest);
          color: var(--error);
          border-color: var(--error);
        }
        .learn-path-stop-btn:focus-visible {
          outline: 2px solid var(--error);
          outline-offset: 2px;
        }
        .learn-path-stop-btn:active {
          transform: translateY(1px);
        }
        @media (prefers-reduced-motion: reduce) {
          .learn-paths-card { transition: none; }
          .learn-paths-card:hover { transform: none; }
          .learn-path-stop-btn { transition: none; }
          .learn-path-stop-btn:active { transform: none; }
        }
      `}</style>
    </div>
  );
}

function PathCard({
  plan,
  onRequestDelete,
  onRequestPublish,
  onRequestReset,
  onRequestTranslate,
}: {
  plan: PathPlanListItem;
  onRequestDelete: (plan: PathPlanListItem) => void;
  onRequestPublish: (plan: PathPlanListItem) => void;
  onRequestReset: (plan: PathPlanListItem) => void;
  onRequestTranslate: (plan: PathPlanListItem) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const allSlots = plan.phases.flatMap((p) => p.slots);
  const total = allSlots.length;
  const done = allSlots.filter((s) => s.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const ultra = plan.ultra === true;
  // Gold fills/borders use the constant --brand-gold; gold text/icons use
  // --ultra-ink so they stay readable when the surface flips to light.
  const ink = ultra ? 'var(--ultra-ink)' : 'var(--md-h4)';
  const primarySubject = primarySubjectOf(plan);
  const publication = plan.publication ?? null;
  const canPublish = plan.generationStatus === 'ready' && !publication;
  // Translate / reset only make sense once the path is fully generated.
  const isReady = plan.generationStatus === 'ready';

  // Close the options menu on any outside click. The kebab's own click
  // stops propagation, so opening the menu never trips this listener.
  useEffect(() => {
    if (!menuOpen) return;
    const close = () => setMenuOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        menuBtnRef.current?.focus();
      }
    };
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    // Move focus into the menu so keyboard users land on the first action.
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  return (
    <Link
      href={`/learn/paths/${encodeURIComponent(plan.id)}`}
      className={ultra ? 'learn-paths-card learn-paths-card--gold' : 'learn-paths-card'}
      style={{
        position: 'relative',
        zIndex: menuOpen ? 5 : undefined,
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        background: 'var(--surface-container)',
        border: ultra ? '1.5px solid var(--brand-gold)' : '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        textDecoration: 'none',
        color: 'var(--on-surface)',
      }}
    >
      {/* Options kebab. preventDefault stops the Link navigating;
          stopPropagation keeps the opening click off the document
          click-away listener. */}
      <button
        ref={menuBtnRef}
        type="button"
        aria-label="Path options"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setMenuOpen((o) => !o);
        }}
        style={{
          position: 'absolute',
          top: '8px',
          right: '8px',
          width: '32px',
          height: '32px',
          borderRadius: 'var(--radius-full)',
          border: 'none',
          background: menuOpen ? 'var(--surface-container-high)' : 'transparent',
          color: 'var(--on-surface-variant)',
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
          more_vert
        </span>
      </button>

      {menuOpen ? (
        <div
          ref={menuRef}
          role="menu"
          style={{
            position: 'absolute',
            top: '42px',
            right: '8px',
            zIndex: 1,
            minWidth: '200px',
            padding: '4px',
            background: 'var(--surface-container-highest)',
            border: '1px solid var(--outline-variant)',
            borderRadius: 'var(--radius-md)',
            boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {canPublish ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                onRequestPublish(plan);
              }}
              style={menuItemStyle('var(--primary)')}
            >
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
                rocket_launch
              </span>
              Publish to library
            </button>
          ) : null}
          {publication ? (
            <Link
              role="menuitem"
              href={`/learn/paths/${encodeURIComponent(plan.id)}/publication`}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
              }}
              style={{ ...menuItemStyle('var(--on-surface)'), textDecoration: 'none' }}
            >
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
                fact_check
              </span>
              View publication status
            </Link>
          ) : null}
          {isReady ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                onRequestTranslate(plan);
              }}
              style={menuItemStyle('var(--on-surface)')}
            >
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
                translate
              </span>
              Translate
            </button>
          ) : null}
          {isReady ? (
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setMenuOpen(false);
                onRequestReset(plan);
              }}
              style={menuItemStyle('var(--on-surface)')}
            >
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
                restart_alt
              </span>
              Reset progress
            </button>
          ) : null}
          <button
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setMenuOpen(false);
              onRequestDelete(plan);
            }}
            style={menuItemStyle('var(--error)')}
          >
            <span
              className="material-symbols-outlined"
              aria-hidden
              style={{ fontSize: '18px' }}
            >
              delete
            </span>
            Delete path
          </button>
        </div>
      ) : null}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          paddingRight: '30px',
        }}
      >
        <span
          aria-hidden
          style={{
            width: '44px',
            height: '44px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-container-high)',
            color: ink,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '24px' }}>
            school
          </span>
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span
            style={{
              display: 'block',
              fontSize: '15px',
              fontWeight: 700,
              color: 'var(--on-surface)',
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
              marginTop: '2px',
              fontSize: '12px',
              color: 'var(--on-surface-variant)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {plan.notebookTitle ?? 'Cross-notebook path'}
          </span>
        </div>
      </div>

      {ultra || primarySubject || publication ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '6px',
            alignItems: 'center',
          }}
        >
          {ultra ? <UltraBadge /> : null}
          {primarySubject ? <SubjectChip subject={primarySubject} /> : null}
          {publication ? <PublishStatusChip status={publication.moderationStatus} /> : null}
        </div>
      ) : null}

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
            background: ultra ? 'var(--brand-gold)' : 'var(--primary)',
            borderRadius: '999px',
          }}
        />
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: 'var(--on-surface-variant)',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <span>
          {done} / {total} checkpoints
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: ink, fontWeight: 600 }}>
          Open
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '16px' }}>
            chevron_right
          </span>
        </span>
      </div>
    </Link>
  );
}

// Skeleton card shown for paths still being generated. The page polls
// the list every 3s while any plan is in this state; when it flips to
// `ready` the card swaps for the real PathCard. When a generation wedges
// (`stuck` — its orchestrator died and stopped writing), the card swaps the
// spinner for a warning and offers a Stop affordance so the path isn't a
// permanent dead-end.
function GeneratingCard({
  plan,
  stuck,
  onRequestCancel,
}: {
  plan: PathPlanListItem;
  stuck: boolean;
  onRequestCancel: (plan: PathPlanListItem) => void;
}) {
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
          className="learn-path-generating-spinner"
          style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            border: '3px solid var(--outline-variant)',
            borderTopColor: 'var(--primary)',
            animation: 'learnPathSpin 0.9s linear infinite',
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
        <p
          style={{
            margin: '4px 0 0',
            fontSize: '12px',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.4,
          }}
        >
          {stuck
            ? plan.generationMode === 'translate'
              ? 'Translation stalled — your path is intact.'
              : "This path got stuck and won't finish. Stop it to start fresh."
            : plan.generationMode === 'translate'
              ? 'Translating your path…'
              : 'Generating your path…'}
        </p>
      </div>
      {stuck ? (
        <button
          type="button"
          className="learn-path-stop-btn"
          onClick={() => onRequestCancel(plan)}
          aria-label={
            plan.generationMode === 'translate'
              ? `Restore ${plan.title}`
              : `Stop generating ${plan.title}`
          }
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
            {plan.generationMode === 'translate' ? 'restart_alt' : 'close'}
          </span>
          {plan.generationMode === 'translate' ? 'Restore' : 'Stop'}
        </button>
      ) : null}
    </section>
  );
}

function EmptyState({ error, onCreate }: { error: string | null; onCreate: () => void }) {
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
        school
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
        {error ? 'Could not load your paths' : 'No study paths yet'}
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
          : 'Spin up your first AI-generated learning path — pick a topic, scope it to a notebook (optional), and watch the checkpoints fill in.'}
      </p>
      {error ? (
        <Link
          href="/notebooks"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-container-high)',
            color: 'var(--on-surface)',
            fontSize: '14px',
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden>
            menu_book
          </span>
          Browse notebooks
        </Link>
      ) : (
        <button
          type="button"
          onClick={onCreate}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '10px 16px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--primary)',
            color: 'var(--on-primary)',
            border: 'none',
            fontFamily: 'inherit',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 2px 0 var(--primary-container, var(--outline))',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }} aria-hidden>
            add
          </span>
          Create your first path
        </button>
      )}
    </section>
  );
}

function SubjectChip({ subject }: { subject: SubjectId }) {
  const def = SUBJECT_REGISTRY[subject];
  return (
    <span
      style={{
        alignSelf: 'flex-start',
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '999px',
        background: 'rgba(174,137,255,0.12)',
        border: '1px solid rgba(174,137,255,0.32)',
        color: 'var(--md-h4)',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.04em',
        textTransform: 'uppercase',
        fontFamily: 'inherit',
      }}
    >
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '14px' }}>
        {def.icon}
      </span>
      {def.shortLabel}
    </span>
  );
}

function SubjectFilterStrip({
  subjects,
  activeSubject,
  onChange,
}: {
  subjects: SubjectId[];
  activeSubject: SubjectId | null;
  onChange: (s: SubjectId | null) => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label="Filter paths by subject"
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
        marginBottom: '16px',
      }}
    >
      <FilterChip
        active={activeSubject === null}
        icon="all_inclusive"
        label="All"
        onClick={() => onChange(null)}
      />
      {subjects.map((id) => {
        const def = SUBJECT_REGISTRY[id];
        return (
          <FilterChip
            key={id}
            active={activeSubject === id}
            icon={def.icon}
            label={def.shortLabel}
            onClick={() => onChange(activeSubject === id ? null : id)}
          />
        );
      })}
    </div>
  );
}

function FilterChip({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: string;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '6px 12px',
        borderRadius: '999px',
        background: active ? 'var(--primary)' : 'var(--surface-container)',
        color: active ? 'var(--on-primary)' : 'var(--on-surface-variant)',
        border: `1px solid ${active ? 'var(--primary)' : 'var(--outline-variant)'}`,
        fontFamily: 'inherit',
        fontSize: '12px',
        fontWeight: 700,
        letterSpacing: '0.02em',
        cursor: 'pointer',
      }}
    >
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '16px' }}>
        {icon}
      </span>
      {label}
    </button>
  );
}

function FilterEmptyState({ onClear }: { onClear: () => void }) {
  return (
    <section
      style={{
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: '24px',
        textAlign: 'center',
      }}
    >
      <p
        style={{
          margin: '0 0 12px',
          fontSize: '14px',
          color: 'var(--on-surface-variant)',
          lineHeight: 1.5,
        }}
      >
        No paths match this subject yet.
      </p>
      <button
        type="button"
        onClick={onClear}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          padding: '8px 14px',
          borderRadius: 'var(--radius-md)',
          background: 'var(--surface-container-high)',
          color: 'var(--on-surface)',
          border: '1px solid var(--outline-variant)',
          fontFamily: 'inherit',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Clear filter
      </button>
    </section>
  );
}

// Confirmation dialog for deleting a path. Deleting removes the path
// plus every activity it generated — and, since path-generated quiz /
// flashcard sets carry the path's notebookId, those also disappear from
// the linked notebook. The copy says so explicitly.
function ResetPathDialog({
  plan,
  resetting,
  error,
  onCancel,
  onConfirm,
}: {
  plan: PathPlanListItem;
  resetting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Reset path progress"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '440px',
          maxWidth: '95vw',
          background: 'var(--surface-container)',
          color: 'var(--on-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--outline-variant)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <span
            aria-hidden
            className="material-symbols-outlined"
            style={{
              fontSize: '22px',
              width: '40px',
              height: '40px',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface-container-highest)',
              color: 'var(--md-h4)',
            }}
          >
            restart_alt
          </span>
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--on-surface)',
                letterSpacing: '-0.01em',
              }}
            >
              Reset this path?
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '13px',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.5,
              }}
            >
              Your progress on{' '}
              <strong style={{ color: 'var(--on-surface)' }}>{plan.title}</strong> — completion,
              stars, best scores, and flashcard review schedule — will be cleared so you can start
              over. The theory, flashcards, and quizzes themselves are kept. This can&apos;t be
              undone.
            </p>
          </div>
        </div>

        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: '13px', color: 'var(--error)' }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={resetting}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface)',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 700,
              cursor: resetting ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={resetting}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--primary)',
              color: 'var(--on-primary)',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 700,
              cursor: resetting ? 'not-allowed' : 'pointer',
              opacity: resetting ? 0.7 : 1,
            }}
          >
            {resetting ? 'Resetting…' : 'Reset progress'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TranslatePathDialog({
  plan,
  translating,
  error,
  onCancel,
  onConfirm,
}: {
  plan: PathPlanListItem;
  translating: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (language: PathLanguageCode) => void;
}) {
  const current = (plan.language ?? 'en') as string;
  // Show every language, including the path's current one. Picking the current
  // language re-translates in place to fix any text still left in another
  // language (e.g. a German path that generated with English fragments).
  const [language, setLanguage] = useState<PathLanguageCode>(() =>
    isPathLanguage(current) ? current : 'en',
  );
  const isReclean = language === current;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Translate path"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '460px',
          maxWidth: '95vw',
          background: 'var(--surface-container)',
          color: 'var(--on-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--outline-variant)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <span
            aria-hidden
            className="material-symbols-outlined"
            style={{
              fontSize: '22px',
              width: '40px',
              height: '40px',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface-container-highest)',
              color: 'var(--md-h4)',
            }}
          >
            translate
          </span>
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--on-surface)',
                letterSpacing: '-0.01em',
              }}
            >
              Translate this path
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '13px',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.5,
              }}
            >
              All of <strong style={{ color: 'var(--on-surface)' }}>{plan.title}</strong> — theory,
              flashcards, and quizzes — is translated in place and your progress is kept. It&apos;s
              currently in {pathLanguageName(current as PathLanguageCode)}; pick that same language to
              re-check it and fix anything still in another language.
            </p>
          </div>
        </div>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--on-surface-variant)' }}>
            Translate to
          </span>
          <select
            aria-label="Target language"
            value={language}
            onChange={(e) => setLanguage(e.target.value as PathLanguageCode)}
            disabled={translating}
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface)',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: translating ? 'not-allowed' : 'pointer',
            }}
          >
            {PATH_LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>
                {l.endonym} — {l.label}
                {l.code === current ? ' (current)' : ''}
              </option>
            ))}
          </select>
        </label>

        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: '13px', color: 'var(--error)' }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={translating}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--outline-variant)',
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface)',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 700,
              cursor: translating ? 'not-allowed' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => onConfirm(language)}
            disabled={translating}
            style={{
              padding: '10px 16px',
              borderRadius: 'var(--radius-md)',
              border: 'none',
              background: 'var(--primary)',
              color: 'var(--on-primary)',
              fontFamily: 'inherit',
              fontSize: '14px',
              fontWeight: 700,
              cursor: translating ? 'not-allowed' : 'pointer',
              opacity: translating ? 0.7 : 1,
            }}
          >
            {translating ? 'Starting…' : isReclean ? 'Re-translate' : 'Translate'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DeletePathDialog({
  plan,
  deleting,
  error,
  onCancel,
  onConfirm,
}: {
  plan: PathPlanListItem;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Delete path"
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '440px',
          maxWidth: '95vw',
          background: 'var(--surface-container)',
          color: 'var(--on-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--outline-variant)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <span
            aria-hidden
            className="material-symbols-outlined"
            style={{
              fontSize: '22px',
              width: '40px',
              height: '40px',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface-container-highest)',
              color: 'var(--error)',
            }}
          >
            delete
          </span>
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--on-surface)',
                letterSpacing: '-0.01em',
              }}
            >
              Delete this path?
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '13px',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: 'var(--on-surface)' }}>{plan.title}</strong> and
              everything it generated — theory, flashcards, and quizzes — will be permanently
              deleted. The flashcards and quizzes are also removed from the linked notebook.
              This can&apos;t be undone.
            </p>
          </div>
        </div>

        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: '13px', color: 'var(--error)' }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            style={{
              padding: '9px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              color: 'var(--on-surface-variant)',
              border: '1px solid var(--outline-variant)',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 700,
              cursor: deleting ? 'default' : 'pointer',
              opacity: deleting ? 0.6 : 1,
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            style={{
              padding: '9px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--error)',
              color: 'var(--on-error)',
              border: 'none',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 700,
              cursor: deleting ? 'default' : 'pointer',
              opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting ? 'Deleting…' : 'Delete path'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Confirmation for stopping a wedged generation. Stopping deletes the row
// (a stuck path can't finish and is locked), so the copy is explicit that the
// path is removed.
function CancelPathDialog({
  plan,
  cancelling,
  error,
  onCancel,
  onConfirm,
}: {
  plan: PathPlanListItem;
  cancelling: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // A stuck translation is non-destructive to recover (restore to ready); a
  // stuck generation is incomplete and gets deleted. Copy + accent branch on it.
  const isTranslate = plan.generationMode === 'translate';
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isTranslate ? 'Restore path' : 'Stop generating path'}
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.65)',
        backdropFilter: 'blur(4px)',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '440px',
          maxWidth: '95vw',
          background: 'var(--surface-container)',
          color: 'var(--on-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--outline-variant)',
          padding: '24px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
          <span
            aria-hidden
            className="material-symbols-outlined"
            style={{
              fontSize: '22px',
              width: '40px',
              height: '40px',
              flexShrink: 0,
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface-container-highest)',
              color: isTranslate ? 'var(--primary)' : 'var(--error)',
            }}
          >
            sync_problem
          </span>
          <div style={{ minWidth: 0 }}>
            <h2
              style={{
                margin: 0,
                fontFamily: 'var(--font-display)',
                fontSize: '18px',
                fontWeight: 800,
                color: 'var(--on-surface)',
                letterSpacing: '-0.01em',
              }}
            >
              {isTranslate ? 'Restore this path?' : 'Stop generating this path?'}
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '13px',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.5,
              }}
            >
              {isTranslate ? (
                <>
                  <strong style={{ color: 'var(--on-surface)' }}>{plan.title}</strong>&apos;s
                  translation stalled, but the path itself is intact. Restoring brings it back to
                  normal — you can translate it again afterwards.
                </>
              ) : (
                <>
                  <strong style={{ color: 'var(--on-surface)' }}>{plan.title}</strong> got stuck and
                  can&apos;t finish. Stopping it removes the path and anything generated so far, so
                  you can create a fresh one. This can&apos;t be undone.
                </>
              )}
            </p>
          </div>
        </div>

        {error ? (
          <p role="alert" style={{ margin: 0, fontSize: '13px', color: 'var(--error)' }}>
            {error}
          </p>
        ) : null}

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={cancelling}
            style={{
              padding: '9px 16px',
              borderRadius: 'var(--radius-md)',
              background: 'transparent',
              color: 'var(--on-surface-variant)',
              border: '1px solid var(--outline-variant)',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 700,
              cursor: cancelling ? 'default' : 'pointer',
              opacity: cancelling ? 0.6 : 1,
            }}
          >
            Keep waiting
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={cancelling}
            aria-busy={cancelling}
            style={{
              padding: '9px 16px',
              borderRadius: 'var(--radius-md)',
              background: isTranslate ? 'var(--primary)' : 'var(--error)',
              color: isTranslate ? 'var(--on-primary)' : 'var(--on-error)',
              border: 'none',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 700,
              cursor: cancelling ? 'default' : 'pointer',
              opacity: cancelling ? 0.7 : 1,
            }}
          >
            {cancelling
              ? isTranslate
                ? 'Restoring…'
                : 'Stopping…'
              : isTranslate
                ? 'Restore path'
                : 'Stop generating'}
          </button>
        </div>
      </div>
    </div>
  );
}
