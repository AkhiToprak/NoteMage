import { describe, expect, it } from 'vitest';
import type { TipTapDoc, TipTapNode, TipTapTextNode } from '@/lib/contentConverter';
import { assembleTiptap } from './assemble';
import type { DocModel, DocModelBlock } from './doc-model';

/** Assemble a one-block DocModel and return that block's TipTap node. */
function assembleOne(
  block: DocModelBlock,
  imageSrcByRef?: Record<string, string>,
): TipTapNode {
  const { doc } = assembleTiptap({ blocks: [block] }, imageSrcByRef);
  return doc.content[0];
}

/** Every node `type` in the document, depth-first. */
function allNodeTypes(doc: TipTapDoc): string[] {
  const types: string[] = [];
  const walk = (node: TipTapNode | TipTapTextNode): void => {
    types.push(node.type);
    const content = (node as TipTapNode).content;
    if (content) content.forEach(walk);
  };
  doc.content.forEach(walk);
  return types;
}

describe('assembleTiptap — block → node mapping', () => {
  it('maps heading to a toggleHeading carrying the level and plain-text summary', () => {
    const node = assembleOne({ type: 'heading', level: 2, runs: [{ text: 'Photosynthesis' }] });
    expect(node).toEqual({
      type: 'toggleHeading',
      attrs: { level: 2, collapsed: false, summary: 'Photosynthesis' },
      content: [{ type: 'paragraph' }],
    });
  });

  it('flattens heading inline runs into one summary string', () => {
    const node = assembleOne({
      type: 'heading',
      level: 1,
      runs: [{ text: 'Bold ', bold: true }, { text: 'part' }],
    });
    expect(node.attrs?.summary).toBe('Bold part');
  });

  it('maps paragraph runs to text nodes', () => {
    const node = assembleOne({ type: 'paragraph', runs: [{ text: 'Hello world' }] });
    expect(node).toEqual({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Hello world' }],
    });
  });

  it('maps callout to a callout with the variant on calloutType', () => {
    const node = assembleOne({
      type: 'callout',
      variant: 'tip',
      children: [{ type: 'paragraph', runs: [{ text: 'A handy tip.' }] }],
    });
    expect(node.type).toBe('callout');
    expect(node.attrs?.calloutType).toBe('tip');
    expect(node.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'A handy tip.' }] },
    ]);
  });

  it('gives an empty callout a placeholder paragraph so it stays valid', () => {
    const node = assembleOne({ type: 'callout', variant: 'info', children: [] });
    expect(node.content).toEqual([{ type: 'paragraph' }]);
  });

  it('maps bulletList items to listItems wrapping a paragraph', () => {
    const node = assembleOne({
      type: 'bulletList',
      items: [{ runs: [{ text: 'one' }] }, { runs: [{ text: 'two' }] }],
    });
    expect(node).toEqual({
      type: 'bulletList',
      content: [
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'one' }] }] },
        { type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'two' }] }] },
      ],
    });
  });

  it('maps orderedList the same way as bulletList', () => {
    const node = assembleOne({ type: 'orderedList', items: [{ runs: [{ text: 'step' }] }] });
    expect(node.type).toBe('orderedList');
    expect(node.content?.[0].type).toBe('listItem');
  });

  it('maps table rows and cells, using tableHeader for the header row', () => {
    const node = assembleOne({
      type: 'table',
      headerRow: true,
      rows: [
        [[{ text: 'Name' }], [{ text: 'Score' }]],
        [[{ text: 'Alice' }], [{ text: '90' }]],
      ],
    });
    expect(node.type).toBe('table');
    const [headerRow, bodyRow] = node.content as TipTapNode[];
    expect((headerRow.content as TipTapNode[]).map((c) => c.type)).toEqual([
      'tableHeader',
      'tableHeader',
    ]);
    expect((bodyRow.content as TipTapNode[]).map((c) => c.type)).toEqual([
      'tableCell',
      'tableCell',
    ]);
    const firstCell = (headerRow.content as TipTapNode[])[0];
    expect(firstCell.attrs).toEqual({ colspan: 1, rowspan: 1, colwidth: null });
    expect(firstCell.content).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: 'Name' }] },
    ]);
  });

  it('uses tableCell for every row when headerRow is false', () => {
    const node = assembleOne({
      type: 'table',
      headerRow: false,
      rows: [[[{ text: 'a' }]]],
    });
    const firstRow = (node.content as TipTapNode[])[0];
    expect((firstRow.content as TipTapNode[])[0].type).toBe('tableCell');
  });

  it('maps codeBlock with its language attr and the verbatim code', () => {
    const node = assembleOne({ type: 'codeBlock', lang: 'python', code: 'print(1)' });
    expect(node).toEqual({
      type: 'codeBlock',
      attrs: { language: 'python' },
      content: [{ type: 'text', text: 'print(1)' }],
    });
  });

  it('keeps a null codeBlock language and omits content for empty code', () => {
    const node = assembleOne({ type: 'codeBlock', lang: null, code: '' });
    expect(node).toEqual({ type: 'codeBlock', attrs: { language: null } });
  });

  it('maps blockquote runs into a wrapped paragraph', () => {
    const node = assembleOne({ type: 'blockquote', runs: [{ text: 'Quoted.' }] });
    expect(node).toEqual({
      type: 'blockquote',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quoted.' }] }],
    });
  });

  it('maps horizontalRule directly', () => {
    expect(assembleOne({ type: 'horizontalRule' })).toEqual({ type: 'horizontalRule' });
  });

  it('maps an image to a resizableImage when the ref resolves', () => {
    const node = assembleOne(
      { type: 'image', ref: 'p1-fig-1', bbox: [0, 0, 1, 1] },
      { 'p1-fig-1': 'https://cdn.example/crop.png' },
    );
    expect(node).toEqual({
      type: 'resizableImage',
      attrs: { src: 'https://cdn.example/crop.png' },
    });
  });
});

