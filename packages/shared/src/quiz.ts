// Quiz V2 — discriminated union of question kinds.
//
// Source of truth for: AI tool input, server validation, client renderers.
// Phase 0 ships only the `mc` variant; Phase 2A/2B agents add a variant each
// (fill_blank, word_bank, match_pairs, sentence_reorder, equation, translation).
//
// The DB row carries `kind` + `payload Json?` after the Phase 1 migration.
// Until the Phase 7 backfill, MC rows keep their legacy `options` + `correctIndex`
// columns and store `payload = null` — the grader reads from columns for those rows.

import { z } from 'zod';

export const QUESTION_KINDS = [
  'mc',
  'true_false',
  'fill_blank',
  'word_bank',
  'match_pairs',
  'sentence_reorder',
  'equation',
  'translation',
] as const;

export const QuestionKindSchema = z.enum(QUESTION_KINDS);
export type QuestionKind = z.infer<typeof QuestionKindSchema>;

export const McPayloadSchema = z.object({
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
});
export type McPayload = z.infer<typeof McPayloadSchema>;

const QuestionCommonShape = {
  prompt: z.string().min(1),
  hint: z.string().optional(),
  correctExplanation: z.string().optional(),
  wrongExplanation: z.string().optional(),
};

export const QuizQuestionV2Schema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('mc'),
    ...QuestionCommonShape,
    payload: McPayloadSchema,
  }),
]);
export type QuizQuestionV2 = z.infer<typeof QuizQuestionV2Schema>;

export const QuizSetV2Schema = z.object({
  title: z.string().min(1),
  questions: z.array(QuizQuestionV2Schema).min(1),
});
export type QuizSetV2 = z.infer<typeof QuizSetV2Schema>;
