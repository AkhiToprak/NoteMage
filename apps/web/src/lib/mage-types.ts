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
// Type-only import of the per-kind answer union (pure types, client-safe).
import type { UserAnswer } from '@/components/quiz/questionRenderers/types';

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
 * Source-highlighting feature — when a cited grounding source maps to an openable
 * ORIGIN material (a study-pack page → its PDF / video / text), the chip carries
 * this anchor so clicking it opens the shared source viewer (page jump / video
 * seek / text) instead of navigating away. Omitted for derived sources (lesson /
 * path / exam outlines) that have no original file to open.
 */
export interface MageSourceAnchor {
  materialId: string;
  materialKind: 'page' | 'document';
  /** 1-based PDF page, when known. */
  page?: number;
  /** Video seek target in seconds, when known. */
  timestampSec?: number;
}

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
  /** Source-highlighting — set when the source opens in the source viewer. */
  anchor?: MageSourceAnchor;
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
  /** Source-highlighting — clicking opens the source viewer instead of navigating. */
  anchor?: MageSourceAnchor;
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
  /** P4b — the model's coverage claim; drives consent chips. Server has a
   *  deterministic zero-citation fallback and never trusts a bare claim. */
  materialCoverage?: 'covered' | 'partial' | 'not_covered';
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
      anchor: s.anchor,
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
  /**
   * The `safe` snapshot of the on-screen activity — options, the learner's own
   * input, the visible prompt/tests, and (post-submit) the verdict. NEVER an
   * answer key. Built client-side by `buildQuizActivityContext`, redacted +
   * capped there; the server caps again and fences it as untrusted data.
   */
  activityContext?: string;
  /**
   * Structured revealing data for a GRADED question — the actual correct answer
   * + feedback. Client-built (the client already holds the answer key: grading
   * is client-side), but the server only ever composes it into the prompt when
   * the reveal gate is `open` (matrix). Empty `{}` pre-submit / mock-in-progress.
   */
  activityRevealing?: MageRevealingParts;
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

// ─────────────────────────────────────────────────────────────────────────────
// Quiz activity serializer (Mage Real Context P1)
//
// One pure, unit-tested function turns the on-screen quiz question + the
// learner's live/graded state into two blocks:
//   - `safe`      — options, the learner's own input, the visible prompt/tests,
//                   and (post-submit) the verdict. NEVER an answer key.
//   - `revealing` — structured correct-answer + feedback, ONLY for a graded
//                   non-exam question. The server composes it into the prompt
//                   only when the reveal gate is `open`.
// Consumed by QuizViewer AND RemediationBody (a graded row builds `state`
// exactly the same way), so it's a pure function of its args — no component
// state, no db.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structured revealing data for a graded question. The server composes the
 * first three into the prompt when the gate is open; `allOptionFeedback` is
 * reserved/withheld in v1 (populated only when cheaply available).
 */
export interface MageRevealingParts {
  /** The actual correct answer, derived per kind (mc: option text, etc.). */
  correctAnswer?: string;
  /** Feedback specific to what the learner picked (e.g. `wrongExplanation`). */
  pickedFeedback?: string;
  /** The general correct explanation (`correctExplanation`). */
  fullExplanation?: string;
  /** Reserved v1 — per-option feedback, only populated when cheap. */
  allOptionFeedback?: string;
}

