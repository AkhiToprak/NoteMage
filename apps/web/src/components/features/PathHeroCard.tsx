'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import type { PathPhase, PathPlan } from '@/components/learn/PathView';

type FetchState =
  | { kind: 'loading' }
  | { kind: 'ready'; plans: PathPlan[] }
  | { kind: 'error' };

interface Derived {
  plan: PathPlan;
  activePhase: PathPhase;
  activePhaseIndex: number;
  nextMaterialIsCheckpoint: boolean;
  percent: number;
  completed: number;
  total: number;
  pathDone: boolean;
}

function deriveHero(plans: PathPlan[]): Derived | null {
  if (plans.length === 0) return null;
  const plan = plans[0];
  if (!plan.phases.length) return null;

  let total = 0;
  let completed = 0;
  for (const phase of plan.phases) {
    for (const m of phase.materials) {
      total += 1;
      if (m.completed) completed += 1;
    }
  }
  if (total === 0) return null;
  const percent = Math.round((completed / total) * 100);
  const pathDone = completed === total;

  let activePhaseIndex = plan.phases.findIndex(
    (p) => p.unlocked && p.materials.some((m) => !m.completed),
  );
  if (activePhaseIndex === -1) activePhaseIndex = plan.phases.length - 1;
  const activePhase = plan.phases[activePhaseIndex];
  const nextMaterial = activePhase.materials.find((m) => m.unlocked && !m.completed) ?? null;

  return {
    plan,
    activePhase,
    activePhaseIndex,
    nextMaterialIsCheckpoint: nextMaterial?.isCheckpoint === true,
    percent,
    completed,
    total,
    pathDone,
  };
}

function NoPathCard({ hasPlans }: { hasPlans: boolean }) {
  // hasPlans: the API returned plans but none of them have content yet
  // (orphaned phases / empty materials). The copy diverges from the
  // "no plans at all" case so the user knows whether to upload content
  // or pick up where they left off.
  return (
    <div
      style={{
        background: 'var(--surface-container-low)',
        border: '1px solid var(--outline-variant)',
        borderLeft: '4px solid var(--primary)',
        borderRadius: '16px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <p
          style={{
            margin: 0,
            fontSize: '11px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--on-surface-variant)',
            fontWeight: 600,
          }}
        >
          Learn path
        </p>
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            letterSpacing: '-0.01em',
          }}
        >
          {hasPlans ? 'Add notes to your path' : 'Generate a learn path'}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.5,
          }}
        >
          {hasPlans
            ? 'Upload notes into a notebook so NoteMage can fill your path with lessons.'
            : 'Drop notes into a notebook and NoteMage will turn them into a guided study path.'}
        </p>
      </div>
      <div>
        <Link
          href="/notebooks"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            background: 'var(--primary)',
            color: 'var(--on-primary)',
            borderRadius: 'var(--radius-full)',
            border: 'none',
            fontSize: '14px',
            fontWeight: 700,
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            auto_fix_high
          </span>
          {hasPlans ? 'Open a notebook' : 'Generate a learn path'}
        </Link>
      </div>
    </div>
  );
}

function HeroSkeleton() {
  return (
    <div
      aria-hidden
      style={{
        background: 'var(--surface-container-low)',
        border: '1px solid var(--outline-variant)',
        borderLeft: '4px solid var(--outline-variant)',
        borderRadius: '16px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
      }}
    >
      <div
        style={{
          width: '50%',
          height: '14px',
          borderRadius: '6px',
          background: 'rgba(229,227,255,0.06)',
          animation: 'pathHeroPulse 1.4s ease-in-out infinite',
        }}
      />
      <div
        style={{
          width: '70%',
          height: '20px',
          borderRadius: '6px',
          background: 'rgba(229,227,255,0.08)',
          animation: 'pathHeroPulse 1.4s ease-in-out infinite',
        }}
      />
      <div
        style={{
          width: '100%',
          height: '6px',
          borderRadius: '999px',
          background: 'rgba(229,227,255,0.05)',
        }}
      />
      <style>{`
        @keyframes pathHeroPulse { 0%,100% { opacity: 1; } 50% { opacity: 0.45; } }
      `}</style>
    </div>
  );
}

export default function PathHeroCard() {
  const [state, setState] = useState<FetchState>({ kind: 'loading' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/study-plans');
        if (!res.ok) throw new Error(`status ${res.status}`);
        const body = (await res.json()) as { success?: boolean; data?: PathPlan[] };
        if (cancelled) return;
        if (!body.success || !Array.isArray(body.data)) {
          setState({ kind: 'error' });
          return;
        }
        setState({ kind: 'ready', plans: body.data });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const derived = useMemo(() => {
    if (state.kind !== 'ready') return null;
    return deriveHero(state.plans);
  }, [state]);

  if (state.kind === 'loading') return <HeroSkeleton />;
  if (state.kind === 'error') return null;
  if (!derived) return <NoPathCard hasPlans={state.kind === 'ready' && state.plans.length > 0} />;

  const { plan, activePhase, activePhaseIndex, nextMaterialIsCheckpoint, percent, pathDone } =
    derived;

  const ctaLabel = pathDone
    ? 'Path complete'
    : nextMaterialIsCheckpoint
      ? 'Take checkpoint'
      : 'Continue';
  const ctaIcon = pathDone ? 'celebration' : nextMaterialIsCheckpoint ? 'school' : 'arrow_forward';

  return (
    <div
      style={{
        background: 'var(--surface-container-low)',
        border: '1px solid var(--outline-variant)',
        borderLeft: '4px solid var(--primary)',
        borderRadius: '16px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px',
        transition: 'background 0.25s cubic-bezier(0.22,1,0.36,1)',
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'var(--card-hover-bg-soft)';
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-container-low)';
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <p
          style={{
            margin: 0,
            fontSize: '11px',
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--on-surface-variant)',
            fontWeight: 600,
          }}
        >
          Continue your path
        </p>
        <h3
          style={{
            margin: 0,
            fontFamily: 'var(--font-display)',
            fontSize: '20px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            letterSpacing: '-0.01em',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {plan.title}
        </h3>
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            color: 'var(--on-surface-variant)',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontWeight: 600 }}>
            Phase {activePhaseIndex + 1}
          </span>
          <span style={{ color: 'var(--outline)' }}>·</span>
          <span
            style={{
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              maxWidth: '100%',
            }}
          >
            {activePhase.title}
          </span>
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div
          aria-hidden
          style={{
            flex: 1,
            height: '6px',
            borderRadius: '999px',
            background: 'var(--surface-container-high)',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              width: `${percent}%`,
              height: '100%',
              background: 'var(--primary)',
              borderRadius: '999px',
              transition: 'width 0.35s cubic-bezier(0.22,1,0.36,1)',
            }}
          />
        </div>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: 'var(--on-surface)',
            fontVariantNumeric: 'tabular-nums',
            minWidth: '38px',
            textAlign: 'right',
          }}
        >
          {percent}%
        </span>
      </div>

      <div>
        <Link
          href="/learn"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 18px',
            background: pathDone ? 'var(--surface-container)' : 'var(--primary)',
            color: pathDone ? 'var(--on-surface)' : 'var(--on-primary)',
            borderRadius: 'var(--radius-full)',
            border: pathDone ? '1px solid var(--outline-variant)' : 'none',
            fontSize: '14px',
            fontWeight: 700,
            textDecoration: 'none',
            cursor: 'pointer',
            transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(-1px)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLAnchorElement).style.transform = 'translateY(0)';
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>
            {ctaIcon}
          </span>
          {ctaLabel}
        </Link>
      </div>
    </div>
  );
}
