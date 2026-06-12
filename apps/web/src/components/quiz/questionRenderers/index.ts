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
import CodeOutputRenderer from './CodeOutputRenderer';
import TimelineRenderer from './TimelineRenderer';
import CodeWriteRenderer from './CodeWriteRenderer';
import DiagramClozeRenderer from './DiagramClozeRenderer';
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
  CodeOutputRenderer,
  TimelineRenderer,
  CodeWriteRenderer,
  DiagramClozeRenderer,
};

// Registry value type: each renderer narrows `TPayload` to its own payload
// shape, but the registry erases that distinction. `any` here is the standard
// trick for a heterogeneous map of generic components — the dispatcher knows
// the question's `kind` and looks up the matching renderer, so type safety
// at the call site is enforced by the renderer's own prop type rather than
// the registry's signature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuestionRenderer = ComponentType<QuestionProps<any>>;

// 12 kinds: the original 8 plus subject-native code_output (coding),
// timeline (history/humanities), code_write (server-graded code execution via
// Piston), and diagram_cloze (code-generated "what's missing in this diagram?").
export const RENDERERS: Partial<Record<QuestionKind, AnyQuestionRenderer>> = {
  mc: MCRenderer,
  true_false: TrueFalseRenderer,
  fill_blank: FillBlankRenderer,
  translation: TranslationRenderer,
  word_bank: WordBankRenderer,
  match_pairs: MatchPairsRenderer,
  sentence_reorder: SentenceReorderRenderer,
  equation: EquationRenderer,
  code_output: CodeOutputRenderer,
  timeline: TimelineRenderer,
  code_write: CodeWriteRenderer,
  diagram_cloze: DiagramClozeRenderer,
};
