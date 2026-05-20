// Word-boundary tokenising scanner for Moderation Layer 1.
//
// Strategy:
//   1. NFKD-normalise and strip combining marks so attacker variants
//      ("fück", "café") fold onto their plain-ASCII canonical form.
//   2. Lowercase.
//   3. Tokenise on Unicode word boundaries via /[\p{L}\p{N}]+/u — this
//      is what defuses the canonical Scunthorpe-style substring
//      mismatch ("scunthorpe" tokenises as one token, never breaking
//      into a slur).
//   4. For each token, also compute a leet-folded variant (4→a, 0→o,
//      1→i, 3→e, 5→s, 7→t, @→a, $→s) so attackers can't trivially
//      bypass with digit substitution. The fold is best-effort only:
//      "f0ck" → "fock" still won't match "fuck", and that bypass is
//      documented as L2's job to catch.
//   5. Multi-word terms (e.g. "buy followers") are matched via a
//      sliding window over the token stream.
//   6. Allowlist tokens are skipped before matching, both for single-
//      and multi-word checks.
//
// The scanner is purely synchronous and pure-functional; runLayer1
// owns the DB writes.

import type { LanguageWordlist, WordlistTerm } from './wordlists';

export type HitKind = 'block' | 'flag';

export interface ScanHit {
  // The canonical wordlist term that matched.
  term: string;
  category: WordlistTerm['category'];
  kind: HitKind;
  // Which wordlist language fired the match — useful when the same
  // text is scanned against both the source language and English.
  language: string;
  // Which input field (caller-supplied label) the term appeared in.
  // Surfaced into the rejectionReason copy so authors know where to
  // edit. Free-form so the caller can name fields with whatever
  // granularity is helpful ("title", "phase 2 / slot 3 / theory").
  field: string;
}

export interface ScanResult {
  hits: ScanHit[];
}

// Pre-folded form of a term so we don't re-fold per call.
interface PreparedTerm extends WordlistTerm {
  // For single-word terms this is `[folded]` (length 1). For
  // multi-word terms it's the per-token list.
  folded: string[];
  isMultiword: boolean;
}

interface PreparedWordlist {
  language: string;
  block: PreparedTerm[];
  flag: PreparedTerm[];
  // Allowlist tokens stored in folded form for cheap Set lookup.
  allowlist: ReadonlySet<string>;
}

const LEET_MAP: Record<string, string> = {
  '0': 'o',
  '1': 'i',
  '3': 'e',
  '4': 'a',
  '5': 's',
  '7': 't',
  '@': 'a',
  $: 's',
};

/** NFKD + diacritic strip + lowercase + ß→ss. The Eszett substitution
 *  is a Unicode-decomposition-blind transform (NFKD doesn't decompose
 *  ß or its capital form ẞ), so canonical German spellings still match
 *  the latin-transliteration form in the wordlist ("scheiße" ↔
 *  "scheisse"). Cheap and idiomatic for the languages we ship. */
function fold(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/ß/g, 'ss');
}

/** Apply LEET_MAP letter-by-letter; identity on real letters. */
function leet(text: string): string {
  let out = '';
  for (const ch of text) {
    out += LEET_MAP[ch] ?? ch;
  }
  return out;
}

/**
 * Tokenise folded text into word tokens. Word = a run of Unicode
 * letters or digits. Punctuation and whitespace split tokens but are
 * otherwise discarded. Returns the array in document order.
 */
function tokenise(folded: string): string[] {
  // /u flag enables \p{L}/\p{N}; we capture them as one run.
  return folded.match(/[\p{L}\p{N}]+/gu) ?? [];
}

function prepareTerm(term: WordlistTerm): PreparedTerm {
  const folded = fold(term.term);
  const tokens = tokenise(folded);
  return {
    ...term,
    folded: tokens,
    isMultiword: tokens.length > 1,
  };
}

const PREPARED_CACHE = new WeakMap<LanguageWordlist, PreparedWordlist>();

