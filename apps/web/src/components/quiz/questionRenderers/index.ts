import type { ComponentType } from 'react';
import type { QuestionKind } from '@notemage/shared';
import MCRenderer from './MCRenderer';
import TrueFalseRenderer from './TrueFalseRenderer';
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
  TrueFalseRenderer,
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

// All 8 kinds from the original Phase 1–2 plan now ship: mc, true_false,
// fill_blank, word_bank, match_pairs, sentence_reorder, translation, equation.
export const RENDERERS: Partial<Record<QuestionKind, AnyQuestionRenderer>> = {
  mc: MCRenderer,
  true_false: TrueFalseRenderer,
  fill_blank: FillBlankRenderer,
  translation: TranslationRenderer,
  word_bank: WordBankRenderer,
  match_pairs: MatchPairsRenderer,
  sentence_reorder: SentenceReorderRenderer,
  equation: EquationRenderer,
};