/** Thread-level Mage consent grants (sticky per conversation). */
export interface MageThreadGrants {
  allowWebSearch: boolean;
  allowGeneralKnowledge: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Consent chips (P4b)
//
// A "third trigger path" alongside server-offered + model-recommended action
// cards: when an answer needed MORE than the numbered material, the server
// offers the learner an in-turn chip to grant the general-knowledge / web
// fallback for this thread. Live-turn only (never persisted in
// MageMessageMetadata — a resumed thread already knows its grants).
//
// ponytail: DEDICATED type, NOT folded into MAGE_ACTION_IDS / MAGE_ACTION_CATALOG
// / resolveMageActionCards. Consent chips are server-derived, never
// model-recommended — putting `ALLOW_*` in the action-card id space would let the
// model surface them via `annotate_answer.actions` and force exhaustive
// catalog/href entries. Same outcome as the plan's "kind:'consent'" wording, far
// less surface area.
// ─────────────────────────────────────────────────────────────────────────────

/** One consent chip offered under an answer. `upsell` = FREE web (disabled, links
 *  to Pro); `enabled` gates a working PATCH-grant chip vs a pure upsell. */
export interface MageConsentChip {
  id: 'ALLOW_GENERAL_KNOWLEDGE' | 'ALLOW_WEB_SEARCH';
  label: string;
  enabled: boolean;
  upsell: boolean;
}

/** The `consent` SSE payload — chips bound to the settled message they hang under
 *  (chatId + messageId make double-fires + stale-thread clicks no-op). */
export interface MageConsentPayload {
  chips: MageConsentChip[];
  chatId: string;
  messageId: string;
}

/**
 * Pure consent-chip derivation (P4b). Consent is offered ONLY when the answer
 * needed more than the numbered material (`coverage !== 'covered'`) OR the user
 * explicitly asked to search the web (`webIntent === 'request'` forces the web
 * offer even on a covered answer). The GATE decision (strict/mode/reveal-gate)
 * is the CALLER's — this only shapes the chips once gated in. Returns [] when
 * nothing applies.
 */
export function deriveConsentChips(args: {
  coverage: 'covered' | 'partial' | 'not_covered';
  grants: MageThreadGrants;
  isPro: boolean;
  webAvailable: boolean;
  webIntent: 'request' | 'negated' | 'none';
}): MageConsentChip[] {
  const { coverage, grants, isPro, webAvailable, webIntent } = args;
  const uncovered = coverage !== 'covered';
  const chips: MageConsentChip[] = [];

  // General knowledge — only when the material fell short and it isn't already
  // granted. Works for both FREE and PRO (no upsell).
  if (uncovered && !grants.allowGeneralKnowledge) {
    chips.push({ id: 'ALLOW_GENERAL_KNOWLEDGE', label: "Use Mage's knowledge", enabled: true, upsell: false });
  }

  // Web — offered when uncovered OR explicitly requested, not already granted,
  // the web path is available, and the user did not negate it this turn. PRO
  // gets a working chip; FREE gets a disabled upsell.
  const wantsWeb = uncovered || webIntent === 'request';
  if (wantsWeb && !grants.allowWebSearch && webAvailable && webIntent !== 'negated') {
    chips.push(
      isPro
        ? { id: 'ALLOW_WEB_SEARCH', label: 'Search the web', enabled: true, upsell: false }
        : { id: 'ALLOW_WEB_SEARCH', label: 'Search web — Pro', enabled: false, upsell: true },
    );
  }

  return chips;
}

/** The product surface a quiz activity is being served from. */
export type QuizActivitySurface = 'practice' | 'mock-exam' | 'remediation';

/**
 * The live/graded state bundle the caller hands the serializer alongside the
 * question. Populatable directly from QuizViewer's per-question state (see the
 * field notes) or a RemediationBody graded row.
 */
export interface QuizActivityState {
  /** Which surface: practice quiz, mock exam in progress, or a remediation row. */
  surface: QuizActivitySurface;
  /**
   * Semantic submission flag. TRUE once the answer is COMMITTED via submit (a
   * staged/selected answer is NOT submitted; code_write test runs are NOT
   * submitted); a mock-exam question is only submitted after final submit-all;
   * a remediation row is submitted when graded. Drives the `quiz-question` →
   * `quiz-result` type flip and whether `revealing` is populated.
   */
  isSubmittedOrRevealed: boolean;
  /** The learner's current answer — staged (pre-submit) or submitted. */
  answer?: UserAnswer;
  /** Graded verdict, when known (post-submit / graded row). */
  isCorrect?: boolean;
  /** Whether the hint is currently revealed on screen. */
  hintShown?: boolean;
  /** True when this is a retry of a previously-missed question. */
  retried?: boolean;
  /**
   * code_write only (P2 wires the data): actual per-test execution results.
   * Rendered into `safe` only when present. Optional — undefined until P2.
   */
  runs?: QuizActivityRun[];
}

/** One code_write test's actual execution result (P2). */
export interface QuizActivityRun {
  name?: string;
  stdin?: string;
  expectedStdout?: string;
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  /** Whether this test passed. */
  ok?: boolean;
}

/**
 * The minimal structural question shape the serializer needs. Populatable
 * directly from QuizViewer's `QuizQuestion` (id, kind, payload, question,
 * options, correctIndex, hint, correctExplanation, wrongExplanation, image) —
 * pass `figureCaption` from `question.image?.caption` and `sourceQuote` from the
 * question row's `source.quote` when present.
 */
export interface QuizActivityQuestion {
  id?: string;
  kind: string;
  question: string;
  options?: string[];
  correctIndex?: number;
  payload?: unknown;
  hint?: string | null;
  correctExplanation?: string | null;
  wrongExplanation?: string | null;
  /** Figure caption (image not shown to Mage). */
  figureCaption?: string | null;
  /** Verbatim grounded passage the question was written from. */
  sourceQuote?: string | null;
}

// Caps (see plan §Design A). Applied before returning; a visible `[truncated]`
// marker is left where content is cut.
const SAFE_CAP = 6000;
const CODE_WRITE_CAP = 3500;
const RUNS_CAP = 1200;
const STDERR_CAP = 200;
const REVEALING_CAP = 1500;
const STARTER_CAP = 1500;
const EDITOR_CAP = 2000;

const TRUNC = '\n[truncated]';

/** Cut `s` to `max` chars, appending a visible marker when it actually cut. */
function cap(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, Math.max(0, max - TRUNC.length)) + TRUNC;
}

