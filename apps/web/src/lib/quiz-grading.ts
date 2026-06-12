// Quiz grading dispatch + persistence helpers. One file owns every
// kind-aware decision so adding a new question kind touches only this file
// plus its renderer.

import { get as levenshteinDistance } from 'fast-levenshtein';
import { safeEvaluate, safeParse } from './safe-math';
import {
  McPayloadSchema,
  DiagramClozePayloadSchema,
  type QuestionKind,
} from '@notemage/shared';
import type { UserAnswer } from '@/components/quiz/questionRenderers/types';

export interface QuizGradeResult {
  isCorrect: boolean;
  feedback?: string;
}

// Legacy column data for MC questions still living on `options` +
// `correctIndex`. Both columns are non-null in Postgres for every row,
// so callers always pass them — even for non-MC rows (where they are
// unused). Kept as a single object so a future kind doesn't need a fresh
// param.
export interface LegacyMcColumns {
  options: string[];
  correctIndex: number;
}

const MATCH_PAIRS_PAYLOAD_KEY = 'pairs';

/**
 * Grade a single answer against a stored question.
 *
 * @param kind Question kind from `QuizQuestion.kind`.
 * @param payload Kind-specific payload from `QuizQuestion.payload`. May be
 *   null for legacy MC rows; the grader falls back to `legacyColumns` then.
 * @param legacyColumns The legacy `options` + `correctIndex` columns,
 *   always provided so the MC branch can read them when `payload` is null.
 * @param userAnswer The submitted answer (shape varies by kind).
 */
