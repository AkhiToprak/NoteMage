import { describe, it, expect } from 'vitest';
import { detectExplicitWebIntent } from './mage-web-intent';

describe('detectExplicitWebIntent', () => {
  it('negation wins over a request in the same message', () => {
    expect(detectExplicitWebIntent("search the web but don't google random blogs")).toBe('negated');
  });

  it('EN explicit request', () => {
    expect(detectExplicitWebIntent('can you search the web for the latest numbers?')).toBe('request');
    expect(detectExplicitWebIntent('just google it')).toBe('request');
  });

  it('DE explicit request', () => {
    expect(detectExplicitWebIntent('kannst du das im internet suchen')).toBe('request');
    expect(detectExplicitWebIntent('bitte googeln')).toBe('request');
  });

  it('EN explicit negation', () => {
    expect(detectExplicitWebIntent("please don't search online, use my notes")).toBe('negated');
    expect(detectExplicitWebIntent('answer without browsing')).toBe('negated');
  });

  it('DE explicit negation', () => {
    expect(detectExplicitWebIntent('bitte ohne zu googeln')).toBe('negated');
    expect(detectExplicitWebIntent('bitte nicht im internet suchen')).toBe('negated');
  });

  it('plain question → none', () => {
    expect(detectExplicitWebIntent('what is the powerhouse of the cell?')).toBe('none');
    expect(detectExplicitWebIntent('erkläre mir die Photosynthese')).toBe('none');
  });

  it('empty / non-string → none', () => {
    expect(detectExplicitWebIntent('')).toBe('none');
    // @ts-expect-error runtime guard
    expect(detectExplicitWebIntent(undefined)).toBe('none');
  });
});
