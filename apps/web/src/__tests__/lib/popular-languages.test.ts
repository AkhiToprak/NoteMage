// P11 — unit tests for the pre-translation config readers
// (src/lib/translation/popular-languages.ts). Pure env parsing; no DB,
// no provider. Locks the fallback behaviour so a malformed env var can
// never silently collapse the funnel anchor's language coverage to zero.

import { describe, it, expect, afterEach } from 'vitest';
import {
  getPopularLanguages,
  getPopularityThreshold,
  getPretranslationCostCeilingUsd,
} from '@/lib/translation/popular-languages';

const ENV_KEYS = [
  'POPULAR_LANGUAGES',
  'POPULARITY_THRESHOLD',
  'PRETRANSLATION_COST_CEILING_USD',
];

afterEach(() => {
  for (const k of ENV_KEYS) delete process.env[k];
});

describe('getPopularLanguages', () => {
  it('falls back to the documented default set when unset', () => {
    expect(getPopularLanguages()).toEqual(['de', 'en', 'fr', 'es', 'it', 'tr']);
  });

  it('parses, lowercases, trims, and de-dupes a comma list', () => {
    process.env.POPULAR_LANGUAGES = ' DE , en,en, FR ';
    expect(getPopularLanguages()).toEqual(['de', 'en', 'fr']);
  });

  it('drops malformed codes but keeps the valid ones', () => {
    process.env.POPULAR_LANGUAGES = 'de,not_a_lang!!,pt-br,en';
    expect(getPopularLanguages()).toEqual(['de', 'pt-br', 'en']);
  });

  it('falls back to the default set when nothing valid parses', () => {
    process.env.POPULAR_LANGUAGES = '!!!,123456789';
    expect(getPopularLanguages()).toEqual(['de', 'en', 'fr', 'es', 'it', 'tr']);
  });

  it('falls back when the value is empty / whitespace', () => {
    process.env.POPULAR_LANGUAGES = '   ';
    expect(getPopularLanguages()).toEqual(['de', 'en', 'fr', 'es', 'it', 'tr']);
  });
});

describe('getPopularityThreshold', () => {
  it('defaults to 10 when unset', () => {
    expect(getPopularityThreshold()).toBe(10);
  });

  it('parses and floors a positive value', () => {
    process.env.POPULARITY_THRESHOLD = '25.9';
    expect(getPopularityThreshold()).toBe(25);
  });

  it('rejects non-positive / non-finite values, falling back to 10', () => {
    process.env.POPULARITY_THRESHOLD = '0';
    expect(getPopularityThreshold()).toBe(10);
    process.env.POPULARITY_THRESHOLD = 'abc';
    expect(getPopularityThreshold()).toBe(10);
    process.env.POPULARITY_THRESHOLD = '-5';
    expect(getPopularityThreshold()).toBe(10);
  });
});

describe('getPretranslationCostCeilingUsd', () => {
  it('defaults to $1.00 when unset', () => {
    expect(getPretranslationCostCeilingUsd()).toBe(1.0);
  });

  it('parses a positive override', () => {
    process.env.PRETRANSLATION_COST_CEILING_USD = '0.5';
    expect(getPretranslationCostCeilingUsd()).toBe(0.5);
  });

  it('rejects non-positive / non-finite values, falling back to $1.00', () => {
    process.env.PRETRANSLATION_COST_CEILING_USD = '0';
    expect(getPretranslationCostCeilingUsd()).toBe(1.0);
    process.env.PRETRANSLATION_COST_CEILING_USD = 'xyz';
    expect(getPretranslationCostCeilingUsd()).toBe(1.0);
  });
});
