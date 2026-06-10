// Wordlist registry — picks the right per-language list keyed off
// `SharedPath.language`. Unknown languages fall back to English: the
// scanner is still useful as a coarse net for paths whose declared
// language we don't yet ship a wordlist for, and authors sometimes
// embed English profanity in non-English content.

import type { LanguageWordlist } from './types';
import { en } from './en';
import { de } from './de';
import { fr } from './fr';
import { es } from './es';
import { it } from './it';
import { tr } from './tr';

export const WORDLISTS: ReadonlyArray<LanguageWordlist> = [en, de, fr, es, it, tr];

const BY_LANGUAGE: Record<string, LanguageWordlist> = {
  en,
  de,
  fr,
  es,
  it,
  tr,
};

// English is always scanned in addition to the source language. Authors
// embedding English profanity in a German path should still trip L1.
export const BASELINE_WORDLIST: LanguageWordlist = en;

/**
 * Returns the wordlists to scan for a SharedPath in `language`. Always
 * includes English plus the source language (if different and supported).
 * Unknown languages collapse to English-only.
 */
export function getWordlistsForLanguage(language: string): LanguageWordlist[] {
  const code = language.toLowerCase().slice(0, 5);
  const localised = BY_LANGUAGE[code];
  if (!localised || code === 'en') {
    return [BASELINE_WORDLIST];
  }
  return [localised, BASELINE_WORDLIST];
}

export type { LanguageWordlist, WordlistTerm } from './types';
export { en, de, fr, es, it, tr };
