import { describe, it, expect } from 'vitest';
import { deriveConsentChips, type MageThreadGrants } from './mage-types';

const NONE: MageThreadGrants = { allowWebSearch: false, allowGeneralKnowledge: false };

describe('deriveConsentChips', () => {
  it('covered answer offers nothing', () => {
    expect(
      deriveConsentChips({ coverage: 'covered', grants: NONE, isPro: true, webAvailable: true, webIntent: 'none' }),
    ).toEqual([]);
  });

  it('not_covered + neither granted + PRO → GK enabled + web enabled', () => {
    const chips = deriveConsentChips({
      coverage: 'not_covered',
      grants: NONE,
      isPro: true,
      webAvailable: true,
      webIntent: 'none',
    });
    const gk = chips.find((c) => c.id === 'ALLOW_GENERAL_KNOWLEDGE');
    const web = chips.find((c) => c.id === 'ALLOW_WEB_SEARCH');
    expect(gk).toMatchObject({ enabled: true, upsell: false });
    expect(web).toMatchObject({ enabled: true, upsell: false });
  });

  it('not_covered + FREE → GK enabled + web upsell', () => {
    const chips = deriveConsentChips({
      coverage: 'not_covered',
      grants: NONE,
      isPro: false,
      webAvailable: true,
      webIntent: 'none',
    });
    expect(chips.find((c) => c.id === 'ALLOW_GENERAL_KNOWLEDGE')).toMatchObject({ enabled: true, upsell: false });
    expect(chips.find((c) => c.id === 'ALLOW_WEB_SEARCH')).toMatchObject({ enabled: false, upsell: true });
  });

  it('webIntent negated → no web chip (GK still offered)', () => {
    const chips = deriveConsentChips({
      coverage: 'not_covered',
      grants: NONE,
      isPro: true,
      webAvailable: true,
      webIntent: 'negated',
    });
    expect(chips.some((c) => c.id === 'ALLOW_WEB_SEARCH')).toBe(false);
    expect(chips.some((c) => c.id === 'ALLOW_GENERAL_KNOWLEDGE')).toBe(true);
  });

  it('already-granted GK → no GK chip', () => {
    const chips = deriveConsentChips({
      coverage: 'not_covered',
      grants: { allowWebSearch: false, allowGeneralKnowledge: true },
      isPro: true,
      webAvailable: true,
      webIntent: 'none',
    });
    expect(chips.some((c) => c.id === 'ALLOW_GENERAL_KNOWLEDGE')).toBe(false);
    expect(chips.some((c) => c.id === 'ALLOW_WEB_SEARCH')).toBe(true);
  });

  it('!webAvailable → no web chip', () => {
    const chips = deriveConsentChips({
      coverage: 'not_covered',
      grants: NONE,
      isPro: true,
      webAvailable: false,
      webIntent: 'none',
    });
    expect(chips.some((c) => c.id === 'ALLOW_WEB_SEARCH')).toBe(false);
  });

  it('covered + explicit request forces the web offer (PRO)', () => {
    const chips = deriveConsentChips({
      coverage: 'covered',
      grants: NONE,
      isPro: true,
      webAvailable: true,
      webIntent: 'request',
    });
    // GK not offered (covered), web IS (explicit request).
    expect(chips.some((c) => c.id === 'ALLOW_GENERAL_KNOWLEDGE')).toBe(false);
    expect(chips.find((c) => c.id === 'ALLOW_WEB_SEARCH')).toMatchObject({ enabled: true, upsell: false });
  });
});
