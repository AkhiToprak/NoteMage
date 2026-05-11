import type { ComponentType } from 'react';
import type { QuestionKind } from '@notemage/shared';
import MCRenderer from './MCRenderer';
import FillBlankRenderer from './FillBlankRenderer';
import TranslationRenderer from './TranslationRenderer';
import WordBankRenderer from './WordBankRenderer';
import MatchPairsRenderer from './MatchPairsRenderer';
import SentenceReorderRenderer from './SentenceReorderRenderer';
import EquationRenderer from './EquationRenderer';
import type { QuestionProps } from './types';

export type { QuestionProps, QuizQuestionForRender, QuizRenderMode, UserAnswer } from './types';
export {
  MCRenderer,
  FillBlankRenderer,
  TranslationRenderer,
  WordBankRenderer,
  MatchPairsRenderer,
  SentenceReorderRenderer,
  EquationRenderer,
};

// Registry value type: each renderer narrows `TPayload` to its own payload
// shape, but the registry erases that distinction. `any` here is the standard
// trick for a heterogeneous map of generic components — the dispatcher knows
// the question's `kind` and looks up the matching renderer, so type safety
// at the call site is enforced by the renderer's own prop type rather than
// the registry's signature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuestionRenderer = ComponentType<QuestionProps<any>>;

// Phase 2 registers all 7 currently-shipped kinds. `true_false` is in the
// QuestionKind enum but not yet implemented; it falls through to the
// "unsupported kind" placeholder rendered by QuizViewer's dispatcher.
export const RENDERERS: Partial<Record<QuestionKind, AnyQuestionRenderer>> = {
  mc: MCRenderer,
  fill_blank: FillBlankRenderer,
  translation: TranslationRenderer,
  word_bank: WordBankRenderer,
  match_pairs: MatchPairsRenderer,
  sentence_reorder: SentenceReorderRenderer,
  equation: EquationRenderer,
};
