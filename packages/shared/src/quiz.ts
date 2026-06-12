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
  // CODE-GENERATED ONLY — never emitted by an LLM. The path generator's
  // deterministic `buildDiagramClozeQuestion` builds this kind from a set's
  // structured `diagrams` (zero AI tokens). It MUST NOT be added to any LLM
  // tool schema (`QUIZ_TOOL_V2.input_schema.kind` enum, ai-tools.ts), to the
  // `QUIZ_PAYLOAD_CATALOG_LINES`, or to any subject's `allowedKinds`
  // (path-subjects.ts) — doing so would let a model emit an ungradeable
  // diagram-cloze. The grader, renderer registry, translator and clone copy it
  // because it is a persisted question like any other.
  'diagram_cloze',
] as const;

// Mask marker for `diagram_cloze`: the removed diagram label is replaced by
// this single-codepoint sentinel inside the embedded (masked) diagram. The
// renderer recognises it and draws a distinct "?" chip; the translator skips
// it (it is not natural-language prose). Chosen to never collide with real
// label text (a dotted square, U+2B1A).
export const DIAGRAM_CLOZE_MASK = '⬚';

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

// An equation answer is a FINAL ANSWER, never a full equation — it must not
// carry an `=`. The grader self-heals legacy `=`-bearing values at grading
// time, but we also strip them here at PERSIST time so the AI can never store
// an ungradeable expected answer (and the wrong-answer feedback shows a clean
// expression). Pure string op: take the RHS of the last `=`, else the LHS of
// the first `=`, else the value unchanged. Mirrors the grader's primary
// candidate (`extractAnswerCandidates`) without depending on the math engine.
function stripEquationSides(raw: string): string {
  const s = raw.trim();
  if (!s.includes('=')) return s;
  const rhs = s.slice(s.lastIndexOf('=') + 1).trim();
  if (rhs.length > 0) return rhs;
  const lhs = s.slice(0, s.indexOf('=')).trim();
  return lhs.length > 0 ? lhs : s;
}

// `.min(1)` rejects an empty input; the post-transform `.pipe` rejects a value
// that strips to empty (whitespace-only) or still carries an `=` (a degenerate
// `=`/`==`). Either way the result is ungradeable, so we FAIL validation at
// persist time — the AI retry/fallback chain then produces a usable answer
// instead of silently storing an always-wrong question.
const ExpectedExpressionSchema = z
  .string()
  .min(1)
  .transform(stripEquationSides)
  .pipe(z.string().min(1).refine((s) => !s.includes('='), 'must not contain "="'));