export function grade(
  kind: QuestionKind,
  payload: unknown,
  legacyColumns: LegacyMcColumns,
  userAnswer: UserAnswer | undefined
): QuizGradeResult {
  if (!userAnswer) return { isCorrect: false };

  switch (kind) {
    case 'mc': {
      if (userAnswer.kind !== 'mc') return { isCorrect: false };
      const parsed =
        payload === null || payload === undefined ? null : McPayloadSchema.safeParse(payload);
      const options = parsed && parsed.success ? parsed.data.options : legacyColumns.options;
      const correctIndex =
        parsed && parsed.success ? parsed.data.correctIndex : legacyColumns.correctIndex;
      const selectedIdx = userAnswer.selectedIdx;
      if (!Number.isInteger(selectedIdx) || selectedIdx < 0 || selectedIdx >= options.length) {
        return { isCorrect: false };
      }
      return { isCorrect: selectedIdx === correctIndex };
    }
    case 'diagram_cloze': {
      // Multiple-choice at heart: the learner picked one of the 4 options;
      // grade against the payload's `correctIndex` (legacy columns mirror it).
      if (userAnswer.kind !== 'diagram_cloze') return { isCorrect: false };
      const parsed =
        payload === null || payload === undefined
          ? null
          : DiagramClozePayloadSchema.safeParse(payload);
      const options = parsed && parsed.success ? parsed.data.options : legacyColumns.options;
      const correctIndex =
        parsed && parsed.success ? parsed.data.correctIndex : legacyColumns.correctIndex;
      const selectedIdx = userAnswer.selectedIdx;
      if (!Number.isInteger(selectedIdx) || selectedIdx < 0 || selectedIdx >= options.length) {
        return { isCorrect: false };
      }
      return { isCorrect: selectedIdx === correctIndex };
    }
    case 'fill_blank': {
      if (userAnswer.kind !== 'fill_blank') return { isCorrect: false };
      const p = readFillBlankPayload(payload);
      if (!p) return { isCorrect: false };
      const matched = fuzzyMatch(
        userAnswer.text,
        p.acceptableAnswers,
        p.fuzzyThreshold ?? 0.85,
        p.caseSensitive ?? false
      );
      return { isCorrect: matched };
    }
    case 'translation': {
      if (userAnswer.kind !== 'translation') return { isCorrect: false };
      const p = readTranslationPayload(payload);
      if (!p) return { isCorrect: false };
      const matched = fuzzyMatch(
        userAnswer.text,
        p.acceptableAnswers,
        p.fuzzyThreshold ?? 0.75,
        p.caseSensitive ?? false
      );
      return { isCorrect: matched };
    }
    case 'word_bank': {
      if (userAnswer.kind !== 'word_bank') return { isCorrect: false };
      const p = readWordBankPayload(payload);
      if (!p) return { isCorrect: false };
      if (userAnswer.slotAnswers.length !== p.slots.length) return { isCorrect: false };
      const allMatch = p.slots.every((slot, i) => {
        const submitted = userAnswer.slotAnswers[i];
        if (submitted === null || submitted === undefined) return false;
        return normalize(submitted) === normalize(slot.correctAnswer);
      });
      return { isCorrect: allMatch };
    }
    case 'match_pairs': {
      if (userAnswer.kind !== 'match_pairs') return { isCorrect: false };
      const p = readMatchPairsPayload(payload);
      if (!p) return { isCorrect: false };
      if (userAnswer.connections.length !== p.pairs.length) return { isCorrect: false };
      const seenLefts = new Set<number>();
      for (const c of userAnswer.connections) {
        if (seenLefts.has(c.left)) return { isCorrect: false };
        seenLefts.add(c.left);
        const expected = p.pairs[c.left];
        if (!expected) return { isCorrect: false };
        if (normalize(expected.right) !== normalize(c.rightLabel)) {
          return { isCorrect: false };
        }
      }
      return { isCorrect: seenLefts.size === p.pairs.length };
    }
    case 'sentence_reorder': {
      if (userAnswer.kind !== 'sentence_reorder') return { isCorrect: false };
      const p = readSentenceReorderPayload(payload);
      if (!p) return { isCorrect: false };
      if (userAnswer.orderedTokens.length !== p.correctOrder.length) {
        return { isCorrect: false };
      }
      const match = p.correctOrder.every((tok, i) => tok === userAnswer.orderedTokens[i]);
      return { isCorrect: match };
    }
    case 'equation': {
      if (userAnswer.kind !== 'equation') return { isCorrect: false };
      const p = readEquationPayload(payload);
      if (!p) return { isCorrect: false };
      return gradeEquation(userAnswer.expression, p);
    }
    case 'true_false': {
      if (userAnswer.kind !== 'true_false') return { isCorrect: false };
      if (!payload || typeof payload !== 'object') return { isCorrect: false };
      const correct = (payload as { correct?: unknown }).correct;
      if (typeof correct !== 'boolean') return { isCorrect: false };
      return { isCorrect: userAnswer.value === correct };
    }
    case 'code_output': {
      if (userAnswer.kind !== 'code_output') return { isCorrect: false };
      const p = readCodeOutputPayload(payload);
      if (!p) return { isCorrect: false };
      const matched = fuzzyMatch(
        userAnswer.text,
        p.acceptableAnswers,
        p.fuzzyThreshold ?? 0.95,
        p.caseSensitive ?? true
      );
      return { isCorrect: matched };
    }
    case 'timeline': {
      if (userAnswer.kind !== 'timeline') return { isCorrect: false };
      const p = readTimelinePayload(payload);
      if (!p) return { isCorrect: false };
      const placements = userAnswer.placements;
      if (Object.keys(placements).length !== p.events.length) {
        return { isCorrect: false };
      }
      // Each label's canonical year. Lets same-year events be interchangeable
      // across their (identical-year) slots: a label is correct in any slot
      // whose year matches the label's true year.
      const labelToYear = new Map<string, string>();
      for (const e of p.events) labelToYear.set(normalize(e.label), normalize(e.year));
      for (let i = 0; i < p.events.length; i++) {
        // New answers key placements by event index; older answers (unique
        // years only) keyed by year — fall back to that so they still grade.
        const submitted = placements[String(i)] ?? placements[p.events[i].year];
        if (typeof submitted !== 'string') return { isCorrect: false };
        const placedYear = labelToYear.get(normalize(submitted));
        if (placedYear === undefined) return { isCorrect: false };
        if (placedYear !== normalize(p.events[i].year)) return { isCorrect: false };
      }
      return { isCorrect: true };
    }
    case 'code_write': {
      // The renderer ran the user's code server-side via
      // /api/quiz/code-execute when the learner submitted, and recorded
      // the verdict on the answer. Server-side re-verification on quiz
      // submission is a future hardening pass — for now the verdict is
      // produced by trusted server code (the proxy route), not arbitrary
      // client logic, so trusting `passed` is safe.
      if (userAnswer.kind !== 'code_write') return { isCorrect: false };
      return { isCorrect: userAnswer.passed === true };
    }
    default: {
      // Exhaustiveness guard. If a new kind is added to QuestionKind but not
      // here, TypeScript flags this assignment.
      const _exhaustive: never = kind;
      throw new Error(`Grading not implemented for kind: ${String(_exhaustive)}`);
    }
  }
}

