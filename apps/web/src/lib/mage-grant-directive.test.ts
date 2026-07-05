import { describe, it, expect } from 'vitest';
import { mageGrantUncoveredDirective, type MageThreadGrants } from './mage-types';

const grants = (
  allowWebSearch: boolean,
  allowGeneralKnowledge: boolean
): MageThreadGrants => ({ allowWebSearch, allowGeneralKnowledge });

describe('mageGrantUncoveredDirective — four grant states', () => {
  const neither = mageGrantUncoveredDirective(grants(false, false));
  const gkOnly = mageGrantUncoveredDirective(grants(false, true));
  const webOnly = mageGrantUncoveredDirective(grants(true, false));
  const both = mageGrantUncoveredDirective(grants(true, true));

  it('neither: restrained offer, refuses outside knowledge, never a dead end', () => {
    expect(neither).toContain('offer');
    expect(neither.toLowerCase()).toContain("don't seem to cover");
    // Explicitly forbids answering from outside/general knowledge when uncovered.
    expect(neither.toLowerCase()).toContain('do not');
    // Not a browse/GK grant.
    expect(neither.toLowerCase()).not.toContain('you may use web results');
  });

  it('GK only: allows own knowledge, discloses, forbids browsing', () => {
    expect(gkOnly.toLowerCase()).toContain('general knowledge');
    expect(gkOnly.toLowerCase()).toContain('say so plainly');
    expect(gkOnly.toLowerCase()).toContain('do not browse');
  });

  it('web only: cite by domain, [S#] reserved, no from-memory claims', () => {
    expect(webOnly.toLowerCase()).toContain('web results');
    expect(webOnly.toLowerCase()).toContain('domain');
    expect(webOnly).toContain('[S#]');
    expect(webOnly.toLowerCase()).toContain('memory');
  });

  it('both: web + general knowledge, cited + disclosed', () => {
    expect(both.toLowerCase()).toContain('general knowledge');
    expect(both.toLowerCase()).toContain('web results');
    expect(both.toLowerCase()).toContain('domain');
  });

  it('all four states are distinct directives', () => {
    const set = new Set([neither, gkOnly, webOnly, both]);
    expect(set.size).toBe(4);
  });
});
