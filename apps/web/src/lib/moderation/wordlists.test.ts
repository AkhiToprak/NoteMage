// Wordlist invariant tests. Verifies that every shipped language has
// the same minimum structure and that all categories are within the
// shared `ModerationCategory` union, so adding a new language doesn't
// silently introduce typos that the scanner would never match.

import { describe, it, expect } from 'vitest';
import { WORDLISTS, getWordlistsForLanguage } from './wordlists';

const VALID_CATEGORIES = new Set([
  'adult',
  'hateful',
  'spam',
  'offtopic',
  'low_quality',
  'copyright',
  'other',
]);

describe('wordlists registry', () => {
  it('ships the popular-language set (en + de + fr + es + it + tr)', () => {
    const languages = WORDLISTS.map((w) => w.language).sort();
    expect(languages).toEqual(['de', 'en', 'es', 'fr', 'it', 'tr']);
  });

  it('every wordlist has at least one block term', () => {
    for (const w of WORDLISTS) {
      expect(w.block.length, `${w.language} has no block terms`).toBeGreaterThan(0);
    }
  });

  it('every term has a valid ModerationCategory', () => {
    for (const w of WORDLISTS) {
      for (const t of [...w.block, ...w.flag]) {
        expect(
          VALID_CATEGORIES.has(t.category),
          `${w.language}: term "${t.term}" has invalid category "${t.category}"`,
        ).toBe(true);
      }
    }
  });

  it('all terms are stored lowercase (the scanner folds on the way in)', () => {
    for (const w of WORDLISTS) {
      for (const t of [...w.block, ...w.flag]) {
        expect(
          t.term,
          `${w.language}: term "${t.term}" should be lowercase`,
        ).toBe(t.term.toLowerCase());
      }
    }
  });

  it('allowlist entries are lowercase too', () => {
    for (const w of WORDLISTS) {
      for (const t of w.allowlist) {
        expect(
          t,
          `${w.language}: allowlist entry "${t}" should be lowercase`,
        ).toBe(t.toLowerCase());
      }
    }
  });

  it('getWordlistsForLanguage("en") returns English only (baseline IS English)', () => {
    const lists = getWordlistsForLanguage('en');
    expect(lists.length).toBe(1);
    expect(lists[0].language).toBe('en');
  });

  it('getWordlistsForLanguage("de") returns German + English baseline', () => {
    const lists = getWordlistsForLanguage('de');
    const languages = lists.map((w) => w.language).sort();
    expect(languages).toEqual(['de', 'en']);
  });
});