/**
 * Maps a kind + payload to the legacy `options` + `correctIndex` columns
 * (still NOT NULL on QuizQuestion). MC rows mirror the payload's answer key;
 * non-MC rows pass sentinels because the columns are otherwise unused.
 */
export function buildLegacyColumns(
  kind: QuestionKind,
  payload: unknown
): { options: string[]; correctIndex: number } {
  if (kind === 'mc') {
    const parsed = McPayloadSchema.safeParse(payload);
    if (parsed.success) {
      return { options: parsed.data.options, correctIndex: parsed.data.correctIndex };
    }
  }
  // diagram_cloze (Phase 5): also multiple-choice at heart — mirror its payload
  // options/correctIndex onto the legacy columns so the row is self-describing
  // even before any payload backfill, matching the MC convention.
  if (kind === 'diagram_cloze') {
    const parsed = DiagramClozePayloadSchema.safeParse(payload);
    if (parsed.success) {
      return { options: parsed.data.options, correctIndex: parsed.data.correctIndex };
    }
  }
  return { options: [], correctIndex: 0 };
}

/**
 * Levenshtein-ratio fuzzy match for typed answers.
 *
 * The ratio is `1 - distance / max(input.length, candidate.length)`, where
 * distance is the standard edit distance. A threshold of 0.85 means the
 * input must be within 15% character changes of one of the candidates.
 */
export function fuzzyMatch(
  input: string,
  candidates: string[],
  threshold: number,
  caseSensitive = false
): boolean {
  const normalizedInput = caseSensitive ? input.trim() : input.trim().toLowerCase();
  if (normalizedInput.length === 0) return false;

  for (const candidate of candidates) {
    const normalizedCandidate = caseSensitive ? candidate.trim() : candidate.trim().toLowerCase();
    if (normalizedInput === normalizedCandidate) return true;
    const longer = Math.max(normalizedInput.length, normalizedCandidate.length);
    if (longer === 0) continue;
    const distance = levenshteinDistance(normalizedInput, normalizedCandidate);
    const ratio = 1 - distance / longer;
    if (ratio >= threshold) return true;
  }
  return false;
}

// ─── Per-kind payload parsers (defensive; payload is JSONB from Postgres) ───

interface FillBlankParsed {
  acceptableAnswers: string[];
  caseSensitive?: boolean;
  fuzzyThreshold?: number;
}

function readFillBlankPayload(payload: unknown): FillBlankParsed | null {
  if (!payload || typeof payload !== 'object') return null;
  const blank = (payload as { blank?: unknown }).blank;
  if (!blank || typeof blank !== 'object') return null;
  const b = blank as Record<string, unknown>;
  const acceptable = Array.isArray(b.acceptableAnswers)
    ? b.acceptableAnswers.filter((s): s is string => typeof s === 'string' && s.length > 0)
    : [];
  if (acceptable.length === 0) return null;
  return {
    acceptableAnswers: acceptable,
    caseSensitive: typeof b.caseSensitive === 'boolean' ? b.caseSensitive : undefined,
    fuzzyThreshold: typeof b.fuzzyThreshold === 'number' ? b.fuzzyThreshold : undefined,
  };
}

interface TranslationParsed extends FillBlankParsed {
  targetLanguage: string;
}

