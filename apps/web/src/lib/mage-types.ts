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

// Type-only import (erased at runtime, so this stays free of any server-only
// value import). Lets the persisted sidecar carry resolved action cards.
import type { MageActionCard } from './mage-actions';

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

/**
 * Answer depth / strictness toggle (Phase 9). `quick` is the automatic default;
 * the panel's `[Go deeper]` / `[Use only my material]` / `[Answer faster]`
 * switches set the others. Each maps to three knobs:
 *  - model tier   — `resolveModel('mage-answer', { mode })`: `deep` → Sonnet,
 *                   `quick` / `strict` → Haiku.
 *  - prompt depth — `mageModePromptParts(mode)` (deep = thorough, quick =
 *                   concise, strict = source-bound, no general-knowledge fallback).
 *  - gate / sources — `strict` raises the reveal gate to at least `hint_only`
 *                   (`applyModeGate`) and forbids a blended `mixed` source mode
 *                   (`resolveCitedSources({ strict })`).
 */
export type MageMode = 'quick' | 'deep' | 'strict';

/**
 * Server-authoritative reveal gate (Phase 8). Derived structurally from the
 * `assistancePolicy` — never from what the model emits — and streamed to the
 * client (the `reveal_gate` SSE event) so the panel renders an answer behind the
 * gate. Prompt instructions are defence-in-depth; THIS is the gate.
 *  - `open`      render the answer immediately (lesson / browsing).
 *  - `hint_only` collapse the answer behind a "Reveal answer" button (practice /
 *                a live question): hint-first, then reveal on click.
 *  - `sealed`    never render the answer body (exam): the learner cannot reveal
 *                it at all, even if the model leaked one.
 */
export type MageRevealGate = 'open' | 'hint_only' | 'sealed';

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

/** The kind of a grounding source — drives the human label + the chip icon. */
export type MageSourceKind = 'theory' | 'page' | 'study-pack' | 'path' | 'exam' | 'quiz';

/**
 * One resolved piece of grounding material for the current context. The server
 * resolves the authorized ids into these (Phase 2) and feeds the formatted text
 * into the chat's cached corpus block (Phase 4 numbers them `[S#]`). The
 * chip-facing fields (`subtitle`/`href`/`pageLabel`) ride along so a resolved
 * citation can render a clickable chip with its provenance — they never reach
 * the model, only the corpus header does.
 */
export interface MageGroundingSource {
  kind: MageSourceKind;
  title: string;
  text: string;
  /** Where the source lives (notebook / path title) — chip subtitle. */
  subtitle?: string;
  /** Best-effort deep link for the chip (omitted when no clean route). */
  href?: string;
  /** Phase-3 provenance, e.g. "page 7" — shown on the chip when present. */
  pageLabel?: string;
}

/**
 * How grounded an answer is. The model declares it via `annotate_answer`; the
 * server may DOWNGRADE it (claimed `material`/`mixed` but cited nothing
 * resolvable → `general`) but never upgrades. `general` answers carry the
 * outside-material label in the UI.
 */
export type MageSourceMode = 'material' | 'mixed' | 'general';

/**
 * A resolved citation chip: a manifest entry the answer actually used. `n` is
 * the `[S#]` number the model cited; the rest is chip chrome. Server-built —
 * the client only renders it.
 */
export interface MageSource {
  n: number;
  kind: MageSourceKind;
  title: string;
  subtitle?: string;
  href?: string;
  pageLabel?: string;
}

/** The `sources` SSE payload (Phase 4) — resolved chips + the final mode. */
export interface MageSourcesPayload {
  sources: MageSource[];
  sourceMode: MageSourceMode;
  /** True when the answer wasn't found in the provided material. */
  notFoundInMaterial: boolean;
}

/**
 * The shape the model fills via the `annotate_answer` tool. Phase 4 consumes
 * `sourceMode` / `usedSources` / `notFoundInMaterial`; `actions` (Phase 6) and
 * `revealGate` (Phase 8) are accepted now so the tool definition stays
 * byte-stable across phases (changing it would bust the prompt cache).
 */
