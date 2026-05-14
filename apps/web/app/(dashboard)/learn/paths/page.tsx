'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import LearnPathSetup from '@/components/learn/LearnPathSetup';
import type { PathPlan } from '@/components/learn/PathView';
import {
  SUBJECT_REGISTRY,
  isSubjectId,
  type SubjectId,
} from '@/lib/path-subjects';

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
};

function primarySubjectOf(plan: PathPlanListItem): SubjectId | null {
  const first = plan.subjects?.find((s) => isSubjectId(s));
  return first ? (first as SubjectId) : null;
}

function isInFlight(plan: PathPlanListItem): boolean {
  const status = plan.generationStatus;
  return status === 'queued' || status === 'generating';
}

export default function LearnPage() {
  const [plans, setPlans] = useState<PathPlanListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [activeSubject, setActiveSubject] = useState<SubjectId | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px 48px' }}>
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
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          style={{
            flexShrink: 0,
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
      </header>

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
        <EmptyState error={error} onCreate={() => setCreateOpen(true)} />
      ) : filteredPlans && filteredPlans.length === 0 ? (
        <FilterEmptyState onClear={() => setActiveSubject(null)} />
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: '12px',
          }}
        >
          {(filteredPlans ?? []).map((plan) =>
            isInFlight(plan) ? (
              <GeneratingCard key={plan.id} plan={plan} />
            ) : (
              <PathCard key={plan.id} plan={plan} />
            ),
          )}
        </div>
      )}

      {createOpen ? <LearnPathSetup onClose={handleCreateClose} /> : null}

      <style>{`
        @keyframes learnPathSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .learn-paths-card {
          transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), border-color 0.22s cubic-bezier(0.22, 1, 0.36, 1);
        }
        .learn-paths-card:hover {
          transform: translateY(-2px);
          border-color: var(--primary);
        }
        .learn-paths-card:focus-visible {
          outline: 3px solid var(--primary);
          outline-offset: 2px;
        }
        @media (prefers-reduced-motion: reduce) {
          .learn-paths-card { transition: none; }
          .learn-paths-card:hover { transform: none; }
        }
      `}</style>
    </div>
  );
}

function PathCard({ plan }: { plan: PathPlanListItem }) {
  const allSlots = plan.phases.flatMap((p) => p.slots);
  const total = allSlots.length;
  const done = allSlots.filter((s) => s.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const primarySubject = primarySubjectOf(plan);

  return (
    <Link
      href={`/learn/paths/${encodeURIComponent(plan.id)}`}
      className="learn-paths-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        background: 'var(--surface-container)',
        border: '1px solid var(--outline-variant)',
        borderRadius: 'var(--radius-lg)',
        textDecoration: 'none',
        color: 'var(--on-surface)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span
          aria-hidden
          style={{
            width: '44px',
            height: '44px',
            borderRadius: 'var(--radius-md)',
            background: 'var(--surface-container-high)',
            color: 'var(--primary)',
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

      {primarySubject ? <SubjectChip subject={primarySubject} /> : null}

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
            background: 'var(--primary)',
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
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '2px', color: 'var(--primary)', fontWeight: 600 }}>
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
// `ready` the card swaps for the real PathCard.
function GeneratingCard({ plan }: { plan: PathPlanListItem }) {
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
          Generating your path…
        </p>
      </div>
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
        color: 'var(--primary)',
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