export const EquationPayloadSchema = z.object({
  expectedExpression: ExpectedExpressionSchema,
  tolerance: z.number().min(0).optional(),
  variables: z.array(z.string().min(1)).optional(),
  // Several distinct answers can be legitimately correct (e.g. the two roots
  // of a quadratic). The grader accepts a match against the expected
  // expression OR any of these. Each is stripped of `=` like the primary.
  acceptedExpressions: z.array(ExpectedExpressionSchema).max(8).optional(),
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
  // Figure-reuse (P4): a question MAY carry ONE exhibit image referenced by a
  // catalog id. Held LOOSE (`unknown`) here on purpose — a single malformed
  // figure must NOT fail (and retry) the whole question. The generator
  // validates it separately with `QuizFigureSchema` and drops the invalid ones
  // (mirrors how TheorySectionSchema holds `figures` loose). Lives OUTSIDE the
  // per-kind `payload` so all kinds get it with zero payload-catalog churn and
  // zero grading impact. Absent on legacy / already-generated questions.
  figure: z.unknown().optional(),
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

// Theory visuals (theory-visuals feature). A figure references one image from
// the per-path source-image catalog by its `imageRef` (a catalog id). The
// caption is the model's slot-local caption. Validated separately from the
// catalog so a hallucinated `imageRef` is caught and dropped before any node
// is emitted.
export const TheoryFigureSchema = z.object({
  imageRef: z.string().min(1),
  caption: z.string().min(1),
});
export type TheoryFigure = z.infer<typeof TheoryFigureSchema>;

// Figure-reuse feature (P3): a flashcard MAY embed ONE source image on either
// side. Mirrors TheoryFigureSchema with an extra `side` (defaults to the front
// / question side). Validated per-card in the path generator so a hallucinated
// `imageRef` is dropped before any FlashcardImage row is written.
export const FlashcardFigureSchema = z.object({
  imageRef: z.string().min(1),
  side: z.enum(['front', 'back']).default('front'),
  caption: z.string().min(1),
});
export type FlashcardFigure = z.infer<typeof FlashcardFigureSchema>;

// Figure-reuse feature (P4): a quiz question MAY embed ONE source image as an
// exhibit, rendered above the prompt by shared player chrome (NOT per-renderer,
// so all kinds get it for free). Mirrors TheoryFigureSchema. Validated per-
// question in the path generator so a hallucinated `imageRef` is dropped before
// any QuizQuestionImage row is written.
export const QuizFigureSchema = z.object({
  imageRef: z.string().min(1),
  caption: z.string().min(1),
});
export type QuizFigure = z.infer<typeof QuizFigureSchema>;

// Structured diagram emitted alongside theory prose and rendered by a React
// component (no AI image generation). The Anthropic/Gemini tool schema is kept
// intentionally loose (one object with `kind` + optional fields, no `anyOf`)
// because Gemini is unreliable on multi-variant unions; THIS discriminated
// union is the strict gate — invalid diagrams are dropped, never failed.
export const PathDiagramSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('timeline'),
    title: z.string().optional(),
    events: z
      .array(z.object({ date: z.string().min(1), label: z.string().min(1) }))
      .min(2)
      .max(10),
  }),
  z.object({
    kind: z.literal('steps'),
    title: z.string().optional(),
    steps: z
      .array(z.object({ title: z.string().min(1), detail: z.string().optional() }))
      .min(2)
      .max(10),
  }),
  z.object({
    kind: z.literal('comparison'),
    title: z.string().optional(),
    columns: z.array(z.string().min(1)).min(2).max(4),
    rows: z
      .array(z.object({ label: z.string().min(1), cells: z.array(z.string()).min(1) }))
      .min(1)
      .max(8),
  }),
  z.object({
    kind: z.literal('cycle'),
    title: z.string().optional(),
    nodes: z.array(z.string().min(1)).min(2).max(8),
  }),
]);
export type PathDiagram = z.infer<typeof PathDiagramSchema>;

// `diagram_cloze` — a deterministic "what's missing in this diagram?" question
// built in CODE from a quiz set's structured `diagrams` (never by an LLM, see
// the QUESTION_KINDS guard). `diagram` is the SAME diagram the learner saw in
// theory but with ONE label replaced by `DIAGRAM_CLOZE_MASK`. The removed label
// lives only in `options[correctIndex]` — there is no answer STRING, which
// keeps translation safe by construction (options and diagram labels translate
// independently with no string-equality coupling). `options` is 4 distinct
// non-empty strings; `correctIndex` selects the missing label.
export const DiagramClozePayloadSchema = z.object({
  diagram: PathDiagramSchema,
  options: z.array(z.string().min(1)).length(4),
  correctIndex: z.number().int().min(0).max(3),
});
export type DiagramClozePayload = z.infer<typeof DiagramClozePayloadSchema>;

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
  // Optional theory visuals. Held LOOSE here on purpose: a single malformed
  // figure/diagram must NOT fail (and retry) the whole theory section. The
  // generator validates each entry separately with TheoryFigureSchema /
  // PathDiagramSchema and drops the invalid ones. Both absent on
  // legacy/already-generated theory, so old tool outputs validate unchanged.
  figures: z.array(z.unknown()).optional(),
  diagrams: z.array(z.unknown()).optional(),
});
export type TheorySection = z.infer<typeof TheorySectionSchema>;