export interface MageAnnotation {
  sourceMode?: MageSourceMode;
  usedSources?: number[];
  notFoundInMaterial?: boolean;
  actions?: string[];
  revealGate?: MageRevealGate;
}

/** The `reveal_gate` SSE payload (Phase 8) — the server-set gate for this turn. */
export interface MageRevealGatePayload {
  gate: MageRevealGate;
}

/**
 * Phase 10 — the per-message sidecar persisted to `ChatMessage.metadata` for a
 * Mage panel turn, so resuming a thread rebuilds the same chips / cards / gate
 * the live turn rendered. `v` guards the shape across future changes. Null in
 * the DB (plain chat + every legacy row) → the panel renders plain prose, which
 * is exactly the back-compat the fold-in needs.
 */
export interface MageMessageMetadata {
  v: 1;
  sources?: MageSource[];
  sourceMode?: MageSourceMode;
  notFoundInMaterial?: boolean;
  actions?: MageActionCard[];
  revealGate?: MageRevealGate;
  mode?: MageMode;
}

const GROUNDING_LABELS: Record<MageSourceKind, string> = {
  theory: 'Lesson',
  page: 'Page',
  'study-pack': 'Study pack',
  path: 'Learning path',
  exam: 'Exam',
  quiz: 'Quiz',
};

/** Short lowercase word for the `(kind)` tag in a source-manifest header. */
const SOURCE_KIND_WORD: Record<MageSourceKind, string> = {
  theory: 'lesson',
  page: 'page',
  'study-pack': 'study pack',
  path: 'path',
  exam: 'exam',
  quiz: 'quiz',
};

/** Human label for a source kind — used by the chip UI. */
export function mageSourceLabel(kind: MageSourceKind): string {
  return GROUNDING_LABELS[kind];
}

/**
 * Build the numbered source manifest (Phase 4). Returns BOTH the corpus parts
 * the model sees — each headed `[S1] (kind) "Title" — Subtitle (page N)` so the
 * model can cite `[S#]` inline — and the chip-ready `manifest` the server keeps
 * to resolve those citations after the stream. Empty-text sources are dropped
 * BEFORE numbering, so `[S#]` stays contiguous and every number resolves. Pure;
 * no db.
 */
export function buildMageSourceManifest(sources: MageGroundingSource[]): {
  corpusParts: string[];
  manifest: MageSource[];
} {
  const kept = sources.filter((s) => s.text.trim().length > 0);
  const corpusParts: string[] = [];
  const manifest: MageSource[] = [];
  kept.forEach((s, i) => {
    const n = i + 1;
    const header =
      `[S${n}] (${SOURCE_KIND_WORD[s.kind]}) "${s.title}"` +
      (s.subtitle ? ` — ${s.subtitle}` : '') +
      (s.pageLabel ? ` (${s.pageLabel})` : '');
    corpusParts.push(`${header}\n${s.text.trim()}`);
    manifest.push({
      n,
      kind: s.kind,
      title: s.title,
      subtitle: s.subtitle,
      href: s.href,
      pageLabel: s.pageLabel,
    });
  });
  return { corpusParts, manifest };
}

const CITATION_RE = /\[S(\d+)\]/g;
const VALID_SOURCE_MODES: ReadonlySet<string> = new Set<MageSourceMode>(['material', 'mixed', 'general']);

/**
 * Resolve which manifest sources an answer actually used (Phase 4). Collects
 * every `[S#]` marker in the prose AND the model's `annotate_answer.usedSources`
 * claim, KEEPING ONLY numbers that exist in the manifest (hallucinated refs are
 * dropped). Then derives the final, server-authoritative `sourceMode`:
 *   - no manifest at all                       → `general`
 *   - claimed grounded but nothing resolvable  → DOWNGRADE to `general`
 *   - otherwise                                → the model's (validated) claim
 * The server never UPGRADES the mode. `notFoundInMaterial` is true when the
 * model says so, or when grounding existed but the answer cited none of it.
 */
