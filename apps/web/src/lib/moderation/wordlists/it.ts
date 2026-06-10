// Italian wordlist for Moderation Layer 1.

import type { LanguageWordlist } from './types';

export const it: LanguageWordlist = {
  language: 'it',
  block: [
    { term: 'cazzo', category: 'adult' },
    { term: 'fottiti', category: 'adult' },
    { term: 'troia', category: 'adult' },
    { term: 'puttana', category: 'adult' },
    { term: 'viagra', category: 'spam' },
    { term: 'casino', category: 'spam' },
    { term: 'cripto gratis', category: 'spam' },
    { term: 'keygen', category: 'copyright' },
    { term: 'warez', category: 'copyright' },
  ],
  flag: [
    { term: 'merda', category: 'adult' },
    { term: 'porca', category: 'adult' },
    { term: 'iscriviti al mio canale', category: 'offtopic' },
  ],
  allowlist: [
    'classe',
    'massa',
    'passare',
    'cassa',
    'tazza',
    // "casino" the spam term collides with the Italian word for "mess";
    // listed here so the rare educational use ("è un casino") doesn't
    // auto-reject. SRE can re-evaluate once we see misfire data.
    'casino',
  ],
};
