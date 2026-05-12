'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import PathView, { type PathPlan } from '@/components/learn/PathView';

// Phase 10.4 — /learn/paths list page.
//
// Two changes vs. the Phase 9 version:
//   1. Source of truth moved from the deleted /api/study-plans to
//      /api/learn/paths (rewritten in Phase 10.3 to serialize the
//      slot/activity tree).
//   2. When any plan reports `generationStatus !== 'ready'` we re-fetch
//      every 3s until they all settle. This is the "background
//      generation finished → list refreshes" signal — the project has
//      no global toast, so we lean on polling the list endpoint.

const POLL_INTERVAL_MS = 3000;

// The list payload includes `generationStatus` for paths in flight.
// PathView's own prop type doesn't surface that field, so we widen the
// list element type locally.
type PathPlanListItem = PathPlan & { generationStatus?: string };

function isInFlight(plan: PathPlanListItem): boolean {
  const status = plan.generationStatus;
  return status === 'queued' || status === 'generating';
}

export default function LearnPage() {
  const [plans, setPlans] = useState<PathPlanListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // Initial load.
  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll whenever any plan is in flight. The recursive timeout is cheaper
  // than a setInterval because it pauses while the network call is in
  // flight (no overlapping refreshes).
  useEffect(() => {
    if (!plans) return;
    const anyInFlight = plans.some(isInFlight);
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
    <div style={{ maxWidth: '760px', margin: '0 auto', padding: '8px 0 48px' }}>
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
          Follow your study paths one lesson at a time. Pass a checkpoint to unlock the next phase.
        </p>
      </header>

      {plans === null ? (
        <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>Loading your paths…</p>
      ) : plans.length === 0 ? (
        <EmptyState error={error} />
      ) : (
        plans.map((plan) =>
          isInFlight(plan) ? (
            <GeneratingCard key={plan.id} plan={plan} />
          ) : (
            <PathView key={plan.id} plan={plan} />
          ),
        )
      )}
    </div>
  );
}

// Skeleton card shown for paths still being generated. The page polls
// the list every 3s while any plan is in this state; when it flips to
// `ready` (or `failed`) this card swaps for the real PathView (or an
// error variant — Phase 10.6 will surface failed paths with a retry).
function GeneratingCard({ plan }: { plan: PathPlanListItem }) {
  return (
    <section
      style={{
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        padding: '20px 24px',
        marginBottom: '20px',
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
      }}
    >
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
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '17px',
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
            fontSize: '13px',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.4,
          }}
        >
          Generating your path… we&apos;ll refresh this card when it&apos;s ready.
        </p>
      </div>
      <style>{`
        @keyframes learnPathSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </section>
  );
}

function EmptyState({ error }: { error: string | null }) {
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
          : 'Open a notebook and generate a study plan to start a learning path.'}
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
