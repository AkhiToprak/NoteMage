// Unit tests for the Moderation Layer 1 scanner (P3V verification gate).
//
// What we verify here:
//   - Block hits fire on whole-token matches.
//   - Scunthorpe-style substring false positives don't fire (the
//     word-boundary tokeniser is the primary defence; the allowlist
//     is the belt-and-suspenders).
//   - Unicode look-alike bypass (NFKD + diacritic strip) IS caught.
//   - Leetspeak bypass with digit substitution is TOLERATED at L1 —
//     L2 is expected to catch it. This is intentional per the plan's
//     P3V adversarial gate ("some bypass tolerated and caught by L2").
//   - The allowlist filters out tokens that would otherwise match
//     (insurance against future scan-mode loosening).
//   - Multi-word terms match across the sliding window.
//   - Multi-language scan picks the right language hit.
//   - English wordlist always runs as a baseline for non-English paths.

import { describe, it, expect } from 'vitest';
import { scanText, scanFields } from './scanner';
import { en, de, getWordlistsForLanguage } from './wordlists';

describe('scanner: block hits on whole tokens', () => {
  it('rejects a direct English block term', () => {
    const r = scanText('this path contains fuck and more', [en], 'title');
    expect(r.hits.find((h) => h.kind === 'block')?.term).toBe('fuck');
  });

  it('passes clean text', () => {
    const r = scanText('Algorithms warm-up: gentle introduction', [en], 'title');
    expect(r.hits).toEqual([]);
  });

  it('matches multiple distinct block terms separately', () => {
    const r = scanText('fuck shit', [en], 'body');
    const blocks = r.hits.filter((h) => h.kind === 'block').map((h) => h.term);
    expect(blocks).toEqual(expect.arrayContaining(['fuck', 'shit']));
  });
});

describe('scanner: Scunthorpe-style substring false-positives', () => {
  it('does not flag "scunthorpe" as containing "cunt"', () => {
    const r = scanText('the town of Scunthorpe is in Lincolnshire', [en], 'body');
    expect(r.hits.find((h) => h.kind === 'block')).toBeUndefined();
  });

  it('does not flag innocent tokens that contain a block substring', () => {
    // "classmate", "classification", "mass", "pass" all contain "ass"
    // as substring; "ass" is on the flag list (not block), but they
    // should not even flag because tokens are split on word boundaries.
    const r = scanText(
      'My classmate and I studied the classification of mass and we passed.',
      [en],
      'description',
    );
    const ass = r.hits.find((h) => h.term === 'ass');
    expect(ass).toBeUndefined();
  });

  it('does not flag "shellfish" / "hello" / "shitake" for the "shit/hell" tokens', () => {
    const r = scanText('hello — try the shellfish and the shiitake', [en], 'body');
    const bad = r.hits.find(
      (h) => h.kind === 'block' && (h.term === 'shit' || h.term === 'hell'),
    );
    expect(bad).toBeUndefined();
  });
});

describe('scanner: Unicode look-alike bypass IS caught', () => {
  it('catches diacritic-bearing variant via NFKD + combining-mark strip', () => {
    // "fück" decomposes to "fu" + COMBINING DIAERESIS + "ck" → strip
    // → "fuck". This is the bypass we want closed at L1.
    const r = scanText('this path has fück in it', [en], 'title');
    expect(r.hits.find((h) => h.kind === 'block')?.term).toBe('fuck');
  });

  it('catches German "schweiß" → strip diacritic; clean text still passes', () => {
    // No block hit; just verifying NFKD doesn't introduce false hits.
    const r = scanText('Ein bisschen Schweiß und Klassenarbeit', [de, en], 'body');
    expect(r.hits.find((h) => h.kind === 'block')).toBeUndefined();
  });
});

