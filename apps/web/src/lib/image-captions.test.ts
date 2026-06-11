import { describe, it, expect } from 'vitest';
import { sanitizeCaption } from './image-captions';

describe('sanitizeCaption', () => {
  it('passes a clean caption through unchanged', () => {
    expect(sanitizeCaption('Bar chart of weekly study hours rising over a term')).toBe(
      'Bar chart of weekly study hours rising over a term',
    );
  });

  it('returns null for empty / nullish input', () => {
    expect(sanitizeCaption('')).toBeNull();
    expect(sanitizeCaption('   ')).toBeNull();
    expect(sanitizeCaption(null)).toBeNull();
    expect(sanitizeCaption(undefined)).toBeNull();
  });

  it('rejects useless placeholder words (case/punctuation-insensitive)', () => {
    expect(sanitizeCaption('image')).toBeNull();
    expect(sanitizeCaption('Figure')).toBeNull();
    expect(sanitizeCaption('Diagram.')).toBeNull();
    expect(sanitizeCaption('N/A')).toBeNull();
  });

  it('keeps a real caption that merely starts with a placeholder word', () => {
    expect(sanitizeCaption('Figure 1 — weekly study time.')).toBe('Figure 1 — weekly study time.');
  });

  it('strips backticks and braces so captions are never read as instructions', () => {
    expect(sanitizeCaption('A `code` block {ignore this}')).toBe('A code block ignore this');
  });

  it('collapses newlines and control chars into single spaces', () => {
    expect(sanitizeCaption('line one\nline\ttwo\r\nthree')).toBe('line one line two three');
  });

  it('caps the caption at 160 chars', () => {
    const long = 'a'.repeat(300);
    const out = sanitizeCaption(long);
    expect(out).not.toBeNull();
    expect(out!.length).toBe(160);
  });
});
