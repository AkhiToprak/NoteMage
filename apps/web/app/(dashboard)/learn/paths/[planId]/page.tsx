'use client';

import { Suspense, useCallback, useEffect, useState, use } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import PathView, {
  type PathActivity,
  type PathPlan,
  type PathSlot,
} from '@/components/learn/PathView';
import CheckpointDrawer from '@/components/learn/CheckpointDrawer';
import CheckpointFlashcardViewer from '@/components/learn/CheckpointFlashcardViewer';
import CheckpointTheoryViewer from '@/components/learn/CheckpointTheoryViewer';
import CheckpointQuizViewer from '@/components/learn/CheckpointQuizViewer';
import GenerationProgressModal from '@/components/learn/GenerationProgressModal';

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

interface PageProps {
  params: Promise<{ planId: string }>;
}

export default function PathDetailPage({ params }: PageProps) {
  const { planId } = use(params);
  return (
    <Suspense fallback={<LoadingShell />}>
      <PathDetailInner planId={planId} />
    </Suspense>
  );
}

function LoadingShell() {
  return (
    <p
      style={{
        margin: '32px auto',
        textAlign: 'center',
        color: 'var(--on-surface-variant)',
        fontSize: '14px',
      }}
    >
      Loading path…
    </p>
  );
}

function PathDetailInner({ planId }: { planId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const slotId = searchParams.get('slot');
  const activityId = searchParams.get('activity');

  const [plan, setPlan] = useState<PathPlan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [regenerating, setRegenerating] = useState(false);
  // Regenerate-button feedback: a pending state so the click registers
  // instantly, and a surfaced error so a rate-limit / "already in progress"
  // response doesn't read as a dead button.
  const [regenStarting, setRegenStarting] = useState(false);
  const [regenError, setRegenError] = useState<string | null>(null);
  const [regenHover, setRegenHover] = useState(false);
  const [regenPressed, setRegenPressed] = useState(false);

  // Initial + refresh fetch.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/learn/paths/${encodeURIComponent(planId)}`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && json.data) {
          setPlan(json.data as PathPlan);
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
      setRegenError('Network error — check your connection and try again.');
    } finally {
      setRegenStarting(false);
    }
  }, [planId, regenStarting]);

  if (error) {
    return (
      <div style={{ maxWidth: '760px', margin: '32px auto', padding: '0 16px' }}>
        <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>{error}</p>
        <Link href="/learn/paths" style={{ color: 'var(--primary)', fontSize: '14px' }}>
          ← Back to paths
        </Link>
      </div>
    );
  }
  if (!plan) return <LoadingShell />;

  const incompleteCount = plan.phases.reduce(
    (n, ph) => n + ph.slots.filter((s) => s.incompleteGeneration).length,
    0,
  );

  return (
    <>
      <div style={{ paddingBottom: '64px' }}>
        <nav style={{ maxWidth: '640px', margin: '0 auto', padding: '8px 16px 0' }}>
          <Link
            href="/learn/paths"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              color: 'var(--on-surface-variant)',
              fontSize: '13px',
              textDecoration: 'none',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }} aria-hidden>
              arrow_back
            </span>
            All paths
          </Link>
        </nav>

        {incompleteCount > 0 ? (
          <div style={{ maxWidth: '640px', margin: '12px auto 0', padding: '0 16px' }}>
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '12px 14px',
                background: 'var(--surface-container)',
                border: '1px solid var(--outline-variant)',
                borderRadius: 'var(--radius-lg)',
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
                  borderRadius: 'var(--radius-full)',
                  background: 'var(--tertiary-container)',
                  color: 'var(--on-tertiary-container)',
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
                    color: 'var(--on-surface)',
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
                    color: 'var(--on-surface-variant)',
                    lineHeight: 1.4,
                  }}
                >
                  They won&apos;t block your progress — regenerate to fill in the missing
                  content.
                </p>
                {regenError ? (
                  <p
                    role="alert"
                    style={{
                      margin: '6px 0 0',
                      fontSize: '12px',
                      fontWeight: 600,
                      color: 'var(--error)',
                      lineHeight: 1.4,
                    }}
                  >
                    {regenError}
                  </p>
                ) : null}
              </div>
              <button
                type="button"
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
                  borderRadius: 'var(--radius-md)',
                  background: 'var(--primary)',
                  color: 'var(--on-primary)',
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
                      : '0 2px 0 var(--primary-container, var(--outline))',
                  transition:
                    'transform 0.12s cubic-bezier(0.22,1,0.36,1), opacity 0.12s cubic-bezier(0.22,1,0.36,1)',
                }}
              >
                <span
                  aria-hidden
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '16px',
                    animation: regenStarting ? 'spin 0.8s linear infinite' : undefined,
                  }}
                >
                  {regenStarting ? 'progress_activity' : 'autorenew'}
                </span>
                {regenStarting ? 'Starting…' : 'Regenerate'}
              </button>
            </div>
          </div>
        ) : null}

        <PathView plan={plan} onSlotClick={handleSlotClick} />
      </div>

      {openSlot && activeActivity?.kind === 'flashcards' ? (
        <CheckpointFlashcardViewer
          key={activeActivity.id}
          slot={openSlot}
          activity={activeActivity}
          onClose={() => setUrlSlot({ activity: null })}
          onCompleted={() => {
            handleSlotChanged();
            setUrlSlot({ activity: null });
          }}
        />
      ) : openSlot && activeActivity?.kind === 'theory' ? (
        <CheckpointTheoryViewer
          key={activeActivity.id}
          slot={openSlot}
          activity={activeActivity}
          onClose={() => setUrlSlot({ activity: null })}
          onCompleted={() => {
            handleSlotChanged();
            setUrlSlot({ activity: null });
          }}
        />
      ) : openSlot && activeActivity?.kind === 'quiz' ? (
        <CheckpointQuizViewer
          key={activeActivity.id}
          slot={openSlot}
          activity={activeActivity}
          onClose={() => setUrlSlot({ activity: null })}
          onCompleted={() => {
            handleSlotChanged();
            setUrlSlot({ activity: null });
          }}
          onProgress={handleSlotChanged}
        />
      ) : openSlot ? (
        <CheckpointDrawer
          slot={openSlot}
          onSelectActivity={handleSelectActivity}
          onClose={handleCloseDrawer}
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
