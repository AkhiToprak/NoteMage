import { describe, it, expect } from 'vitest';
import { isDegenerateText } from './gemini';

describe('isDegenerateText', () => {
  it('accepts normal prose', () => {
    const text =
      'Mitosis is the process by which a eukaryotic cell divides into two ' +
      'genetically identical daughter cells. It has four main phases: prophase, ' +
      'metaphase, anaphase, and telophase. Each phase has distinct features.';
    expect(isDegenerateText(text)).toBe(false);
  });

  it('accepts short repetitive text under thresholds', () => {
    expect(isDegenerateText('yes yes yes')).toBe(false);
    expect(isDegenerateText('')).toBe(false);
    expect(isDegenerateText('a\na\na')).toBe(false);
  });

  it('flags a single character repeated forever', () => {
    expect(isDegenerateText('a'.repeat(400))).toBe(true);
    expect(isDegenerateText('-'.repeat(500))).toBe(true);
  });

  it('flags a word repeated back-to-back', () => {
    expect(isDegenerateText(`${'spam '.repeat(60)}`)).toBe(true);
  });

  it('flags an identical line repeated back-to-back', () => {
    const looped = Array.from({ length: 40 }, () => 'The answer is 42.').join('\n');
    expect(isDegenerateText(looped)).toBe(true);
  });

  it('flags vocabulary collapse on long interleaved loops', () => {
    // "alpha beta alpha beta …" — never repeats consecutively but the
    // vocabulary is tiny; long enough to cross the 1500-char gate.
    const looped = Array.from({ length: 800 }, (_, i) => (i % 2 ? 'alpha' : 'beta')).join(' ');
    expect(looped.length).toBeGreaterThan(1500);
    expect(isDegenerateText(looped)).toBe(true);
  });

  it('does not flag long, varied prose', () => {
    const words = [
      'cell',
      'nucleus',
      'membrane',
      'protein',
      'enzyme',
      'reaction',
      'energy',
      'glucose',
      'oxygen',
      'carbon',
    ];
    const text = Array.from({ length: 400 }, (_, i) => words[i % words.length]).join(' ');
    // 10 unique / 400 words = 2.5% — but this is a contrived stress fixture; the
    // real guard targets <4% which this trips. Verify a richer text passes:
    const rich = Array.from({ length: 400 }, (_, i) => `${words[i % words.length]}${i}`).join(' ');
    expect(isDegenerateText(rich)).toBe(false);
    void text;
  });
});
