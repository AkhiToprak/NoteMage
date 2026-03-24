import { Mark, mergeAttributes } from '@tiptap/core';

/**
 * InlineHeading — a Mark-level extension that applies heading-like
 * visual styles (font-size, font-weight, letter-spacing) to an inline
 * text selection without converting the block to a heading node.
 *
 * Usage:
 *   editor.chain().focus().toggleInlineHeading({ level: 1 }).run()
 *   editor.chain().focus().unsetInlineHeading().run()
 */

export interface InlineHeadingOptions {
  HTMLAttributes: Record<string, unknown>;
  levels: number[];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    inlineHeading: {
      setInlineHeading: (attrs: { level: number }) => ReturnType;
      unsetInlineHeading: () => ReturnType;
      toggleInlineHeading: (attrs: { level: number }) => ReturnType;
    };
  }
}

/* Maps level → CSS properties matching the Neon Scholar Design System */
const LEVEL_STYLES: Record<number, { fontSize: string; fontWeight: string; letterSpacing: string; lineHeight: string }> = {
  1: { fontSize: '30px', fontWeight: '700', letterSpacing: '-0.03em', lineHeight: '1.2' },
  2: { fontSize: '22px', fontWeight: '700', letterSpacing: '-0.02em', lineHeight: '1.3' },
  3: { fontSize: '18px', fontWeight: '600', letterSpacing: '0em',     lineHeight: '1.4' },
};

export const InlineHeading = Mark.create<InlineHeadingOptions>({
  name: 'inlineHeading',

  addOptions() {
    return {
      HTMLAttributes: {},
      levels: [1, 2, 3],
    };
  },

  addAttributes() {
    return {
      level: {
        default: null,
        parseHTML: (element) => {
          const val = element.getAttribute('data-inline-heading');
          return val ? Number(val) : null;
        },
        renderHTML: (attributes) => {
          const lvl = attributes.level as number | null;
          if (!lvl || !LEVEL_STYLES[lvl]) return {};
          const s = LEVEL_STYLES[lvl];
          return {
            'data-inline-heading': String(lvl),
            style: `font-size:${s.fontSize};font-weight:${s.fontWeight};letter-spacing:${s.letterSpacing};line-height:${s.lineHeight}`,
          };
        },
      },
    };
  },

  parseHTML() {
    return [{ tag: 'span[data-inline-heading]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addCommands() {
    return {
      setInlineHeading:
        (attrs) =>
        ({ commands }) =>
          commands.setMark(this.name, attrs),

      unsetInlineHeading:
        () =>
        ({ commands }) =>
          commands.unsetMark(this.name),

      toggleInlineHeading:
        (attrs) =>
        ({ commands }) =>
          commands.toggleMark(this.name, attrs),
    };
  },
});
