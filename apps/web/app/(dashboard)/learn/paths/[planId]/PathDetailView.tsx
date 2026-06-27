'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  type PathActivity,
  type PathPlan,
  type PathSlot,
} from '@/components/learn/PathView';
import CheckpointFlashcardViewer from '@/components/learn/CheckpointFlashcardViewer';
import CheckpointTheoryViewer from '@/components/learn/CheckpointTheoryViewer';
import CheckpointQuizViewer from '@/components/learn/CheckpointQuizViewer';
import GenerationProgressModal from '@/components/learn/GenerationProgressModal';
import { CheckpointSkeletonOverlay } from '@/components/learn/CheckpointSkeleton';
import { TutorialPathPlayer } from '@/components/learn/TutorialPathPlayer';
import AppShell from '@/components/app/AppShell';
import LearningPathScreen from '@/components/learn/path-screen/LearningPathScreen';
import NodeOverview from '@/components/learn/path-screen/NodeOverview';
import { useRegisterMageContext } from '@/components/mage';
import type { MageClientContext } from '@/lib/mage-types';
import type { SerializedPath } from '@/lib/path-loader';

// Phase 10.6 — path detail page.
//
// URL contract: `/learn/paths/[planId]?slot=<slotId>&activity=<activityId>`
//
// The page renders PathView (the guided path column) and overlays a
// CheckpointDrawer when `?slot=` is present. URL-derived state means
// the back button + refresh both preserve the exact drawer view, and
// linking to a specific slot or activity Just Works.
//
// `useSearchParams()` opts the page out of static rendering (per
// project memory: feedback_use_search_params_bailout). The Suspense
// wrapper is required so `next build` doesn't try to prerender.

interface ViewProps {
  planId: string;
  /** Path resolved on the server (the same SerializedPath the detail GET returns)
   *  so the first render already has content — no client spinner-then-fetch. */
  initialPath: SerializedPath;
}

// The detail GET returns the full SerializedPath; PathView only types the
// subset it renders, so extend locally for the generation-status fields we
// need to detect — and recover from — a wedged generation.
type DetailPlan = PathPlan & {
  generationStatus?: string;
  updatedAt?: string;
  /** 'translate' while an in-place translation runs; else absent. */
  generationMode?: string | null;
};

// Mirrors STALE_GENERATION_MS in src/lib/path-loader.ts (client-safe copy). A
// `generating` path with no heartbeat for this long has a dead orchestrator
// (e.g. a redeploy killed the detached worker) and is safe to stop.
const STALE_GENERATION_MS = 15 * 60 * 1000;

export default function PathDetailView({ planId, initialPath }: ViewProps) {
  return (
    <Suspense fallback={<LoadingShell />}>
      <PathDetailInner planId={planId} initialPath={initialPath} />
    </Suspense>
  );
}

function LoadingShell() {
  return (
    <AppShell width="wide">
      <p style={{ margin: '32px auto', textAlign: 'center', color: 'var(--body)', fontSize: '14px' }}>
        Loading path…
      </p>
    </AppShell>
  );
}