export function resolveCitedSources(
  answerText: string,
  manifest: MageSource[],
  declared: MageAnnotation | null,
  opts: { strict?: boolean } = {},
): MageSourcesPayload {
  const byNum = new Map(manifest.map((s) => [s.n, s]));
  const cited = new Set<number>();
  for (const m of answerText.matchAll(CITATION_RE)) {
    const n = Number(m[1]);
    if (byNum.has(n)) cited.add(n); // drop hallucinated [S#] not in the manifest
  }
  if (Array.isArray(declared?.usedSources)) {
    for (const n of declared.usedSources) {
      if (typeof n === 'number' && byNum.has(n)) cited.add(n);
    }
  }
  // Preserve manifest order so chips read S1, S2, … rather than cite order.
  const sources = manifest.filter((s) => cited.has(s.n));

  const claimed =
    declared?.sourceMode && VALID_SOURCE_MODES.has(declared.sourceMode)
      ? declared.sourceMode
      : manifest.length > 0
        ? 'material'
        : 'general';

  let sourceMode: MageSourceMode;
  if (manifest.length === 0) {
    sourceMode = 'general';
  } else if ((claimed === 'material' || claimed === 'mixed') && sources.length === 0) {
    sourceMode = 'general'; // claimed grounded, cited nothing resolvable → downgrade
  } else {
    sourceMode = claimed;
  }

  // Phase 9 — strict ("use only my material") mode tightens the source mode: a
  // blended `mixed` answer is never reported. It collapses to pure `material`
  // (when it cited resolvable sources) or to `general` (when it didn't), so a
  // strict answer is unambiguously grounded-in-your-material OR outside-it.
  if (opts.strict && sourceMode === 'mixed') {
    sourceMode = sources.length > 0 ? 'material' : 'general';
  }

  const notFoundInMaterial =
    Boolean(declared?.notFoundInMaterial) ||
    (manifest.length > 0 && sources.length === 0 && sourceMode === 'general');

  return { sources, sourceMode, notFoundInMaterial };
}

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

/**
 * Phase 10 — the persistent-thread key for a context. Pure + client-safe so the
 * panel can compute it to RESUME a thread (GET, scoped to the user) and the
 * server can compute it from AUTHORIZED ids to find-or-create the thread on a
 * send. One thread per surface, in priority order so the most specific id wins:
 *   exam:{id} > path:{id} > notebook:{id} > global
 * The `notebook:{id}` / `global` arms match the Phase-10 backfill, so a legacy
 * notebook chat resumes under the study pack it was homed in.
 *
 * SECURITY: a key the client builds from ids it doesn't own is harmless — the
 * resume query is filtered by `userId`, so a forged `exam:{someoneElses}` simply
 * matches no thread. On a send the server rebuilds the key from authorized ids
 * only, so a thread is never created under an id the user can't see.
 */
