/**
 * Mage Revolution — shared context types + pure derivation helpers.
 *
 * This module is deliberately free of any server-only import (no `db`, no
 * Prisma) so BOTH the client panel and the server route can import it. The
 * db-backed id authorization lives in `mage-context.ts` (server-only).
 *
 * Phase 1 scope: define the thin context the client sends, plus the pure
 * derivation of `assistancePolicy` and `allowedActions`. Grounding-material
 * resolution, source manifests, action cards, and the reveal gate land in
 * later phases.
 */

/** The product surface the panel was opened from. */
export type MageContextType =
  | 'global'
  | 'home'
  | 'lesson'
  | 'practice'
  | 'path'
  | 'my-path'
  | 'exam'
  | 'study-pack'
  | 'material'
  | 'quiz-question'
  | 'quiz-result';

/**
 * Server-authoritative answer policy. Derived from context, never sent by the
 * client — so a client can't claim `full` while sitting in an exam.
 *  - `full`        lesson / browsing: Mage may explain anything.
 *  - `hints-first` practice / mid-question: nudge before revealing.
 *  - `no-answers`  exam: never hand over answers.
 */
export type MageAssistancePolicy = 'full' | 'hints-first' | 'no-answers';

/** Answer depth / strictness toggle. Wired to model tier in Phase 9. */
export type MageMode = 'quick' | 'deep' | 'strict';

/**
 * Every action id Mage may ever reference. The server offers a per-context
 * subset (see `deriveAllowedActions`); the model may only reference ids the
 * server offered, and execution re-authorizes (Phase 6). Listing the full set
 * here keeps the id space single-sourced as later phases wire each one up.
 */
export const MAGE_ACTION_IDS = [
  // Low-risk navigation (auto-run): open something the user already owns.
  'OPEN_PATH',
  'OPEN_LESSON',
  'OPEN_EXAM',
  'OPEN_STUDY_PACK',
  'OPEN_QUIZ',
  'OPEN_FLASHCARDS',
  // Medium-risk generation (confirm + quota re-check at execution).
  'START_WEAK_TOPIC_SESSION',
  'CREATE_PRACTICE_SET',
  'START_EXAM_SIMULATION',
  'EXPLAIN_MISTAKE',
  // Gate-controlled (Phase 8).
  'REVEAL_ANSWER',
  // High-risk (open the existing edit UI prefilled; Mage never commits).
  'EDIT_EXAM_SCOPE',
  'CHANGE_EXAM_DATE',
  'CREATE_PATH',
] as const;

export type MageActionId = (typeof MAGE_ACTION_IDS)[number];

/** Ids the client may attach to a context. All optional; all re-authorized. */
export interface MageContextIds {
  notebookId?: string;
  pathId?: string;
  slotId?: string;
  examId?: string;
  quizSetId?: string;
  pageId?: string;
}

/**
 * The thin payload the client sends. Ids + UI state only — the server expands
 * ids into grounding material (Phase 2), never trusting a client-supplied page
 * list.
 */
export interface MageClientContext {
  type?: MageContextType;
  ids?: MageContextIds;
  /** Human label of the current surface (e.g. the lesson title). */
  title?: string;
  /** Text the user highlighted to ask about. */
  selectedText?: string;
  /** Quiz question currently on screen (quiz-question / quiz-result). */
  activeQuestionId?: string;
  mode?: MageMode;
}

/** What the server resolves a client context into. Ids are authorized-only. */
export interface ResolvedMageContext {
  type: MageContextType;
  /** Only ids the requesting user actually owns survive here. */
  ids: MageContextIds;
  title?: string;
  selectedText?: string;
  activeQuestionId?: string;
  mode: MageMode;
  assistancePolicy: MageAssistancePolicy;
  allowedActions: MageActionId[];
}

export const MAGE_CONTEXT_TYPES: readonly MageContextType[] = [
  'global',
  'home',
  'lesson',
  'practice',
  'path',
  'my-path',
  'exam',
  'study-pack',
  'material',
  'quiz-question',
  'quiz-result',
];

export const MAGE_MODES: readonly MageMode[] = ['quick', 'deep', 'strict'];

/**
 * Server-authoritative assistance policy. Pure function of the (already
 * validated) context type — the reveal gate (Phase 8) enforces it structurally;
 * prompt instructions are only defense-in-depth.
 */
export function deriveAssistancePolicy(type: MageContextType): MageAssistancePolicy {
  switch (type) {
    case 'exam':
      return 'no-answers';
    case 'practice':
    case 'quiz-question':
      return 'hints-first';
    default:
      return 'full';
  }
}

/**
 * The action menu the server offers for a context. Pure: depends only on the
 * (authorized) ids, the surface type, and whether the user is on a paid tier.
 * Navigation actions follow whichever owned ids are in context; generation
 * actions are Pro-gated and never offered mid-question. Rendered as cards in
 * Phase 6; here we only derive + expose the set.
 */
export function deriveAllowedActions(
  type: MageContextType,
  ids: MageContextIds,
  isPro: boolean
): MageActionId[] {
  const actions = new Set<MageActionId>();

  // Low-risk navigation: open something already owned and in context.
  if (ids.pathId) actions.add('OPEN_PATH');
  if (ids.slotId) actions.add('OPEN_LESSON');
  if (ids.quizSetId) actions.add('OPEN_QUIZ');
  if (ids.notebookId) actions.add('OPEN_STUDY_PACK');
  if (ids.examId) {
    actions.add('OPEN_EXAM');
    // High-risk edits open the existing UI prefilled — Mage never commits them.
    actions.add('EDIT_EXAM_SCOPE');
    actions.add('CHANGE_EXAM_DATE');
  }

  // A graded result lets the learner ask for a mistake breakdown.
  if (type === 'quiz-result') actions.add('EXPLAIN_MISTAKE');

  // Generation spends quota → Pro only, and never while answering a question.
  if (isPro && type !== 'quiz-question') {
    actions.add('CREATE_PRACTICE_SET');
    if (ids.pathId) actions.add('START_WEAK_TOPIC_SESSION');
    if (ids.examId) actions.add('START_EXAM_SIMULATION');
  }

  // Starting a brand-new path is always on the table (opens the setup wizard
  // prefilled; high-risk so Mage never commits it).
  actions.add('CREATE_PATH');

  return [...actions];
}
