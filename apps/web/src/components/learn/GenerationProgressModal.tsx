'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Mascot } from '@/components/mascot/Mascot';
import type { MascotOneShot, MascotPose } from '@/components/mascot/poses';
import {
  usePathGenerationStream,
  type PathGenerationProgress,
  type PathGenerationStatus,
} from '@/hooks/usePathGenerationStream';

// Phase 10.4 — "Generating your path" modal.
//
// Lifecycle:
//   1. Parent submits the create-path form, gets `{ planId, status }`,
//      mounts <GenerationProgressModal planId={planId} onClose={…} />.
//   2. Modal opens an SSE connection to /api/learn/paths/[planId]/generation
//      via usePathGenerationStream, renders progress, mascot, and a
//      current-activity caption.
//   3. Two CTAs:
//        • "Run in background" → calls onRunInBackground (parent closes
//          the modal; generation continues server-side and the list
//          page picks it up via polling).
//        • "Start learning →" → only shown once status === 'ready';
//          links to the new path detail page.
//   4. On status === 'failed' the modal shows the server error message
//      and a "Try again" button that POSTs to
//      /api/learn/paths/[planId]/regenerate. The orchestrator's
//      idempotency takes care of retrying only the missing activities.
//
// No external toast or notification system — the parent surface
// (e.g. /learn/paths list page) handles the "background generation
// finished" UX by polling for in-progress plans.

interface SerializedPathPhase {
  id: string;
  title: string;
  slots?: Array<{
    id: string;
    title: string;
    activities?: unknown[];
    /** True when a checkpoint genuinely failed to generate. Already
     *  pruned-aware via path-gating — intentionally-pruned activities are
     *  NOT counted here. */
    incompleteGeneration?: boolean;
  }>;
}

interface SerializedPath {
  id: string;
  title: string;
  phases?: SerializedPathPhase[];
}

interface PlanStructure {
  title: string;
  phases: Array<{
    id: string;
    title: string;
    slotIds: string[];
  }>;
  totalSlots: number;
}

interface GenerationProgressModalProps {
  planId: string;
  /** Plan title the user submitted — used as the modal header until the SSE replies. */
  initialTitle: string;
  /** Called when the user picks "Run in background". */
  onRunInBackground: () => void;
  /** Called when the user dismisses the modal entirely (after success/error). */
  onClose: () => void;
}

const ACTIVITY_LABEL: Record<'theory' | 'flashcards' | 'quiz', string> = {
  theory: 'theory',
  flashcards: 'flashcards',
  quiz: 'quiz',
};

function statusToPose(status: PathGenerationStatus): MascotPose {
  if (status === 'ready') return 'graduation';
  if (status === 'failed') return 'thinking';
  return 'holding-wand';
}

// Count checkpoints that GENUINELY failed to generate. `incompleteGeneration`
// is already pruned-aware (path-gating) — intentionally-pruned activities are
// not failures, so a deliberately-tight path reports zero here.
function countIncompleteSlots(plan: unknown): number {
  const p = plan as SerializedPath | null;
  if (!p?.phases) return 0;
  let n = 0;
  for (const phase of p.phases) {
    for (const slot of phase.slots ?? []) {
      if (slot.incompleteGeneration) n += 1;
    }
  }
  return n;
}

