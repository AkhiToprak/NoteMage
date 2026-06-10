'use client';

import { createContext, useContext } from 'react';

/**
 * A request to open the equation-input modal. The caller supplies the current
 * LaTeX (empty for a fresh insert) and an `onSubmit` callback that knows how to
 * apply the result — toolbar inserts a new `blockMath` node, MathView updates
 * the existing node's `latex` attribute.
 */
export interface MathModalRequest {
  initialLatex: string;
  isBlock: boolean;
  onSubmit: (latex: string) => void;
}

/**
 * Lets the deep TipTap NodeView (MathView) open the equation modal owned by
 * PageEditor. React context propagates through TipTap's portal-rendered
 * NodeViews, so a provider above <EditorContent> reaches them. The default is a
 * no-op so consuming outside a provider is harmless.
 */
export const MathModalContext = createContext<(req: MathModalRequest) => void>(() => {});

export function useMathModal(): (req: MathModalRequest) => void {
  return useContext(MathModalContext);
}
