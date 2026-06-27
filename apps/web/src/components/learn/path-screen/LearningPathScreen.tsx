'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import type { PathPhase, PathSlot } from '@/components/learn/PathView';
import { UltraBadge } from '@/components/learn/UltraBadge';
import { derivePathStats } from '@/lib/path-stats';
import { bestGrade, sectionAverageGrade } from '@/lib/path-gating';
import {
  AskMageCard,
  MsIcon,
  ProgressBar,
  type NodeState,
  type ScreenPlan,
  type SectionState,
  activityMeta,
  finalExamSlot,
  missionStateFor,
  nodeBadgeLabel,
  nodeIcon,
  nodeStateFor,
  sectionStateFor,
  sourceName,
} from './helpers';
import styles from './PathScreen.module.css';

/* Learning-path "Core Experience" web screen — Figma 161:2, wired to the
   learner's real path. Sections = phases, nodes = slots, missions =
   activities. Renders inside AppShell (warm palette). Clicking an unlocked
   node calls onSlotClick, which the route turns into ?slot=<id> → the
   node-overview screen. */

interface Props {
  plan: ScreenPlan;
  onSlotClick: (slot: PathSlot) => void;
  /** Optional generating / incomplete banner injected by the route. */
  banner?: ReactNode;
}

export default function LearningPathScreen({ plan, onSlotClick, banner }: Props) {
  const stats = derivePathStats(plan);
  const hasFinalExam = plan.phases.some((ph) => finalExamSlot(ph));

  return (
    <>
      {banner}

      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link href="/my-path" className={styles.crumbLink}>
          Paths
        </Link>
        <span className={styles.crumbSep} aria-hidden>
          ›
        </span>
        <span className={styles.crumbHere}>{plan.title}</span>
      </nav>

      <div className={styles.pathHead}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <h1 className={styles.pathTitle}>{plan.title}</h1>
            {plan.ultra && <UltraBadge />}
          </div>
          <p className={styles.pathSub}>
            Generated from {sourceName(plan)} · {plan.phases.length}{' '}
            {plan.phases.length === 1 ? 'section' : 'sections'}
            {hasFinalExam ? ' · 1 final exam' : ''}
          </p>
        </div>
        <span className={styles.overallPill}>
          Overall <b>{stats.progressPct}%</b>
        </span>
      </div>

      <div className={styles.layout}>
        <div className={styles.main}>
          {plan.phases.length === 0 ? (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>Mage is building this path…</div>
              <p className={styles.emptyText}>Sections appear here as they finish generating.</p>
            </div>
          ) : (
            <div className={styles.sectionStack}>
              {plan.phases.map((phase, i) => (
                <SectionZone
                  key={phase.id}
                  phase={phase}
                  index={i}
                  nextSectionTitle={plan.phases[i + 1]?.title ?? null}
                  onSlotClick={onSlotClick}
                />
              ))}
            </div>
          )}
        </div>

        <aside className={styles.rail}>
          <YourPathCard plan={plan} pct={stats.progressPct} />
          <ReviewQueueCard weakCount={stats.weakCheckpoints.length} />
          <AskMageCard desc="Stuck on this path? Mage explains with your own sources." />
        </aside>
      </div>
    </>
  );
}

// ── section zone ────────────────────────────────────────────────────

