import type {
  TipTapDoc,
  TipTapMark,
  TipTapNode,
  TipTapTextNode,
} from '@/lib/contentConverter';
import type { DocModel, DocModelBlock, InlineRun } from './doc-model';

/**
 * Byte ceiling for the assembled document. The page-content route rejects
 * anything over 500,000 bytes; assembly stops well before that so the
 * truncation notice and any JSON-encoding slack always fit underneath.
 */
const MAX_DOC_BYTES = 460_000;

/** Notice appended inside a warning callout when the size guard fires. */
const TRUNCATION_MESSAGE =
  'Import truncated — this PDF was too large to fit in a single page.';

/**
 * One inline run → one TipTap text node. Returns `null` for an empty
 * string: ProseMirror forbids empty text nodes, and the DocModel schema
 * does permit `text: ""`.
 */
function runToTextNode(run: InlineRun): TipTapTextNode | null {
  if (run.text.length === 0) return null;

  const marks: TipTapMark[] = [];
  if (run.bold) marks.push({ type: 'bold' });
  if (run.italic) marks.push({ type: 'italic' });
  if (run.underline) marks.push({ type: 'underline' });
  if (run.strike) marks.push({ type: 'strike' });
  if (run.code) marks.push({ type: 'code' });
  if (run.link) marks.push({ type: 'link', attrs: { href: run.link, target: '_blank' } });

  const node: TipTapTextNode = { type: 'text', text: run.text };
  if (marks.length > 0) node.marks = marks;
  return node;
}

function runsToInline(runs: InlineRun[]): TipTapTextNode[] {
  return runs
    .map(runToTextNode)
    .filter((node): node is TipTapTextNode => node !== null);
}

/** Clamp a heading level into the 1–3 range the heading node supports. */
function clampHeadingLevel(level: number): 1 | 2 | 3 {
  return Math.min(3, Math.max(1, level)) as 1 | 2 | 3;
}

/**
 * A paragraph node. ProseMirror accepts a paragraph with no `content`
 * key as an empty paragraph, so omit it when there is no inline content.
 */
function paragraphNode(runs: InlineRun[]): TipTapNode {
  const content = runsToInline(runs);
  return content.length > 0 ? { type: 'paragraph', content } : { type: 'paragraph' };
}

/** A bullet/ordered list, or `null` when it has no items (an empty list is invalid). */
function listNode(
  type: 'bulletList' | 'orderedList',
  items: { runs: InlineRun[] }[],
): TipTapNode | null {
  if (items.length === 0) return null;
  return {
    type,
    content: items.map((item) => ({
      type: 'listItem',
      content: [paragraphNode(item.runs)],
    })),
  };
}

/**
 * One DocModel block → one TipTap node, or `null` when the block produces
 * nothing renderable (an image whose crop is missing, an empty list or
 * table). A `null` is simply skipped by the caller.
 */
function convertBlock(
  block: DocModelBlock,
  imageSrcByRef: Record<string, string>,
): TipTapNode | null {
  switch (block.type) {
    // A heading carries its text as inline content; the level is clamped to
    // the 1–3 range the heading node supports. Inline marks are preserved.
    case 'heading': {
      const content = runsToInline(block.runs);
      const node: TipTapNode = {
        type: 'heading',
        attrs: { level: clampHeadingLevel(block.level) },
      };
      if (content.length > 0) node.content = content;
      return node;
    }

    case 'paragraph':
      return paragraphNode(block.runs);

    case 'callout': {
      const children = block.children
        .map((child) => convertBlock(child, imageSrcByRef))
        .filter((node): node is TipTapNode => node !== null);
      return {
        type: 'callout',
        attrs: { calloutType: block.variant },
        content: children.length > 0 ? children : [{ type: 'paragraph' }],
      };
    }

    case 'bulletList':
      return listNode('bulletList', block.items);

    case 'orderedList':
      return listNode('orderedList', block.items);

    case 'table': {
      const rows = block.rows.filter((cells) => cells.length > 0);
      if (rows.length === 0) return null;
      return {
        type: 'table',
        content: rows.map((cells, rowIndex) => ({
          type: 'tableRow',
          content: cells.map((cellRuns) => ({
            type: block.headerRow && rowIndex === 0 ? 'tableHeader' : 'tableCell',
            attrs: { colspan: 1, rowspan: 1, colwidth: null },
            content: [paragraphNode(cellRuns)],
          })),
        })),
      };
    }

    case 'codeBlock': {
      const node: TipTapNode = { type: 'codeBlock', attrs: { language: block.lang } };
      if (block.code.length > 0) {
        node.content = [{ type: 'text', text: block.code }];
      }
      return node;
    }

    case 'blockquote':
      return { type: 'blockquote', content: [paragraphNode(block.runs)] };

    // Figures are cropped from the rendered page and uploaded by the import
    // worker, which supplies the ref → URL map. A ref with no entry means
    // the crop was dropped (too small / failed) — skip the image.
    case 'image': {
      const src = imageSrcByRef[block.ref];
      if (!src) return null;
      return { type: 'resizableImage', attrs: { src } };
    }

    case 'horizontalRule':
      return { type: 'horizontalRule' };
  }
}

/** A warning callout carrying the truncation notice. */
function truncationCallout(): TipTapNode {
  return {
    type: 'callout',
    attrs: { calloutType: 'warning' },
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: TRUNCATION_MESSAGE }] },
    ],
  };
}

/**
 * Convert a `DocModel` into a TipTap document — the single deterministic
 * seam between any structure engine and the editor.
 *
 * `imageSrcByRef` maps an `image` block's `ref` to the uploaded crop URL;
 * images without an entry are dropped. Blocks are appended one at a time
 * and the running JSON size is checked after each: once it would exceed
 * `MAX_DOC_BYTES` the last block is removed, a truncation callout is
 * appended, and `truncated` is returned `true`. The result always has at
 * least one block, so an empty `DocModel` still yields a valid document.
 */
export function assembleTiptap(
  model: DocModel,
  imageSrcByRef: Record<string, string> = {},
): { doc: TipTapDoc; truncated: boolean } {
  const doc: TipTapDoc = { type: 'doc', content: [] };
  let truncated = false;

  for (const block of model.blocks) {
    const node = convertBlock(block, imageSrcByRef);
    if (node === null) continue;

    doc.content.push(node);
    if (Buffer.byteLength(JSON.stringify(doc)) > MAX_DOC_BYTES) {
      doc.content.pop();
      truncated = true;
      break;
    }
  }

  if (truncated) {
    doc.content.push(truncationCallout());
  }
  if (doc.content.length === 0) {
    doc.content.push({ type: 'paragraph' });
  }

  return { doc, truncated };
}