function readTranslationPayload(payload: unknown): TranslationParsed | null {
  const blank = readFillBlankPayload(payload);
  if (!blank) return null;
  const targetLanguage = (payload as { targetLanguage?: unknown }).targetLanguage;
  if (typeof targetLanguage !== 'string' || targetLanguage.length === 0) return null;
  return { ...blank, targetLanguage };
}

interface WordBankParsed {
  template: string;
  slots: { correctAnswer: string }[];
  wordBank: string[];
}

function readWordBankPayload(payload: unknown): WordBankParsed | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.template !== 'string' || p.template.length === 0) return null;
  if (!Array.isArray(p.slots) || p.slots.length === 0) return null;
  const slots = p.slots
    .map((s) => {
      if (!s || typeof s !== 'object') return null;
      const correctAnswer = (s as { correctAnswer?: unknown }).correctAnswer;
      if (typeof correctAnswer !== 'string' || correctAnswer.length === 0) return null;
      return { correctAnswer };
    })
    .filter((s): s is { correctAnswer: string } => s !== null);
  if (slots.length !== p.slots.length) return null;
  const wordBank = Array.isArray(p.wordBank)
    ? p.wordBank.filter((s): s is string => typeof s === 'string' && s.length > 0)
    : [];
  if (wordBank.length === 0) return null;
  return { template: p.template, slots, wordBank };
}

interface MatchPairsParsed {
  pairs: { left: string; right: string }[];
}

function readMatchPairsPayload(payload: unknown): MatchPairsParsed | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const raw = p[MATCH_PAIRS_PAYLOAD_KEY];
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const pairs = raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null;
      const left = (entry as { left?: unknown }).left;
      const right = (entry as { right?: unknown }).right;
      if (typeof left !== 'string' || typeof right !== 'string') return null;
      if (left.length === 0 || right.length === 0) return null;
      return { left, right };
    })
    .filter((p): p is { left: string; right: string } => p !== null);
  if (pairs.length !== raw.length) return null;
  return { pairs };
}

interface SentenceReorderParsed {
  correctOrder: string[];
}

function readSentenceReorderPayload(payload: unknown): SentenceReorderParsed | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const raw = p.correctOrder;
  if (!Array.isArray(raw) || raw.length < 2) return null;
  const correctOrder = raw.filter((s): s is string => typeof s === 'string' && s.length > 0);
  if (correctOrder.length !== raw.length) return null;
  return { correctOrder };
}

interface EquationParsed {
  expectedExpression: string;
  tolerance?: number;
  variables?: string[];
  acceptedExpressions?: string[];
}

function readEquationPayload(payload: unknown): EquationParsed | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.expectedExpression !== 'string' || p.expectedExpression.length === 0) return null;
  const tolerance = typeof p.tolerance === 'number' ? p.tolerance : undefined;
  const variables = Array.isArray(p.variables)
    ? p.variables.filter((s): s is string => typeof s === 'string')
    : undefined;
  // `.slice(0, 8)` mirrors the schema's `.max(8)` so a hand-edited/legacy DB row
  // that bypassed the zod cap can't widen the grade-time compare loop.
  const acceptedExpressions = Array.isArray(p.acceptedExpressions)
    ? p.acceptedExpressions
        .filter((s): s is string => typeof s === 'string' && s.length > 0)
        .slice(0, 8)
    : undefined;
  return { expectedExpression: p.expectedExpression, tolerance, variables, acceptedExpressions };
}

// Untrusted expressions are bounded in length: even behind the hardened
// safe-math instance, mathjs can evaluate pathologically expensive inputs
// (huge factorials/exponents, deep nesting). Cap before parsing so the
// grading path can't be turned into a CPU/ReDoS sink.
const MAX_EQUATION_CHARS = 256;