describe('assembleTiptap — never emits a disabled heading node', () => {
  it('emits toggleHeading and never a plain heading node for any level', () => {
    const blocks: DocModelBlock[] = [
      { type: 'heading', level: 1, runs: [{ text: 'L1' }] },
      { type: 'heading', level: 2, runs: [{ text: 'L2' }] },
      { type: 'heading', level: 3, runs: [{ text: 'L3' }] },
    ];
    const { doc } = assembleTiptap({ blocks });
    const types = allNodeTypes(doc);
    expect(types).not.toContain('heading');
    expect(types.filter((t) => t === 'toggleHeading')).toHaveLength(3);
  });
});

describe('assembleTiptap — inline marks', () => {
  it('preserves every supported mark on a run', () => {
    const node = assembleOne({
      type: 'paragraph',
      runs: [
        { text: 'bold', bold: true },
        { text: 'italic', italic: true },
        { text: 'under', underline: true },
        { text: 'struck', strike: true },
        { text: 'code', code: true },
      ],
    });
    const marks = (node.content as TipTapTextNode[]).map((t) => t.marks?.[0].type);
    expect(marks).toEqual(['bold', 'italic', 'underline', 'strike', 'code']);
  });

  it('keeps multiple marks on a single run', () => {
    const node = assembleOne({
      type: 'paragraph',
      runs: [{ text: 'strong+em', bold: true, italic: true }],
    });
    expect((node.content as TipTapTextNode[])[0].marks).toEqual([
      { type: 'bold' },
      { type: 'italic' },
    ]);
  });

  it('maps a link run to a link mark with href and target', () => {
    const node = assembleOne({
      type: 'paragraph',
      runs: [{ text: 'site', link: 'https://example.com' }],
    });
    expect((node.content as TipTapTextNode[])[0].marks).toEqual([
      { type: 'link', attrs: { href: 'https://example.com', target: '_blank' } },
    ]);
  });

  it('drops empty-text runs — ProseMirror forbids empty text nodes', () => {
    const node = assembleOne({
      type: 'paragraph',
      runs: [{ text: '' }, { text: 'kept' }, { text: '' }],
    });
    expect(node.content).toEqual([{ type: 'text', text: 'kept' }]);
  });

  it('emits an empty paragraph when a paragraph has no usable runs', () => {
    expect(assembleOne({ type: 'paragraph', runs: [{ text: '' }] })).toEqual({
      type: 'paragraph',
    });
  });
});

