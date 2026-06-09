import { describe, it, expect } from 'vitest';
import { docModelSchema } from './doc-model';

/** Parse a block array wrapped as a DocModel. */
const parse = (blocks: unknown[]) => docModelSchema.safeParse({ blocks });

describe('docModelSchema — accepts valid DocModels', () => {
  it('accepts a heading at every allowed level', () => {
    expect(parse([{ type: 'heading', level: 1, runs: [{ text: 'A' }] }]).success).toBe(true);
    expect(parse([{ type: 'heading', level: 2, runs: [{ text: 'B' }] }]).success).toBe(true);
    expect(parse([{ type: 'heading', level: 3, runs: [{ text: 'C' }] }]).success).toBe(true);
  });

  it('accepts a paragraph with every inline mark', () => {
    expect(
      parse([
        {
          type: 'paragraph',
          runs: [
            { text: 'plain' },
            { text: 'bold', bold: true },
            { text: 'italic', italic: true },
            { text: 'under', underline: true },
            { text: 'struck', strike: true },
            { text: 'mono', code: true },
            { text: 'linked', link: 'https://example.com' },
          ],
        },
      ]).success,
    ).toBe(true);
  });

  it('accepts a callout with paragraph and list children', () => {
    expect(
      parse([
        {
          type: 'callout',
          variant: 'tip',
          children: [
            { type: 'paragraph', runs: [{ text: 'note' }] },
            { type: 'bulletList', items: [{ runs: [{ text: 'a' }] }] },
            { type: 'orderedList', items: [{ runs: [{ text: 'b' }] }] },
          ],
        },
      ]).success,
    ).toBe(true);
  });

  it('accepts bullet and ordered lists', () => {
    expect(parse([{ type: 'bulletList', items: [{ runs: [{ text: 'x' }] }] }]).success).toBe(true);
    expect(parse([{ type: 'orderedList', items: [{ runs: [{ text: 'y' }] }] }]).success).toBe(true);
  });

  it('accepts a table with a header row', () => {
    expect(
      parse([
        {
          type: 'table',
          headerRow: true,
          rows: [
            [[{ text: 'H1' }], [{ text: 'H2' }]],
            [[{ text: 'r1c1' }], [{ text: 'r1c2' }]],
          ],
        },
      ]).success,
    ).toBe(true);
  });

  it('accepts a code block with a language and with null', () => {
    expect(parse([{ type: 'codeBlock', lang: 'python', code: 'print(1)' }]).success).toBe(true);
    expect(parse([{ type: 'codeBlock', lang: null, code: 'plain' }]).success).toBe(true);
  });

  it('accepts a blockquote', () => {
    expect(parse([{ type: 'blockquote', runs: [{ text: 'quoted' }] }]).success).toBe(true);
  });

  it('accepts an image block', () => {
    expect(parse([{ type: 'image', ref: 'fig-1', bbox: [0, 0, 1, 1] }]).success).toBe(true);
  });

  it('accepts a horizontal rule', () => {
    expect(parse([{ type: 'horizontalRule' }]).success).toBe(true);
  });

  it('accepts an empty block list', () => {
    expect(parse([]).success).toBe(true);
  });

  it('accepts a DocModel containing every block type at once', () => {
    expect(
      parse([
        { type: 'heading', level: 1, runs: [{ text: 'Title' }] },
        { type: 'paragraph', runs: [{ text: 'Body' }] },
        {
          type: 'callout',
          variant: 'info',
          children: [{ type: 'paragraph', runs: [{ text: 'c' }] }],
        },
        { type: 'bulletList', items: [{ runs: [{ text: 'b' }] }] },
        { type: 'orderedList', items: [{ runs: [{ text: 'o' }] }] },
        { type: 'table', headerRow: false, rows: [[[{ text: 't' }]]] },
        { type: 'codeBlock', lang: null, code: 'x' },
        { type: 'blockquote', runs: [{ text: 'q' }] },
        { type: 'image', ref: 'r', bbox: [0.1, 0.2, 0.8, 0.9] },
        { type: 'horizontalRule' },
      ]).success,
    ).toBe(true);
  });
});