/**
 * Normalize a raw math answer to the ASCII form safe-math expects, WITHOUT
 * touching statement separators (newlines stay so extraction can split on
 * them). Applied to BOTH the user answer and every expected expression so the
 * two sides are compared on equal footing.
 *
 * - Unicode operators/symbols → ASCII (`×→*`, `÷→/`, U+2212 `−→-`, `²→^2`,
 *   `³→^3`, `π→pi`), strip `≈` and a leading `~` (approximation markers).
 * - Locale decimals: a comma directly between digits, when it's the only comma
 *   in that digit run, is a decimal point (`2,5 → 2.5`). Thousands-style runs
 *   with several commas are left alone (ambiguous, not a decimal).
 * - Collapse horizontal whitespace; newlines are preserved as separators.
 */
function normalizeMathInput(raw: string): string {
  let s = raw.replace(/≈/g, '').replace(/^\s*~+\s*/, '');
  s = s
    .replace(/×/g, '*')
    .replace(/[·⋅]/g, '*') // middle dot / dot operator → multiply
    .replace(/÷/g, '/')
    .replace(/[−–—‐―]/g, '-') // U+2212 minus + en/em/hyphen/horizontal-bar dashes
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/π/g, 'pi');
  // Locale decimal comma → point, but ONLY at bracket depth 0 and only for an
  // unambiguous single comma between digits (`2,5 → 2.5`). A comma INSIDE
  // parentheses is a function-argument separator (`max(2,5)`) and must be left
  // intact; a multi-comma run (`1,000,000`) is ambiguous and left intact too.
  s = convertDecimalCommas(s);
  // Collapse spaces/tabs/CR but keep newlines for statement splitting.
  return s.replace(/[ \t\f\v\r]+/g, ' ').trim();
}

/**
 * Convert German/Swiss decimal commas to points, but only where a comma is
 * unambiguously a decimal: a single comma between digits at bracket depth 0.
 * Commas inside `()`/`[]`/`{}` are function-argument separators and are left
 * untouched, so `max(2,5)` stays a two-argument call rather than collapsing to
 * `max(2.5)`. Done as a depth-tracking scan because a plain regex over the
 * whole string can't tell an arg comma from a decimal comma.
 */
function convertDecimalCommas(s: string): string {
  let depth = 0;
  let out = '';
  let i = 0;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      out += ch;
      i++;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth > 0) depth--;
      out += ch;
      i++;
    } else if (ch >= '0' && ch <= '9') {
      // Consume the maximal run of digits and commas. Bracket depth is constant
      // across it (neither digits nor commas change depth).
      let j = i;
      while (j < s.length && ((s[j] >= '0' && s[j] <= '9') || s[j] === ',')) j++;
      const run = s.slice(i, j);
      out += depth === 0 && /^\d+,\d+$/.test(run) ? run.replace(',', '.') : run;
      i = j;
    } else {
      out += ch;
      i++;
    }
  }
  return out;
}

/**
 * Split a normalized answer into statements at top-level `,`/`;` and at any
 * `\n`, `→`, or `=>`. Commas/semicolons INSIDE parentheses are left intact so
 * function-argument lists (`max(2, 3)`, `mod(10, 3)`) survive — only
 * separators at bracket depth 0 cut. Decimal commas were already converted by
 * `normalizeMathInput`, so a remaining top-level comma is a real separator.
 */
function splitStatements(input: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      cur += ch;
    } else if (ch === ')' || ch === ']' || ch === '}') {
      if (depth > 0) depth--;
      cur += ch;
    } else if (input.startsWith('=>', i)) {
      out.push(cur);
      cur = '';
      i++; // consume the '>' too
    } else if (ch === '\n' || ch === '→') {
      out.push(cur);
      cur = '';
    } else if ((ch === ',' || ch === ';') && depth === 0) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * From a normalized answer, derive the ordered candidate expressions to grade.
 * Learners show their work and state the final answer LAST, so only the last
 * statement is considered. Within it (≤3 candidates):
 *   - if it contains `=`: the RHS of the last `=`, then the LHS of the first
 *     `=` (covers `x=5` and `5=x`);
 *   - otherwise: the whole statement.
 * The original equation alone (`2x+3=13`) yields `13` and `2x+3` — neither
 * equals the answer `5`, so leniency never manufactures a false positive.
 */
