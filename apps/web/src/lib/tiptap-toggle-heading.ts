import { Node, mergeAttributes, wrappingInputRule } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

/**
 * ToggleHeading — a block-level TipTap node for collapsible heading sections.
 *
 * Structure: a wrapper node containing a heading summary and content.
 * The collapsed state is stored as an attribute.
 *
 * Usage:
 *   editor.chain().focus().setToggleHeading({ level: 1 }).run()
 *   editor.chain().focus().toggleToggleHeading({ level: 2 }).run()
 */

export type ToggleLevel = 1 | 2 | 3;

export interface ToggleHeadingOptions {
  HTMLAttributes: Record<string, unknown>;
  levels: ToggleLevel[];
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    toggleHeading: {
      setToggleHeading: (attrs: { level: ToggleLevel }) => ReturnType;
      toggleToggleHeading: (attrs: { level: ToggleLevel }) => ReturnType;
      unsetToggleHeading: () => ReturnType;
    };
  }
}

const LEVEL_STYLES: Record<
  ToggleLevel,
  { fontSize: string; fontWeight: string; letterSpacing: string }
> = {
  1: { fontSize: '30px', fontWeight: '700', letterSpacing: '-0.03em' },
  2: { fontSize: '22px', fontWeight: '700', letterSpacing: '-0.02em' },
  3: { fontSize: '18px', fontWeight: '600', letterSpacing: '0em' },
};

export { LEVEL_STYLES as TOGGLE_HEADING_STYLES };

export const ToggleHeading = Node.create<ToggleHeadingOptions>({
  name: 'toggleHeading',

  group: 'block',

  content: 'block+',

  defining: true,

  addOptions() {
    return {
      HTMLAttributes: {},
      levels: [1, 2, 3],
    };
  },

  addAttributes() {
    return {
      level: {
        default: 1,
        parseHTML: (element) => {
          const val = element.getAttribute('data-toggle-level');
          return val ? Number(val) : 1;
        },
        renderHTML: (attributes) => ({
          'data-toggle-level': String(attributes.level),
        }),
      },
      collapsed: {
        default: false,
        parseHTML: (element) => element.getAttribute('data-collapsed') === 'true',
        renderHTML: (attributes) => ({
          'data-collapsed': String(attributes.collapsed),
        }),
      },
      summary: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-toggle-summary') || '',
        renderHTML: (attributes) => ({
          'data-toggle-summary': attributes.summary || '',
        }),
      },
    };
  },

  parseHTML() {
    return [
      { tag: 'div[data-toggle-level]' },
      // Also match pasted <h1>, <h2>, <h3> so they become toggle headings
      ...[1, 2, 3].map((level) => ({
        tag: `h${level}` as const,
        getAttrs: (element: HTMLElement) => ({
          level,
          collapsed: false,
          summary: element.textContent || '',
        }),
      })),
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(this.options.HTMLAttributes, HTMLAttributes), 0];
  },

  addInputRules() {
    return this.options.levels.map((level) =>
      wrappingInputRule({
        find: new RegExp(`^(#{${level}})\\s$`),
        type: this.type,
        getAttributes: { level, collapsed: false, summary: '' },
      })
    );
  },

  addCommands() {
    return {
      setToggleHeading:
        (attrs) =>
        ({ commands }) =>
          commands.wrapIn(this.name, { level: attrs.level, collapsed: false, summary: '' }),

      toggleToggleHeading:
        (attrs) =>
        ({ commands, editor }) => {
          if (editor.isActive(this.name)) {
            return commands.lift(this.name);
          }
          return commands.wrapIn(this.name, { level: attrs.level, collapsed: false, summary: '' });
        },

      unsetToggleHeading:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },

  /**
   * Position-based outline collapse.
   *
   * When a toggle heading's `collapsed` attr is true, we hide every
   * following sibling in the same parent until we hit the next
   * heading of the same or shallower level. That gives Notion-style
   * subordination: collapsing an h1 hides all paragraphs, lists,
   * tables, AND any h2/h3 (plus their own content) that come after
   * it in the document — without needing to physically nest them
   * inside the toggle node.
   *
   * We use ProseMirror node decorations rather than mutating the doc
   * so that the collapse is purely visual and round-trips cleanly
   * through save/load. Re-runs on every state change; the walk is
   * cheap because we bail out of any node that can't contain a
   * toggleHeading.
   */
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('toggleHeadingPositionCollapse'),
        props: {
          decorations(state) {
            const decorations: Decoration[] = [];

            state.doc.descendants((node, pos, parent, index) => {
              // Only toggleHeadings can trigger hiding, and only
              // toggleHeadings can legally nest other toggleHeadings.
              // Skip descent into anything else to keep the walk O(n)
              // in top-level blocks rather than O(n) in text nodes.
              if (node.type.name !== 'toggleHeading') {
                return false;
              }

              if (!node.attrs.collapsed || !parent) {
                return; // continue descending for nested toggles
              }

              const level = Number(node.attrs.level) || 1;

              // Walk forward through this toggle's remaining siblings
              // in `parent`, hiding each until we hit the next same-
              // or-shallower heading (which starts its own section).
              let followingPos = pos + node.nodeSize;
              for (let i = index + 1; i < parent.childCount; i++) {
                const sibling = parent.child(i);
                if (sibling.type.name === 'toggleHeading' && Number(sibling.attrs.level) <= level) {
                  break;
                }
                decorations.push(
                  Decoration.node(followingPos, followingPos + sibling.nodeSize, {
                    style: 'display: none;',
                  })
                );
                followingPos += sibling.nodeSize;
              }
            });

            return DecorationSet.create(state.doc, decorations);
          },
        },
      }),
    ];
  },
});