function SectionZone({
  phase,
  index,
  nextSectionTitle,
  onSlotClick,
}: {
  phase: PathPhase;
  index: number;
  nextSectionTitle: string | null;
  onSlotClick: (slot: PathSlot) => void;
}) {
  // Collapse state for completed / locked sections (the current zone is always
  // expanded). The hook stays above the exam early-return so it runs every time.
  const [open, setOpen] = useState(false);

  const exam = finalExamSlot(phase);
  if (exam) return <ExamMedallion slot={exam} onSlotClick={onSlotClick} />;

  const state = sectionStateFor(phase);
  const coreNodes = phase.slots.filter((s) => s.kind === 'learning' || s.kind === 'review');
  // The trail/row shows the core nodes plus any gate rendered inline as a gold
  // shield (passed gates, and locked gates). An actionable pending gate
  // (unlocked, not yet passed) becomes a gate CARD beside the current node.
  const trailSlots = phase.slots.filter(
    (s) =>
      s.kind === 'learning' ||
      s.kind === 'review' ||
      (s.kind === 'assessment' && (s.completed || !s.unlocked)),
  );
  const gateCards = phase.slots.filter((s) => s.kind === 'assessment' && s.unlocked && !s.completed);
  const activeNode = coreNodes.find((s) => s.isActive) ?? null;
  const doneCount = coreNodes.filter((s) => s.completed).length;

  const sectionCls =
    state === 'current'
      ? `${styles.section} ${styles.sectionCurrent}`
      : state === 'locked'
        ? `${styles.section} ${styles.sectionLocked}`
        : styles.section;

  const status =
    state === 'locked'
      ? 'Locked — pass the previous checkpoint to unlock'
      : state === 'done'
        ? `Completed · ${coreNodes.length} ${coreNodes.length === 1 ? 'node' : 'nodes'}`
        : `In progress · ${doneCount} of ${coreNodes.length} done`;

  const headInner = (
    <>
      <span
        className={`${styles.secNum} ${
          state === 'done'
            ? styles.secNumDone
            : state === 'current'
              ? styles.secNumCurrent
              : styles.secNumLocked
        }`}
      >
        {state === 'done' ? <MsIcon name="check" size={18} /> : index + 1}
      </span>
      <div className={styles.secText}>
        <h2 className={styles.secTitle}>{phase.title}</h2>
        <p className={styles.secStatus}>{status}</p>
      </div>
      <SectionBadge phase={phase} state={state} />
    </>
  );

  // CURRENT — always-expanded two-column study zone (vertical trail + side card).
  if (state === 'current') {
    return (
      <section className={sectionCls} aria-label={phase.title}>
        <div className={styles.sectionHead}>{headInner}</div>
        <div className={styles.curBody}>
          <div className={styles.trailCol}>
            {trailSlots.length > 0 ? <NodeTrail slots={trailSlots} onSlotClick={onSlotClick} /> : null}
          </div>
          <div className={styles.sideCol}>
            {activeNode ? <NodeHub slot={activeNode} onSlotClick={onSlotClick} /> : null}
            {gateCards.map((slot) => (
              <GateCard key={slot.id} slot={slot} nextSectionTitle={nextSectionTitle} onSlotClick={onSlotClick} />
            ))}
          </div>
        </div>
      </section>
    );
  }

  // COMPLETED / LOCKED — collapsible, compact horizontal row (collapsed by default).
  return (
    <section className={sectionCls} aria-label={phase.title}>
      <button
        type="button"
        className={styles.sectionHeadBtn}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        {headInner}
        <span className={styles.chevron} data-open={open} aria-hidden>
          <MsIcon name="expand_more" size={22} />
        </span>
      </button>
      {open && trailSlots.length > 0 ? <HRow slots={trailSlots} onSlotClick={onSlotClick} /> : null}
    </section>
  );
}

