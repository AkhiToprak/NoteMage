// French wordlist for Moderation Layer 1.

import type { LanguageWordlist } from './types';

export const fr: LanguageWordlist = {
  language: 'fr',
  block: [
    { term: 'putain', category: 'adult' },
    { term: 'connard', category: 'adult' },
    { term: 'salope', category: 'adult' },
    { term: 'enculé', category: 'adult' },
    { term: 'viagra', category: 'spam' },
    { term: 'casino', category: 'spam' },
    { term: 'crypto gratuit', category: 'spam' },
    { term: 'keygen', category: 'copyright' },
    { term: 'warez', category: 'copyright' },
  ],
  flag: [
    { term: 'merde', category: 'adult' },
    { term: 'putain de', category: 'adult' },
    { term: 'abonnez-vous', category: 'offtopic' },
  ],
  allowlist: [
    'merci',
    'classe',
    'masse',
    'passer',
    'embrasser',
  ],
};