describe('scanner: leetspeak bypass — TOLERATED at L1 (per spec)', () => {
  it('does NOT catch "f0ck" — digit substitution mismatches "fuck"', () => {
    // 0→o folds "f0ck" to "fock", which doesn't match "fuck". This is
    // a documented L1 limit; L2 (P4) is expected to catch it.
    const r = scanText('this path has f0ck in it', [en], 'body');
    expect(r.hits.find((h) => h.kind === 'block')).toBeUndefined();
  });

  it('does NOT catch concatenated-token bypass "stfuyou"', () => {
    // Word-boundary tokeniser keeps "stfuyou" as one token; it never
    // matches "fuck". Tolerated bypass per spec.
    const r = scanText('stfuyou and read this', [en], 'body');
    expect(r.hits.find((h) => h.kind === 'block')).toBeUndefined();
  });

  it('does catch leet 5→s on a spam term: "ca5ino" → "casino"', () => {
    // 5→s maps "ca5ino" to "casino" exactly — bypass IS caught here.
    // Demonstrates the leet fold is best-effort but does help when
    // the substitution lands on a real character mapping.
    const r = scanText('visit our ca5ino tonight', [en], 'body');
    expect(r.hits.find((h) => h.kind === 'block')?.term).toBe('casino');
  });
});

describe('scanner: allowlist filters out would-be matches', () => {
  it('honours the allowlist even when a fold would otherwise match', () => {
    // Build a synthetic wordlist that blocks "hello" so we can verify
    // the allowlist intercepts (en.allowlist contains "hello"). This
    // documents the safety net's behaviour without depending on the
    // real wordlist semantics.
    const synthetic = {
      ...en,
      block: [{ term: 'hello', category: 'adult' as const }],
    };
    const r = scanText('hello world', [synthetic], 'title');
    expect(r.hits.find((h) => h.kind === 'block')).toBeUndefined();
  });
});

describe('scanner: multi-word terms via sliding window', () => {
  it('catches "buy followers" as one match', () => {
    const r = scanText('we will buy followers for you', [en], 'body');
    expect(r.hits.find((h) => h.term === 'buy followers')).toBeDefined();
  });

  it('does not catch "buy" or "followers" alone if neither is listed', () => {
    const r = scanText('you can buy a notebook and follow other users', [en], 'body');
    const buyFollowers = r.hits.find((h) => h.term === 'buy followers');
    expect(buyFollowers).toBeUndefined();
  });
});

describe('scanner: multi-language routing', () => {
  it('catches a German block term on a German path', () => {
    const lists = getWordlistsForLanguage('de');
    const r = scanText('das ist scheiße aber ficken ist schlimmer', lists, 'body');
    // 'ficken' is on de.block (adult). 'scheiße' is on de.flag (adult).
    expect(r.hits.find((h) => h.kind === 'block' && h.term === 'ficken')).toBeDefined();
    expect(r.hits.find((h) => h.kind === 'flag' && h.term === 'scheisse')).toBeDefined();
  });

  it('catches English profanity inside a non-English path (baseline scan)', () => {
    // Author writes "fuck" inside a French path — fr scans miss it,
    // but the English baseline catches it.
    const lists = getWordlistsForLanguage('fr');
    const r = scanText('le chemin contient fuck', lists, 'body');
    expect(r.hits.find((h) => h.kind === 'block' && h.term === 'fuck')).toBeDefined();
  });

  it('unknown language falls back to English-only scan', () => {
    const lists = getWordlistsForLanguage('xx');
    expect(lists.length).toBe(1);
    expect(lists[0].language).toBe('en');
  });
});

describe('scanFields: merges hits across multiple fields with field labels', () => {
  it('preserves per-field provenance on each hit', () => {
    const r = scanFields(
      [
        { field: 'title', text: 'clean title' },
        { field: 'description', text: 'this casino offer is hot' },
        { field: 'phase 1 / slot 2 title', text: 'a fuck of a chapter' },
      ],
      [en],
    );
    const casino = r.hits.find((h) => h.term === 'casino');
    const fuck = r.hits.find((h) => h.term === 'fuck');
    expect(casino?.field).toBe('description');
    expect(fuck?.field).toBe('phase 1 / slot 2 title');
  });

  it('ignores null / undefined field text without crashing', () => {
    const r = scanFields(
      [
        { field: 'title', text: null },
        { field: 'desc', text: undefined },
        { field: 'body', text: '' },
      ],
      [en],
    );
    expect(r.hits).toEqual([]);
  });
});
