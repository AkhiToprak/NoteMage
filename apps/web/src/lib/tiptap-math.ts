import { Node, mergeAttributes } from '@tiptap/core';
import katex from 'katex';

// Lightweight read-only TipTap nodes for KaTeX math, used by the theory
// viewer in learning paths. The orchestrator emits these nodes when the
// AI-generated prose contains LaTeX between `$...$` (inline) or `$$...$$`
// (block); see `markupTextToInlineContent` and `splitParagraphs` in
// `path-generator.ts`.
//
// Both nodes are atoms: the LaTeX source lives on a `latex` attribute and
// the DOM is rendered statically via `katex.renderToString`. No
// editability, no input rules — the theory viewer is read-only.

function renderMath(latex: string, displayMode: boolean): { html: string; ok: boolean } {
  try {
    const html = katex.renderToString(latex, {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
    });
    return { html, ok: true };
  } catch {
    return { html: '', ok: false };
  }
}

function buildSpan(latex: string, displayMode: boolean): HTMLElement {
  const tag = displayMode ? 'div' : 'span';
  const el = document.createElement(tag);
  el.setAttribute('data-math', displayMode ? 'block' : 'inline');
  el.setAttribute('data-latex', latex);
  el.style.fontFamily = 'inherit';
  if (displayMode) {
    el.style.display = 'block';
    el.style.margin = '0.6em 0';
    el.style.textAlign = 'center';
    el.style.overflowX = 'auto';
  } else {
    el.style.display = 'inline-block';
  }
  const { html, ok } = renderMath(latex, displayMode);
  if (ok) {
    el.innerHTML = html;
  } else {
    el.textContent = displayMode ? `$$${latex}$$` : `$${latex}$`;
    el.style.fontFamily =
      '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace';
    el.style.color = 'rgba(252,165,165,0.85)';
  }
  return el;
}

export const InlineMath = Node.create({
  name: 'inlineMath',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') ?? '',
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-math="inline"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'span',
      mergeAttributes({ 'data-math': 'inline' }, HTMLAttributes),
      // Server-rendered KaTeX is injected by the NodeView at mount time.
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const latex = String(node.attrs.latex ?? '');
      const dom = buildSpan(latex, false);
      return { dom };
    };
  },
});

export const BlockMath = Node.create({
  name: 'blockMath',
  group: 'block',
  atom: true,
  selectable: false,

  addAttributes() {
    return {
      latex: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-latex') ?? '',
        renderHTML: (attrs) => ({ 'data-latex': attrs.latex }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-math="block"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes({ 'data-math': 'block' }, HTMLAttributes),
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const latex = String(node.attrs.latex ?? '');
      const dom = buildSpan(latex, true);
      return { dom };
    };
  },
});
