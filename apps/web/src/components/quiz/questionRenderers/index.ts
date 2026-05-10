import type { ComponentType } from 'react';
import type { QuestionKind } from '@notemage/shared';
import MCRenderer from './MCRenderer';
import type { QuestionProps } from './types';

export type { QuestionProps, QuizQuestionForRender, QuizRenderMode, UserAnswer } from './types';
export { MCRenderer };

// Registry value type: each renderer narrows `TPayload` to its own payload
// shape, but the registry erases that distinction. `any` here is the standard
// trick for a heterogeneous map of generic components — the dispatcher knows
// the question's `kind` and looks up the matching renderer, so type safety
// at the call site is enforced by the renderer's own prop type rather than
// the registry's signature.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyQuestionRenderer = ComponentType<QuestionProps<any>>;

// Phase 1 registers only `mc`. Phase 2A/2B agents add the remaining seven
// entries. The dispatcher in QuizViewer handles the missing-kind case so
// unregistered kinds render a placeholder instead of crashing.
export const RENDERERS: Partial<Record<QuestionKind, AnyQuestionRenderer>> = {
  mc: MCRenderer,
};