function prepare(list: LanguageWordlist): PreparedWordlist {
  const cached = PREPARED_CACHE.get(list);
  if (cached) return cached;
  const prepared: PreparedWordlist = {
    language: list.language,
    block: list.block.map(prepareTerm),
    flag: list.flag.map(prepareTerm),
    allowlist: new Set(list.allowlist.map((t) => fold(t))),
  };
  PREPARED_CACHE.set(list, prepared);
  return prepared;
}

/**
 * Scan one text blob against one or more wordlists. The caller passes
 * a `field` label that surfaces back through every hit — useful for
 * the rejection-reason copy on the author UI.
 */
export function scanText(
  text: string | null | undefined,
  lists: ReadonlyArray<LanguageWordlist>,
  field: string,
): ScanResult {
  if (!text || lists.length === 0) return { hits: [] };
  const folded = fold(text);
  const tokens = tokenise(folded);
  if (tokens.length === 0) return { hits: [] };

  // Pre-compute the leet-folded mirror once per token so multi-word
  // sliding-window checks don't re-fold inside the inner loop.
  const leetTokens = tokens.map(leet);

  const hits: ScanHit[] = [];

  for (const list of lists) {
    const prepared = prepare(list);

    // First pass: single-word block + flag. Iterate tokens; skip any
    // allowlisted token; check both canonical and leet variants.
    for (let i = 0; i < tokens.length; i += 1) {
      const tok = tokens[i];
      const leetTok = leetTokens[i];
      if (prepared.allowlist.has(tok) || prepared.allowlist.has(leetTok)) continue;

      for (const term of prepared.block) {
        if (term.isMultiword) continue;
        if (tok === term.folded[0] || leetTok === term.folded[0]) {
          hits.push({
            term: term.term,
            category: term.category,
            kind: 'block',
            language: list.language,
            field,
          });
        }
      }
      for (const term of prepared.flag) {
        if (term.isMultiword) continue;
        if (tok === term.folded[0] || leetTok === term.folded[0]) {
          hits.push({
            term: term.term,
            category: term.category,
            kind: 'flag',
            language: list.language,
            field,
          });
        }
      }
    }

    // Second pass: multi-word terms via sliding window. We compare
    // both canonical and leet-folded token streams against the term's
    // folded tokens. Allowlist still applies — any allowlisted token
    // inside the window kills the match (lets authors say "this is
    // not casino-related" without tripping the spam term).
    const allTerms: Array<[PreparedTerm, HitKind]> = [
      ...prepared.block.filter((t) => t.isMultiword).map((t) => [t, 'block'] as [PreparedTerm, HitKind]),
      ...prepared.flag.filter((t) => t.isMultiword).map((t) => [t, 'flag'] as [PreparedTerm, HitKind]),
    ];
    for (const [term, kind] of allTerms) {
      const span = term.folded.length;
      for (let i = 0; i + span <= tokens.length; i += 1) {
        let matchCanonical = true;
        let matchLeet = true;
        let allowlisted = false;
        for (let j = 0; j < span; j += 1) {
          if (prepared.allowlist.has(tokens[i + j]) || prepared.allowlist.has(leetTokens[i + j])) {
            allowlisted = true;
            break;
          }
          if (tokens[i + j] !== term.folded[j]) matchCanonical = false;
          if (leetTokens[i + j] !== term.folded[j]) matchLeet = false;
          if (!matchCanonical && !matchLeet) break;
        }
        if (allowlisted) continue;
        if (matchCanonical || matchLeet) {
          hits.push({
            term: term.term,
            category: term.category,
            kind,
            language: list.language,
            field,
          });
        }
      }
    }
  }

  return { hits };
}

/** Convenience: scan many `{ field, text }` pairs and merge the hits. */
export function scanFields(
  fields: ReadonlyArray<{ field: string; text: string | null | undefined }>,
  lists: ReadonlyArray<LanguageWordlist>,
): ScanResult {
  const merged: ScanHit[] = [];
  for (const f of fields) {
    const res = scanText(f.text, lists, f.field);
    merged.push(...res.hits);
  }
  return { hits: merged };
}
