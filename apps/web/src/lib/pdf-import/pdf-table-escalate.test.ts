import { describe, it, expect } from 'vitest';
import { isTableDensePage } from './pdf-table-escalate';
import type { DocModelBlock } from './doc-model';

const table = (rows: number): DocModelBlock => ({
  type: 'table',
  headerRow: true,
  rows: Array.from({ length: rows }, () => [[{ text: 'x' }]]),
});
const para: DocModelBlock = { type: 'paragraph', runs: [{ text: 'hi' }] };

describe('isTableDensePage', () => {
  it('flags a page with a 4+ row table', () => {
    expect(isTableDensePage([para, table(4)])).toBe(true);
  });

  it('does not flag a small table', () => {
    expect(isTableDensePage([table(2)])).toBe(false);
  });

  it('sums rows across multiple tables', () => {
    expect(isTableDensePage([table(2), table(3)])).toBe(true);
  });

  it('does not flag a page with no tables', () => {
    expect(isTableDensePage([para, para])).toBe(false);
  });
});
