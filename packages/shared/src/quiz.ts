// Quiz V2 — discriminated union of question kinds.
//
// Source of truth for: AI tool input, server validation, client renderers.
// Phase 1 shipped only the `mc` variant. Phase 2 adds fill_blank, word_bank,
// match_pairs, translation, sentence_reorder, equation, and true_false —
// the full 8-kind palette from the original plan.
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
  'code_output',
  'timeline',
  'code_write',
] as const;

export const CODE_LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'java',
  'cpp',
  'sql',
  'plaintext',
] as const;
export type CodeLanguage = (typeof CODE_LANGUAGES)[number];

/**
 * Languages eligible for `code_write` — code-execution-backed questions.
 * Narrower than `CODE_LANGUAGES` (no plaintext) because the server must
 * actually run the user's code on a Piston runtime.
 */
export const EXECUTABLE_CODE_LANGUAGES = [
  'python',
  'javascript',
  'typescript',
  'java',
  'cpp',
  'sql',
  'go',
  'rust',
] as const;
export type ExecutableCodeLanguage = (typeof EXECUTABLE_CODE_LANGUAGES)[number];

export const QuestionKindSchema = z.enum(QUESTION_KINDS);
export type QuestionKind = z.infer<typeof QuestionKindSchema>;

export const McPayloadSchema = z.object({
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
});
export type McPayload = z.infer<typeof McPayloadSchema>;

export const TrueFalsePayloadSchema = z.object({
  correct: z.boolean(),
});
export type TrueFalsePayload = z.infer<typeof TrueFalsePayloadSchema>;

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

export const CodeOutputPayloadSchema = z.object({
  language: z.enum(CODE_LANGUAGES),
  code: z.string().min(1),
  blank: z.object({
    acceptableAnswers: z.array(z.string().min(1)).min(1),
    caseSensitive: z.boolean().optional(),
    fuzzyThreshold: z.number().min(0).max(1).optional(),
  }),
});
export type CodeOutputPayload = z.infer<typeof CodeOutputPayloadSchema>;

export const TimelinePayloadSchema = z.object({
  events: z
    .array(
      z.object({
        year: z.string().min(1),
        label: z.string().min(1),
      })
    )
    .min(3)
    .max(8),
});
export type TimelinePayload = z.infer<typeof TimelinePayloadSchema>;

/**
 * `code_write`: the learner writes code in an editor; the server runs it on
 * a Piston runtime against each declared test case (stdin → expected stdout)
 * and grades pass/fail.
 */
export const CodeWriteTestSchema = z.object({
  name: z.string().min(1).optional(),
  stdin: z.string().optional(),
  expectedStdout: z.string(),
});
export type CodeWriteTest = z.infer<typeof CodeWriteTestSchema>;

export const CodeWritePayloadSchema = z.object({
  language: z.enum(EXECUTABLE_CODE_LANGUAGES),
  /** Pre-filled in the editor when the learner opens the question. */
  starterCode: z.string().default(''),
  tests: z.array(CodeWriteTestSchema).min(1).max(8),
  /** Optional per-question execution timeout in milliseconds. */
  runTimeoutMs: z.number().int().min(500).max(15000).optional(),
});
export type CodeWritePayload = z.infer<typeof CodeWritePayloadSchema>;

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
    kind: z.literal('true_false'),
    ...QuestionCommonShape,
    payload: TrueFalsePayloadSchema,
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
  z.object({
    kind: z.literal('code_output'),
    ...QuestionCommonShape,
    payload: CodeOutputPayloadSchema,
  }),
  z.object({
    kind: z.literal('timeline'),
    ...QuestionCommonShape,
    payload: TimelinePayloadSchema,
  }),
  z.object({
    kind: z.literal('code_write'),
    ...QuestionCommonShape,
    payload: CodeWritePayloadSchema,
  }),
]);
export type QuizQuestionV2 = z.infer<typeof QuizQuestionV2Schema>;

export const QuizSetV2Schema = z.object({
  title: z.string().min(1),
  questions: z.array(QuizQuestionV2Schema).min(1),
});
export type QuizSetV2 = z.infer<typeof QuizSetV2Schema>;

// Theory section — validates the Stage B `create_theory_section` tool input
// before it is converted to a TipTap document. Mirrors `TheorySectionToolInput`
// in `apps/web/src/lib/ai-tools.ts` and matches the tool's `required` list.
export const TheorySectionSchema = z.object({
  title: z.string().min(1),
  introduction: z.string().min(1),
  keyPoints: z.array(z.string().min(1)).min(1),
  // examples may be empty: the path generator retries once for examples and
  // then accepts an example-less section rather than failing the slot —
  // theoryInputToTipTap renders fine without an Examples block.
  examples: z.array(
    z.object({
      label: z.string().min(1),
      explanation: z.string().min(1),
    }),
  ),
  summary: z.string().optional(),
});
export type TheorySection = z.infer<typeof TheorySectionSchema>;