function extractAnswerCandidates(normalized: string): string[] {
  const statements = splitStatements(normalized);
  if (statements.length === 0) return [];
  const last = statements[statements.length - 1];
  const raw: string[] = [];
  // The `equation` kind is for final-answer math, never relations: relational
  // operators (`>=`, `<=`, `==`) are out of scope and aren't parsed specially —
  // their `=` just splits here, leaving a dangling fragment that fails to parse
  // and is harmlessly discarded by compareExpressions' try/catch.
  if (last.includes('=')) {
    const rhs = last.slice(last.lastIndexOf('=') + 1).trim();
    const lhs = last.slice(0, last.indexOf('=')).trim();
    if (rhs.length > 0) raw.push(rhs);
    if (lhs.length > 0) raw.push(lhs);
  } else {
    raw.push(last);
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of raw) {
    if (seen.has(c)) continue;
    seen.add(c);
    out.push(c);
    if (out.length >= 3) break;
  }
  return out;
}

/**
 * The single expression `gradeEquation` will try FIRST for a raw user answer —
 * the same normalize → extract pipeline the grader uses, exposed so the
 * equation renderer's live preview can show the learner exactly what will be
 * graded ("Grading: …"). One implementation feeds both verdict and preview, so
 * the two can never drift (B4.6). Returns null for empty, over-length, or
 * no-candidate input (the preview then shows its can't-read hint).
 */
export function extractGradingCandidate(raw: string): string | null {
  if (raw.trim().length === 0) return null;
  if (raw.length > MAX_EQUATION_CHARS) return null;
  const candidates = extractAnswerCandidates(normalizeMathInput(raw));
  return candidates.length > 0 ? candidates[0] : null;
}

/**
 * Numerically compare one user expression against one expected expression via
 * the hardened safe-math engine. With declared `variables`, samples at several
 * points (algebraic equivalence); otherwise a single numeric compare. Any
 * parse/eval error or non-finite value → not a match (never throws).
 */
function compareExpressions(
  userExpr: string,
  expectedExpr: string,
  variables: string[] | null,
  tol: number
): boolean {
  try {
    if (variables) {
      // Multi-point numeric equivalence. Avoids relying on symbolic-simplify
      // identifying every algebraic restatement.
      const samples = [1.7183, 2.5, -0.41, 3.14159];
      const userNode = safeParse(userExpr);
      const expectedNode = safeParse(expectedExpr);
      for (const seed of samples) {
        const scope = Object.fromEntries(variables.map((v, i) => [v, seed + i * 0.137]));
        const userVal = Number(userNode.evaluate(scope));
        const expectedVal = Number(expectedNode.evaluate(scope));
        if (!Number.isFinite(userVal) || !Number.isFinite(expectedVal)) return false;
        if (Math.abs(userVal - expectedVal) > tol) return false;
      }
      return true;
    }
    const userVal = Number(safeEvaluate(userExpr));
    const expectedVal = Number(safeEvaluate(expectedExpr));
    if (!Number.isFinite(userVal) || !Number.isFinite(expectedVal)) return false;
    // `<=` matches the inclusive boundary used by the variables branch above
    // (which fails only when the gap is strictly > tol).
    return Math.abs(userVal - expectedVal) <= tol;
  } catch {
    return false;
  }
}