describe('assembleTiptap — size guard', () => {
  it('truncates oversized input and appends a warning callout', () => {
    const blocks: DocModelBlock[] = [];
    for (let i = 0; i < 200; i++) {
      blocks.push({ type: 'paragraph', runs: [{ text: 'x'.repeat(4000) }] });
    }
    const { doc, truncated } = assembleTiptap({ blocks });

    expect(truncated).toBe(true);
    expect(doc.content.length).toBeLessThan(200);
    expect(Buffer.byteLength(JSON.stringify(doc))).toBeLessThan(500_000);

    const last = doc.content[doc.content.length - 1];
    expect(last.type).toBe('callout');
    expect(last.attrs?.calloutType).toBe('warning');
    expect(JSON.stringify(last)).toContain('Import truncated');
  });

  it('does not truncate or add a notice for a document under the cap', () => {
    const { doc, truncated } = assembleTiptap({
      blocks: [{ type: 'paragraph', runs: [{ text: 'short' }] }],
    });
    expect(truncated).toBe(false);
    expect(doc.content).toHaveLength(1);
    expect(doc.content[0].type).toBe('paragraph');
  });
});

describe('assembleTiptap — dropped blocks', () => {
  it('drops an image whose ref is not in the map', () => {
    const { doc, truncated } = assembleTiptap({
      blocks: [{ type: 'image', ref: 'missing', bbox: [0, 0, 1, 1] }],
    });
    expect(truncated).toBe(false);
    expect(allNodeTypes(doc)).not.toContain('resizableImage');
    expect(doc.content).toEqual([{ type: 'paragraph' }]);
  });

  it('keeps surrounding blocks when one image ref is missing', () => {
    const { doc } = assembleTiptap({
      blocks: [
        { type: 'paragraph', runs: [{ text: 'before' }] },
        { type: 'image', ref: 'missing', bbox: [0, 0, 1, 1] },
        { type: 'paragraph', runs: [{ text: 'after' }] },
      ],
    });
    expect(doc.content.map((n) => n.type)).toEqual(['paragraph', 'paragraph']);
  });

  it('drops a table that has no rows', () => {
    const { doc } = assembleTiptap({
      blocks: [{ type: 'table', headerRow: false, rows: [] }],
    });
    expect(allNodeTypes(doc)).not.toContain('table');
  });

  it('drops a list that has no items', () => {
    const { doc } = assembleTiptap({ blocks: [{ type: 'bulletList', items: [] }] });
    expect(allNodeTypes(doc)).not.toContain('bulletList');
  });
});

describe('assembleTiptap — always a valid non-empty document', () => {
  it('returns a single empty paragraph for an empty DocModel', () => {
    const { doc, truncated } = assembleTiptap({ blocks: [] });
    expect(doc).toEqual({ type: 'doc', content: [{ type: 'paragraph' }] });
    expect(truncated).toBe(false);
  });

  it('always produces a doc node with at least one block', () => {
    const models: DocModel[] = [
      { blocks: [] },
      { blocks: [{ type: 'image', ref: 'gone', bbox: [0, 0, 1, 1] }] },
      { blocks: [{ type: 'paragraph', runs: [{ text: 'ok' }] }] },
    ];
    for (const model of models) {
      const { doc } = assembleTiptap(model);
      expect(doc.type).toBe('doc');
      expect(doc.content.length).toBeGreaterThanOrEqual(1);
    }
  });
});
