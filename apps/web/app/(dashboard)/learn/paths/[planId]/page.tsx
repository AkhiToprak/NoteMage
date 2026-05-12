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

// Phase 10.6 — path detail page.
//
// URL contract: `/learn/paths/[planId]?slot=<slotId>&activity=<activityId>`
//
// The page renders PathView (the Duolingo column) and overlays a
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
        />
      ) : openSlot ? (
        <CheckpointDrawer
          slot={openSlot}
          onSelectActivity={handleSelectActivity}
          onClose={handleCloseDrawer}
        />
      ) : null}
    </>
  );
}
