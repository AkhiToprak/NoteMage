import type { Editor } from '@tiptap/react';
import { TextSelection } from '@tiptap/pm/state';

/**
 * Obsidian-style code-block insertion.
 *
 * TipTap's stock `toggleCodeBlock()` is built on ProseMirror's `setBlockType`,
 * which converts the ENTIRE textblock the cursor sits in (code blocks are
 * block-level — a block can't be "half a paragraph"). On a page that is a
 * single paragraph — e.g. a short note — that swallows the whole note, which
 * is exactly the "the entire page turned into a code block" report.
 *
 * This command is scope-aware instead, matching how Obsidian behaves:
 *
 *   • Already inside a code block → toggle it back to a paragraph.
 *   • Non-empty text selection    → wrap ONLY the selected text into its own
 *                                   code block, leaving the text before/after
 *                                   as their own paragraphs. A selection that
 *                                   spans several lines becomes one multi-line
 *                                   code block.
 *   • Collapsed cursor            → drop a fresh, empty code block at the
 *                                   cursor (an empty line is converted in
 *                                   place; mid-text the line is split around
 *                                   the new block).
 *
 * The cursor always lands inside the resulting code block so the user can keep
 * typing. `replaceRangeWith` (not `setBlockType`) is the primitive that splits
 * the surrounding content into separate blocks instead of consuming it.
 */
export function insertCodeBlock(editor: Editor | null): boolean {
  if (!editor || editor.isDestroyed || !editor.isEditable) return false;

  // Cursor is already in a code block — clicking again removes it.
  if (editor.isActive('codeBlock')) {
    return editor.chain().focus().toggleCodeBlock().run();
  }

  const codeBlockType = editor.schema.nodes.codeBlock;
  if (!codeBlockType) {
    // Schema has no code block — fall back to the stock command.
    return editor.chain().focus().toggleCodeBlock().run();
  }

  return editor
    .chain()
    .focus()
    .command(({ tr, dispatch }) => {
      const { from, to, empty } = tr.selection;

      // The new block holds the selected text (lines joined by newlines so a
      // multi-line selection collapses into one code block), or is empty for
      // a bare cursor.
      const selectedText = empty ? '' : tr.doc.textBetween(from, to, '\n', '\n');
      const node = selectedText
        ? codeBlockType.create(null, editor.schema.text(selectedText))
        : codeBlockType.createAndFill();
      if (!node) return false;

      // `can()` dry-runs the chain with no dispatch — report success without
      // mutating the throwaway transaction.
      if (!dispatch) return true;

      tr.replaceRangeWith(from, empty ? from : to, node);

      // Drop the cursor inside the freshly-inserted code block. Locate it by
      // scanning a small window around the (mapped) insertion point rather
      // than relying on brittle position arithmetic across the split.
      const anchor = tr.mapping.map(from, -1);
      let codeBlockPos = -1;
      tr.doc.nodesBetween(
        Math.max(0, anchor - 3),
        Math.min(tr.doc.content.size, anchor + selectedText.length + 4),
        (childNode, pos) => {
          if (codeBlockPos === -1 && childNode.type === codeBlockType) codeBlockPos = pos;
        }
      );
      if (codeBlockPos >= 0) {
        const inside = Math.min(codeBlockPos + 1 + selectedText.length, tr.doc.content.size);
        try {
          tr.setSelection(TextSelection.create(tr.doc, inside));
        } catch {
          // Position rejected by the schema — keep the default mapped selection.
        }
      }
      tr.scrollIntoView();
      return true;
    })
    .run();
}
