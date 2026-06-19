/**
 * Mage Revolution — action cards (Phase 6).
 *
 * Pure, client+server safe (no `db`, no React) so the route can resolve the
 * server-owned action menu AND the panel can render the resolved cards from the
 * same source. Decision 5: actions come from a SERVER menu; the model may only
 * reference ids the server offered, and execution re-authorizes.
 *
 * Risk tiers:
 *  - low  (`navigate`): open something the learner already owns → auto-runs.
 *  - high (`prefill`):  open an existing edit UI prefilled → Mage never commits.
 *  - medium (`generate`): spends generation quota → confirm + server re-check.
 *
 * Phase 6 ships `navigate` + `prefill` end to end. The `generate` cards are
 * resolved here (and unit-tested) but kept OUT of the offered menu by default
 * (`includeGeneration` is false) until Phase 7 builds their executor
 * (`POST /api/mage/practice-sessions`); flip the gate then.
 */

import type { MageActionId, MageContextIds, MageContextType } from './mage-types';

export type MageActionKind = 'navigate' | 'prefill' | 'generate' | 'gate';
export type MageActionRisk = 'low' | 'medium' | 'high';

/** Static metadata for an action id — its card chrome + how the model should
 * reason about it. Href/confirm are derived per-context by the resolver. */
interface MageActionSpec {
  /** Imperative card label shown to the learner. */
  label: string;
  /** Material Symbols Outlined glyph. */
  icon: string;
  risk: MageActionRisk;
  kind: MageActionKind;
  /** One-line model hint: when recommending this action is appropriate. */
  when: string;
  /** Confirmation copy for a medium-risk (generate) card. */
  confirm?: { title: string; body: string; confirmLabel: string };
}

/**
 * The full id → spec catalog. Single-sources every action's chrome + risk. The
 * per-context offered subset is derived in `mage-types.deriveAllowedActions`;
 * this just describes each id. Keeping all ids here (even Phase 7/8 ones) keeps
 * the space single-sourced as later phases wire executors.
 */
export const MAGE_ACTION_CATALOG: Record<MageActionId, MageActionSpec> = {
  // ── Low-risk navigation (auto-run) ────────────────────────────────────────
  OPEN_PATH: {
    label: 'Open the path',
    icon: 'route',
    risk: 'low',
    kind: 'navigate',
    when: "the learner should look at the whole learning path's map.",
  },
  OPEN_LESSON: {
    label: 'Open the lesson',
    icon: 'menu_book',
    risk: 'low',
    kind: 'navigate',
    when: 'the learner should read or revisit the current lesson.',
  },
  OPEN_EXAM: {
    label: 'Open exam overview',
    icon: 'school',
    risk: 'low',
    kind: 'navigate',
    when: 'the learner should see their exam readiness and weak spots.',
  },
  OPEN_STUDY_PACK: {
    label: 'Open study pack',
    icon: 'folder_open',
    risk: 'low',
    kind: 'navigate',
    when: 'the learner should browse this study pack.',
  },
  OPEN_QUIZ: {
    label: 'Open the quiz',
    icon: 'quiz',
    risk: 'low',
    kind: 'navigate',
    when: 'the learner should take or retake this quiz.',
  },
  OPEN_FLASHCARDS: {
    label: 'Open flashcards',
    icon: 'style',
    risk: 'low',
    kind: 'navigate',
    when: 'the learner should drill these flashcards.',
  },

  // ── Medium-risk generation (confirm + quota re-check; Phase 7 executor) ────
  START_WEAK_TOPIC_SESSION: {
    label: 'Practice your weak spots',
    icon: 'fitness_center',
    risk: 'medium',
    kind: 'generate',
    when: "the learner wants targeted practice on the path's weakest checkpoints.",
    confirm: {
      title: 'Start a focused practice session?',
      body: 'Mage will build a short quiz from your weakest checkpoints. This uses some of your monthly generation allowance.',
      confirmLabel: 'Start session',
    },
  },
  CREATE_PRACTICE_SET: {
    label: 'Build a practice set',
    icon: 'add_task',
    risk: 'medium',
    kind: 'generate',
    when: 'the learner wants a fresh practice quiz on what they are studying.',
    confirm: {
      title: 'Build a practice set?',
      body: 'Mage will generate a new practice quiz. This uses some of your monthly generation allowance.',
      confirmLabel: 'Build it',
    },
  },
  START_EXAM_SIMULATION: {
    label: 'Start an exam simulation',
    icon: 'timer',
    risk: 'medium',
    kind: 'generate',
    when: "the learner wants a mock exam assembled from this exam's scope.",
    confirm: {
      title: 'Start an exam simulation?',
      body: "Mage will assemble a mock exam from this exam's scope. This uses some of your monthly generation allowance.",
      confirmLabel: 'Start simulation',
    },
  },
  EXPLAIN_MISTAKE: {
    label: 'Explain my mistakes',
    icon: 'psychology',
    risk: 'medium',
    kind: 'generate',
    when: 'the learner wants a breakdown of the questions they just missed.',
    confirm: {
      title: 'Explain your mistakes?',
      body: 'Mage will walk through the questions you missed and why.',
      confirmLabel: 'Explain',
    },
  },

  // ── Gate-controlled (Phase 8) — never an action card ──────────────────────
  REVEAL_ANSWER: {
    label: 'Reveal the answer',
    icon: 'visibility',
    risk: 'low',
    kind: 'gate',
    when: 'never recommend directly — the reveal gate controls this.',
  },

  // ── High-risk prefill (opens an existing editor; Mage never commits) ──────
  EDIT_EXAM_SCOPE: {
    label: 'Edit exam coverage',
    icon: 'checklist',
    risk: 'high',
    kind: 'prefill',
    when: "what the exam covers is wrong or incomplete and should be edited.",
  },
  CHANGE_EXAM_DATE: {
    label: 'Change the exam date',
    icon: 'event',
    risk: 'high',
    kind: 'prefill',
    when: 'the exam date is wrong and should be changed.',
  },
  CREATE_PATH: {
    label: 'Create a new path',
    icon: 'add_road',
    risk: 'high',
    kind: 'prefill',
    when: 'the learner needs a brand-new guided path on a topic they lack one for.',
  },
};

