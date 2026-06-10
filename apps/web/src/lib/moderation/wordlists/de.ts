// German wordlist for Moderation Layer 1. See ./types.ts and ./en.ts
// for the rules of engagement.

import type { LanguageWordlist } from './types';

export const de: LanguageWordlist = {
  language: 'de',
  block: [
    // Adult.
    { term: 'ficken', category: 'adult' },
    { term: 'fotze', category: 'adult' },
    { term: 'arschloch', category: 'adult' },
    { term: 'schwanz', category: 'adult' },
    // Spam — same scam markers as English; brand names are loanwords.
    { term: 'viagra', category: 'spam' },
    { term: 'casino', category: 'spam' },
    { term: 'kostenlos krypto', category: 'spam' },
    // Copyright.
    { term: 'keygen', category: 'copyright' },
    { term: 'warez', category: 'copyright' },
  ],
  flag: [
    { term: 'scheisse', category: 'adult' },
    { term: 'verdammt', category: 'adult' },
    { term: 'kacke', category: 'adult' },
    { term: 'abonniere meinen kanal', category: 'offtopic' },
  ],
  allowlist: [
    // German Klasse / Klassen / klassisch don't contain a slur in
    // word-boundary mode, listed defensively.
    'klasse',
    'klassen',
    'klassisch',
    'massen',
    'masseinheit',
    'kasse',
    'kassen',
    'fasse',
    'wasser',
  ],
};
