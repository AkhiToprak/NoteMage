// Quiz grading dispatch + persistence helpers. One file owns every
// kind-aware decision so adding a new question kind touches only this file
// plus its renderer.

import { get as levenshteinDistance } from 'fast-levenshtein';
import * as math from 'mathjs';
import {
  McPayloadSchema,
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
}

function readEquationPayload(payload: unknown): EquationParsed | null {
  if (!payload || typeof payload !== 'object') return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.expectedExpression !== 'string' || p.expectedExpression.length === 0) return null;
  const tolerance = typeof p.tolerance === 'number' ? p.tolerance : undefined;
  const variables = Array.isArray(p.variables)
    ? p.variables.filter((s): s is string => typeof s === 'string')
    : undefined;
  return { expectedExpression: p.expectedExpression, tolerance, variables };
}

function gradeEquation(userExpression: string, p: EquationParsed): QuizGradeResult {
  if (userExpression.trim().length === 0) return { isCorrect: false };
  try {
    if (p.variables && p.variables.length > 0) {
      // Multi-point numeric equivalence. Avoids relying on symbolic-simplify
      // identifying every algebraic restatement.
      const samples = [1.7183, 2.5, -0.41, 3.14159];
      const userNode = math.parse(userExpression);
      const expectedNode = math.parse(p.expectedExpression);
      const tol = p.tolerance ?? 1e-6;
      for (const seed of samples) {
        const scope = Object.fromEntries(
          p.variables.map((v, i) => [v, seed + i * 0.137])
        );
        const userVal = Number(userNode.evaluate(scope));
        const expectedVal = Number(expectedNode.evaluate(scope));
        if (!Number.isFinite(userVal) || !Number.isFinite(expectedVal)) {
          return { isCorrect: false };
        }
        if (Math.abs(userVal - expectedVal) > tol) return { isCorrect: false };
      }
      return { isCorrect: true };
    }
    // No declared variables → evaluate both as numbers.
    const userVal = Number(math.evaluate(userExpression));
    const expectedVal = Number(math.evaluate(p.expectedExpression));
    if (!Number.isFinite(userVal) || !Number.isFinite(expectedVal)) {
      return { isCorrect: false };
    }
    return { isCorrect: Math.abs(userVal - expectedVal) < (p.tolerance ?? 1e-6) };
  } catch {
    return { isCorrect: false };
  }
}

function normalize(s: string): string {
  return s.trim().toLowerCase();
}
