import { describe, expect, it } from 'vitest';
import { selectRelevantContext } from './context-retrieval';

describe('selectRelevantContext', () => {
  it('keeps short context byte-for-byte', () => {
    const result = selectRelevantContext(['[S1] Notes\nShort body'], 'body', 1_000);
    expect(result).toMatchObject({ text: '[S1] Notes\nShort body', truncated: false });
  });

  it('retrieves relevant material near the end instead of keeping only a prefix', () => {
    const filler = 'unrelated introductory material '.repeat(180);
    const tail = 'The Krebs cycle produces electron carriers through citrate oxidation.';
    const result = selectRelevantContext(
      [`[S1] Biology\n${filler}${tail}`],
      'How does citrate oxidation work in the Krebs cycle?',
      3_600,
    );
    expect(result.truncated).toBe(true);
    expect(result.text).toContain('[S1] Biology');
    expect(result.text).toContain('Krebs cycle');
  });

  it('never exceeds the requested context budget', () => {
    const result = selectRelevantContext(['x'.repeat(20_000)], 'xylophone', 4_000);
    expect(result.keptChars).toBeLessThanOrEqual(4_000);
  });
});
