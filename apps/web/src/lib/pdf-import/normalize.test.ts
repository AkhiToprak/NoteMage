import { describe, it, expect } from 'vitest';
import { normalizeTableCell, normalizeDocModelShape } from './normalize';
import { docModelSchema } from './doc-model';

describe('normalizeTableCell', () => {
  it('passes a bare run array through', () => {
    expect(normalizeTableCell([{ text: 'a', bold: true }])).toEqual([{ text: 'a', bold: true }]);
  });

  it('coerces a bare string into a run array', () => {
    expect(normalizeTableCell('Hello')).toEqual([{ text: 'Hello' }]);
  });

  it('unwraps { runs: [...] }', () => {
    expect(normalizeTableCell({ runs: [{ text: 'x' }] })).toEqual([{ text: 'x' }]);
  });

  it('unwraps { type: "paragraph", runs: [...] }', () => {
    expect(normalizeTableCell({ type: 'paragraph', runs: [{ text: 'y' }] })).toEqual([
      { text: 'y' },
    ]);
  });

  it('wraps a single { text } run object', () => {
    expect(normalizeTableCell({ text: 'z' })).toEqual([{ text: 'z' }]);
  });

  it('drops a stray run `type` key and keeps valid flags', () => {
    expect(normalizeTableCell([{ type: 'text', text: 'b', italic: true }])).toEqual([
      { text: 'b', italic: true },
    ]);
  });

  it('drops type-mismatched flags (bold:"true")', () => {
    expect(normalizeTableCell([{ text: 'c', bold: 'true' }])).toEqual([{ text: 'c' }]);
  });

  it('returns an empty array for null / empty cells', () => {
    expect(normalizeTableCell(null)).toEqual([]);
    expect(normalizeTableCell([])).toEqual([]);
    expect(normalizeTableCell('')).toEqual([]);
  });
});

describe('normalizeDocModelShape', () => {
  it('normalizes a drifted table so the strict schema accepts it', () => {
    const drifted = {
      blocks: [
        {
          type: 'table',
          rows: [
            [{ runs: [{ text: 'Header A' }] }, 'Header B'],
            [{ type: 'paragraph', runs: [{ text: '1' }] }, { text: '2' }],
          ],
        },
      ],
    };
    const normalized = normalizeDocModelShape(drifted);
    const result = docModelSchema.safeParse(normalized);
    expect(result.success).toBe(true);
    if (result.success) {
      const table = result.data.blocks[0];
      expect(table.type).toBe('table');
      if (table.type === 'table') {
        expect(table.rows).toEqual([
          [[{ text: 'Header A' }], [{ text: 'Header B' }]],
          [[{ text: '1' }], [{ text: '2' }]],
        ]);
        expect(table.headerRow).toBe(true); // defaulted (multi-row)
      }
    }
  });

  it('unwraps a row given as { cells: [...] }', () => {
    const drifted = {
      blocks: [{ type: 'table', headerRow: false, rows: [{ cells: ['a', 'b'] }] }],
    };
    const normalized = normalizeDocModelShape(drifted) as { blocks: Array<{ rows: unknown }> };
    expect(normalized.blocks[0].rows).toEqual([[[{ text: 'a' }], [{ text: 'b' }]]]);
  });

  it('leaves non-table blocks untouched', () => {
    const doc = { blocks: [{ type: 'paragraph', runs: [{ text: 'hi' }] }] };
    const normalized = normalizeDocModelShape(doc);
    expect(docModelSchema.safeParse(normalized).success).toBe(true);
  });

  it('accepts a bare block array', () => {
    const blocks = [{ type: 'table', rows: [['a']] }];
    const normalized = normalizeDocModelShape(blocks) as Array<{ rows: unknown; headerRow: boolean }>;
    expect(normalized[0].rows).toEqual([[[{ text: 'a' }]]]);
    expect(normalized[0].headerRow).toBe(false); // single row
  });
});

