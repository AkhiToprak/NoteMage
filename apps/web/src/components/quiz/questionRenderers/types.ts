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

// Per-renderer answer payloads. Phase 1: only `mc` (number index).
// Phase 2A/2B agents extend this union (e.g. typed strings for fill_blank,
// arrays of slot assignments for word_bank).
export type UserAnswer = number;

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
