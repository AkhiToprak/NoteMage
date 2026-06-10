import type { QuestionKind } from '@notemage/shared';

// Display mode for the question surface.
// 'quiz'   = live attempt, taking input
// 'review' = post-attempt walkthrough; renderer shows the user's saved answer + correctness
export type QuizRenderMode = 'quiz' | 'review';

// The unified question shape the dispatcher hands to a renderer.
// Phase 1 fields cover MC; non-MC kinds carry their data on `payload`
// (Phase 2A/2B). Legacy MC rows keep `options` + `correctIndex` populated
// and `payload = null` until the Phase 7 backfill.
export interface QuizQuestionForRender {
  id: string;
  kind: QuestionKind;
  question: string;
  options: string[];
  correctIndex: number;
  payload: unknown;
  hint: string | null;
  correctExplanation: string | null;
  wrongExplanation: string | null;
  sortOrder: number;
}

// Discriminated union of per-kind user answers. Each variant carries its own
// `kind` literal so the grader can assert the answer matches the question.
// Server and client both grade via `grade()` in `apps/web/src/lib/quiz-grading.ts`,
// which switches on this discriminator.
export type UserAnswer =
  | { kind: 'mc'; selectedIdx: number }
  | { kind: 'true_false'; value: boolean }
  | { kind: 'fill_blank'; text: string }
  | { kind: 'word_bank'; slotAnswers: (string | null)[] }
  // `left` is the payload pair index (unique). `rightSlot` is the chosen
  // right-column slot's index in the shuffled `shuffledRights` array — the
  // stable identity that lets two slots sharing the same text be matched
  // independently. `rightLabel` is retained for grading (the server grader
  // compares it by value) and for display. Optional `rightSlot` keeps
  // already-saved attempts (which only carry `rightLabel`) type-compatible.
  | { kind: 'match_pairs'; connections: { left: number; rightSlot?: number; rightLabel: string }[] }
  | { kind: 'translation'; text: string }
  | { kind: 'sentence_reorder'; orderedTokens: string[] }
  | { kind: 'equation'; expression: string }
  | { kind: 'code_output'; text: string }
  | { kind: 'timeline'; placements: Record<string, string> }
  | {
      kind: 'code_write';
      language: string;
      code: string;
      /**
       * Pass/fail verdict pre-computed by the renderer when the learner
       * submitted (the renderer ran the code server-side via the
       * /api/quiz/code-execute endpoint and recorded the result). The
       * server-side grader trusts this value — server-side re-verification
       * is a future hardening pass.
       */
      passed: boolean;
    };

// Shared props every renderer receives from the QuizViewer dispatcher.
// `TPayload` is the kind-specific payload type; each renderer narrows it.
export interface QuestionProps<TPayload = unknown> {
  question: QuizQuestionForRender & { payload: TPayload };
  mode: QuizRenderMode;
  isAnswered: boolean;
  currentAnswer: UserAnswer | undefined;
  reviewAnswer: UserAnswer | undefined;
  // The graded result for the submitted answer (undefined until answered).
  // Sourced from the QuizViewer answers map, where grade() stored it at submit
  // time — renderers that can't re-derive correctness client-side (e.g. the
  // equation kind, where the grader evaluates symbolic equivalence) read this
  // instead of guessing from a literal string match.
  gradedCorrect: boolean | undefined;
  showHint: boolean;
  onToggleHint: () => void;
  onSelectAnswer: (answer: UserAnswer) => void;
  isPhone: boolean;
  // Coarse (touch / stylus / in-app WebView) pointer. Gates interaction-pattern
  // swaps — tap-to-pair, tap-to-place, tap-to-flip — which are about pointer
  // capability, not screen width. Distinct from `isPhone`, which keeps gating
  // layout/sizing. Computed once in the shell (QuizViewer) via `useCoarsePointer`
  // so every renderer shares one SSR-safe snapshot instead of each calling the hook.
  coarsePointer: boolean;
}