describe('normalizeDocModelShape — extended drift rescue', () => {
  const parseAfter = (blocks: unknown[]) =>
    docModelSchema.safeParse(normalizeDocModelShape({ blocks }));

  it('coerces a bare-string caption on image and math blocks', () => {
    const result = parseAfter([
      { type: 'image', ref: 'p1-fig-1', bbox: [0, 0, 1, 1], caption: 'Figure 1 — chart.' },
      { type: 'math', latex: 'E=mc^2', display: true, caption: 'Equation.' },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      const img = result.data.blocks[0];
      if (img.type === 'image') expect(img.caption).toEqual([{ text: 'Figure 1 — chart.' }]);
    }
  });

  it('drops an empty caption rather than failing validation', () => {
    const result = parseAfter([
      { type: 'image', ref: 'p1-fig-1', bbox: [0, 0, 1, 1], caption: '' },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      const img = result.data.blocks[0];
      if (img.type === 'image') expect(img.caption).toBeUndefined();
    }
  });

  it('keeps a string alt on an image block', () => {
    const result = parseAfter([
      { type: 'image', ref: 'p1-fig-1', bbox: [0, 0, 1, 1], alt: 'Bar chart of weekly study hours.' },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      const img = result.data.blocks[0];
      if (img.type === 'image') expect(img.alt).toBe('Bar chart of weekly study hours.');
    }
  });

  it('flattens a run-array alt into a string instead of failing validation', () => {
    const result = parseAfter([
      { type: 'image', ref: 'p1-fig-1', bbox: [0, 0, 1, 1], alt: [{ text: 'A' }, { text: 'cell.' }] },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      const img = result.data.blocks[0];
      if (img.type === 'image') expect(img.alt).toBe('A cell.');
    }
  });

  it('drops a non-string alt with no recoverable text (number)', () => {
    const result = parseAfter([
      { type: 'image', ref: 'p1-fig-1', bbox: [0, 0, 1, 1], alt: 42 },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      const img = result.data.blocks[0];
      if (img.type === 'image') expect(img.alt).toBeUndefined();
    }
  });

  it('coerces checked given as a string and items given as strings', () => {
    const result = parseAfter([
      {
        type: 'taskList',
        items: [{ runs: [{ text: 'a' }], checked: 'true' }, 'bare item'],
      },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      const list = result.data.blocks[0];
      if (list.type === 'taskList') {
        expect(list.items[0].checked).toBe(true);
        expect(list.items[1].runs).toEqual([{ text: 'bare item' }]);
      }
    }
  });

  it('wraps a single nested-children object into an array and recurses', () => {
    const result = parseAfter([
      {
        type: 'bulletList',
        items: [
          {
            runs: [{ text: 'parent' }],
            children: { type: 'bulletList', items: ['child'] },
          },
        ],
      },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      const list = result.data.blocks[0];
      if (list.type === 'bulletList') {
        expect(list.items[0].children?.[0]).toEqual({
          type: 'bulletList',
          items: [{ runs: [{ text: 'child' }] }],
        });
      }
    }
  });

  it('strips stray keys from blocks and runs', () => {
    const result = parseAfter([
      { type: 'paragraph', runs: [{ type: 'text', text: 'hi', style: 'big' }], align: 'left' },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.blocks[0]).toEqual({ type: 'paragraph', runs: [{ text: 'hi' }] });
    }
  });

  it('expands a blockquote drifted into children into per-line blockquotes', () => {
    const result = parseAfter([
      {
        type: 'blockquote',
        children: [
          { type: 'paragraph', runs: [{ text: 'Tell me and I forget.', italic: true }] },
          { type: 'paragraph', runs: [{ text: '— Xenophon' }] },
        ],
      },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.blocks).toEqual([
        { type: 'blockquote', runs: [{ text: 'Tell me and I forget.', italic: true }] },
        { type: 'blockquote', runs: [{ text: '— Xenophon' }] },
      ]);
    }
  });

  it('maps callout variant synonyms and demotes a heading child to a paragraph', () => {
    const result = parseAfter([
      {
        type: 'callout',
        variant: 'Error',
        children: [{ type: 'heading', level: 2, runs: [{ text: 'Danger zone' }] }],
      },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      const callout = result.data.blocks[0];
      if (callout.type === 'callout') {
        expect(callout.variant).toBe('danger');
        expect(callout.children).toEqual([
          { type: 'paragraph', runs: [{ text: 'Danger zone' }] },
        ]);
      }
    }
  });

  it('defaults a missing math display flag and strips $ delimiters', () => {
    const result = parseAfter([{ type: 'math', latex: '$$E=mc^2$$' }]);
    expect(result.success).toBe(true);
    if (result.success) {
      const math = result.data.blocks[0];
      if (math.type === 'math') {
        expect(math.latex).toBe('E=mc^2');
        expect(math.display).toBe(true);
      }
    }
  });

  it('coerces numeric-string heading levels and clamps the range', () => {
    const result = parseAfter([
      { type: 'heading', level: '2', runs: [{ text: 'h' }] },
      { type: 'heading', level: 5, runs: [{ text: 'deep' }] },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      const [a, b] = result.data.blocks;
      if (a.type === 'heading') expect(a.level).toBe(2);
      if (b.type === 'heading') expect(b.level).toBe(3);
    }
  });

  it('coerces numeric-string bbox values', () => {
    const result = parseAfter([
      { type: 'image', ref: 'p1-fig-1', bbox: ['0.1', '0.2', '0.8', '0.9'] },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      const img = result.data.blocks[0];
      if (img.type === 'image') expect(img.bbox).toEqual([0.1, 0.2, 0.8, 0.9]);
    }
  });

  it('passes any above-1 bbox through untouched for the crop stage to rescale', () => {
    // Percent, 0–1000-grid, pixel, and PER-AXIS mixed drift all rescale in
    // cropFigure, which knows the page dimensions — normalize must not
    // mangle them (a whole-bbox divide would wreck mixed-axis boxes).
    for (const bbox of [
      [8, 31, 92, 64],
      [100, 100, 600, 500],
      [0.187, 94, 0.797, 330],
    ]) {
      const result = parseAfter([{ type: 'image', ref: 'p1-fig-1', bbox }]);
      expect(result.success).toBe(true);
      if (result.success) {
        const img = result.data.blocks[0];
        if (img.type === 'image') expect(img.bbox).toEqual(bbox);
      }
    }
  });

  it('reinterprets an [x, y, w, h]-style bbox as corners', () => {
    const result = parseAfter([
      { type: 'image', ref: 'p1-fig-1', bbox: [0.1, 0.4, 0.8, 0.3] },
    ]);
    expect(result.success).toBe(true);
    if (result.success) {
      const img = result.data.blocks[0];
      if (img.type === 'image') {
        expect(img.bbox[2]).toBeCloseTo(0.9);
        expect(img.bbox[3]).toBeCloseTo(0.7);
      }
    }
  });
});
