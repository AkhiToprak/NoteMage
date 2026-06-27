import type { QuestionKind } from '@notemage/shared';

/**
 * Live session state QuizViewer reports up to QuizPlayerShell in external-chrome
 * mode (Phase A). The shell renders the header progress + the state-driven CTA
 * from this object; the CTA calls back into these actions. QuizViewer keeps
 * owning the state machine, grading, and the attempt POST — the shell is chrome.
 */
export interface QuizSession {
  /** 0-based index of the current question. */
  index: number;
  /** Total questions in the set. */
  total: number;
  mode: 'quiz' | 'review' | 'results';
  questionId: string | null;
  questionKind: QuestionKind | null;
  /** The current question has been graded (committed). */
  isAnswered: boolean;
  /** Graded result of the current question; null until answered. */
  isCorrect: boolean | null;
  isLast: boolean;
  /** A staged-but-unsubmitted answer is present → "Check answer" is enabled. */
  canSubmit: boolean;
  /** Grade the staged answer ("Check answer"). */
  submit: () => void;
  /** Advance to the next question ("Continue"). */
  next: () => void;
  prev: () => void;
  /** Re-attempt the current question, clearing its answer ("Try again"). */
  retry: () => void;
  /** Finish + grade the whole attempt ("Finish"). */
  finish: () => void;

  // ── Mock-exam (timed, free-navigation) extensions (Phase 3) ──
  // Only populated when QuizViewer runs in `mock` mode. The mock player stages
  // every answer (never committing per-question, so no verdict leaks) and grades
  // them all at once on submit — so the shell drives a question navigator + a
  // single "Submit exam", not the per-question Check/Continue CTA.
  /** True when the session is a timed mock exam. */
  isMock?: boolean;
  /** Indices with a staged answer — the navigator's "answered" cells. */
  answeredIndices?: number[];
  /** Jump to any question (navigator click / free nav). */
  jumpTo?: (index: number) => void;
  /** Grade every staged answer into one sealed attempt and finish. */
  submitAll?: () => void;
}

/** One grounding source — Sources sidebar rows + the per-question source chip. */
export interface QuizSource {
  id: string;
  title: string;
  kind?: 'pdf' | 'ppt' | 'doc' | 'page' | 'video' | 'path' | 'quiz';
  /** Provenance line, e.g. "Page 12" / "Slide 8". */
  detail?: string;
  href?: string;
  /**
   * The verbatim grounding passage (Phase D). Present → the source opens the
   * reader drawer with this passage highlighted; absent (e.g. the path-level
   * fallback source) → "Show source" defers to Ask Mage instead.
   */
  quote?: string;
}

/** One step in the Mission progress rail. */
export interface MissionStep {
  id: string;
  label: string;
  /** Sub-status line, e.g. "Done" / "In progress" / "Locked" / "Finish". */
  status: 'done' | 'current' | 'locked' | 'finish';
}

/** A quick Ask-Mage prompt chip in the sidebar card. */
export interface MageQuickAction {
  label: string;
  onClick: () => void;
}

/** Human label per question kind for the QuestionCard type badge. */
export const QUIZ_KIND_LABEL: Record<QuestionKind, string> = {
  mc: 'Multiple Choice',
  true_false: 'True / False',
  fill_blank: 'Fill in the Blank',
  word_bank: 'Fill in the Blank',
  match_pairs: 'Match Pairs',
  sentence_reorder: 'Order the Steps',
  equation: 'Calculation',
  translation: 'Translation',
  code_output: 'Code Output',
  timeline: 'Timeline',
  code_write: 'Coding',
  diagram_cloze: 'Diagram',
};
