// Spanish wordlist for Moderation Layer 1.

import type { LanguageWordlist } from './types';

export const es: LanguageWordlist = {
  language: 'es',
  block: [
    { term: 'joder', category: 'adult' },
    { term: 'puta', category: 'adult' },
    { term: 'coño', category: 'adult' },
    { term: 'cabrón', category: 'adult' },
    { term: 'viagra', category: 'spam' },
    { term: 'casino', category: 'spam' },
    { term: 'cripto gratis', category: 'spam' },
    { term: 'keygen', category: 'copyright' },
    { term: 'warez', category: 'copyright' },
  ],
  flag: [
    { term: 'mierda', category: 'adult' },
    { term: 'maldición', category: 'adult' },
    { term: 'suscríbete a mi canal', category: 'offtopic' },
  ],
  allowlist: [
    'clase',
    'masa',
    'pasar',
    'pasado',
    'puesto',
    'cabra',
    'cabras',
  ],
};
