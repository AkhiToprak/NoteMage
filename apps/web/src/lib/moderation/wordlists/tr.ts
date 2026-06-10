// Turkish wordlist for Moderation Layer 1.

import type { LanguageWordlist } from './types';

export const tr: LanguageWordlist = {
  language: 'tr',
  block: [
    { term: 'amk', category: 'adult' },
    { term: 'siktir', category: 'adult' },
    { term: 'orospu', category: 'adult' },
    { term: 'göt', category: 'adult' },
    { term: 'viagra', category: 'spam' },
    { term: 'casino', category: 'spam' },
    { term: 'bedava kripto', category: 'spam' },
    { term: 'keygen', category: 'copyright' },
    { term: 'warez', category: 'copyright' },
  ],
  flag: [
    { term: 'lan', category: 'adult' },
    { term: 'ulan', category: 'adult' },
    { term: 'kanalıma abone ol', category: 'offtopic' },
  ],
  allowlist: [
    'sınıf',
    'sınıflar',
    'kütle',
    'kasa',
    'masa',
  ],
};
