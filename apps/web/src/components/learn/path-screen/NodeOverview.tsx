'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import type { PathActivity, PathSlot } from '@/components/learn/PathView';
import { trackEvent } from '@/lib/telemetry';
import {
  AskMageCard,
  MsIcon,
  ProgressBar,
  type ScreenPlan,
  activityMeta,
  missionStateFor,
  nextActivity,
  nodeBadgeLabel,
  sourceName,
} from './helpers';
import styles from './PathScreen.module.css';

/* Node-overview web screen — Figma 186:2. The dedicated page for one node
   (slot), opened from the path when ?slot=<id> is set (no ?activity). Lists
   the node's real activities as "missions"; the current task's Go button +
   each mission card call onSelectActivity, which the route turns into
   ?activity=<id> and launches the existing theory / flashcard / quiz viewer.
   Replaces CheckpointDrawer — same contract, full-screen layout. */

interface Props {
  slot: PathSlot;
  plan: ScreenPlan;
  /** Launch / pop an activity by id (null pops back). */
  onSelectActivity: (activityId: string | null) => void;
  /** Clear ?slot — return to the path. */
  onBack: () => void;
}

const KIND_DESC: Record<string, string> = {
  theory: 'Read the explanation for this node, then you’re set.',
  flashcards: 'Flip through the key cards to lock in the ideas.',
  quiz: 'Answer a few questions to prove you’ve got it.',
};

export default function NodeOverview({ slot, plan, onSelectActivity, onBack }: Props) {
  const section = plan.phases.find((ph) => ph.slots.some((s) => s.id === slot.id)) ?? null;
  const missions = missionStateFor(slot.activities);
  const done = missions.filter((m) => m.state === 'done').length;
  const total = missions.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  const next = nextActivity(slot);
  const nextIndex = next ? slot.activities.findIndex((a) => a.id === next.id) : -1;

  const isGraded = slot.kind === 'assessment' || slot.kind === 'final_exam';
  const weak = isGraded && slot.bestPercentage != null && slot.bestPercentage < 70;
  // Retaking a checkpoint should always relaunch its quiz, even if some other
  // activity happens to be the first-incomplete one.
  const retakeActivity = slot.activities.find((a) => a.kind === 'quiz') ?? next;

  useEffect(() => {
    trackEvent('path.slot.opened', { slotId: slot.id, slotKind: slot.kind });
  }, [slot.id, slot.kind]);

  // Esc returns to the path, matching the old drawer affordance.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onBack();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        <header className={styles.nodeHead}>
          <div style={{ minWidth: 0 }}>
            <nav className={styles.crumbs} aria-label="Breadcrumb">
              <Link href="/my-path" className={styles.crumbLink}>
                Paths
              </Link>
              <span className={styles.crumbSep} aria-hidden>
                ›
              </span>
              <button type="button" className={styles.crumbLink} onClick={onBack}>
                {plan.title}
              </button>
              {section ? (
                <>
                  <span className={styles.crumbSep} aria-hidden>
                    ›
                  </span>
                  <span className={styles.crumbHere}>{section.title}</span>
                </>
              ) : null}
            </nav>
            <div style={{ marginTop: 12 }}>
              <span className={styles.coreBadge}>{nodeBadgeLabel(slot.kind)}</span>
            </div>
            <h1 className={styles.nodeTitle}>{slot.title}</h1>
            {slot.description ? <p className={styles.nodeSub}>{slot.description}</p> : null}
          </div>
          <button type="button" className={styles.backPill} onClick={onBack}>
            <MsIcon name="chevron_left" size={18} />
            Back to path
          </button>
        </header>

        <div className={styles.nodeProgress}>
          <div className={styles.nodeProgRow}>
            <span className={styles.nodeProgLabel}>
              {done} of {total} {total === 1 ? 'mission' : 'missions'}
            </span>
            <span className={styles.nodeProgPct}>{pct}%</span>
          </div>
          <ProgressBar pct={pct} className={styles.nodeProgBar} />
        </div>

        {total === 0 ? (
          <PendingHero />
        ) : next ? (
          <CurrentTask
            activity={next}
            index={nextIndex}
            total={total}
            sourceLabel={sourceName(plan)}
            onGo={() => onSelectActivity(next.id)}
          />
        ) : (
          <CompletedHero onBack={onBack} />
        )}

        <p className={styles.missionsLabel}>Missions in this node</p>
        <div className={styles.missionGrid}>
          {missions.map(({ activity, state }) => (
            <MissionCard
              key={activity.id}
              activity={activity}
              state={state}
              onOpen={() => onSelectActivity(activity.id)}
            />
          ))}
        </div>

        {weak ? (
          <div className={styles.weakCard}>
            <span className={styles.weakIcon}>
              <MsIcon name="priority_high" size={18} />
            </span>
            <div className={styles.weakText}>
              <p className={styles.weakTitle}>Weak points in this node</p>
              <p className={styles.weakSub}>
                You scored {Math.round(slot.bestPercentage as number)}% — retake to push past the
                pass mark.
              </p>
            </div>
            {retakeActivity ? (
              <button
                type="button"
                className={styles.weakBtn}
                onClick={() => onSelectActivity(retakeActivity.id)}
              >
                Retake
              </button>
            ) : null}
          </div>
        ) : null}
      </div>

      <aside className={styles.rail}>
        <section className={styles.railCard} aria-label="This node">
          <div className={styles.railHeadRow}>
            <h3 className={styles.railTitle}>This node</h3>
            <span className={styles.railPct}>{pct}%</span>
          </div>
          <p className={styles.railProgLabel}>
            {done} of {total} {total === 1 ? 'mission' : 'missions'}
          </p>
          <div style={{ marginTop: 10 }}>
            <ProgressBar pct={pct} />
          </div>
          <div className={styles.upNext}>
            <MsIcon name={total === 0 ? 'hourglass_top' : next ? 'play_arrow' : 'check_circle'} size={16} />
            {total === 0
              ? 'Content pending'
              : next
                ? `Up next · ${activityMeta(next.kind).label}`
                : 'All missions done'}
          </div>
        </section>

        <section className={styles.railCard} aria-label="Sources">
          <h3 className={styles.railTitle}>Sources</h3>
          <p className={styles.railSub}>What this node is built from</p>
          <div className={styles.sourceRow}>
            <span className={styles.sourceRowIcon}>
              <MsIcon name="description" size={18} />
            </span>
            <div className={styles.sourceRowText}>
              <div className={styles.sourceRowName}>{sourceName(plan)}</div>
              <div className={styles.sourceRowMeta}>This path’s source material</div>
            </div>
          </div>
        </section>

        <AskMageCard desc="Stuck on this node? Ask Mage anything." />
      </aside>
    </div>
  );
}