describe('docModelSchema — extended block vocabulary', () => {
  it('accepts the highlight, subscript and superscript inline marks', () => {
    expect(
      parse([
        {
          type: 'paragraph',
          runs: [
            { text: 'hi', highlight: true },
            { text: '2', subscript: true },
            { text: '2', superscript: true },
          ],
        },
      ]).success,
    ).toBe(true);
  });

  it('accepts the danger and note callout variants', () => {
    expect(
      parse([{ type: 'callout', variant: 'danger', children: [] }]).success,
    ).toBe(true);
    expect(
      parse([{ type: 'callout', variant: 'note', children: [] }]).success,
    ).toBe(true);
  });

  it('accepts a task list with checked items', () => {
    expect(
      parse([
        {
          type: 'taskList',
          items: [
            { runs: [{ text: 'done' }], checked: true },
            { runs: [{ text: 'todo' }], checked: false },
          ],
        },
      ]).success,
    ).toBe(true);
  });

  it('accepts a nested list via item children', () => {
    expect(
      parse([
        {
          type: 'bulletList',
          items: [
            {
              runs: [{ text: 'parent' }],
              children: [
                { type: 'bulletList', items: [{ runs: [{ text: 'child' }] }] },
              ],
            },
          ],
        },
      ]).success,
    ).toBe(true);
  });

  it('accepts a math block in display and inline modes, with a caption', () => {
    expect(parse([{ type: 'math', latex: 'E = mc^2', display: true }]).success).toBe(true);
    expect(parse([{ type: 'math', latex: 'x_i', display: false }]).success).toBe(true);
    expect(
      parse([
        { type: 'math', latex: 'a^2 + b^2 = c^2', display: true, caption: [{ text: 'Pythagoras.' }] },
      ]).success,
    ).toBe(true);
  });

  it('accepts an image block with a caption', () => {
    expect(
      parse([
        { type: 'image', ref: 'p1-fig-1', bbox: [0, 0, 1, 1], caption: [{ text: 'Figure 1.' }] },
      ]).success,
    ).toBe(true);
  });

  it('accepts a callout whose children include a task list', () => {
    expect(
      parse([
        {
          type: 'callout',
          variant: 'note',
          children: [{ type: 'taskList', items: [{ runs: [{ text: 't' }], checked: true }] }],
        },
      ]).success,
    ).toBe(true);
  });

  it('rejects a math block missing latex or display', () => {
    expect(parse([{ type: 'math', display: true }]).success).toBe(false);
    expect(parse([{ type: 'math', latex: 'x' }]).success).toBe(false);
  });
});

describe('docModelSchema — rejects malformed DocModels', () => {
  it('rejects an unknown block type', () => {
    expect(parse([{ type: 'spaceship', runs: [] }]).success).toBe(false);
  });

  it('rejects a heading level outside 1-3', () => {
    expect(parse([{ type: 'heading', level: 0, runs: [] }]).success).toBe(false);
    expect(parse([{ type: 'heading', level: 4, runs: [] }]).success).toBe(false);
  });

  it('rejects blocks missing required fields', () => {
    expect(parse([{ type: 'heading', level: 1 }]).success).toBe(false);
    expect(parse([{ type: 'paragraph' }]).success).toBe(false);
    expect(parse([{ type: 'codeBlock', lang: null }]).success).toBe(false);
    expect(parse([{ type: 'image', ref: 'x' }]).success).toBe(false);
    expect(parse([{ type: 'table', rows: [] }]).success).toBe(false);
  });

  it('rejects unknown extra keys on a block (strict)', () => {
    expect(parse([{ type: 'paragraph', runs: [{ text: 'hi' }], note: 'extra' }]).success).toBe(
      false,
    );
  });

  it('rejects unknown extra keys on an inline run (strict)', () => {
    expect(parse([{ type: 'paragraph', runs: [{ text: 'hi', size: 12 }] }]).success).toBe(false);
  });

  it('rejects unknown extra keys at the DocModel root (strict)', () => {
    expect(docModelSchema.safeParse({ blocks: [], version: 2 }).success).toBe(false);
  });

  it('rejects an invalid callout variant', () => {
    expect(parse([{ type: 'callout', variant: 'critical', children: [] }]).success).toBe(false);
  });

  it('rejects a callout child outside the allowed subset', () => {
    expect(
      parse([
        {
          type: 'callout',
          variant: 'info',
          children: [{ type: 'heading', level: 1, runs: [{ text: 'no' }] }],
        },
      ]).success,
    ).toBe(false);
  });

  it('rejects an image bbox of the wrong length', () => {
    expect(parse([{ type: 'image', ref: 'x', bbox: [0, 0, 1] }]).success).toBe(false);
    expect(parse([{ type: 'image', ref: 'x', bbox: [0, 0, 1, 1, 1] }]).success).toBe(false);
  });

  it('rejects a wrongly typed inline run field', () => {
    expect(parse([{ type: 'paragraph', runs: [{ text: 42 }] }]).success).toBe(false);
    expect(parse([{ type: 'paragraph', runs: [{ text: 'x', bold: 'yes' }] }]).success).toBe(false);
  });

  it('rejects a value not shaped { blocks: [...] }', () => {
    expect(docModelSchema.safeParse({}).success).toBe(false);
    expect(docModelSchema.safeParse({ blocks: 'nope' }).success).toBe(false);
    expect(docModelSchema.safeParse(null).success).toBe(false);
  });
});
