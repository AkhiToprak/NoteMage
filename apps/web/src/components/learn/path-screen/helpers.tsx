'use client';

// Shared pure helpers + tiny presentational atoms for the redesigned
// learning-path + node-overview web screens (Figma 161:2 / 186:2).
// Data shapes come straight from the path DTO (see PathView types +
// path-loader's SerializedPath); nothing here fabricates content.

import type { CSSProperties } from 'react';
import { useOptionalMage } from '@/components/mage';
import type { PathActivity, PathPhase, PathPlan, PathSlot } from '@/components/learn/PathView';
import styles from './PathScreen.module.css';

/** The detail GET returns the full SerializedPath; PathView's PathPlan only
 *  types the subset it rendered. Extend with the few extra fields these
 *  screens read (all optional — safe on the partial type the route holds). */
export type ScreenPlan = PathPlan & {
  source?: string;
  subjects?: string[];
};

// ── labels / icons ──────────────────────────────────────────────────

/** Real activity kinds → display label + Material Symbol. Mirrors
 *  ActivityList so a "mission" reads identically wherever it surfaces. */
export function activityMeta(kind: string): { label: string; icon: string } {
  switch (kind) {
    case 'theory':
      return { label: 'Theory', icon: 'auto_stories' };
    case 'flashcards':
      return { label: 'Flashcards', icon: 'style' };
    case 'quiz':
      return { label: 'Quiz', icon: 'quiz' };
    default:
      return { label: kind, icon: 'task_alt' };
  }
}

/** Badge above a node's title — the design's "CORE NODE" / gate wording. */
export function nodeBadgeLabel(kind: string): string {
  switch (kind) {
    case 'assessment':
      return 'CHECKPOINT';
    case 'final_exam':
      return 'FINAL EXAM';
    case 'review':
      return 'REVIEW';
    default:
      return 'CORE NODE';
  }
}

/** Glyph for a node tile in the path strip, by slot kind + state. */
export function nodeIcon(slot: PathSlot, state: NodeState): string {
  if (state === 'completed') return 'check';
  if (state === 'generating') return 'progress_activity';
  if (state === 'locked') return 'lock';
  if (state === 'active') return 'play_arrow';
  if (slot.kind === 'assessment') return 'workspace_premium';
  if (slot.kind === 'final_exam') return 'school';
  if (slot.kind === 'review') return 'replay';
  return 'menu_book';
}

/** Subject buckets → header glyph (mirrors the /my-path card icon). */
export function subjectIcon(subjects?: string[]): string {
  const subj = subjects?.[0] ?? '';
  if (subj.includes('math') || subj.includes('calc')) return 'calculate';
  if (subj.includes('chem') || subj.includes('bio')) return 'science';
  if (subj.includes('hist') || subj.includes('geo')) return 'public';
  if (subj.includes('phys')) return 'bolt';
  if (subj.includes('comp') || subj.includes('cs') || subj.includes('sql') || subj.includes('data'))
    return 'database';
  if (subj.includes('lang') || subj.includes('lit') || subj.includes('eng')) return 'auto_stories';
  if (subj.includes('econ') || subj.includes('biz')) return 'trending_up';
  return 'menu_book';
}

/** Human source name for the subtitle + Sources card. Prefers the Study
 *  Pack name; falls back to the generation source. No page-level citation
 *  exists in the DTO, so we never invent one. */
export function sourceName(plan: ScreenPlan): string {
  if (plan.notebookTitle) return plan.notebookTitle;
  switch (plan.source) {
    case 'sample':
      return 'Sample Material';
    case 'import':
      return 'your upload';
    case 'clone':
    case 'community':
      return 'a community path';
    default:
      return 'your material';
  }
}

// ── node + section state ────────────────────────────────────────────

export type NodeState = 'locked' | 'available' | 'active' | 'completed' | 'generating';

export function nodeStateFor(slot: PathSlot): NodeState {
  if (slot.completed) return 'completed';
  // Still-building checkpoints read as "generating" — ahead of both locked and
  // available, so an un-built node never masquerades as a user-gated one.
  if (slot.generating) return 'generating';
  if (!slot.unlocked) return 'locked';
  if (slot.isActive) return 'active';
  return 'available';
}

export type SectionState = 'done' | 'current' | 'locked';

export function sectionStateFor(phase: PathPhase): SectionState {
  if (!phase.unlocked) return 'locked';
  if (phase.slots.length > 0 && phase.slots.every((s) => s.completed)) return 'done';
  return 'current';
}

/** A phase is the final-exam zone when its terminal slot is the graded
 *  final. Rendered as the gold medallion instead of a node strip. */
export function finalExamSlot(phase: PathPhase): PathSlot | null {
  const last = phase.slots[phase.slots.length - 1];
  return last && last.kind === 'final_exam' ? last : null;
}

/** Mission rows for a node, each tagged done / now (the next task) / todo. */
export type MissionState = 'done' | 'now' | 'todo';
export function missionStateFor(
  activities: PathActivity[],
): { activity: PathActivity; state: MissionState }[] {
  const firstIncomplete = activities.findIndex((a) => !a.completed);
  return activities.map((activity, idx) => ({
    activity,
    state: activity.completed ? 'done' : idx === firstIncomplete ? 'now' : 'todo',
  }));
}

/** The activity the learner should resume — first incomplete, else null. */
export function nextActivity(slot: PathSlot): PathActivity | null {
  return slot.activities.find((a) => !a.completed) ?? null;
}

// ── shared atoms ────────────────────────────────────────────────────

export function ProgressBar({ pct, className }: { pct: number; className?: string }) {
  const ratio = Math.max(0, Math.min(100, pct)) / 100;
  return (
    <div className={className ? `${styles.bar} ${className}` : styles.bar} role="presentation">
      <div className={styles.barFill} style={{ '--pct': ratio } as CSSProperties} />
    </div>
  );
}

export function MsIcon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <span className="material-symbols-outlined" style={{ fontSize: size, color: 'inherit' }} aria-hidden>
      {name}
    </span>
  );
}

/** Right-rail "Ask Mage" card. Opens the global Mage panel, which the path
 *  detail route has already grounded on the current path / open node via
 *  useRegisterMageContext — so this needs no per-card context of its own. */
export function AskMageCard({ desc }: { desc: string }) {
  const mage = useOptionalMage();
  return (
    <section className={styles.askCard} aria-label="Ask Mage">
      <div className={styles.askHead}>
        <span className={styles.askMascot}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/mascot/holding-wand-v2.png" alt="" />
        </span>
        <span className={styles.askTitle}>Ask Mage</span>
      </div>
      <p className={styles.askDesc}>{desc}</p>
      <button type="button" className={styles.askBtn} onClick={() => mage?.open()}>
        Ask Mage
      </button>
    </section>
  );
}
