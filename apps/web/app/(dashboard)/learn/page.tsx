'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import PathView, { type PathPlan } from '@/components/learn/PathView';

// Phase 5 — /learn. Top-level Learn surface, one path per study plan.
// Sidebar entry + dashboard hero card are Phase 6. Until then the route is
// reachable by direct URL only.

export default function LearnPage() {
  const [plans, setPlans] = useState<PathPlan[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/study-plans')
      .then((r) => r.json())
      .then((res) => {
        if (res?.success) {
          setPlans((res.data ?? []) as PathPlan[]);
        } else {
          setError(res?.error ?? 'Failed to load paths');
          setPlans([]);
        }
      })
      .catch(() => {
        setError('Failed to load paths');
        setPlans([]);
      });
  }, []);

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
        plans.map((plan) => <PathView key={plan.id} plan={plan} />)
      )}
    </div>
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
