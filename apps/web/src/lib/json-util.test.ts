import { describe, it, expect } from 'vitest';
import {
  stripCodeFences,
  extractBalancedJson,
  parseJsonLoose,
  tryParseJsonLoose,
} from './json-util';

describe('stripCodeFences', () => {
  it('returns clean JSON unchanged', () => {
    expect(stripCodeFences('{"a":1}')).toBe('{"a":1}');
  });

  it('strips a ```json fence', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('strips a bare ``` fence', () => {
    expect(stripCodeFences('```\n[1,2,3]\n```')).toBe('[1,2,3]');
  });

  it('extracts the fenced block out of surrounding prose', () => {
    const raw = 'Here you go:\n```json\n{"ok":true}\n```\nHope that helps!';
    expect(stripCodeFences(raw)).toBe('{"ok":true}');
  });
});

describe('extractBalancedJson', () => {
  it('extracts an object and ignores trailing prose', () => {
    expect(extractBalancedJson('{"a":1} and then some text')).toBe('{"a":1}');
  });

  it('extracts an array', () => {
    expect(extractBalancedJson('prefix [1, {"b":2}] suffix')).toBe('[1, {"b":2}]');
  });

  it('handles braces inside string literals', () => {
    const s = '{"text":"a } b ] c"}';
    expect(extractBalancedJson(s)).toBe(s);
  });

  it('handles escaped quotes inside strings', () => {
    const s = '{"q":"she said \\"hi\\" }"}';
    expect(extractBalancedJson(s)).toBe(s);
  });

  it('returns null when there is no JSON', () => {
    expect(extractBalancedJson('no json here')).toBeNull();
  });

  it('prefers an object that appears before an array', () => {
    expect(extractBalancedJson('{"a":[1,2]} [3]')).toBe('{"a":[1,2]}');
  });
});

describe('parseJsonLoose', () => {
  it('parses clean JSON', () => {
    expect(parseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it('parses fenced JSON', () => {
    expect(parseJsonLoose('```json\n{"a":1,"b":[2,3]}\n```')).toEqual({ a: 1, b: [2, 3] });
  });

  it('parses JSON embedded in prose', () => {
    expect(parseJsonLoose('The answer is {"score":100,"issues":[]}.')).toEqual({
      score: 100,
      issues: [],
    });
  });

  it('throws when no JSON is present', () => {
    expect(() => parseJsonLoose('totally not json')).toThrow();
  });
});

describe('tryParseJsonLoose', () => {
  it('returns the value on success', () => {
    expect(tryParseJsonLoose('{"a":1}')).toEqual({ a: 1 });
  });

  it('returns null on failure', () => {
    expect(tryParseJsonLoose('nope')).toBeNull();
  });
});
