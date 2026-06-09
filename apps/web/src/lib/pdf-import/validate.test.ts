import { describe, expect, it } from 'vitest';
import { extractJson, parseDocModelBlocks } from './validate';

describe('extractJson', () => {
  it('returns a bare JSON object unchanged', () => {
    expect(extractJson('{"blocks":[]}')).toBe('{"blocks":[]}');
  });

  it('strips a ```json code fence', () => {
    expect(extractJson('```json\n{"blocks":[]}\n```')).toBe('{"blocks":[]}');
  });

  it('strips a bare ``` code fence', () => {
    expect(extractJson('```\n{"blocks":[]}\n```')).toBe('{"blocks":[]}');
  });

  it('extracts an object embedded in surrounding prose', () => {
    expect(extractJson('Here is the result:\n{"blocks":[]}\nHope that helps!')).toBe(
      '{"blocks":[]}',
    );
  });

  it('extracts a bare array', () => {
    expect(extractJson('[{"type":"horizontalRule"}]')).toBe('[{"type":"horizontalRule"}]');
  });

  it('returns null when no JSON value is present', () => {
    expect(extractJson('no json here at all')).toBeNull();
    expect(extractJson('')).toBeNull();
    expect(extractJson('   ')).toBeNull();
  });
});

describe('parseDocModelBlocks — accepts valid output', () => {
  it('parses a bare DocModel object', () => {
    const result = parseDocModelBlocks('{"blocks":[{"type":"paragraph","runs":[{"text":"hi"}]}]}');
    expect(result.ok).toBe(true);
    expect(result.blocks).toHaveLength(1);
  });

  it('parses a fenced response', () => {
    const result = parseDocModelBlocks('```json\n{"blocks":[]}\n```');
    expect(result.ok).toBe(true);
    expect(result.blocks).toEqual([]);
  });

  it('tolerates a bare block array missing the { blocks } wrapper', () => {
    const result = parseDocModelBlocks('[{"type":"paragraph","runs":[{"text":"x"}]}]');
    expect(result.ok).toBe(true);
    expect(result.blocks).toHaveLength(1);
  });

  it('accepts a representative document with several block types', () => {
    const doc = JSON.stringify({
      blocks: [
        { type: 'heading', level: 2, runs: [{ text: 'Title' }] },
        { type: 'paragraph', runs: [{ text: 'plain ' }, { text: 'bold', bold: true }] },
        { type: 'bulletList', items: [{ runs: [{ text: 'a' }] }] },
        { type: 'image', ref: 'p1-fig-1', bbox: [0, 0, 1, 1] },
      ],
    });
    const result = parseDocModelBlocks(doc);
    expect(result.ok).toBe(true);
    expect(result.blocks).toHaveLength(4);
  });
});

describe('parseDocModelBlocks — rejects invalid output', () => {
  it('fails when no JSON is present', () => {
    const result = parseDocModelBlocks('I cannot do that.');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('fails on truncated JSON', () => {
    const result = parseDocModelBlocks('{"blocks":[{"type":"para');
    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('rejects an unknown block type', () => {
    expect(parseDocModelBlocks('{"blocks":[{"type":"spaceship"}]}').ok).toBe(false);
  });

  // The G3 normalizer rescues well-meaning drift rather than rejecting it —
  // these shapes used to fail validation and now coerce to the nearest
  // canonical form (losing the page to the heuristic fallback costs far more
  // than tolerating the drift).
  it('clamps a heading level outside 1-3 instead of rejecting', () => {
    const result = parseDocModelBlocks('{"blocks":[{"type":"heading","level":5,"runs":[]}]}');
    expect(result.ok).toBe(true);
    const heading = result.blocks?.[0];
    if (heading?.type === 'heading') expect(heading.level).toBe(3);
  });

  it('strips an unknown extra key on a block instead of rejecting', () => {
    const result = parseDocModelBlocks(
      '{"blocks":[{"type":"paragraph","runs":[{"text":"x"}],"note":"no"}]}',
    );
    expect(result.ok).toBe(true);
    expect(result.blocks?.[0]).toEqual({ type: 'paragraph', runs: [{ text: 'x' }] });
  });

  it('demotes a callout heading child to a paragraph instead of rejecting', () => {
    const result = parseDocModelBlocks(
      '{"blocks":[{"type":"callout","variant":"info","children":[{"type":"heading","level":1,"runs":[{"text":"t"}]}]}]}',
    );
    expect(result.ok).toBe(true);
    const callout = result.blocks?.[0];
    if (callout?.type === 'callout') {
      expect(callout.children).toEqual([{ type: 'paragraph', runs: [{ text: 't' }] }]);
    }
  });

  it('produces a non-empty, path-bearing error string for the repair retry', () => {
    const result = parseDocModelBlocks('{"blocks":[{"type":"image","ref":"x"}]}');
    expect(result.ok).toBe(false);
    expect(typeof result.error).toBe('string');
    expect((result.error ?? '').length).toBeGreaterThan(0);
    expect(result.error).toContain('blocks.0');
  });
});
