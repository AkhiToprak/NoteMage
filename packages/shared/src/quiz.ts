// Quiz V2 — discriminated union of question kinds.
//
// Source of truth for: AI tool input, server validation, client renderers.
// Phase 1 shipped only the `mc` variant. Phase 2 (this file's current shape)
// adds fill_blank, word_bank, match_pairs, translation, sentence_reorder,
// equation. true_false is reserved but not yet shipped.
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

export const FillBlankPayloadSchema = z.object({
  blank: z.object({
    acceptableAnswers: z.array(z.string().min(1)).min(1),
    caseSensitive: z.boolean().optional(),
    fuzzyThreshold: z.number().min(0).max(1).optional(),
  }),
});
export type FillBlankPayload = z.infer<typeof FillBlankPayloadSchema>;

export const TranslationPayloadSchema = z.object({
  targetLanguage: z.string().min(1),
  blank: z.object({
    acceptableAnswers: z.array(z.string().min(1)).min(1),
    caseSensitive: z.boolean().optional(),
    fuzzyThreshold: z.number().min(0).max(1).optional(),
  }),
});
export type TranslationPayload = z.infer<typeof TranslationPayloadSchema>;

export const WordBankPayloadSchema = z.object({
  template: z.string().min(1),
  slots: z.array(z.object({ correctAnswer: z.string().min(1) })).min(1),
  wordBank: z.array(z.string().min(1)).min(2),
});
export type WordBankPayload = z.infer<typeof WordBankPayloadSchema>;

export const MatchPairsPayloadSchema = z.object({
  pairs: z
    .array(
      z.object({
        left: z.string().min(1),
        right: z.string().min(1),
      })
    )
    .min(2)
    .max(8),
});
export type MatchPairsPayload = z.infer<typeof MatchPairsPayloadSchema>;

export const SentenceReorderPayloadSchema = z.object({
  correctOrder: z.array(z.string().min(1)).min(2).max(12),
});
export type SentenceReorderPayload = z.infer<typeof SentenceReorderPayloadSchema>;

export const EquationPayloadSchema = z.object({
  expectedExpression: z.string().min(1),
  tolerance: z.number().min(0).optional(),
  variables: z.array(z.string().min(1)).optional(),
});
export type EquationPayload = z.infer<typeof EquationPayloadSchema>;

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
  z.object({
    kind: z.literal('fill_blank'),
    ...QuestionCommonShape,
    payload: FillBlankPayloadSchema,
  }),
  z.object({
    kind: z.literal('word_bank'),
    ...QuestionCommonShape,
    payload: WordBankPayloadSchema,
  }),
  z.object({
    kind: z.literal('match_pairs'),
    ...QuestionCommonShape,
    payload: MatchPairsPayloadSchema,
  }),
  z.object({
    kind: z.literal('translation'),
    ...QuestionCommonShape,
    payload: TranslationPayloadSchema,
  }),
  z.object({
    kind: z.literal('sentence_reorder'),
    ...QuestionCommonShape,
    payload: SentenceReorderPayloadSchema,
  }),
  z.object({
    kind: z.literal('equation'),
    ...QuestionCommonShape,
    payload: EquationPayloadSchema,
  }),
]);
export type QuizQuestionV2 = z.infer<typeof QuizQuestionV2Schema>;

export const QuizSetV2Schema = z.object({
  title: z.string().min(1),
  questions: z.array(QuizQuestionV2Schema).min(1),
});
export type QuizSetV2 = z.infer<typeof QuizSetV2Schema>;
