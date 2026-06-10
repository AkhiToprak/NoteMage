// English wordlist for Moderation Layer 1.
//
// Curated for an educational platform. The block set is intentionally
// narrow — universal-explicit terms, scam markers, piracy bait — so
// false positives stay rare. Subtler offence is L2's job.
//
// Adding terms: pick the right category (adult/hateful/spam/copyright);
// add the canonical lowercased form; if the term would substring-match
// an innocent word, also add the innocent word to the allowlist below.

import type { LanguageWordlist } from './types';

export const en: LanguageWordlist = {
  language: 'en',
  block: [
    // Adult — universally explicit; not for an educational surface.
    { term: 'fuck', category: 'adult' },
    { term: 'shit', category: 'adult' },
    { term: 'cunt', category: 'adult' },
    { term: 'pussy', category: 'adult' },
    { term: 'dick', category: 'adult' },
    { term: 'porn', category: 'adult' },
    // Spam — common scam / promo markers in path bodies.
    { term: 'viagra', category: 'spam' },
    { term: 'casino', category: 'spam' },
    { term: 'crypto giveaway', category: 'spam' },
    { term: 'buy followers', category: 'spam' },
    { term: 'xxx', category: 'spam' },
    // Copyright — piracy-bait markers that flag low-quality / illegal
    // re-uploads more than they police language.
    { term: 'keygen', category: 'copyright' },
    { term: 'warez', category: 'copyright' },
    { term: 'free crack', category: 'copyright' },
  ],
  flag: [
    // Mild profanity — L2 reads context to decide whether educational
    // usage (history class quoting source material, etc.) justifies it.
    { term: 'damn', category: 'adult' },
    { term: 'ass', category: 'adult' },
    { term: 'hell', category: 'adult' },
    { term: 'bastard', category: 'adult' },
    // Off-topic markers — promo language that often signals the path is
    // an ad rather than a learning resource.
    { term: 'subscribe to my channel', category: 'offtopic' },
    { term: 'follow me on', category: 'offtopic' },
    { term: 'use my code', category: 'offtopic' },
  ],
  allowlist: [
    // Canonical Scunthorpe-problem token — already safe under
    // word-boundary tokenisation, listed defensively in case scan mode
    // ever loosens.
    'scunthorpe',
    'shiitake',
    'mishit',
    'hellfire',
    'hello',
    'shell',
    'assignment',
    'assassin',
    'class',
    'classic',
    'classical',
    'classmate',
    'mass',
    'massachusetts',
    'pass',
    'bypass',
    'embarrass',
    'cassandra',
    'dickson',
  ],
};
