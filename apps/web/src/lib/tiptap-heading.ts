import { Extension } from '@tiptap/core';

/**
 * Obsidian-style heading behaviour.
 *
 * NoteMage uses the standard StarterKit `heading` node (a plain styled line,
 * `content: 'inline*'`, levels 1-3). By default ProseMirror's Enter splits a
 * heading into ANOTHER heading; Obsidian instead drops you into a normal
 * paragraph on the next line. This tiny companion extension restores that:
 * pressing Enter at the END of a heading creates a paragraph below. Enter in
 * the middle of a heading, or anywhere outside a heading, keeps the default
 * behaviour (returns false so other handlers run).
 */
export const HeadingEnterBehavior = Extension.create({
  name: 'headingEnterBehavior',

  // Run ahead of the default Enter (splitBlock) so we get first crack at
  // converting a heading split into a paragraph.
  priority: 1000,

  addKeyboardShortcuts() {
    return {
      Enter: () => {
        const { state } = this.editor;
        const { $from, empty } = state.selection;
        if (!empty) return false;
        if ($from.parent.type.name !== 'heading') return false;
        // Only when the caret sits at the very end of the heading text.
        if ($from.parentOffset !== $from.parent.content.size) return false;
        // Split, then force the fresh block to a paragraph (split alone would
        // otherwise carry the heading type forward).
        return this.editor.chain().splitBlock().setNode('paragraph').run();
      },
    };
  },
});