/** A resolved action card — server-built from authorized ids, client-rendered. */
export interface MageActionCard {
  id: MageActionId;
  label: string;
  icon: string;
  risk: MageActionRisk;
  kind: MageActionKind;
  /** Destination for a navigate/prefill card (built from AUTHORIZED ids). */
  href?: string;
  /** Shown before executing a medium-risk (generate) card. */
  confirm?: { title: string; body: string; confirmLabel: string };
}

/** The `actions` SSE payload (Phase 6) — the cards the answer recommends. */
export interface MageActionsPayload {
  actions: MageActionCard[];
}

/** Cap on how many cards a single answer may surface — keeps the panel tidy. */
export const MAX_ACTION_CARDS = 3;

/** The context an action card is resolved against (authorized ids + surface). */
export interface MageActionContext {
  type: MageContextType;
  ids: MageContextIds;
}

/**
 * Build the deep link for a navigate/prefill action from the AUTHORIZED context
 * ids. Returns null when the ids needed for a clean route aren't present — the
 * resolver then drops the card, so a card never points at content the learner
 * can't reach. Generate/gate kinds have no href (null).
 */
function cardHref(id: MageActionId, ctx: MageActionContext): string | null {
  const { ids } = ctx;
  switch (id) {
    case 'OPEN_PATH':
      return ids.pathId ? `/learn/paths/${ids.pathId}` : null;
    // The real lesson lives in the path checkpoint drawer, not the sample
    // /lesson route — deep-link there (needs both the path and the slot).
    case 'OPEN_LESSON':
      return ids.pathId && ids.slotId
        ? `/learn/paths/${ids.pathId}?slot=${ids.slotId}`
        : null;
    case 'OPEN_EXAM':
      return ids.examId ? `/exam/${ids.examId}` : null;
    case 'OPEN_STUDY_PACK':
      return ids.notebookId ? `/study-packs/${ids.notebookId}` : null;
    // The quiz viewer is nested under its study pack — needs both ids. Path
    // bundles (quizSetId but no notebookId) have no standalone viewer → drop.
    case 'OPEN_QUIZ':
      return ids.notebookId && ids.quizSetId
        ? `/study-packs/${ids.notebookId}/quizzes/${ids.quizSetId}`
        : null;
    // No flashcard-set id rides in MageContextIds yet, so this never resolves —
    // it stays catalog-only until a surface registers one (Phase 7+).
    case 'OPEN_FLASHCARDS':
      return null;
    // High-risk: open the existing editor PREFILLED. The exam surface reads
    // `?edit=` to auto-open the matching editor; Mage never commits the change.
    case 'EDIT_EXAM_SCOPE':
      return ids.examId ? `/exam/${ids.examId}?edit=scope` : null;
    case 'CHANGE_EXAM_DATE':
      return ids.examId ? `/exam/${ids.examId}?edit=date` : null;
    // Path creation runs through the Study Pack wizard.
    case 'CREATE_PATH':
      return '/study-packs/new';
    default:
      return null;
  }
}

