import { describe, expect, it } from 'vitest';
import { docModelSchema, type DocModelBlock } from './doc-model';
import type { GroundTruthPage } from './ground-truth';
import { groundTruthToBlocks, isTableDensePage } from './heuristic-fallback';
import type { Cell, Line } from './pdfjs-geometry';

// The fallback consumes pure geometry, so fixtures are hand-built Line
// objects — no PDF rendering needed.

function cell(text: string, startX: number, width = text.length * 6): Cell {
  return { text, startX, endX: startX + width };
}
function line(y: number, fontSize: number, ...cells: Cell[]): Line {
  return { y, fontSize, cells };
}
function page(...lines: Line[]): GroundTruthPage {
  return { pageNumber: 1, width: 600, height: 800, lines };
}

/** Every fallback output must be a valid DocModel — the load-bearing invariant. */
function expectValidDoc(blocks: DocModelBlock[]): void {
  expect(docModelSchema.safeParse({ blocks }).success).toBe(true);
}

describe('groundTruthToBlocks', () => {
  it('returns an empty, valid block list for a page with no lines', () => {
    const blocks = groundTruthToBlocks(page());
    expect(blocks).toEqual([]);
    expectValidDoc(blocks);
  });

  it('detects a visually larger line as a level-1 heading', () => {
    const blocks = groundTruthToBlocks(
      page(
        line(750, 26, cell('Photosynthesis', 50)),
        line(700, 12, cell('Plants convert light into chemical energy across many words.', 50)),
        line(686, 12, cell('A second body line continues that same opening paragraph here.', 50)),
      ),
    );
    expectValidDoc(blocks);
    expect(blocks[0]).toMatchObject({ type: 'heading', level: 1, runs: [{ text: 'Photosynthesis' }] });
  });

  it('ranks distinct heading sizes into levels 1, 2 and 3', () => {
    const blocks = groundTruthToBlocks(
      page(
        line(760, 30, cell('Big Title', 50)),
        line(724, 22, cell('Medium Section', 50)),
        line(700, 11, cell('Body sentence one provides realistic filler content for a page.', 50)),
        line(686, 11, cell('Body sentence two keeps the body font size the clear majority.', 50)),
        line(672, 11, cell('Body sentence three stays at the same ordinary body size value.', 50)),
        line(636, 16, cell('Small Subsection', 50)),
        line(606, 11, cell('Body sentence four appears under the small subsection heading too.', 50)),
        line(592, 11, cell('Body sentence five rounds out the body text on this test page.', 50)),
      ),
    );
    expectValidDoc(blocks);
    const levels = blocks
      .filter((block) => block.type === 'heading')
      .map((block) => (block.type === 'heading' ? block.level : 0));
    expect(levels).toEqual([1, 2, 3]);
  });

  it('groups consecutive bullet lines into one bulletList with glyphs stripped', () => {
    const blocks = groundTruthToBlocks(
      page(
        line(700, 12, cell('• First item', 50)),
        line(684, 12, cell('• Second item', 50)),
        line(668, 12, cell('• Third item', 50)),
      ),
    );
    expectValidDoc(blocks);
    expect(blocks).toHaveLength(1);
    const list = blocks[0];
    if (list.type !== 'bulletList') throw new Error('expected a bulletList');
    expect(list.items.map((item) => item.runs[0].text)).toEqual([
      'First item',
      'Second item',
      'Third item',
    ]);
  });

  it('groups consecutive numbered lines into one orderedList with markers stripped', () => {
    const blocks = groundTruthToBlocks(
      page(
        line(700, 12, cell('1. Step one', 50)),
        line(684, 12, cell('2. Step two', 50)),
      ),
    );
    expectValidDoc(blocks);
    const list = blocks[0];
    if (list.type !== 'orderedList') throw new Error('expected an orderedList');
    expect(list.items.map((item) => item.runs[0].text)).toEqual(['Step one', 'Step two']);
  });

  it('does not merge two bullet lists separated by a paragraph', () => {
    const blocks = groundTruthToBlocks(
      page(
        line(720, 12, cell('• Apple', 50)),
        line(700, 12, cell('A plain sentence interrupts the list with ordinary prose here.', 50)),
        line(680, 12, cell('• Banana', 50)),
      ),
    );
    expectValidDoc(blocks);
    expect(blocks.map((block) => block.type)).toEqual(['bulletList', 'paragraph', 'bulletList']);
  });

  it('builds a table from canonically aligned columns', () => {
    const blocks = groundTruthToBlocks(
      page(
        line(700, 12, cell('Name', 50), cell('Score', 250)),
        line(684, 12, cell('Alice', 50), cell('90', 250)),
        line(668, 12, cell('Bob', 50), cell('75', 250)),
      ),
    );
    expectValidDoc(blocks);
    const table = blocks.find((block) => block.type === 'table');
    if (!table || table.type !== 'table') throw new Error('expected a table block');
    expect(table.rows.length).toBeGreaterThanOrEqual(2);
  });

  it('joins a soft-hyphenated word split across two lines', () => {
    const blocks = groundTruthToBlocks(
      page(
        line(700, 12, cell('This explains the funda-', 50)),
        line(686, 12, cell('mental concept in great detail', 50)),
      ),
    );
    expectValidDoc(blocks);
    expect(blocks).toHaveLength(1);
    const para = blocks[0];
    if (para.type !== 'paragraph') throw new Error('expected a paragraph');
    expect(para.runs[0].text).toContain('fundamental');
  });

  it('splits paragraphs separated by a wide vertical gap', () => {
    const blocks = groundTruthToBlocks(
      page(
        line(740, 12, cell('First paragraph sits near the top of this test page area.', 50)),
        line(620, 12, cell('Second paragraph sits far below after a wide blank gap.', 50)),
      ),
    );
    expectValidDoc(blocks);
    expect(blocks.filter((block) => block.type === 'paragraph')).toHaveLength(2);
  });

  it('never emits callouts, code blocks, images, or inline marks', () => {
    const blocks = groundTruthToBlocks(
      page(
        line(750, 24, cell('Heading Here', 50)),
        line(710, 12, cell('• a bullet point line on the page', 50)),
        line(694, 12, cell('Body prose that should land in a plain paragraph block here.', 50)),
      ),
    );
    expectValidDoc(blocks);
    for (const block of blocks) {
      expect(['heading', 'paragraph', 'bulletList', 'orderedList', 'table']).toContain(block.type);
    }
    const json = JSON.stringify(blocks);
    expect(json).not.toContain('"bold"');
    expect(json).not.toContain('"italic"');
  });

  it('is deterministic', () => {
    const build = (): GroundTruthPage =>
      page(
        line(750, 24, cell('Title', 50)),
        line(710, 12, cell('Body text content for the determinism check on this page.', 50)),
      );
    expect(groundTruthToBlocks(build())).toEqual(groundTruthToBlocks(build()));
  });
});

const denseTable = (rows: number): DocModelBlock => ({
  type: 'table',
  headerRow: true,
  rows: Array.from({ length: rows }, () => [[{ text: 'x' }]]),
});
const denseParagraph: DocModelBlock = { type: 'paragraph', runs: [{ text: 'hi' }] };

describe('isTableDensePage', () => {
  it('flags a page with a 4+ row table', () => {
    expect(isTableDensePage([denseParagraph, denseTable(4)])).toBe(true);
  });

  it('does not flag a small table', () => {
    expect(isTableDensePage([denseTable(2)])).toBe(false);
  });

  it('sums rows across multiple tables', () => {
    expect(isTableDensePage([denseTable(2), denseTable(3)])).toBe(true);
  });

  it('does not flag a page with no tables', () => {
    expect(isTableDensePage([denseParagraph, denseParagraph])).toBe(false);
  });
});