// Compact horizontal node row — the collapsed/expanded body of a completed or
// locked section (tiles + labels beneath, scrolls sideways when there are many).
function HRow({ slots, onSlotClick }: { slots: PathSlot[]; onSlotClick: (slot: PathSlot) => void }) {
  return (
    <div className={styles.hRow}>
      {slots.map((slot, i) => {
        const state = nodeStateFor(slot);
        const isGate = slot.kind === 'assessment';
        return (
          <div className={styles.hWrap} key={slot.id}>
            <div className={styles.hNode}>
              <NodeTileButton slot={slot} onSlotClick={onSlotClick} />
              <span className={`${styles.hLabel} ${state === 'locked' ? styles.hLabelMuted : ''}`}>
                {slot.title}
              </span>
              {isGate && state === 'completed' && slot.starsEarned > 0 ? (
                <span className={styles.trailStars} aria-label={`${slot.starsEarned} of 3 stars`}>
                  {[0, 1, 2].map((s) => (
                    <MsIcon key={s} name={s < slot.starsEarned ? 'star' : 'star_outline'} size={12} />
                  ))}
                </span>
              ) : null}
            </div>
            {i < slots.length - 1 ? (
              <span className={`${styles.hConn} ${slot.completed ? styles.hConnDone : ''}`} aria-hidden />
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SectionBadge({ phase, state }: { phase: PathPhase; state: SectionState }) {
  if (state === 'locked') {
    return (
      <span className={`${styles.secBadge} ${styles.secBadgeLocked}`}>
        <MsIcon name="lock" size={13} /> Locked
      </span>
    );
  }
  if (state === 'current') {
    return <span className={`${styles.secBadge} ${styles.secBadgeCurrent}`}>Current</span>;
  }
  // done — surface the section's average grade across its graded slots.
  const avg = sectionAverageGrade(phase.slots);
  if (avg) {
    return <span className={`${styles.secBadge} ${styles.secBadgeGrade}`}>Grade {avg.letter}</span>;
  }
  return (
    <span className={`${styles.secBadge} ${styles.secBadgeDone}`}>
      <MsIcon name="check" size={13} /> Done
    </span>
  );
}

// Vertical winding trail of node tiles down the left of a section, each with
// its title + status beside it (matches the Figma "study zone", and scales to
// sections with many nodes where a horizontal row would overflow).
function NodeTrail({ slots, onSlotClick }: { slots: PathSlot[]; onSlotClick: (slot: PathSlot) => void }) {
  return (
    <ol className={styles.trail}>
      {slots.map((slot) => {
        const state = nodeStateFor(slot);
        const isGate = slot.kind === 'assessment';
        return (
          <li
            key={slot.id}
            className={`${styles.trailItem} ${slot.completed ? styles.trailItemDone : ''}`}
          >
            <div className={styles.trailTileWrap}>
              <NodeTileButton slot={slot} onSlotClick={onSlotClick} />
            </div>
            <div className={styles.trailContent}>
              <div className={styles.trailLabelRow}>
                <span className={`${styles.trailLabel} ${state === 'locked' ? styles.trailLabelMuted : ''}`}>
                  {slot.title}
                </span>
                {state === 'active' ? <span className={styles.startPill}>START</span> : null}
              </div>
              <span className={styles.trailSub}>{trailSubLabel(slot, state, isGate)}</span>
              {isGate && state === 'completed' && slot.starsEarned > 0 ? (
                <span className={styles.trailStars} aria-label={`${slot.starsEarned} of 3 stars`}>
                  {[0, 1, 2].map((i) => (
                    <MsIcon key={i} name={i < slot.starsEarned ? 'star' : 'star_outline'} size={14} />
                  ))}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function trailSubLabel(slot: PathSlot, state: NodeState, isGate: boolean): string {
  if (isGate) {
    if (state === 'completed') {
      const g = bestGrade(slot.bestPercentage, slot.starsEarned);
      return g ? `Checkpoint · Passed · Grade ${g}` : 'Checkpoint · Passed';
    }
    return state === 'locked' ? 'Checkpoint · Locked' : 'Checkpoint';
  }
  if (state === 'completed') return 'Completed';
  if (state === 'active') return 'Continue here';
  if (state === 'locked') return 'Locked';
  return 'Up next';
}

function NodeTileButton({ slot, onSlotClick }: { slot: PathSlot; onSlotClick: (slot: PathSlot) => void }) {
  const state = nodeStateFor(slot);
  const isGate = slot.kind === 'assessment';
  const disabled = !slot.unlocked;

  let tileCls: string;
  let icon: string;
  if (isGate) {
    tileCls =
      state === 'locked'
        ? `${styles.nodeTile} ${styles.nodeGateLocked}`
        : `${styles.nodeTile} ${styles.nodeGate}`;
    icon = state === 'completed' ? 'verified' : state === 'locked' ? 'lock' : 'workspace_premium';
  } else {
    tileCls =
      state === 'completed'
        ? `${styles.nodeTile} ${styles.nodeDone}`
        : state === 'active'
          ? `${styles.nodeTile} ${styles.nodeActive}`
          : state === 'locked'
            ? `${styles.nodeTile} ${styles.nodeLocked}`
            : styles.nodeTile;
    icon = nodeIcon(slot, state);
  }

  return (
    <button
      type="button"
      className={`${tileCls} learn-path-node`}
      onClick={() => !disabled && onSlotClick(slot)}
      disabled={disabled}
      aria-disabled={disabled || undefined}
      aria-label={slot.title}
      data-active-slot={state === 'active' ? 'true' : undefined}
    >
      <MsIcon name={icon} size={24} />
    </button>
  );
}

// ── current-node hub preview ────────────────────────────────────────

function NodeHub({ slot, onSlotClick }: { slot: PathSlot; onSlotClick: (slot: PathSlot) => void }) {
  const missions = missionStateFor(slot.activities);
  const done = missions.filter((m) => m.state === 'done').length;
  const total = missions.length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className={styles.hub}>
      <div className={styles.hubHead}>
        <span className={styles.hubBadge}>{nodeBadgeLabel(slot.kind)}</span>
      </div>
      <h3 className={styles.hubTitle}>{slot.title}</h3>
      {slot.description ? <p className={styles.hubSub}>{slot.description}</p> : null}

      <div className={styles.hubProgRow}>
        <span className={styles.hubProgLabel}>
          {done} of {total} {total === 1 ? 'mission' : 'missions'} complete
        </span>
        <ProgressBar pct={pct} />
      </div>

      <div className={styles.miniList}>
        {missions.map(({ activity, state }) => {
          const meta = activityMeta(activity.kind);
          return (
            <div className={styles.miniItem} key={activity.id}>
              <span
                className={`${styles.miniDot} ${
                  state === 'done' ? styles.miniDotDone : state === 'todo' ? styles.miniDotLocked : ''
                }`}
              >
                <MsIcon name={state === 'done' ? 'check' : meta.icon} size={14} />
              </span>
              <span className={styles.miniLabel}>{meta.label}</span>
              <span
                className={`${styles.miniState} ${
                  state === 'done' ? styles.miniStateDone : state === 'now' ? styles.miniStateNow : ''
                }`}
              >
                {state === 'done' ? 'Done' : state === 'now' ? 'Next' : 'To do'}
              </span>
            </div>
          );
        })}
      </div>

      <div className={styles.hubFoot}>
        <button type="button" className={styles.pillBtn} onClick={() => onSlotClick(slot)}>
          Continue node
          <MsIcon name="arrow_forward" size={16} />
        </button>
        <button type="button" className={styles.hubSources} onClick={() => onSlotClick(slot)}>
          <MsIcon name="description" size={15} />
          View sources
        </button>
      </div>
    </div>
  );
}

// ── gate (assessment) card ──────────────────────────────────────────

function GateCard({
  slot,
  nextSectionTitle,
  onSlotClick,
}: {
  slot: PathSlot;
  nextSectionTitle: string | null;
  onSlotClick: (slot: PathSlot) => void;
}) {
  const passed = slot.completed;
  const locked = !slot.unlocked;
  const grade = bestGrade(slot.bestPercentage, slot.starsEarned);

  const sub = passed
    ? `Passed${grade ? ` · Grade ${grade}` : ''}`
    : locked
      ? 'Finish the nodes above to unlock'
      : nextSectionTitle
        ? `Pass to unlock ${nextSectionTitle}`
        : 'Clear this checkpoint to finish the section';

  return (
    <div className={styles.gateCard} data-active-slot={slot.isActive ? 'true' : undefined}>
      <span className={`${styles.gateShield} ${locked && !passed ? styles.gateShieldLocked : ''}`}>
        <MsIcon name={passed ? 'verified' : locked ? 'lock' : 'workspace_premium'} size={22} />
      </span>
      <div className={styles.gateText}>
        <p className={styles.gateTitle}>{slot.title}</p>
        <p className={styles.gateSub}>{sub}</p>
      </div>
      <div className={styles.gateAction}>
        {passed && slot.starsEarned > 0 ? (
          <span className={styles.gradePill} aria-label={`${slot.starsEarned} of 3 stars`}>
            {[0, 1, 2].map((i) => (
              <MsIcon key={i} name={i < slot.starsEarned ? 'star' : 'star_outline'} size={15} />
            ))}
          </span>
        ) : !locked && !passed ? (
          <button type="button" className={`${styles.pillBtn} ${styles.pillBtnGold}`} onClick={() => onSlotClick(slot)}>
            Take checkpoint
          </button>
        ) : null}
      </div>
    </div>
  );
}

// ── final-exam medallion ────────────────────────────────────────────

function ExamMedallion({ slot, onSlotClick }: { slot: PathSlot; onSlotClick: (slot: PathSlot) => void }) {
  const passed = slot.completed;
  const locked = !slot.unlocked;
  const grade = bestGrade(slot.bestPercentage, slot.starsEarned);

  return (
    <section className={`${styles.examSection} ${locked && !passed ? styles.examLocked : ''}`} aria-label={slot.title}>
      <span className={`${styles.examMedal} ${locked && !passed ? styles.examMedalLocked : ''}`}>
        <MsIcon name="school" size={32} />
      </span>
      <div className={styles.examBody}>
        <span className={styles.examKicker}>Final exam</span>
        <h2 className={styles.examTitle}>{slot.title}</h2>
        <p className={styles.examSub}>
          {passed
            ? `Passed${grade ? ` · Grade ${grade}` : ''} — graduate anytime`
            : locked
              ? 'Finish every section to unlock your final exam'
              : 'You’re ready — take the final exam to graduate'}
        </p>
      </div>
      {passed ? (
        <span className={styles.gradePill} aria-hidden>
          <MsIcon name="workspace_premium" size={22} />
        </span>
      ) : locked ? (
        <span className={styles.lockedPill}>
          <MsIcon name="lock" size={14} /> Locked
        </span>
      ) : (
        <button type="button" className={`${styles.pillBtn} ${styles.pillBtnGold}`} onClick={() => onSlotClick(slot)}>
          Start exam
          <MsIcon name="arrow_forward" size={16} />
        </button>
      )}
    </section>
  );
}

// ── right rail ──────────────────────────────────────────────────────

function YourPathCard({ plan, pct }: { plan: ScreenPlan; pct: number }) {
  return (
    <section className={styles.railCard} aria-label="Your path progress">
      <h3 className={styles.railTitle}>Your path</h3>
      <div className={styles.railStat}>{pct}%</div>
      <p className={styles.railProgLabel}>complete</p>
      <div style={{ marginTop: 12 }}>
        <ProgressBar pct={pct} />
      </div>
      <div className={styles.railList}>
        {plan.phases.map((phase) => {
          const exam = finalExamSlot(phase);
          const state = exam
            ? exam.completed
              ? 'done'
              : exam.unlocked
                ? 'current'
                : 'locked'
            : sectionStateFor(phase);
          return (
            <div className={styles.railRow} key={phase.id}>
              <span
                className={`${styles.railRowIcon} ${
                  state === 'done'
                    ? styles.railRowIconDone
                    : state === 'locked'
                      ? styles.railRowIconLocked
                      : ''
                }`}
              >
                <MsIcon
                  name={
                    state === 'done'
                      ? 'check'
                      : state === 'locked'
                        ? 'lock'
                        : exam
                          ? 'school'
                          : 'radio_button_checked'
                  }
                  size={13}
                />
              </span>
              <span
                className={`${styles.railRowLabel} ${state === 'locked' ? styles.railRowLabelMuted : ''}`}
              >
                {phase.title}
              </span>
              {state === 'current' ? <span className={styles.railRowState}>Now</span> : null}
            </div>
          );
        })}
        {plan.phases.length === 0 ? <p className={styles.railProgLabel}>Building…</p> : null}
      </div>
    </section>
  );
}

function ReviewQueueCard({ weakCount }: { weakCount: number }) {
  return (
    <section className={styles.railCard} aria-label="Review queue">
      <h3 className={styles.railTitle}>Review queue</h3>
      <p className={styles.railSub}>
        {weakCount > 0
          ? `${weakCount} weak ${weakCount === 1 ? 'spot' : 'spots'} to revisit before your next checkpoint.`
          : 'Nothing flagged yet — keep going and Mage will surface weak spots here.'}
      </p>
    </section>
  );
}