export default function GenerationProgressModal({
  planId,
  initialTitle,
  onRunInBackground,
  onClose,
}: GenerationProgressModalProps) {
  const stream = usePathGenerationStream(planId, true);
  const [oneShot, setOneShot] = useState<MascotOneShot | null>(null);
  const [structure, setStructure] = useState<PlanStructure | null>(null);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState<string | null>(null);

  // Initial fetch of the plan's section/slot skeleton so we can render
  // per-section progress dots. The SSE only carries totals + current
  // slot, not the structure.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/learn/paths/${encodeURIComponent(planId)}`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && json.data) {
          const data = json.data as SerializedPath;
          setStructure({
            title: data.title,
            phases: (data.phases ?? []).map((p) => ({
              id: p.id,
              title: p.title,
              slotIds: (p.slots ?? []).map((s) => s.id),
            })),
            totalSlots: (data.phases ?? []).reduce(
              (n, p) => n + (p.slots?.length ?? 0),
              0,
            ),
          });
        }
      } catch {
        /* structure is optional — the modal still shows overall progress */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [planId]);

  // Fire a celebratory `cast` sparkle whenever a slot completes. The
  // SSE reports `completedSlots`; we watch it for forward jumps.
  const completedSlots = stream.progress?.completedSlots ?? 0;
  useEffect(() => {
    if (completedSlots === 0) return;
    setOneShot('sparkle');
  }, [completedSlots]);

  const onRetry = async () => {
    setRetrying(true);
    setRetryError(null);
    try {
      const res = await fetch(
        `/api/learn/paths/${encodeURIComponent(planId)}/regenerate`,
        { method: 'POST' },
      );
      const json = await res.json();
      if (!json?.success) {
        setRetryError(json?.error ?? 'Could not retry generation.');
      }
    } catch {
      setRetryError('Network error. Try again.');
    }
    setRetrying(false);
  };

  const total = stream.progress?.totalSlots ?? structure?.totalSlots ?? 0;
  const done = stream.progress?.completedSlots ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const currentSlot = stream.progress?.currentSlot;
  const currentActivity = stream.progress?.currentActivity;

  const isReady = stream.status === 'ready';
  const isFailed = stream.status === 'failed';
  const isWorking = !isReady && !isFailed;
  // Honest completion: the path finished, but some checkpoints genuinely
  // failed. Derived from the delivered plan tree, so it's accurate the moment
  // the `done` event arrives. A clean path reports 0 → the celebratory branch.
  const incompleteCount = stream.plan ? countIncompleteSlots(stream.plan) : 0;
  const isPartial = isReady && incompleteCount > 0;

  const planTitle = (stream.plan as SerializedPath | null)?.title ?? structure?.title ?? initialTitle;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Generating your path"
      onClick={isReady || isFailed ? onClose : undefined}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1100,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        padding: '20px',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '520px',
          maxWidth: '95vw',
          maxHeight: '88vh',
          overflowY: 'auto',
          background: 'var(--surface-container)',
          color: 'var(--on-surface)',
          borderRadius: 'var(--radius-xl)',
          border: '1px solid var(--outline-variant)',
          padding: '32px 28px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '20px',
        }}
      >
        <Mascot
          pose={isPartial ? 'thinking' : statusToPose(stream.status)}
          size="md"
          idle={isWorking ? 'sway' : 'none'}
          oneShot={oneShot}
          onOneShotEnd={() => setOneShot(null)}
        />

        <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--font-display)',
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--on-surface)',
              letterSpacing: '-0.01em',
            }}
          >
            {isReady
              ? isPartial
                ? `Path ready, ${incompleteCount} to retry`
                : 'Your path is ready!'
              : isFailed
                ? 'Generation hit a snag'
                : 'Building your path…'}
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: '14px',
              color: 'var(--on-surface-variant)',
              lineHeight: 1.5,
            }}
          >
            {isReady
              ? isPartial
                ? `${incompleteCount} checkpoint${incompleteCount === 1 ? '' : 's'} couldn't generate. The rest is ready — retry the gaps now or later.`
                : planTitle
              : isFailed
                ? stream.errorMessage ?? 'Something went wrong. Try again.'
                : currentSlot && currentActivity
                  ? `Writing ${ACTIVITY_LABEL[currentActivity]} for "${currentSlot.title}"…`
                  : 'Designing sections and checkpoints…'}
          </p>
        </div>

        <ProgressBar percent={percent} status={stream.status} total={total} done={done} />

        {structure && structure.phases.length > 0 && (
          <SectionProgress
            phases={structure.phases}
            currentSlotId={currentSlot?.id ?? null}
            progress={stream.progress}
          />
        )}

        {(isFailed || isPartial) && retryError && (
          <p
            role="alert"
            style={{
              margin: 0,
              fontSize: '13px',
              color: 'var(--error)',
              textAlign: 'center',
            }}
          >
            {retryError}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            gap: '10px',
            flexWrap: 'wrap',
            justifyContent: 'center',
            marginTop: '4px',
          }}
        >
          {isReady ? (
            <>
              <Link
                href={`/learn/paths/${encodeURIComponent(planId)}`}
                style={primaryButtonStyle}
                onClick={onClose}
              >
                Start learning →
              </Link>
              {isPartial ? (
                <button
                  type="button"
                  onClick={onRetry}
                  disabled={retrying}
                  style={{ ...secondaryButtonStyle, opacity: retrying ? 0.6 : 1 }}
                >
                  {retrying ? 'Retrying…' : `Retry ${incompleteCount}`}
                </button>
              ) : null}
            </>
          ) : isFailed ? (
            <button
              type="button"
              onClick={onRetry}
              disabled={retrying}
              style={{ ...primaryButtonStyle, opacity: retrying ? 0.6 : 1 }}
            >
              {retrying ? 'Retrying…' : 'Try again'}
            </button>
          ) : (
            <button type="button" onClick={onRunInBackground} style={secondaryButtonStyle}>
              Run in background
            </button>
          )}
          {(isReady || isFailed) && (
            <button type="button" onClick={onClose} style={ghostButtonStyle}>
              Close
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressBar({
  percent,
  status,
  total,
  done,
}: {
  percent: number;
  status: PathGenerationStatus;
  total: number;
  done: number;
}) {
  return (
    <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '6px' }}>
      <div
        aria-hidden
        style={{
          width: '100%',
          height: '8px',
          background: 'var(--surface-container-high)',
          borderRadius: '999px',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            transform: `scaleX(${status === 'failed' ? 1 : percent / 100})`,
            transformOrigin: 'left',
            background: status === 'failed' ? 'var(--error)' : 'var(--primary)',
            borderRadius: '999px',
            transition: 'transform 0.35s cubic-bezier(0.22,1,0.36,1)',
          }}
        />
      </div>
      <p
        style={{
          margin: 0,
          fontSize: '12px',
          color: 'var(--on-surface-variant)',
          textAlign: 'center',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {total > 0 ? `${done} / ${total} slots` : 'Designing structure…'}
      </p>
    </div>
  );
}

function SectionProgress({
  phases,
  currentSlotId,
  progress,
}: {
  phases: PlanStructure['phases'];
  currentSlotId: string | null;
  progress: PathGenerationProgress | null;
}) {
  // We don't get per-section completion counts from the SSE — only
  // totals + current slot. Derive section progress by counting how
  // many slot ids in each section appear at-or-before the current
  // slot in the flat order.
  const flatSlotIds = phases.flatMap((p) => p.slotIds);
  const currentIdx = currentSlotId ? flatSlotIds.indexOf(currentSlotId) : -1;
  // If there's no current slot but we have a completedSlots count, fall
  // back to that.
  const completedFlat = progress?.completedSlots ?? Math.max(0, currentIdx);

  return (
    <ul
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        width: '100%',
        display: 'flex',
        flexDirection: 'column',
        gap: '8px',
      }}
    >
      {phases.map((phase, idx) => {
        const phaseStart = phases
          .slice(0, idx)
          .reduce((n, p) => n + p.slotIds.length, 0);
        const phaseEnd = phaseStart + phase.slotIds.length;
        const doneInPhase = Math.max(
          0,
          Math.min(phase.slotIds.length, completedFlat - phaseStart),
        );
        const isActivePhase = currentIdx >= phaseStart && currentIdx < phaseEnd;
        const isDonePhase = doneInPhase === phase.slotIds.length && phase.slotIds.length > 0;
        return (
          <li
            key={phase.id}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '12px',
              padding: '10px 12px',
              background: isActivePhase
                ? 'var(--surface-container-high)'
                : 'var(--surface-container-low)',
              borderRadius: 'var(--radius-md)',
              border: `1px solid ${
                isActivePhase ? 'var(--outline)' : 'var(--outline-variant)'
              }`,
            }}
          >
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'var(--on-surface)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              Section {idx + 1} — {phase.title}
            </span>
            <span
              style={{
                fontSize: '12px',
                color: isDonePhase
                  ? 'var(--primary)'
                  : 'var(--on-surface-variant)',
                fontVariantNumeric: 'tabular-nums',
                flexShrink: 0,
              }}
            >
              {doneInPhase}/{phase.slotIds.length}
              {isDonePhase ? ' ✓' : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const primaryButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 18px',
  background: 'var(--primary)',
  color: 'var(--on-primary)',
  border: 'none',
  borderRadius: 'var(--radius-full)',
  fontSize: '14px',
  fontWeight: 700,
  cursor: 'pointer',
  textDecoration: 'none',
  fontFamily: 'inherit',
};

const secondaryButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: 'var(--surface-container-high)',
  color: 'var(--on-surface)',
  border: '1px solid var(--outline-variant)',
};

const ghostButtonStyle: React.CSSProperties = {
  ...primaryButtonStyle,
  background: 'transparent',
  color: 'var(--on-surface-variant)',
  border: '1px solid var(--outline-variant)',
};
