'use client';

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import PathView, { type PathPlan, type PathSlot } from '@/components/learn/PathView';
import { NMCard } from '@/components/rework/NMCard';
import { SectionHeading } from '@/components/rework/SectionHeading';
import { ProgressBar } from '@/components/rework/ProgressBar';
import { Mascot } from '@/components/mascot/Mascot';
import { Button } from '@/components/ui/Button';

// /my-path — Duolingo-style "My active path" surface.
//
// Picks the most-recent in-progress path (else most-recent) and renders
// its progression map via the existing PathView component. When the
// user has multiple paths a compact chip-row switcher is rendered above
// so they can flip between them without going to the list page.
//
// Clicking a slot opens a detail panel (right rail on desktop, bottom
// card on phone) showing node info and a CTA that links to the real
// path detail route with the slot pre-opened.
//
// Data source: GET /api/learn/paths (list) + GET /api/learn/paths/[id]
// (full plan with slot.activities).

// ── types ──────────────────────────────────────────────────────────────

type PathListItem = PathPlan & {
  generationStatus?: string;
  updatedAt?: string;
};

// Detail plan returned by /api/learn/paths/[id] — superset of PathPlan.
type DetailPlan = PathPlan;

// ── helpers ────────────────────────────────────────────────────────────

function overallProgress(plan: PathPlan): { done: number; total: number; pct: number } {
  const slots = plan.phases.flatMap((p) => p.slots);
  const total = slots.length;
  const done = slots.filter((s) => s.completed).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return { done, total, pct };
}

function pickActivePath(plans: PathListItem[]): PathListItem | null {
  if (plans.length === 0) return null;
  // Prefer most-recent path that has at least one incomplete slot (in-progress).
  const ready = plans.filter((p) => p.generationStatus === 'ready' || !p.generationStatus);
  const inProgress = ready.filter((p) => {
    const slots = p.phases.flatMap((ph) => ph.slots);
    return slots.some((s) => !s.completed);
  });
  if (inProgress.length > 0) return inProgress[0];
  if (ready.length > 0) return ready[0];
  return plans[0];
}

// Kind label from PathSlot.kind (the path system uses "learning" / "review" /
// "assessment" / "final_exam"). Map to friendly names shown in the detail panel.
const SLOT_KIND_LABEL: Record<string, string> = {
  learning: 'Learning',
  review: 'Review',
  assessment: 'Assessment',
  final_exam: 'Final Exam',
};

// Estimated reading time per activity kind (minutes).
const ACTIVITY_TIME: Record<string, number> = {
  theory: 5,
  flashcards: 4,
  quiz: 5,
};

function estimatedMinutes(slot: PathSlot): number {
  return slot.activities.reduce((sum, a) => sum + (ACTIVITY_TIME[a.kind] ?? 5), 0) || 10;
}

// ── root page component ────────────────────────────────────────────────

export default function MyPathPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <MyPathInner />
    </Suspense>
  );
}

function LoadingState() {
  return (
    <div className={wrapClass} style={wrapStyle}>
      <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px', textAlign: 'center', padding: '48px 0' }}>
        Loading your path…
      </p>
    </div>
  );
}