/**
 * Resolve a list of OFFERED action ids into concrete cards for a context. Pure.
 *  - navigate/prefill cards are dropped when their route can't be built from the
 *    authorized ids (so a card never dangles),
 *  - generate cards are included only when `includeGeneration` is true (Phase 7
 *    gate — their executor doesn't exist yet),
 *  - gate kinds (REVEAL_ANSWER) are never cards.
 * Order follows the input; de-dups by id.
 */
export function resolveMageActionCards(
  offered: readonly MageActionId[],
  ctx: MageActionContext,
  opts: { includeGeneration?: boolean } = {},
): MageActionCard[] {
  const includeGeneration = opts.includeGeneration ?? false;
  const out: MageActionCard[] = [];
  const seen = new Set<MageActionId>();

  for (const id of offered) {
    if (seen.has(id)) continue;
    const spec = MAGE_ACTION_CATALOG[id];
    if (!spec) continue;
    if (spec.kind === 'gate') continue;
    if (spec.kind === 'generate' && !includeGeneration) continue;

    if (spec.kind === 'navigate' || spec.kind === 'prefill') {
      const href = cardHref(id, ctx);
      if (!href) continue; // required ids missing — don't dangle a dead card
      out.push({ id, label: spec.label, icon: spec.icon, risk: spec.risk, kind: spec.kind, href });
    } else {
      // generate
      out.push({
        id,
        label: spec.label,
        icon: spec.icon,
        risk: spec.risk,
        kind: spec.kind,
        confirm: spec.confirm,
      });
    }
    seen.add(id);
  }
  return out;
}

/**
 * Model-facing description of the offered menu. Listed in an UNCACHED system
 * block (varies per surface, so it must never enter the cached corpus prefix).
 * Empty string when nothing is offered. The model recommends a subset by
 * putting ids into `annotate_answer.actions`.
 */
export function describeMageActionMenu(cards: MageActionCard[]): string {
  if (cards.length === 0) return '';
  const lines = cards.map((c) => `- ${c.id}: ${MAGE_ACTION_CATALOG[c.id].when}`);
  return [
    'AVAILABLE ACTIONS — the app can offer the learner the buttons below. If, and only if, your answer genuinely points the learner toward one of them, list its exact id in `annotate_answer.actions`.',
    `Use at most ${MAX_ACTION_CARDS}, only ids from this list, and only when truly helpful — never invent an id, and never list one your answer does not support.`,
    ...lines,
  ].join('\n');
}

/**
 * Validate the model's recommended action ids against the OFFERED cards and
 * return the matching cards (server-authoritative — anything not offered is
 * dropped, so the model can never surface an action the server didn't menu).
 * De-dups, preserves offered order, caps at {@link MAX_ACTION_CARDS}.
 */
export function pickRecommendedActions(
  offered: MageActionCard[],
  recommended: unknown,
): MageActionCard[] {
  if (!Array.isArray(recommended) || offered.length === 0) return [];
  const wanted = new Set(recommended.filter((r): r is string => typeof r === 'string'));
  if (wanted.size === 0) return [];
  const picked: MageActionCard[] = [];
  for (const card of offered) {
    if (wanted.has(card.id)) {
      picked.push(card);
      if (picked.length >= MAX_ACTION_CARDS) break;
    }
  }
  return picked;
}