// ── current-task hero ───────────────────────────────────────────────

function CurrentTask({
  activity,
  index,
  total,
  sourceLabel,
  onGo,
}: {
  activity: PathActivity;
  index: number;
  total: number;
  sourceLabel: string;
  onGo: () => void;
}) {
  const meta = activityMeta(activity.kind);
  return (
    <div className={styles.taskHero}>
      <div className={styles.taskLeft}>
        <span className={styles.taskKicker}>Current task</span>
        <div className={styles.taskTitleRow}>
          <span className={styles.taskPlay}>
            <MsIcon name={meta.icon} size={22} />
          </span>
          <h2 className={styles.taskTitle}>{meta.label}</h2>
        </div>
        <p className={styles.taskMeta}>
          Mission {index + 1} of {total}
        </p>
        <p className={styles.taskDesc}>{KIND_DESC[activity.kind] ?? 'Open this mission to continue.'}</p>
        <span className={styles.sourceChip}>
          <MsIcon name="description" size={14} />
          From {sourceLabel}
        </span>
      </div>
      <div className={styles.taskDivider} aria-hidden />
      <div className={styles.taskRight}>
        <button type="button" className={styles.heroGo} onClick={onGo}>
          Go
          <MsIcon name="arrow_forward" size={18} />
        </button>
        <span className={styles.heroCaption}>{meta.label} · interactive</span>
      </div>
    </div>
  );
}

function CompletedHero({ onBack }: { onBack: () => void }) {
  return (
    <div className={styles.taskHero}>
      <div className={styles.taskLeft}>
        <span className={styles.taskKicker} style={{ color: 'var(--green-ink)' }}>
          Node complete
        </span>
        <div className={styles.taskTitleRow}>
          <span className={styles.taskPlay} style={{ background: 'var(--green-soft)', color: 'var(--green-ink)' }}>
            <MsIcon name="check" size={22} />
          </span>
          <h2 className={styles.taskTitle}>Every mission done</h2>
        </div>
        <p className={styles.taskDesc}>
          You’ve finished this node. Revisit any mission below, or head back to your path.
        </p>
      </div>
      <div className={styles.taskDivider} aria-hidden />
      <div className={styles.taskRight}>
        <button type="button" className={styles.heroGo} onClick={onBack} aria-label="Back to your path">
          <MsIcon name="route" size={18} />
          Path
        </button>
        <span className={styles.heroCaption}>Back to your path</span>
      </div>
    </div>
  );
}

// Shown when a node's activities haven't generated yet (incompleteGeneration).
function PendingHero() {
  return (
    <div className={styles.taskHero} style={{ borderColor: 'var(--amber-line)' }}>
      <div className={styles.taskLeft}>
        <span className={styles.taskKicker} style={{ color: 'var(--amber-ink)' }}>
          Content pending
        </span>
        <div className={styles.taskTitleRow}>
          <span
            className={styles.taskPlay}
            style={{ background: 'var(--amber-soft)', color: 'var(--amber-ink)' }}
          >
            <MsIcon name="hourglass_top" size={22} />
          </span>
          <h2 className={styles.taskTitle}>No missions yet</h2>
        </div>
        <p className={styles.taskDesc}>
          This node’s content is still being generated. Head back to your path and regenerate it if
          it doesn’t appear shortly.
        </p>
      </div>
    </div>
  );
}

// ── mission card ────────────────────────────────────────────────────

function MissionCard({
  activity,
  state,
  onOpen,
}: {
  activity: PathActivity;
  state: 'done' | 'now' | 'todo';
  onOpen: () => void;
}) {
  const meta = activityMeta(activity.kind);
  return (
    <button
      type="button"
      className={`${styles.missionCard} ${state === 'now' ? styles.missionCardNow : ''}`}
      aria-current={state === 'now' ? 'step' : undefined}
      onClick={onOpen}
    >
      <span
        className={`${styles.missionIcon} ${
          state === 'done' ? styles.missionIconDone : state === 'now' ? styles.missionIconNow : styles.missionIconLocked
        }`}
      >
        <MsIcon name={state === 'done' ? 'check' : meta.icon} size={20} />
      </span>
      <div style={{ minWidth: 0 }}>
        <div className={styles.missionName}>{meta.label}</div>
        <div
          className={`${styles.missionState} ${
            state === 'done' ? styles.missionStateDone : state === 'now' ? styles.missionStateNow : ''
          }`}
        >
          {state === 'done' ? 'Done' : state === 'now' ? 'Now' : 'Up next'}
        </div>
      </div>
    </button>
  );
}