function PathDetailInner({ planId, initialPath }: { planId: string; initialPath: SerializedPath }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const slotId = searchParams.get('slot');
  const activityId = searchParams.get('activity');
  // Tutorial handoff flag — only in this mode does a completion fire the
  // full-screen celebration (elsewhere the unlock surfaces via the subtle
  // cosmetic toast + notification bell, on their own cadence).
  const isTutorial = searchParams.get('tutorial') === '1';

  // Seeded from the server (initialPath) so the first render has the path — the
  // fetch below only runs on refresh (refreshKey > 0). Cast mirrors the existing
  // `json.data as DetailPlan` boundary cast.
  const [plan, setPlan] = useState<DetailPlan | null>(initialPath as unknown as DetailPlan);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  // Stop-a-stuck-generation: a two-step inline confirm in the banner, plus
  // in-flight + error state. Stopping deletes the wedged path and returns to
  // the list.
  const [stopConfirm, setStopConfirm] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  // Regenerate-button feedback: a pending state so the click registers
  // instantly, and a surfaced error so a rate-limit / "already in progress"
  // response doesn't read as a dead button.
  const [regenStarting, setRegenStarting] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenHover, setRegenHover] = useState(false);
  const [regenPressed, setRegenPressed] = useState(false);

  // Refresh fetch. The first render is seeded by initialPath (from SSR), so the
  // initial fetch is skipped — this only runs after a mutation/poll bumps
  // refreshKey, keeping the SSR content as the first paint.
  useEffect(() => {
    if (refreshKey === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/learn/paths/${encodeURIComponent(planId)}`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && json.data) {
          setPlan(json.data as DetailPlan);
          setError(null);
        } else {
          setError(json?.error ?? 'Could not load path');
        }
      } catch {
        if (!cancelled) setError('Could not load path');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId, refreshKey]);

  // Poll while a healthy generation/translation is in flight so the banner
  // resolves to the finished path without a manual reload (mirrors the list
  // page). Stops once the status settles OR the run goes stale (re-fetching a
  // dead row is pointless — the banner then offers the recovery action).
  useEffect(() => {
    if (plan?.generationStatus !== 'generating') return;
    const stale =
      !!plan.updatedAt &&
      Date.now() - new Date(plan.updatedAt).getTime() > STALE_GENERATION_MS;
    if (stale) return;
    const t = setTimeout(() => setRefreshKey((k) => k + 1), 3000);
    return () => clearTimeout(t);
  }, [plan?.generationStatus, plan?.updatedAt, refreshKey]);

  // Keep the learner on their next checkpoint. Whenever the path column is the
  // foreground (no slot drawer or activity viewer open) and the plan is loaded
  // — first entry, the refetch after finishing a section, or simply closing an
  // overlay — scroll the active slot into view instead of dropping them at the
  // top to scroll back down. `isActive` marks exactly one slot (the first
  // doable, not-done slot), so there is a single scroll target.
  useEffect(() => {
    if (slotId || activityId || !plan) return;
    const el = document.querySelector('[data-active-slot="true"]');
    el?.scrollIntoView({ block: 'center' });
  }, [plan, slotId, activityId]);

  // Resolve the currently-open slot from the URL.
  const openSlot: PathSlot | null = (() => {
    if (!slotId || !plan) return null;
    for (const phase of plan.phases) {
      const s = phase.slots.find((x) => x.id === slotId);
      if (s) return s;
    }
    return null;
  })();

  const activeActivity: PathActivity | null =
    openSlot && activityId
      ? (openSlot.activities.find((a) => a.id === activityId) ?? null)
      : null;

  // Register what the learner is looking at with the global Mage panel so its
  // answers ground on the open lesson's theory (server resolves slotId → theory)
  // and its prompt chips match the surface. A live quiz activity flips the
  // policy to hints-first; the path map alone grounds on the path outline.
  const mageContext: MageClientContext = openSlot
    ? activeActivity?.kind === 'quiz' && activeActivity.quizSetId
      ? {
          type: 'quiz-question',
          ids: { pathId: planId, slotId: openSlot.id, quizSetId: activeActivity.quizSetId },
          title: openSlot.title,
        }
      : { type: 'lesson', ids: { pathId: planId, slotId: openSlot.id }, title: openSlot.title }
    : { type: 'my-path', ids: { pathId: planId }, title: plan?.title };
  useRegisterMageContext(mageContext);

  const setUrlSlot = useCallback(
    (next: { slot?: string | null; activity?: string | null }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.slot === null) params.delete('slot');
      else if (next.slot) params.set('slot', next.slot);
      if (next.activity === null) params.delete('activity');
      else if (next.activity) params.set('activity', next.activity);
      const qs = params.toString();
      router.replace(qs ? `?${qs}` : '?', { scroll: false });
    },
    [router, searchParams],
  );

  const handleSlotClick = useCallback(
    (slot: PathSlot) => {
      if (!slot.unlocked) return;
      setUrlSlot({ slot: slot.id, activity: null });
    },
    [setUrlSlot],
  );

  const handleSelectActivity = useCallback(
    (next: string | null) => {
      setUrlSlot({ activity: next });
    },
    [setUrlSlot],
  );

  const handleCloseDrawer = useCallback(() => {
    setUrlSlot({ slot: null, activity: null });
  }, [setUrlSlot]);

  const handleSlotChanged = useCallback(() => {
    // Trigger a re-fetch of the plan so PathView's completion ring,
    // star counts, and unlocked-next-slot all reflect the new state.
    setRefreshKey((k) => k + 1);
  }, []);

  // Completing an activity refreshes the path and closes back to the slot's
  // activity list. (The guided tutorial uses its own player — TutorialPathPlayer
  // — which auto-advances and celebrates; this page only handles real paths.)
  const handleActivityCompleted = useCallback(() => {
    handleSlotChanged();
    setUrlSlot({ activity: null });
  }, [handleSlotChanged, setUrlSlot]);

  // Retry failed activities for the whole path. The endpoint is
  // idempotent (regenerates only missing activities); the progress
  // modal streams the run and a refetch picks up the filled-in tree.
  const handleRegenerate = useCallback(async () => {
    if (regenStarting) return;
    setRegenStarting(true);
    setRegenError(null);
    try {
      const res = await fetch(
        `/api/learn/paths/${encodeURIComponent(planId)}/regenerate`,
        { method: 'POST' },
      );
      const json = await res.json();
      if (json?.success) {
        setRegenerating(true);
      } else {
        // Surface the reason — a 429 (rate limit / monthly token budget) or a
        // 400 ("already in progress") otherwise leaves the banner up with no
        // feedback, which reads as an unresponsive button.
        setRegenError(json?.error ?? 'Could not start regeneration. Please try again.');
      }
    } catch {
      setRegenError('Network error. Check your connection and try again.');
    } finally {
      setRegenStarting(false);
    }
  }, [planId, regenStarting]);

  // Resolve a wedged path. A stuck TRANSLATION leaves the path intact, so
  // restore it in place (POST /cancel → flips back to ready) and re-fetch. A
  // stuck GENERATION is incomplete, so delete it (DELETE) and return to the list.
  const handleStopGenerating = useCallback(async () => {
    if (stopping) return;
    const isTranslate = plan?.generationMode === 'translate';
    setStopping(true);
    setStopError(null);
    try {
      const res = await fetch(
        `/api/learn/paths/${encodeURIComponent(planId)}${isTranslate ? '/cancel' : ''}`,
        { method: isTranslate ? 'POST' : 'DELETE' },
      );
      const json = await res.json();
      if (json?.success) {
        if (isTranslate) {
          setStopConfirm(false);
          setRefreshKey((k) => k + 1);
        } else {
          router.push('/my-path');
        }
      } else {
        setStopError(
          json?.error ?? 'Could not stop this path. If it just started, give it a moment.',
        );
      }
    } catch {
      setStopError('Network error. Check your connection and try again.');
    } finally {
      setStopping(false);
    }
  }, [planId, router, stopping, plan?.generationMode]);

  if (error) {
    return (
      <AppShell width="wide">
        <div style={{ maxWidth: '760px', margin: '24px auto', textAlign: 'center' }}>
          <p style={{ color: 'var(--body)', fontSize: '14px' }}>{error}</p>
          <Link href="/my-path" style={{ color: 'var(--primary)', fontSize: '14px', fontWeight: 600 }}>
            ← Back to paths
          </Link>
        </div>
      </AppShell>
    );
  }
  // On a tutorial deep-link the entry activity is the learning slot's theory.
  // Show its skeleton while the plan loads so the path never flashes first.
  if (!plan)
    return isTutorial && activityId ? <CheckpointSkeletonOverlay kind="theory" /> : <LoadingShell />;

  // Guided tutorial gets its own linear, state-driven player (no path map, no
  // URL hops) so nothing flashes between checkpoints. Real paths fall through.
  if (isTutorial) return <TutorialPathPlayer plan={plan} startActivityId={activityId} />;

  const incompleteCount = plan.phases.reduce(
    (n, ph) => n + ph.slots.filter((s) => s.incompleteGeneration).length,
    0,
  );

  const generating = plan.generationStatus === 'generating';
  const stuckGenerating =
    generating &&
    !!plan.updatedAt &&
    Date.now() - new Date(plan.updatedAt).getTime() > STALE_GENERATION_MS;
  // A stuck translation is recoverable non-destructively (restore to ready); a
  // stuck generation is incomplete and gets deleted. Copy + actions branch on it.
  const isTranslate = plan.generationMode === 'translate';

  const bannerNode = generating ? (
          <div className="path-banner" style={{ margin: '0 0 16px' }}>
            <style>{`
              @keyframes spin { to { transform: rotate(360deg); } }
              .path-banner { --danger: #c0392b; }
              .path-spin { animation: spin 0.8s linear infinite; }
              .path-stop-btn { transition: transform 0.12s cubic-bezier(0.22,1,0.36,1); }
              .path-stop-btn:active { transform: translateY(1px); }
              .path-stop-btn--ghost:hover { background: #f6f3ec; }
              .path-stop-btn--ghost:focus-visible { outline: 2px solid var(--border); outline-offset: 2px; }
              .path-stop-btn--danger:hover { opacity: 0.92; }
              .path-stop-btn--danger:focus-visible { outline: 2px solid var(--danger); outline-offset: 2px; }
              .path-stop-btn--primary:hover { opacity: 0.92; }
              .path-stop-btn--primary:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
              @media (prefers-reduced-motion: reduce) {
                .path-stop-btn { transition: none; }
                .path-stop-btn:active { transform: none; }
                .path-spin { animation: none; }
              }
            `}</style>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--rc)',
              }}
            >
              {stuckGenerating ? (
                <span
                  aria-hidden
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '20px',
                    width: '36px',
                    height: '36px',
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderRadius: '999px',
                    background: 'var(--amber-soft)',
                    color: 'var(--amber-ink)',
                  }}
                >
                  sync_problem
                </span>
              ) : (
                <span
                  aria-hidden
                  style={{
                    width: '36px',
                    height: '36px',
                    flexShrink: 0,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <span
                    className="path-spin"
                    style={{
                      width: '22px',
                      height: '22px',
                      borderRadius: '50%',
                      border: '3px solid var(--border)',
                      borderTopColor: 'var(--primary)',
                    }}
                  />
                </span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: 'var(--ink)' }}>
                  {stuckGenerating
                    ? isTranslate
                      ? 'Translation stalled'
                      : 'This path got stuck'
                    : isTranslate
                      ? 'Translating your path'
                      : 'Still generating your path'}
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '12px',
                    color: 'var(--body)',
                    lineHeight: 1.4,
                  }}
                >
                  {stuckGenerating
                    ? isTranslate
                      ? "The translation didn't finish, but your path is intact. Restore it to bring it back to normal."
                      : "It stopped responding and won't finish. Stop it to remove the path and create a fresh one."
                    : isTranslate
                      ? "Your path is being translated. This updates automatically when it's done."
                      : "Your path is still being built. This updates automatically when it's done."}
                </p>
                {stopError ? (
                  <p
                    role="alert"
                    style={{
                      margin: '6px 0 0',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--danger)',
                      lineHeight: 1.4,
                    }}
                  >
                    {stopError}
                  </p>
                ) : null}
              </div>
              {stuckGenerating ? (
                stopConfirm ? (
                  <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                    <button
                      type="button"
                      className="path-stop-btn path-stop-btn--ghost"
                      onClick={() => {
                        setStopConfirm(false);
                        setStopError(null);
                      }}
                      disabled={stopping}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '9px 14px',
                        borderRadius: 'var(--rm)',
                        background: 'transparent',
                        color: 'var(--body)',
                        border: '1px solid var(--border)',
                        fontFamily: 'inherit',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: stopping ? 'default' : 'pointer',
                        opacity: stopping ? 0.6 : 1,
                      }}
                    >
                      Keep waiting
                    </button>
                    <button
                      type="button"
                      className={`path-stop-btn ${
                        isTranslate ? 'path-stop-btn--primary' : 'path-stop-btn--danger'
                      }`}
                      onClick={handleStopGenerating}
                      disabled={stopping}
                      aria-busy={stopping}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        minWidth: '128px',
                        padding: '9px 14px',
                        borderRadius: 'var(--rm)',
                        background: isTranslate ? 'var(--primary)' : 'var(--danger)',
                        color: isTranslate ? '#fff' : '#fff',
                        border: 'none',
                        fontFamily: 'inherit',
                        fontSize: '13px',
                        fontWeight: 700,
                        cursor: stopping ? 'default' : 'pointer',
                        opacity: stopping ? 0.7 : 1,
                      }}
                    >
                      <span
                        aria-hidden
                        className={stopping ? 'material-symbols-outlined path-spin' : 'material-symbols-outlined'}
                        style={{ fontSize: '16px' }}
                      >
                        {stopping ? 'progress_activity' : isTranslate ? 'restart_alt' : 'close'}
                      </span>
                      {stopping
                        ? isTranslate
                          ? 'Restoring…'
                          : 'Stopping…'
                        : isTranslate
                          ? 'Restore'
                          : 'Stop & remove'}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className={`path-stop-btn ${
                      isTranslate ? 'path-stop-btn--primary' : 'path-stop-btn--danger'
                    }`}
                    onClick={() => setStopConfirm(true)}
                    style={{
                      flexShrink: 0,
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      padding: '9px 14px',
                      borderRadius: 'var(--rm)',
                      background: isTranslate ? 'var(--primary)' : 'var(--danger)',
                      color: isTranslate ? '#fff' : '#fff',
                      border: 'none',
                      fontFamily: 'inherit',
                      fontSize: '13px',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    <span
                      aria-hidden
                      className="material-symbols-outlined"
                      style={{ fontSize: '16px' }}
                    >
                      {isTranslate ? 'restart_alt' : 'close'}
                    </span>
                    {isTranslate ? 'Restore path' : 'Stop generating'}
                  </button>
                )
              ) : null}
            </div>
          </div>
        ) : incompleteCount > 0 ? (
          <div className="path-banner" style={{ margin: '0 0 16px' }}>
            <style>{`
              @keyframes spin { to { transform: rotate(360deg); } }
              .path-banner { --danger: #c0392b; }
              .path-spin { animation: spin 0.8s linear infinite; }
              .path-stop-btn--primary:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
              @media (prefers-reduced-motion: reduce) { .path-spin { animation: none; } }
            `}</style>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--rc)',
              }}
            >
              <span
                aria-hidden
                className="material-symbols-outlined"
                style={{
                  fontSize: '20px',
                  width: '36px',
                  height: '36px',
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: '999px',
                  background: 'var(--amber-soft)',
                  color: 'var(--amber-ink)',
                }}
              >
                sync_problem
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p
                  style={{
                    margin: 0,
                    fontSize: '13px',
                    fontWeight: 700,
                    color: 'var(--ink)',
                  }}
                >
                  {incompleteCount === 1
                    ? "1 checkpoint didn't finish generating"
                    : `${incompleteCount} checkpoints didn't finish generating`}
                </p>
                <p
                  style={{
                    margin: '2px 0 0',
                    fontSize: '12px',
                    color: 'var(--body)',
                    lineHeight: 1.4,
                  }}
                >
                  They won&apos;t block your progress. Regenerate to fill in the missing
                  content.
                </p>
                {regenError ? (
                  <p
                    role="alert"
                    style={{
                      margin: '6px 0 0',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--danger)',
                      lineHeight: 1.4,
                    }}
                  >
                    {regenError}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                className="path-stop-btn--primary"
                onClick={handleRegenerate}
                disabled={regenStarting}
                aria-busy={regenStarting}
                onMouseEnter={() => setRegenHover(true)}
                onMouseLeave={() => {
                  setRegenHover(false);
                  setRegenPressed(false);
                }}
                onMouseDown={() => setRegenPressed(true)}
                onMouseUp={() => setRegenPressed(false)}
                style={{
                  flexShrink: 0,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '6px',
                  minWidth: '128px',
                  padding: '9px 14px',
                  borderRadius: 'var(--rm)',
                  background: 'var(--primary)',
                  color: '#fff',
                  border: 'none',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  fontWeight: 700,
                  cursor: regenStarting ? 'default' : 'pointer',
                  opacity: regenStarting ? 0.7 : regenHover ? 0.92 : 1,
                  transform:
                    !regenStarting && regenPressed ? 'translateY(1px)' : 'translateY(0)',
                  boxShadow:
                    !regenStarting && regenPressed
                      ? 'none'
                      : '0 2px 0 var(--primary-container, var(--border))',
                  transition:
                    'transform 0.12s cubic-bezier(0.22,1,0.36,1), opacity 0.12s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                <span
                  aria-hidden
                  className={regenStarting ? 'material-symbols-outlined path-spin' : 'material-symbols-outlined'}
                  style={{ fontSize: '16px' }}
                >
                  {regenStarting ? 'progress_activity' : 'autorenew'}
                </span>
                {regenStarting ? 'Starting…' : 'Regenerate'}
              </button>
            </div>
          </div>
        ) : null;

  return (
    <>
      <AppShell width="wide">
        {openSlot ? (
          <NodeOverview
            slot={openSlot}
            plan={plan}
            onSelectActivity={handleSelectActivity}
            onBack={handleCloseDrawer}
          />
        ) : (
          <LearningPathScreen plan={plan} onSlotClick={handleSlotClick} banner={bannerNode} />
        )}
      </AppShell>

      {openSlot && activeActivity?.kind === 'flashcards' ? (
        <CheckpointFlashcardViewer
          key={activeActivity.id}
          slot={openSlot}
          activity={activeActivity}
          onClose={() => setUrlSlot({ activity: null })}
          onCompleted={handleActivityCompleted}
        />
      ) : openSlot && activeActivity?.kind === 'theory' ? (
        <CheckpointTheoryViewer
          key={activeActivity.id}
          slot={openSlot}
          activity={activeActivity}
          planId={planId}
          notebookId={plan.notebookId}
          pathTitle={plan.title}
          onClose={() => setUrlSlot({ activity: null })}
          onCompleted={handleActivityCompleted}
        />
      ) : openSlot && activeActivity?.kind === 'quiz' ? (
        <CheckpointQuizViewer
          key={activeActivity.id}
          slot={openSlot}
          activity={activeActivity}
          pathTitle={plan.title}
          pathId={planId}
          onClose={() => setUrlSlot({ activity: null })}
          onCompleted={handleActivityCompleted}
          onProgress={handleSlotChanged}
        />
      ) : null}

      {regenerating ? (
        <GenerationProgressModal
          planId={planId}
          initialTitle={plan.title}
          mode="regenerate"
          targetCount={incompleteCount}
          onRunInBackground={() => {
            setRegenerating(false);
            setRefreshKey((k) => k + 1);
          }}
          onClose={() => {
            setRegenerating(false);
            setRefreshKey((k) => k + 1);
          }}
        />
      ) : null}
    </>
  );
}