export function mageContextKey(
  context: { ids?: MageContextIds } | null | undefined
): string {
  const ids = context?.ids ?? {};
  if (ids.examId) return `exam:${ids.examId}`;
  if (ids.pathId) return `path:${ids.pathId}`;
  if (ids.notebookId) return `notebook:${ids.notebookId}`;
  return 'global';
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
  /** Phase 8 — structural reveal gate derived from `assistancePolicy`. */
  revealGate: MageRevealGate;
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
 * Map the (server-derived) assistance policy to the structural reveal gate
 * (Phase 8). Pure; the single source of truth for what a context exposes:
 *  - `no-answers`  → `sealed`     (exam: the body is never shown)
 *  - `hints-first` → `hint_only`  (practice / live question: reveal on click)
 *  - `full`        → `open`       (lesson / browsing / a graded result)
 * The gate is derived here and streamed to the client; the model's own
 * `annotate_answer.revealGate` is never trusted for it.
 */
export function deriveRevealGate(policy: MageAssistancePolicy): MageRevealGate {
  switch (policy) {
    case 'no-answers':
      return 'sealed';
    case 'hints-first':
      return 'hint_only';
    default:
      return 'open';
  }
}

/** Strictness ladder for the reveal gate — `open` < `hint_only` < `sealed`. */
const GATE_RANK: Record<MageRevealGate, number> = { open: 0, hint_only: 1, sealed: 2 };

/**
 * Phase 9 — fold the answer `mode` into the structural reveal gate. `strict`
 * ("use only my material") RAISES the gate floor to `hint_only`: even on an
 * otherwise-open surface, a strict answer is hint-first rather than dumped
 * outright. `hint_only` / `sealed` already sit at or above the floor, so they
 * pass through unchanged (strict never loosens a tighter gate, and never seals
 * a practice gate). `quick` / `deep` never touch the gate. Pure + monotonic, so
 * "strict tightens the gate" is unit-testable; composed with `deriveRevealGate`
 * in `expandMageContext`, never trusted from the model.
 */
export function applyModeGate(base: MageRevealGate, mode: MageMode): MageRevealGate {
  if (mode === 'strict' && GATE_RANK[base] < GATE_RANK.hint_only) return 'hint_only';
  return base;
}

/** The per-mode prompt fragments — see `mageModePromptParts`. */
export interface MageModePromptParts {
  /** What to do when the provided sources don't cover the question. Strict
   *  forbids the general-knowledge fallback; quick / deep allow it. */
  uncoveredDirective: string;
  /** Depth / length steer for the answer prose (deep = thorough, quick =
   *  concise, strict = stay grounded in source wording). */
  depthDirective: string;
}

/**
 * Phase 9 — map an answer `mode` to its uncached prompt fragments (answer depth
 * + how to handle questions the material doesn't cover). Pure + client-safe so
 * it's single-sourced and testable; `chat-stream` appends these AFTER the cached
 * corpus block, so varying them per turn never busts the 1h corpus cache. The
 * model tier itself (Haiku vs Sonnet) is chosen separately by
 * `resolveModel('mage-answer', { mode })`.
 */
export function mageModePromptParts(mode: MageMode): MageModePromptParts {
  if (mode === 'strict') {
    return {
      uncoveredDirective:
        'The learner asked you to use ONLY their material. Answer strictly from the numbered sources above; if they do not cover the question, say so plainly and stop — do not fall back to general knowledge or outside facts.',
      depthDirective:
        'Stay grounded: make only claims the sources support, and prefer their definitions, wording, and examples over outside phrasing.',
    };
  }
  const uncoveredDirective =
    'If the sources do not cover the question, answer from general knowledge and say so plainly rather than fabricating a citation.';
  if (mode === 'deep') {
    return {
      uncoveredDirective,
      depthDirective:
        'Go deep: explain the underlying reasoning, work through a concrete example, and connect it to related ideas. Structure it with short headings or numbered steps where they help.',
    };
  }
  // quick (the automatic default)
  return {
    uncoveredDirective,
    depthDirective:
      'Keep it tight: lead with the answer in a sentence or two, then only the essential detail. Don’t pad.',
  };
}

/**
 * Pure client gate decision (Phase 8): given the server's gate and whether the
 * learner has clicked reveal, decide what the panel renders. Kept here (not in
 * the component) so the "answer never renders in exam mode" guarantee is
 * unit-testable.
 *  - `open`      → body shown.
 *  - `sealed`    → body NEVER shown, no reveal affordance (even if `revealed`
 *                  is somehow true — the model can't leak past this).
 *  - `hint_only` → body hidden with a reveal affordance until `revealed`.
 */
export function gateVisibility(
  gate: MageRevealGate,
  revealed: boolean
): { showBody: boolean; canReveal: boolean; sealed: boolean } {
  if (gate === 'sealed') return { showBody: false, canReveal: false, sealed: true };
  if (gate === 'hint_only') return { showBody: revealed, canReveal: !revealed, sealed: false };
  return { showBody: true, canReveal: false, sealed: false };
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