function gradeEquation(userExpression: string, p: EquationParsed): QuizGradeResult {
  // Rollback lever: revert to the raw-string comparison if lenient grading
  // ever misbehaves in prod (no code redeploy needed).
  if (process.env.EQUATION_LENIENT_GRADING_DISABLED === '1') {
    return gradeEquationStrict(userExpression, p);
  }
  if (userExpression.trim().length === 0) return { isCorrect: false };
  // Length cap on the raw untrusted input before any parsing.
  if (userExpression.length > MAX_EQUATION_CHARS) return { isCorrect: false };

  const userCandidates = extractAnswerCandidates(normalizeMathInput(userExpression));
  if (userCandidates.length === 0) return { isCorrect: false };

  // Canonicalize every accepted expected answer (the primary expression plus
  // any `acceptedExpressions`) through the SAME normalizer + extractor. This is
  // why a legacy `=`-bearing expected (e.g. "x = 5") self-heals to its final
  // answer at grading time with no migration.
  const expectedInputs = [p.expectedExpression, ...(p.acceptedExpressions ?? [])];
  const expectedCanonical: string[] = [];
  for (const raw of expectedInputs) {
    if (typeof raw !== 'string' || raw.trim().length === 0 || raw.length > MAX_EQUATION_CHARS) {
      continue;
    }
    const cand = extractAnswerCandidates(normalizeMathInput(raw));
    if (cand.length > 0) expectedCanonical.push(cand[0]);
  }
  if (expectedCanonical.length === 0) return { isCorrect: false };

  const tol = p.tolerance ?? 1e-6;
  const variables = p.variables && p.variables.length > 0 ? p.variables : null;

  // First success wins: try each user candidate (in priority order) against
  // each accepted expected answer.
  for (const userCand of userCandidates) {
    for (const expectedCand of expectedCanonical) {
      if (compareExpressions(userCand, expectedCand, variables, tol)) {
        return { isCorrect: true };
      }
    }
  }
  return { isCorrect: false };
}

/**
 * The pre-leniency grader, kept verbatim behind the
 * `EQUATION_LENIENT_GRADING_DISABLED=1` rollback lever: raw user + expected
 * strings fed straight to safe-math with no normalization or extraction.
 */
function gradeEquationStrict(userExpression: string, p: EquationParsed): QuizGradeResult {
  if (userExpression.trim().length === 0) return { isCorrect: false };
  if (userExpression.length > MAX_EQUATION_CHARS || p.expectedExpression.length > MAX_EQUATION_CHARS) {
    return { isCorrect: false };
  }
  try {
    if (p.variables && p.variables.length > 0) {
      const samples = [1.7183, 2.5, -0.41, 3.14159];
      const userNode = safeParse(userExpression);
      const expectedNode = safeParse(p.expectedExpression);
      const tol = p.tolerance ?? 1e-6;
      for (const seed of samples) {
        const scope = Object.fromEntries(p.variables.map((v, i) => [v, seed + i * 0.137]));
        const userVal = Number(userNode.evaluate(scope));
        const expectedVal = Number(expectedNode.evaluate(scope));
        if (!Number.isFinite(userVal) || !Number.isFinite(expectedVal)) {
          return { isCorrect: false };
        }
        if (Math.abs(userVal - expectedVal) > tol) return { isCorrect: false };
      }
      return { isCorrect: true };
    }
    const userVal = Number(safeEvaluate(userExpression));
    const expectedVal = Number(safeEvaluate(p.expectedExpression));
    if (!Number.isFinite(userVal) || !Number.isFinite(expectedVal)) {
      return { isCorrect: false };
    }
    return { isCorrect: Math.abs(userVal - expectedVal) <= (p.tolerance ?? 1e-6) };
  } catch {
    return { isCorrect: false };
  }
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}

interface CodeOutputParsed extends FillBlankParsed {
  language: string;
  code: string;
}

function readCodeOutputPayload(payload: unknown): CodeOutputParsed | null {
  const blank = readFillBlankPayload(payload);
  if (!blank) return null;
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  const language = typeof p.language === 'string' && p.language.length > 0 ? p.language : 'plaintext';
  const code = typeof p.code === 'string' && p.code.length > 0 ? p.code : '';
  if (code.length === 0) return null;
  return { ...blank, language, code };
}

interface TimelineParsed {
  events: { year: string; label: string }[];
}

function readTimelinePayload(payload: unknown): TimelineParsed | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (!Array.isArray(p.events)) return null;
  const events = p.events
    .map((e) => {
      if (!e || typeof e !== 'object') return null;
      const year = (e as { year?: unknown }).year;
      const label = (e as { label?: unknown }).label;
      if (typeof year !== 'string' || typeof label !== 'string') return null;
      if (year.length === 0 || label.length === 0) return null;
      return { year, label };
    })
    .filter((e): e is { year: string; label: string } => e !== null);
  if (events.length === 0 || events.length !== p.events.length) return null;
  return { events };
}
