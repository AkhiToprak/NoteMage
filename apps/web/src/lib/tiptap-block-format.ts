import type { Editor, ChainedCommands } from '@tiptap/react';
import type { Transaction } from '@tiptap/pm/state';
import { TextSelection } from '@tiptap/pm/state';
import { canSplit } from '@tiptap/pm/transform';

/**
 * Selection-aware block formatting (headings, callouts, quotes, lists).
 *
 * The block-level commands these wrap (`toggleHeading`, `toggleCallout`,
 * `toggleBlockquote`, list toggles) are all built on ProseMirror's `wrapIn` /
 * `setBlockType`, which operate on the WHOLE textblock the selection sits in —
 * a heading or callout can't be "half a paragraph". So on a page that is a
 * single paragraph (e.g. a note pasted as one block), selecting a few words and
 * hitting "Heading" wrapped the entire paragraph: "the whole box becomes one
 * heading".
 *
 * `formatBlockSelectionAware` fixes that the same way the code-block command
 * does: when there's a real text selection, it first splits that selection out
 * into its own block(s), then lets the stock command format only that isolated
 * block. Surrounding text is preserved as its own paragraphs. A bare cursor (or
 * toggling an active format off) keeps the stock whole-block behaviour.
 */

/**
 * Split the current selection out so it occupies its own block(s), then move
 * the selection onto that isolated range. Mutates `tr` in place.
 */
function isolateSelection(tr: Transaction): void {
  const { from, to } = tr.selection;
  const $from = tr.doc.resolve(from);
  const $to = tr.doc.resolve(to);

  // Cut at the selection's end and start so the selected text becomes its own
  // block. Skip a cut that would only carve off an empty sliver (selection
  // already flush with a block boundary).
  const cuts: number[] = [];
  if ($to.parent.isTextblock && $to.parentOffset < $to.parent.content.size) cuts.push(to);
  if ($from.parent.isTextblock && $from.parentOffset > 0) cuts.push(from);

  // Split the higher position first so the lower one's coordinates stay valid.
  cuts
    .sort((a, b) => b - a)
    .forEach((pos) => {
      const mapped = tr.mapping.map(pos);
      if (canSplit(tr.doc, mapped)) tr.split(mapped);
    });

  // Re-aim the selection at the now-isolated text. Bias the end backward (-1)
  // so the range stays inside the isolated block instead of spilling into the
  // following one.
  const nextFrom = tr.mapping.map(from, 1);
  const nextTo = tr.mapping.map(to, -1);
  try {
    tr.setSelection(TextSelection.create(tr.doc, nextFrom, nextTo));
  } catch {
    // If the computed range is rejected, leave the mapped selection in place.
  }
}

/**
 * Apply a block format to the current selection, scoping it to the selected
 * text rather than the whole containing block.
 *
 * @param editor       the TipTap editor (no-op if null / read-only)
 * @param formatName   node name used to detect an already-active format that
 *                     should toggle OFF (e.g. 'toggleHeading', 'callout')
 * @param appendFormat appends the stock command to a chain, e.g.
 *                     `(c) => c.toggleToggleHeading({ level: 1 })`
 */
export function formatBlockSelectionAware(
  editor: Editor | null,
  formatName: string,
  appendFormat: (chain: ChainedCommands) => ChainedCommands
): boolean {
  if (!editor || editor.isDestroyed || !editor.isEditable) return false;

  const { empty } = editor.state.selection;

  // Bare cursor, or toggling an active format off — the stock command already
  // scopes to the current block, so run it as-is.
  if (empty || editor.isActive(formatName)) {
    return appendFormat(editor.chain().focus()).run();
  }

  // Non-empty selection: carve the selected text into its own block first (its
  // own transaction, so the stock command below runs against a settled state),
  // then format that isolated block.
  editor
    .chain()
    .focus()
    .command(({ tr, dispatch }) => {
      if (dispatch) isolateSelection(tr);
      return true;
    })
    .run();

  return appendFormat(editor.chain().focus()).run();
}