// ─── Secret redaction (before ANY user text enters safe/revealing) ───
const REDACTION_RES: RegExp[] = [
  /sk-[A-Za-z0-9_-]{8,}/g, // OpenAI-style API keys
  /[A-Za-z0-9_]*(?:API|SECRET|TOKEN)_?KEY\s*=\s*\S+/gi, // *_API_KEY=… assignments
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, // JWT
  /\b[A-Fa-f0-9]{32,}\b/g, // long hex tokens
  /\b[A-Za-z0-9+/]{40,}={0,2}\b/g, // long base64 tokens
  /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, // AWS access key id
  /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{10,}\b/g, // GitHub tokens
  /\bAIza[A-Za-z0-9_-]{20,}\b/g, // Google API key
  /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, // Slack tokens
  /\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{10,}\b/g, // Stripe keys
];

/** Scrub secrets from untrusted user-supplied text. Pure; never throws. */
function redact(raw: string): string {
  let s = raw;
  for (const re of REDACTION_RES) s = s.replace(re, '[redacted]');
  return s;
}

/** Redact + trim a possibly-undefined string; '' for nullish. */
function clean(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return redact(raw).trim();
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

function strArr(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/**
 * Human label for the reveal policy line, from surface + submission state. Not
 * the authoritative gate (that's server-derived) — just a hint for the model.
 */
function revealPolicyLabel(state: QuizActivityState): string {
  if (state.surface === 'mock-exam' && !state.isSubmittedOrRevealed) return 'sealed (exam in progress)';
  if (state.isSubmittedOrRevealed) return 'open (submitted — verdict available)';
  return 'hint_only (live question)';
}

/**
 * Build the per-kind `safe` body — the visible, non-answer-key content. Partial-
 * safe: unknown kind / malformed payload degrades to whatever is available
 * rather than throwing (this runs on live keystroke state).
 */
function buildSafeBody(q: QuizActivityQuestion, state: QuizActivityState): string {
  const kind = q.kind;
  const a = state.answer;
  const lines: string[] = [];
  const options = q.options && q.options.length > 0 ? q.options : strArr((q.payload as Record<string, unknown> | undefined)?.options);

  try {
    switch (kind) {
      case 'mc':
      case 'diagram_cloze': {
        // Options verbatim + UNMARKED (never flag which is correct) + the pick.
        options.forEach((o, i) => lines.push(`  (${i + 1}) ${clean(o)}`));
        const picked = a && (a.kind === 'mc' || a.kind === 'diagram_cloze') ? a.selectedIdx : undefined;
        lines.push(
          typeof picked === 'number' && picked >= 0
            ? `Learner picked option (${picked + 1})${options[picked] ? `: ${clean(options[picked])}` : ''}`
            : 'Learner has not picked an option yet.',
        );
        break;
      }
      case 'true_false': {
        const opts = options.length > 0 ? options : ['True', 'False'];
        opts.forEach((o) => lines.push(`  - ${clean(o)}`));
        const v = a && a.kind === 'true_false' ? a.value : undefined;
        lines.push(typeof v === 'boolean' ? `Learner answered: ${v ? 'True' : 'False'}` : 'Learner has not answered yet.');
        break;
      }
      case 'fill_blank': {
        const t = a && a.kind === 'fill_blank' ? clean(a.text) : '';
        lines.push(`Learner typed: ${t || '(empty)'}`);
        break;
      }
      case 'translation': {
        const lang = clean((q.payload as Record<string, unknown> | undefined)?.targetLanguage);
        if (lang) lines.push(`Target language: ${lang}`);
        const t = a && a.kind === 'translation' ? clean(a.text) : '';
        lines.push(`Learner typed: ${t || '(empty)'}`);
        break;
      }
      case 'code_output': {
        const p = q.payload as Record<string, unknown> | undefined;
        const lang = clean(p?.language);
        const code = clean(p?.code);
        if (lang) lines.push(`Language: ${lang}`);
        if (code) lines.push(`Code shown to the learner:\n${code}`);
        const t = a && a.kind === 'code_output' ? clean(a.text) : '';
        lines.push(`Learner's predicted output: ${t || '(empty)'}`);
        break;
      }
      case 'word_bank': {
        const p = q.payload as Record<string, unknown> | undefined;
        const template = clean(p?.template);
        const bank = strArr(p?.wordBank).map(clean);
        if (template) lines.push(`Template: ${template}`);
        if (bank.length) lines.push(`Word bank: ${bank.join(', ')}`);
        const fills = a && a.kind === 'word_bank' ? a.slotAnswers : [];
        const slotCount = Array.isArray(p?.slots) ? (p!.slots as unknown[]).length : fills.length;
        for (let i = 0; i < slotCount; i++) {
          const f = fills[i];
          lines.push(`  slot ${i + 1}: ${f == null ? 'empty' : clean(f) || 'empty'}`);
        }
        break;
      }
      case 'match_pairs': {
        const p = q.payload as Record<string, unknown> | undefined;
        const pairs = Array.isArray(p?.pairs) ? (p!.pairs as unknown[]) : [];
        const lefts = pairs.map((e) => (isObj(e) ? clean(e.left) : ''));
        const rights = pairs.map((e) => (isObj(e) ? clean(e.right) : ''));
        if (lefts.length) lines.push(`Left column: ${lefts.join(' | ')}`);
        if (rights.length) lines.push(`Right column (shuffled): ${rights.join(' | ')}`);
        const conns = a && a.kind === 'match_pairs' ? a.connections : [];
        const connectedLefts = new Set<number>();
        conns.forEach((c) => {
          connectedLefts.add(c.left);
          lines.push(`  connected: "${clean(lefts[c.left] ?? String(c.left))}" → "${clean(c.rightLabel)}"`);
        });
        const leftovers = lefts.filter((_, i) => !connectedLefts.has(i));
        if (leftovers.length) lines.push(`  still unconnected (left): ${leftovers.map(clean).join(', ')}`);
        if (conns.length === 0) lines.push('  Learner has not connected any pairs yet.');
        break;
      }
      case 'sentence_reorder': {
        const p = q.payload as Record<string, unknown> | undefined;
        const tokens = strArr(p?.correctOrder).map(clean); // the token SET (order below is the learner's)
        if (tokens.length) lines.push(`Tokens (to arrange): ${[...tokens].sort().join(' | ')}`);
        const order = a && a.kind === 'sentence_reorder' ? a.orderedTokens.map(clean) : [];
        lines.push(order.length ? `Learner's current order: ${order.join(' ')}` : "Learner hasn't arranged the tokens yet.");
        break;
      }
      case 'equation': {
        const expr = a && a.kind === 'equation' ? clean(a.expression) : '';
        lines.push(`Learner's expression: ${expr || '(empty)'}`);
        lines.push('(graded symbolically with tolerance)');
        break;
      }
      case 'timeline': {
        const p = q.payload as Record<string, unknown> | undefined;
        const events = Array.isArray(p?.events) ? (p!.events as unknown[]) : [];
        const labels = events.map((e) => (isObj(e) ? clean(e.label) : '')).filter(Boolean);
        if (labels.length) lines.push(`Labels to place: ${labels.join(', ')}`);
        const placements = a && a.kind === 'timeline' ? a.placements : {};
        const placed = Object.entries(placements);
        if (placed.length) {
          for (const [slot, label] of placed) lines.push(`  slot ${clean(slot)}: ${clean(label)}`);
        } else {
          lines.push('  Learner has not placed any labels yet.');
        }
        break;
      }
      case 'code_write': {
        return capCodeWrite(q, state);
      }
      default: {
        // Unknown kind — degrade to the prompt only (added by the caller).
        break;
      }
    }
  } catch {
    // Malformed payload/answer — never crash on live state; emit what we have.
    lines.push('(activity details unavailable)');
  }
  return lines.join('\n');
}

/**
 * code_write `safe` subsection with its own tighter caps: starter trimmed,
 * editor code capped, tests (UI-visible stdin+expected), and — when present —
 * per-test actual runs (each stderr ≤200, runs total ≤1200). Whole subsection
 * ≤3500.
 */
function capCodeWrite(q: QuizActivityQuestion, state: QuizActivityState): string {
  const p = q.payload as Record<string, unknown> | undefined;
  const a = state.answer;
  const lines: string[] = [];
  const lang = clean(p?.language) || (a && a.kind === 'code_write' ? clean(a.language) : '');
  if (lang) lines.push(`Language: ${lang}`);

  const starter = clean(p?.starterCode);
  if (starter) lines.push(`Starter code:\n${cap(starter, STARTER_CAP)}`);

  const editor = a && a.kind === 'code_write' ? clean(a.code) : '';
  lines.push(`Learner's current code:\n${editor ? cap(editor, EDITOR_CAP) : '(empty)'}`);

  const tests = Array.isArray(p?.tests) ? (p!.tests as unknown[]) : [];
  if (tests.length) {
    lines.push('Tests (visible to the learner):');
    tests.forEach((t, i) => {
      if (!isObj(t)) return;
      const stdin = clean(t.stdin);
      const expected = clean(t.expectedStdout);
      lines.push(`  test ${i + 1}${t.name ? ` (${clean(t.name)})` : ''}: stdin=${stdin || '∅'} → expected=${expected || '∅'}`);
    });
  }

  const runs = state.runs;
  if (Array.isArray(runs) && runs.length > 0) {
    const runLines: string[] = [];
    runs.forEach((r, i) => {
      const stderr = cap(clean(r.stderr), STDERR_CAP);
      runLines.push(
        `  run ${i + 1}: ${r.ok ? 'PASS' : 'FAIL'} exit=${r.exitCode ?? '?'} stdout=${clean(r.stdout) || '∅'}` +
          (stderr ? ` stderr=${stderr}` : ''),
      );
    });
    lines.push('Actual test runs:\n' + cap(runLines.join('\n'), RUNS_CAP));
  }

  return cap(lines.join('\n'), CODE_WRITE_CAP);
}

/**
 * Derive the actual correct answer per kind for the `revealing` block. Reads the
 * answer key straight from the payload/columns — this NEVER goes into `safe`.
 * Returns '' when it can't be derived (degrades gracefully).
 */
function deriveCorrectAnswer(q: QuizActivityQuestion): string {
  const p = q.payload as Record<string, unknown> | undefined;
  try {
    switch (q.kind) {
      case 'mc':
      case 'diagram_cloze': {
        const options = q.options && q.options.length ? q.options : strArr(p?.options);
        const ci = typeof q.correctIndex === 'number' ? q.correctIndex : typeof p?.correctIndex === 'number' ? (p!.correctIndex as number) : -1;
        return ci >= 0 && options[ci] ? clean(options[ci]) : '';
      }
      case 'true_false':
        return typeof p?.correct === 'boolean' ? (p!.correct ? 'True' : 'False') : '';
      case 'fill_blank':
      case 'translation':
      case 'code_output': {
        const blank = isObj(p?.blank) ? (p!.blank as Record<string, unknown>) : undefined;
        return strArr(blank?.acceptableAnswers).map(clean).filter(Boolean).join(' / ');
      }
      case 'word_bank': {
        const slots = Array.isArray(p?.slots) ? (p!.slots as unknown[]) : [];
        return slots.map((s) => (isObj(s) ? clean(s.correctAnswer) : '')).filter(Boolean).join(', ');
      }
      case 'match_pairs': {
        const pairs = Array.isArray(p?.pairs) ? (p!.pairs as unknown[]) : [];
        return pairs.map((e) => (isObj(e) ? `${clean(e.left)} → ${clean(e.right)}` : '')).filter(Boolean).join('; ');
      }
      case 'sentence_reorder':
        return strArr(p?.correctOrder).map(clean).join(' ');
      case 'equation':
        return clean(p?.expectedExpression);
      case 'timeline': {
        const events = Array.isArray(p?.events) ? (p!.events as unknown[]) : [];
        return events.map((e) => (isObj(e) ? `${clean(e.year)}: ${clean(e.label)}` : '')).filter(Boolean).join('; ');
      }
      case 'code_write':
        return ''; // no single canonical answer — tests are the key, already in safe
      default:
        return '';
    }
  } catch {
    return '';
  }
}

/**
 * Cap the revealing parts to ≤1500 chars TOTAL across the fields (in order:
 * correctAnswer, pickedFeedback, fullExplanation, allOptionFeedback), dropping /
 * truncating from the least-important end.
 */
function capRevealing(parts: MageRevealingParts): MageRevealingParts {
  const out: MageRevealingParts = {};
  let budget = REVEALING_CAP;
  const order: (keyof MageRevealingParts)[] = ['correctAnswer', 'pickedFeedback', 'fullExplanation', 'allOptionFeedback'];
  for (const key of order) {
    const v = parts[key];
    if (!v || budget <= 0) continue;
    out[key] = v.length <= budget ? v : cap(v, budget);
    budget -= out[key]!.length;
  }
  return out;
}

/**
 * Serialize the on-screen quiz activity into a `safe` block (options + the
 * learner's input + verdict, NEVER a key) and structured `revealing` parts (the
 * key + feedback, only for a graded non-exam question). Pure, partial-safe,
 * redacted, and capped — the single serializer for QuizViewer AND RemediationBody.
 */
export function buildQuizActivityContext(
  question: QuizActivityQuestion,
  state: QuizActivityState,
): { safe: string; revealing: MageRevealingParts } {
  const graded = state.isSubmittedOrRevealed && state.surface !== 'mock-exam';

  const header = [
    `Surface: ${state.surface}`,
    `Mode: ${state.surface === 'mock-exam' ? 'mock exam' : 'practice'}`,
    `Submission state: ${state.isSubmittedOrRevealed ? 'submitted' : 'in progress'}`,
    `Reveal policy: ${revealPolicyLabel(state)}`,
  ];

  const body: string[] = [];
  body.push(`Question (kind: ${redact(String(question.kind))}): ${clean(question.question)}`);
  const fig = clean(question.figureCaption);
  if (fig) body.push(`Figure caption: ${fig} (image not shown to you)`);
  const src = clean(question.sourceQuote);
  if (src) body.push(`Source passage: ${src}`);

  body.push(buildSafeBody(question, state));

  const hint = clean(question.hint);
  if (hint) body.push(`Hint (${state.hintShown ? 'shown to learner' : 'not yet revealed'}): ${hint}`);

  // Post-submit verdict + retry — but NEVER for a mock exam in progress.
  if (graded) {
    if (typeof state.isCorrect === 'boolean') {
      body.push(`Verdict: ${state.isCorrect ? 'CORRECT' : 'INCORRECT'}`);
    }
    if (state.retried) body.push('(this was a retry of a previously-missed question)');
  }

  const safe = cap([...header, '', ...body].join('\n'), SAFE_CAP);

  // Revealing — only for a graded non-exam question; empty {} otherwise.
  if (!graded) return { safe, revealing: {} };

  const parts: MageRevealingParts = {};
  const correct = deriveCorrectAnswer(question);
  if (correct) parts.correctAnswer = correct;
  // picked-specific feedback: on a wrong answer, the wrong-explanation is the
  // targeted feedback for what they chose.
  const wrong = clean(question.wrongExplanation);
  if (state.isCorrect === false && wrong) parts.pickedFeedback = wrong;
  const full = clean(question.correctExplanation);
  if (full) parts.fullExplanation = full;
  // allOptionFeedback — cheap only: MC per-option feedback if present on payload.
  const feedback = (question.payload as Record<string, unknown> | undefined)?.optionFeedback;
  if (Array.isArray(feedback)) {
    const opts = question.options && question.options.length ? question.options : strArr((question.payload as Record<string, unknown> | undefined)?.options);
    const rows = feedback
      .map((f, i) => (isObj(f) && typeof f.explanation === 'string' ? `(${i + 1}) ${clean(opts[i] ?? String(i + 1))}: ${clean(f.explanation)}` : ''))
      .filter(Boolean);
    if (rows.length) parts.allOptionFeedback = rows.join('\n');
  }

  return { safe, revealing: capRevealing(parts) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Flashcard activity serializer (Mage Real Context P3)
//
// Flashcards aren't quiz kinds, so `buildQuizActivityContext` doesn't apply.
// This is the tiny flashcard analogue: the on-screen card + flip state → the
// same `{ safe, revealing }` shape. Flashcards register as `type: 'practice'`
// (gate `hint_only`), so the server STRIPS `revealing`. That's what makes
// pre-flip safe: put the BACK in `revealing.correctAnswer` while unflipped
// (stripped by the server), and into `safe` only once flipped (never stripped).
// ─────────────────────────────────────────────────────────────────────────────

export function buildFlashcardActivityContext(
  card: { front: string; back: string; imageCaptions?: (string | null)[] },
  state: { deckTitle: string; position: number; total: number; isFlipped: boolean; lastGrade?: string | null },
): { safe: string; revealing: MageRevealingParts } {
  const lines: string[] = [
    'Surface: flashcard review',
    `Deck: ${clean(state.deckTitle)}`,
    `Card ${state.position} of ${state.total}`,
    `Flip state: ${state.isFlipped ? 'flipped (answer shown)' : 'front only'}`,
    `FRONT: ${clean(card.front)}`,
  ];
  if (state.isFlipped) lines.push(`BACK: ${clean(card.back)}`);
  for (const c of card.imageCaptions ?? []) {
    const caption = clean(c);
    if (caption) lines.push(`Image caption: ${caption} (image not shown to you)`);
  }
  if (state.lastGrade) lines.push(`Last self-grade: ${clean(state.lastGrade)}`);

  const safe = cap(lines.join('\n'), SAFE_CAP);
  // Pre-flip: hide the back behind the gate (server strips it under hint_only).
  // Post-flip: the back is already in `safe`, so revealing is empty.
  const revealing = state.isFlipped ? {} : capRevealing({ correctAnswer: clean(card.back) });
  return { safe, revealing };
}

/** What the server resolves a client context into. Ids are authorized-only. */
export interface ResolvedMageContext {
  type: MageContextType;
  /** Only ids the requesting user actually owns survive here. */
  ids: MageContextIds;
  title?: string;
  selectedText?: string;
  activeQuestionId?: string;
  /** The `safe` activity snapshot (see MageClientContext.activityContext). */
  activityContext?: string;
  /** Structured revealing data (see MageClientContext.activityRevealing). */
  activityRevealing?: MageRevealingParts;
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
      'Keep it tight: lead with the most useful next step in a sentence or two, then only the essential detail. Don’t pad.',
  };
}

/**
 * P4a — the ask-first "uncovered / fallback" directive for a set of thread
 * grants. Pure + client-safe so it's single-sourced and unit-testable.
 * REPLACES the silent-general-knowledge `uncoveredDirective` for non-strict
 * quick/deep answers: neither grant → restrained offer (never a dead end),
 * grants → the allowed fallback with its citation rule. Only consulted for
 * gate `open`/`hint_only` + non-strict (strict + sealed ignore grants, per the
 * policy matrix). Web *execution* is P5 — this only sets the prompt directive.
 */
export function mageGrantUncoveredDirective(grants: MageThreadGrants): string {
  const { allowWebSearch, allowGeneralKnowledge } = grants;
  if (allowWebSearch && allowGeneralKnowledge) {
    return 'You may use both your general knowledge and web results alongside the sources. Cite web sources by domain in prose (e.g. "according to nature.com"); [S#] stays reserved for the numbered material. Disclose plainly when your reasoning goes beyond the material.';
  }
  if (allowWebSearch) {
    return 'You may use web results in addition to the sources. Cite web sources by their domain in prose (e.g. "according to nature.com"); [S#] markers stay reserved for the numbered material. Do not add unsupported claims from memory.';
  }
  if (allowGeneralKnowledge) {
    return 'You may answer from your own general knowledge in addition to the sources. When a claim goes beyond the numbered material, say so plainly. Do not browse the web.';
  }
  // Neither granted — restrained offer, never a dead end.
  return 'If your numbered sources cover the question, answer from them. If they do NOT cover it, do NOT answer from outside or general knowledge and do NOT browse — instead say the materials don\'t seem to cover it and offer: you can answer from Mage\'s own knowledge, or search the web for current sources. For a partially-covered question, answer the covered part from the sources, then make the same offer for the rest.';
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
