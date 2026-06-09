import type {
  TipTapDoc,
  TipTapMark,
  TipTapNode,
  TipTapTextNode,
} from '@/lib/contentConverter';
import type {
  DocModel,
  DocModelBlock,
  InlineRun,
  ListContainerBlock,
} from './doc-model';

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
  if (run.highlight) marks.push({ type: 'highlight' });
  if (run.subscript) marks.push({ type: 'subscript' });
  if (run.superscript) marks.push({ type: 'superscript' });
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

/**
 * A figure/equation caption: the runs rendered as a single italic paragraph.
 * Returns `null` when the caption has no usable text.
 */
function captionParagraph(runs: InlineRun[]): TipTapNode | null {
  const content = runsToInline(runs.map((run) => ({ ...run, italic: true })));
  return content.length > 0 ? { type: 'paragraph', content } : null;
}

/**
 * One DocModel list container (bullet/ordered/task) → its TipTap list node,
 * recursing into each item's nested child lists. Bullet/ordered items become
 * `listItem`s; task items become `taskItem`s carrying their `checked` state.
 * Returns `null` for an empty list (ProseMirror rejects a list with no items).
 */
function convertListContainer(block: ListContainerBlock): TipTapNode | null {
  if (block.items.length === 0) return null;
  const isTask = block.type === 'taskList';

  const content: TipTapNode[] = block.items.map((item) => {
    const childLists = (item.children ?? [])
      .map(convertListContainer)
      .filter((node): node is TipTapNode => node !== null);
    const itemContent: TipTapNode[] = [paragraphNode(item.runs), ...childLists];
    return isTask
      ? { type: 'taskItem', attrs: { checked: item.checked ?? false }, content: itemContent }
      : { type: 'listItem', content: itemContent };
  });

  return { type: block.type, content };
}

/**
 * One DocModel block → zero or more TipTap nodes. Most blocks map to a single
 * node; a figure or equation expands to the media node plus an optional caption
 * paragraph; a block with nothing renderable (an image whose crop is missing,
 * an empty list or table) maps to no nodes at all.
 */
function convertBlock(
  block: DocModelBlock,
  imageSrcByRef: Record<string, string>,
): TipTapNode[] {
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
      return [node];
    }

    case 'paragraph':
      return [paragraphNode(block.runs)];

    case 'callout': {
      const children = block.children.flatMap((child) => convertBlock(child, imageSrcByRef));
      return [
        {
          type: 'callout',
          attrs: { calloutType: block.variant },
          content: children.length > 0 ? children : [{ type: 'paragraph' }],
        },
      ];
    }

    case 'bulletList':
    case 'orderedList':
    case 'taskList': {
      const node = convertListContainer(block);
      return node ? [node] : [];
    }

    case 'table': {
      const rows = block.rows.filter((cells) => cells.length > 0);
      if (rows.length === 0) return [];
      return [
        {
          type: 'table',
          content: rows.map((cells, rowIndex) => ({
            type: 'tableRow',
            content: cells.map((cellRuns) => ({
              type: block.headerRow && rowIndex === 0 ? 'tableHeader' : 'tableCell',
              attrs: { colspan: 1, rowspan: 1, colwidth: null },
              content: [paragraphNode(cellRuns)],
            })),
          })),
        },
      ];
    }

    case 'codeBlock': {
      const node: TipTapNode = { type: 'codeBlock', attrs: { language: block.lang } };
      if (block.code.length > 0) {
        node.content = [{ type: 'text', text: block.code }];
      }
      return [node];
    }

    case 'blockquote':
      return [{ type: 'blockquote', content: [paragraphNode(block.runs)] }];

    // Figures are cropped from the rendered page and uploaded by the import
    // worker, which supplies the ref → URL map. A ref with no entry means
    // the crop was dropped (too small / failed) — skip the image. A caption,
    // when present, follows as its own italic paragraph.
    case 'image': {
      const src = imageSrcByRef[block.ref];
      const nodes: TipTapNode[] = [];
      if (src) nodes.push({ type: 'resizableImage', attrs: { src } });
      if (block.caption) {
        // The caption is verbatim page text — keep it even when the crop
        // itself failed, so a dropped figure never silently loses prose.
        const caption = captionParagraph(block.caption);
        if (caption) nodes.push(caption);
      }
      return nodes;
    }

    // A rendered equation → a KaTeX math node. Display math is a block node;
    // inline math is wrapped in a paragraph so it sits at block level. An
    // optional caption follows as its own italic paragraph.
    case 'math': {
      const mathNode: TipTapNode = block.display
        ? { type: 'blockMath', attrs: { latex: block.latex } }
        : { type: 'paragraph', content: [{ type: 'inlineMath', attrs: { latex: block.latex } }] };
      const nodes: TipTapNode[] = [mathNode];
      if (block.caption) {
        const caption = captionParagraph(block.caption);
        if (caption) nodes.push(caption);
      }
      return nodes;
    }

    case 'horizontalRule':
      return [{ type: 'horizontalRule' }];
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
 * images without an entry are dropped. Nodes are appended one at a time and
 * the running JSON size is checked after each: once it would exceed
 * `MAX_DOC_BYTES` the last node is removed, a truncation callout is appended,
 * and `truncated` is returned `true`. The result always has at least one
 * block, so an empty `DocModel` still yields a valid document.
 */
export function assembleTiptap(
  model: DocModel,
  imageSrcByRef: Record<string, string> = {},
): { doc: TipTapDoc; truncated: boolean } {
  // Convert every block, merging CONSECUTIVE blockquotes into one quote node:
  // a multi-line quotation (quote + attribution) arrives from the engine as
  // one blockquote block per visual line, and a single quote box with several
  // paragraphs is the faithful rendering.
  const nodes: TipTapNode[] = [];
  for (const block of model.blocks) {
    for (const node of convertBlock(block, imageSrcByRef)) {
      const prev = nodes[nodes.length - 1];
      if (
        node.type === 'blockquote' &&
        prev?.type === 'blockquote' &&
        Array.isArray(prev.content) &&
        Array.isArray(node.content)
      ) {
        prev.content.push(...node.content);
        continue;
      }
      nodes.push(node);
    }
  }

  const doc: TipTapDoc = { type: 'doc', content: [] };
  let truncated = false;

  for (const node of nodes) {
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