function MyPathInner() {
  const [listItems, setListItems] = useState<PathListItem[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  // The planId the user has actively selected (or null = auto-pick).
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  // Full plan detail (with activities) for the selected path.
  const [plan, setPlan] = useState<DetailPlan | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  // The slot currently selected for the detail panel.
  const [activeSlot, setActiveSlot] = useState<PathSlot | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Fetch the path list once on mount.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/learn/paths')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.success) {
          setListItems((j.data ?? []) as PathListItem[]);
        } else {
          setListError(j?.error ?? 'Could not load paths');
          setListItems([]);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setListError('Could not load paths');
          setListItems([]);
        }
      });
    return () => { cancelled = true; };
  }, []);

  // Derive the "active" list item based on selectedPlanId or auto-pick.
  const readyItems = useMemo(() => {
    if (!listItems) return [];
    return listItems.filter((p) => p.generationStatus === 'ready' || !p.generationStatus);
  }, [listItems]);

  const activePlanMeta = useMemo<PathListItem | null>(() => {
    if (readyItems.length === 0) return null;
    if (selectedPlanId) {
      return readyItems.find((p) => p.id === selectedPlanId) ?? null;
    }
    return pickActivePath(readyItems);
  }, [readyItems, selectedPlanId]);

  // Fetch full detail plan whenever the selected plan changes.
  useEffect(() => {
    if (!activePlanMeta) return;
    let cancelled = false;
    setPlan(null);
    setPlanError(null);
    setActiveSlot(null);
    fetch(`/api/learn/paths/${encodeURIComponent(activePlanMeta.id)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j?.success && j.data) {
          setPlan(j.data as DetailPlan);
        } else {
          setPlanError(j?.error ?? 'Could not load path details');
        }
      })
      .catch(() => {
        if (!cancelled) setPlanError('Could not load path details');
      });
    return () => { cancelled = true; };
  }, [activePlanMeta]);

  // Dismiss the panel on Escape.
  useEffect(() => {
    if (!activeSlot) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActiveSlot(null);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [activeSlot]);

  // Focus the panel when it opens so keyboard/SR users land inside.
  useEffect(() => {
    if (activeSlot) {
      panelRef.current?.focus();
    }
  }, [activeSlot]);

  const handleSlotClick = useCallback((slot: PathSlot) => {
    setActiveSlot((prev) => (prev?.id === slot.id ? null : slot));
  }, []);

  // Still loading the list.
  if (listItems === null) return <LoadingState />;

  // No paths at all (including generating ones).
  if (listItems.length === 0) {
    return (
      <div className={wrapClass} style={wrapStyle}>
        <EmptyState />
      </div>
    );
  }

  // List loaded but no ready paths exist yet (all generating).
  if (readyItems.length === 0) {
    return (
      <div className={wrapClass} style={wrapStyle}>
        <GeneratingState />
      </div>
    );
  }

  const { pct, done, total } = activePlanMeta ? overallProgress(activePlanMeta) : { pct: 0, done: 0, total: 0 };

  return (
    <div className={wrapClass} style={wrapStyle}>
      {/* ── Header ───────────────────────────────────── */}
      <header style={{ marginBottom: '24px' }}>
        <SectionHeading
          title="My Path"
          subtitle={activePlanMeta?.title ?? undefined}
          icon="route"
        />

        {activePlanMeta && (
          <div style={{ marginTop: '16px' }}>
            <ProgressBar
              value={pct}
              label={`${done} / ${total} checkpoints`}
              showPercent
              height={8}
              color="var(--primary)"
            />
          </div>
        )}

        {/* Path switcher — only when the user has more than one ready path. */}
        {readyItems.length > 1 && (
          <PathSwitcher
            items={readyItems}
            activePlanId={activePlanMeta?.id ?? null}
            onSelect={setSelectedPlanId}
          />
        )}
      </header>

      {listError && (
        <p role="alert" style={{ fontSize: '13px', color: 'var(--error)', marginBottom: '16px' }}>
          {listError}
        </p>
      )}

      {/* ── Main content: map + optional detail panel ── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: activeSlot ? 'minmax(0,1fr) 360px' : '1fr',
          gap: '24px',
          alignItems: 'start',
        }}
      >
        {/* Map column */}
        <div style={{ minWidth: 0 }}>
          {planError && (
            <p role="alert" style={{ fontSize: '13px', color: 'var(--error)', margin: '0 0 16px' }}>
              {planError}
            </p>
          )}
          {plan ? (
            <PathView plan={plan} onSlotClick={handleSlotClick} />
          ) : activePlanMeta && !planError ? (
            <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px', textAlign: 'center', padding: '48px 0' }}>
              Loading map…
            </p>
          ) : null}
        </div>

        {/* Detail panel — desktop right rail */}
        {activeSlot && (
          <div
            ref={panelRef}
            tabIndex={-1}
            role="region"
            aria-label="Node details"
            style={{
              position: 'sticky',
              top: '72px',
              outline: 'none',
            }}
          >
            <SlotDetailPanel
              slot={activeSlot}
              planId={activePlanMeta?.id ?? ''}
              onClose={() => setActiveSlot(null)}
            />
          </div>
        )}
      </div>

      {/* Detail panel — phone bottom card */}
      {activeSlot && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1100,
            display: 'none',
          }}
          className="my-path-phone-overlay"
        >
          <div
            aria-hidden
            onClick={() => setActiveSlot(null)}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Node details"
            style={{
              position: 'absolute',
              bottom: 0,
              left: 0,
              right: 0,
              background: 'var(--surface-container)',
              borderRadius: 'var(--radius-xl) var(--radius-xl) 0 0',
              padding: 'clamp(20px, 5vw, 28px)',
              maxHeight: '75dvh',
              overflowY: 'auto',
            }}
          >
            {/* drag handle */}
            <div
              aria-hidden
              style={{
                width: '36px',
                height: '4px',
                background: 'var(--outline-variant)',
                borderRadius: '999px',
                margin: '0 auto 20px',
              }}
            />
            <SlotDetailPanel
              slot={activeSlot}
              planId={activePlanMeta?.id ?? ''}
              onClose={() => setActiveSlot(null)}
            />
          </div>
        </div>
      )}

      <style>{`
        @media (max-width: 720px) {
          .my-path-phone-overlay { display: block !important; }
          .my-path-grid { grid-template-columns: 1fr !important; }
        }
        @media (prefers-reduced-motion: reduce) {
          .my-path-phone-overlay * { transition: none !important; animation: none !important; }
        }
      `}</style>
    </div>
  );
}

// ── Path switcher chip row ─────────────────────────────────────────────

function PathSwitcher({
  items,
  activePlanId,
  onSelect,
}: {
  items: PathListItem[];
  activePlanId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <nav
      aria-label="Switch path"
      style={{
        marginTop: '16px',
        display: 'flex',
        flexWrap: 'wrap',
        gap: '8px',
      }}
    >
      {items.map((item) => {
        const isActive = item.id === activePlanId;
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            aria-pressed={isActive}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              padding: '6px 14px',
              borderRadius: 'var(--radius-full)',
              border: `1px solid ${isActive ? 'var(--primary)' : 'var(--outline-variant)'}`,
              background: isActive ? 'var(--primary)' : 'var(--surface-container)',
              color: isActive ? 'var(--on-primary)' : 'var(--on-surface-variant)',
              fontFamily: 'inherit',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              minHeight: '36px',
              maxWidth: '220px',
              transition: 'opacity 0.15s ease',
            }}
            className="my-path-switcher-chip"
          >
            <span
              className="material-symbols-outlined"
              aria-hidden
              style={{ fontSize: '16px', flexShrink: 0 }}
            >
              route
            </span>
            <span
              style={{
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {item.title}
            </span>
          </button>
        );
      })}
      <style>{`
        .my-path-switcher-chip:hover:not([aria-pressed="true"]) {
          border-color: var(--outline);
          color: var(--on-surface);
        }
        .my-path-switcher-chip:focus-visible {
          outline: 3px solid var(--primary);
          outline-offset: 2px;
        }
        .my-path-switcher-chip:active {
          opacity: 0.8;
        }
      `}</style>
    </nav>
  );
}

// ── Slot detail panel ──────────────────────────────────────────────────

function SlotDetailPanel({
  slot,
  planId,
  onClose,
}: {
  slot: PathSlot;
  planId: string;
  onClose: () => void;
}) {
  const kindLabel = SLOT_KIND_LABEL[slot.kind] ?? slot.kind;
  const estMin = estimatedMinutes(slot);
  const isLocked = !slot.unlocked;
  const isCompleted = slot.completed;

  // Derive the first incomplete activity to link the primary CTA to.
  const firstIncomplete = slot.activities.find((a) => !a.completed);
  const ctaActivity = firstIncomplete ?? slot.activities[0] ?? null;

  // Build the URL for the "Start / Review" CTA.
  const ctaHref = planId && ctaActivity
    ? `/learn/paths/${encodeURIComponent(planId)}?slot=${encodeURIComponent(slot.id)}&activity=${encodeURIComponent(ctaActivity.id)}`
    : planId
      ? `/learn/paths/${encodeURIComponent(planId)}?slot=${encodeURIComponent(slot.id)}`
      : '/learn/paths';

  const ctaLabel = isCompleted
    ? 'Review'
    : isLocked
      ? 'Locked'
      : firstIncomplete
        ? (firstIncomplete.kind === 'quiz' ? 'Start Quiz' : firstIncomplete.kind === 'flashcards' ? 'Start Flashcards' : 'Start Lesson')
        : 'Open';

  const activityRows = slot.activities.slice(0, 6);

  return (
    <NMCard
      style={{
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '12px' }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          {/* Kind badge */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              padding: '2px 8px',
              borderRadius: 'var(--radius-full)',
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface-variant)',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '13px' }}>
              {slot.kind === 'assessment' || slot.kind === 'final_exam'
                ? 'flag'
                : slot.kind === 'review'
                  ? 'repeat'
                  : 'menu_book'}
            </span>
            {kindLabel}
          </span>
          <h3
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '17px',
              fontWeight: 800,
              color: 'var(--on-surface)',
              letterSpacing: '-0.01em',
              lineHeight: 1.3,
            }}
          >
            {slot.title}
          </h3>
          {slot.description && (
            <p
              style={{
                margin: '6px 0 0',
                fontSize: '13px',
                color: 'var(--on-surface-variant)',
                lineHeight: 1.5,
              }}
            >
              {slot.description}
            </p>
          )}
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close panel"
          style={{
            flexShrink: 0,
            width: '32px',
            height: '32px',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 'var(--radius-full)',
            border: 'none',
            background: 'transparent',
            color: 'var(--on-surface-variant)',
            cursor: 'pointer',
          }}
          className="my-path-close-btn"
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
            close
          </span>
        </button>
      </div>

      {/* Meta row */}
      <div
        style={{
          display: 'flex',
          gap: '16px',
          flexWrap: 'wrap',
          fontSize: '13px',
          color: 'var(--on-surface-variant)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '15px' }}>
            schedule
          </span>
          Est. {estMin} min
        </span>
        {isCompleted && slot.bestPercentage !== null && (
          <span
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              color: 'var(--primary)',
              fontWeight: 600,
            }}
          >
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '15px' }}>
              check_circle
            </span>
            Best: {Math.round(slot.bestPercentage)}%
          </span>
        )}
        {isLocked && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--on-surface-variant)' }}>
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '15px' }}>
              lock
            </span>
            Locked
          </span>
        )}
      </div>

      {/* Activity list */}
      {activityRows.length > 0 && (
        <div>
          <p
            style={{
              margin: '0 0 8px',
              fontSize: '11px',
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: 'var(--on-surface-variant)',
            }}
          >
            Activities
          </p>
          <ul
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              display: 'flex',
              flexDirection: 'column',
              gap: '6px',
            }}
          >
            {activityRows.map((activity) => {
              const iconMap: Record<string, string> = {
                theory: 'auto_stories',
                flashcards: 'style',
                quiz: 'quiz',
              };
              const labelMap: Record<string, string> = {
                theory: 'Theory',
                flashcards: 'Flashcards',
                quiz: 'Quiz',
              };
              const icon = iconMap[activity.kind] ?? 'task';
              const label = labelMap[activity.kind] ?? activity.kind;
              const actHref = planId
                ? `/learn/paths/${encodeURIComponent(planId)}?slot=${encodeURIComponent(slot.id)}&activity=${encodeURIComponent(activity.id)}`
                : '/learn/paths';
              return (
                <li key={activity.id}>
                  <Link
                    href={isLocked ? '#' : actHref}
                    aria-disabled={isLocked}
                    onClick={isLocked ? (e) => e.preventDefault() : undefined}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      padding: '9px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: activity.completed
                        ? 'var(--surface-container-high)'
                        : 'var(--surface-container)',
                      border: '1px solid var(--outline-variant)',
                      textDecoration: 'none',
                      color: 'var(--on-surface)',
                      opacity: isLocked ? 0.55 : 1,
                      cursor: isLocked ? 'default' : 'pointer',
                    }}
                    className="my-path-activity-link"
                  >
                    <span
                      className="material-symbols-outlined"
                      aria-hidden
                      style={{
                        fontSize: '18px',
                        color: activity.completed ? 'var(--primary)' : 'var(--on-surface-variant)',
                      }}
                    >
                      {activity.completed ? 'check_circle' : icon}
                    </span>
                    <span style={{ flex: 1, fontSize: '13px', fontWeight: 600 }}>
                      {label}
                    </span>
                    {activity.completed && (
                      <span
                        style={{
                          fontSize: '11px',
                          color: 'var(--on-surface-variant)',
                          fontWeight: 600,
                        }}
                      >
                        Done
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* Primary CTA */}
      {!isLocked ? (
        <Button href={ctaHref} variant="primary" size="lg" style={{ width: '100%', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
            {isCompleted ? 'replay' : 'play_arrow'}
          </span>
          {ctaLabel}
        </Button>
      ) : (
        <Button
          variant="secondary"
          size="lg"
          disabled
          style={{ width: '100%', justifyContent: 'center', cursor: 'not-allowed' }}
        >
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
            lock
          </span>
          Locked
        </Button>
      )}

      <style>{`
        .my-path-close-btn:hover { background: var(--surface-container-high); }
        .my-path-close-btn:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
        .my-path-close-btn:active { opacity: 0.7; }
        .my-path-activity-link:hover:not([aria-disabled="true"]) { border-color: var(--outline); background: var(--surface-container-high); }
        .my-path-activity-link:focus-visible { outline: 3px solid var(--primary); outline-offset: 2px; }
        .my-path-activity-link:active { opacity: 0.85; }
      `}</style>
    </NMCard>
  );
}

// ── Empty states ───────────────────────────────────────────────────────

function EmptyState() {
  return (
    <NMCard
      style={{
        maxWidth: '480px',
        margin: '48px auto 0',
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
          No path yet
        </h2>
        <p
          style={{
            margin: 0,
            fontSize: '14px',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.65,
          }}
        >
          Upload your material and Notemage builds a step-by-step path: lessons, quizzes, reviews,
          and a final boss test.
        </p>
      </div>
      <Button href="/study-packs/new" variant="primary" size="lg">
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '20px' }}>
          upload_file
        </span>
        Upload material
      </Button>
    </NMCard>
  );
}

function GeneratingState() {
  return (
    <NMCard
      style={{
        maxWidth: '480px',
        margin: '48px auto 0',
        padding: '40px 32px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        gap: '16px',
      }}
    >
      <span
        aria-hidden
        className="my-path-spinner"
        style={{
          width: '48px',
          height: '48px',
          borderRadius: '50%',
          border: '3px solid var(--outline-variant)',
          borderTopColor: 'var(--primary)',
          animation: 'myPathSpin 0.9s linear infinite',
        }}
      />
      <div>
        <h2
          style={{
            margin: '0 0 8px',
            fontFamily: 'var(--font-display)',
            fontSize: '20px',
            fontWeight: 800,
            color: 'var(--on-surface)',
          }}
        >
          Generating your path…
        </h2>
        <p style={{ margin: 0, fontSize: '14px', color: 'var(--on-surface-variant)', lineHeight: 1.6 }}>
          This usually takes a minute. It will appear here when ready.
        </p>
      </div>
      <Button href="/learn/paths" variant="secondary" size="md">
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '18px' }}>
          arrow_back
        </span>
        Back to paths
      </Button>
      <style>{`
        @keyframes myPathSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .my-path-spinner { animation: none !important; }
        }
      `}</style>
    </NMCard>
  );
}

// ── Layout constant ────────────────────────────────────────────────────

const wrapStyle: React.CSSProperties = {
  maxWidth: '1180px',
  margin: '0 auto',
  padding: 'clamp(16px, 4vw, 32px)',
  width: '100%',
};

const wrapClass = 'nm-rework';
