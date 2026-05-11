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
  | { kind: 'fill_blank'; text: string }
  | { kind: 'word_bank'; slotAnswers: (string | null)[] }
  | { kind: 'match_pairs'; connections: { left: number; rightLabel: string }[] }
  | { kind: 'translation'; text: string }
  | { kind: 'sentence_reorder'; orderedTokens: string[] }
  | { kind: 'equation'; expression: string };

// Shared props every renderer receives from the QuizViewer dispatcher.
// `TPayload` is the kind-specific payload type; each renderer narrows it.
export interface QuestionProps<TPayload = unknown> {
  question: QuizQuestionForRender & { payload: TPayload };
  mode: QuizRenderMode;
  isAnswered: boolean;
  currentAnswer: UserAnswer | undefined;
  reviewAnswer: UserAnswer | undefined;
  showHint: boolean;
  onToggleHint: () => void;
  onSelectAnswer: (answer: UserAnswer) => void;
  isPhone: boolean;
}
