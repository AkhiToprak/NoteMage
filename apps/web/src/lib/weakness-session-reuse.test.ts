import { describe, it, expect } from 'vitest';
import { cooldownConceptSet } from './weakness-session-generator';

describe('cooldownConceptSet', () => {
  it('returns an empty set for empty input', () => {
    const result = cooldownConceptSet([]);
    expect(result.size).toBe(0);
  });

  it('flattens a single session into its conceptIds', () => {
    const result = cooldownConceptSet([{ conceptIds: ['a', 'b'] }]);
    expect(result).toEqual(new Set(['a', 'b']));
  });

  it('dedupes overlapping conceptIds across multiple sessions', () => {
    const result = cooldownConceptSet([
      { conceptIds: ['a', 'b'] },
      { conceptIds: ['b', 'c'] },
      { conceptIds: ['c', 'd'] },
    ]);
    expect(result).toEqual(new Set(['a', 'b', 'c', 'd']));
    expect(result.size).toBe(4);
  });

  it('ignores sessions with an empty conceptIds array', () => {
    const result = cooldownConceptSet([{ conceptIds: [] }, { conceptIds: ['x'] }]);
    expect(result).toEqual(new Set(['x']));
  });
});
