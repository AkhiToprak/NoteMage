// Quiz grading dispatch. Phase 1: only MC is implemented; Phase 2A/2B agents
// add the rest. The grader reads MC answers from either the kind-specific
// `payload` (newer rows) or the legacy `options`+`correctIndex` columns
// (existing rows whose payload was not backfilled yet). Phase 7 ports legacy
// rows into `payload` and drops the legacy columns.

import { McPayloadSchema, type QuestionKind } from '@notemage/shared';

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
  userAnswer: unknown
): QuizGradeResult {
  switch (kind) {
    case 'mc': {
      const parsed =
        payload === null || payload === undefined ? null : McPayloadSchema.safeParse(payload);
      const options = parsed && parsed.success ? parsed.data.options : legacyColumns.options;
      const correctIndex =
        parsed && parsed.success ? parsed.data.correctIndex : legacyColumns.correctIndex;
      const selectedIdx = typeof userAnswer === 'number' ? userAnswer : Number(userAnswer);
      if (!Number.isInteger(selectedIdx) || selectedIdx < 0 || selectedIdx >= options.length) {
        return { isCorrect: false };
      }
      return { isCorrect: selectedIdx === correctIndex };
    }
    case 'true_false':
    case 'fill_blank':
    case 'word_bank':
    case 'match_pairs':
    case 'sentence_reorder':
    case 'equation':
    case 'translation':
      throw new Error(`Grading not implemented for kind: ${kind}`);
    default: {
      // Exhaustiveness guard. If a new kind is added to QuestionKind but not
      // here, TypeScript flags this assignment.
      const _exhaustive: never = kind;
      throw new Error(`Grading not implemented for kind: ${String(_exhaustive)}`);
    }
  }
}
