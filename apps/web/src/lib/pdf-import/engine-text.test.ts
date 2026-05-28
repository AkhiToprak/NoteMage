import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { docModelSchema, type DocModelBlock } from './doc-model';
import { type DescribePageInput, StructureEngineError } from './engine';
import { textLayerEngine } from './engine-text';
import { extractGroundTruth, type GroundTruthPage } from './ground-truth';
import type { Cell, Line } from './pdfjs-geometry';

// The text engine consumes pure geometry, so unit fixtures are hand-built
// `Line` objects — same pattern as `heuristic-fallback.test.ts`. The
// integration suite at the bottom exercises the real ground-truth pipeline
// against the existing `__fixtures__/*.pdf` corpus.

function cell(text: string, startX: number, width = text.length * 6): Cell {
  return { text, startX, endX: startX + width };
}
function line(y: number, fontSize: number, ...cells: Cell[]): Line {
  return { y, fontSize, cells };
}
function page(...lines: Line[]): GroundTruthPage {
  return { pageNumber: 1, width: 600, height: 800, lines };
}

/** Minimal `DescribePageInput` for a text-layer engine call. The text
 *  engine ignores the vision-only fields. */
function input(gtPage: GroundTruthPage, overrides: Partial<DescribePageInput> = {}): DescribePageInput {
  return {
    pageImageBase64: '',
    mimeType: 'image/png',
    groundTruthText: '',
    isScanned: false,
    pageNumber: gtPage.pageNumber,
    groundTruthPage: gtPage,
    ...overrides,
  };
}

/** Every text engine output must be a valid DocModel — same invariant as
 *  the heuristic-fallback tests. */
function expectValidDoc(blocks: DocModelBlock[]): void {
  expect(docModelSchema.safeParse({ blocks }).success).toBe(true);
}

describe('textLayerEngine — identity', () => {
  it('reports its engine name and configured state', () => {
    expect(textLayerEngine.name).toBe('text-layer');
    expect(textLayerEngine.isConfigured()).toBe(true);
  });
});

describe('textLayerEngine — fallback sentinels', () => {
  it('throws StructureEngineError on a scanned page', async () => {
    await expect(
      textLayerEngine.describePage(
        input(page(line(700, 12, cell('anything', 50))), { isScanned: true }),
      ),
    ).rejects.toBeInstanceOf(StructureEngineError);
  });

  it('throws StructureEngineError when groundTruthPage is missing', async () => {
    await expect(
      textLayerEngine.describePage({
        pageImageBase64: '',
        mimeType: 'image/png',
        groundTruthText: '',
        isScanned: false,
        pageNumber: 1,
      }),
    ).rejects.toBeInstanceOf(StructureEngineError);
  });

  it('throws StructureEngineError when the classifier produces zero blocks', async () => {
    // pdfjs said "text layer present" — but the page is empty (e.g. a
    // tiny corrupted layer). The engine signals the worker to promote
    // this page to Gemini rather than silently emit an empty paragraph.
    await expect(textLayerEngine.describePage(input(page()))).rejects.toBeInstanceOf(
      StructureEngineError,
    );
  });
});

describe('textLayerEngine — preserved block types', () => {
  it('classifies a heading + paragraphs + bullet list + table into preserved blocks', async () => {
    const blocks = await textLayerEngine.describePage(
      input(
        page(
          line(770, 26, cell('Photosynthesis', 50)),
          line(740, 12, cell('Plants convert light into chemical energy across many words.', 50)),
          line(724, 12, cell('A second body line continues that opening paragraph here.', 50)),
          line(700, 12, cell('• First fact about chlorophyll', 50)),
          line(684, 12, cell('• Second fact about ATP synthesis', 50)),
          line(660, 12, cell('Stage', 50), cell('Output', 250)),
          line(644, 12, cell('Light', 50), cell('ATP', 250)),
          line(628, 12, cell('Dark', 50), cell('Sugar', 250)),
        ),
      ),
    );

    expectValidDoc(blocks);
    expect(blocks).toMatchSnapshot();

    const types = blocks.map((block) => block.type);
    expect(types).toContain('heading');
    expect(types).toContain('paragraph');
    expect(types).toContain('bulletList');
    expect(types).toContain('table');
  });

  it('never emits dropped block types (image, callout, blockquote, codeBlock)', async () => {
    // The heuristic doesn't produce these today; this guards the contract
    // at the engine boundary so a future classifier change can't leak them
    // into fast mode.
    const blocks = await textLayerEngine.describePage(
      input(
        page(
          line(770, 22, cell('Title', 50)),
          line(740, 12, cell('Plain body text on this test page line for the engine.', 50)),
        ),
      ),
    );
    expectValidDoc(blocks);
    for (const block of blocks) {
      expect(['image', 'callout', 'blockquote', 'codeBlock']).not.toContain(block.type);
    }
  });

  it('is deterministic for identical input', async () => {
    const build = (): GroundTruthPage =>
      page(
        line(770, 22, cell('Title', 50)),
        line(740, 12, cell('Body text content for the determinism check on this page.', 50)),
      );
    const first = await textLayerEngine.describePage(input(build()));
    const second = await textLayerEngine.describePage(input(build()));
    expect(first).toEqual(second);
  });
});

// Integration: real PDFs from the existing fixture corpus. Same shape the
// import worker will use in P5 — extractGroundTruth → textLayerEngine.
const readFixture = (name: string): Buffer =>
  readFileSync(fileURLToPath(new URL(`./__fixtures__/${name}`, import.meta.url)));

describe('textLayerEngine — integration against fixture PDFs', () => {
  it('produces a stable DocModel for clean-text.pdf', async () => {
    const gt = await extractGroundTruth(readFixture('clean-text.pdf'));
    expect(gt.hasTextLayer).toBe(true);
    const allBlocks: DocModelBlock[] = [];
    for (const gtPage of gt.pages) {
      const blocks = await textLayerEngine.describePage(
        input(gtPage, { pageNumber: gtPage.pageNumber }),
      );
      allBlocks.push(...blocks);
    }
    expectValidDoc(allBlocks);
    expect(allBlocks).toMatchSnapshot();
  });

  it('produces a stable DocModel for table-heavy.pdf', async () => {
    const gt = await extractGroundTruth(readFixture('table-heavy.pdf'));
    expect(gt.hasTextLayer).toBe(true);
    const allBlocks: DocModelBlock[] = [];
    for (const gtPage of gt.pages) {
      const blocks = await textLayerEngine.describePage(
        input(gtPage, { pageNumber: gtPage.pageNumber }),
      );
      allBlocks.push(...blocks);
    }
    expectValidDoc(allBlocks);
    expect(allBlocks.some((block) => block.type === 'table')).toBe(true);
    expect(allBlocks).toMatchSnapshot();
  });
});
