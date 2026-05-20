// Phase 3 of plans/path-publishing-community-library.md — Moderation
// Layer 1 (wordlist filter). Per-language data files import this shape.
//
// `block` hits = automatic L1 reject. They map to the
// "wordlist.<lang>.<category>" reason-code taxonomy (P0 spec §3.3).
//
// `flag` hits = non-binding signal forwarded to L2 in the audit row's
// `reasoning` field. L1 still verdict-passes on flag-only content; L2
// (P4) decides what to do with the marker. Listed here so SRE/ops can
// extend the per-language signal set without code changes.
//
// `allowlist` = belt-and-suspenders against substring false-positives.
// The scanner already tokenises on Unicode word boundaries, which is
// what prevents the canonical Scunthorpe-style mismatch. The allowlist
// is the explicit safety net for tokens that would otherwise match if a
// future engineer enabled substring scanning, or if a leet/diacritic
// fold maps an innocent token onto a blocked term.

import type { ModerationCategory } from '@notemage/shared';

export interface WordlistTerm {
  // Lowercase, NFKC-normalised already; the scanner reapplies the fold
  // before matching so leet/diacritic attacker variants resolve back to
  // these canonical forms.
  term: string;
  category: ModerationCategory;
}

export interface LanguageWordlist {
  // BCP-47 lowercase language code matching SharedPath.language.
  language: string;
  block: ReadonlyArray<WordlistTerm>;
  flag: ReadonlyArray<WordlistTerm>;
  // Tokens we never want to flag, even if a future scan mode would
  // catch them. Compared after normalisation, so list canonical forms
  // (lowercase, no diacritics).
  allowlist: ReadonlyArray<string>;
}
