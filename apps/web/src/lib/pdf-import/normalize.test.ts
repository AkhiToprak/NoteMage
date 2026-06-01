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
