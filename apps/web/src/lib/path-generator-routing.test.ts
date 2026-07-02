import { describe, it, expect } from 'vitest';
import { parseStructureReasoningEffort } from './path-generator-routing';

/**
 * Phase 7 — GLM path-generation hardening. `parseStructureReasoningEffort`
 * gates the PATH_STRUCTURE_REASONING experiment (Stage A structure call only,
 * OFF by default). Pure string parsing, no env/network — the dispatcher wires
 * `process.env.PATH_STRUCTURE_REASONING` through this at call time.
 */
describe('parseStructureReasoningEffort', () => {
  it('accepts the three valid effort values', () => {
    expect(parseStructureReasoningEffort('low')).toBe('low');
    expect(parseStructureReasoningEffort('medium')).toBe('medium');
    expect(parseStructureReasoningEffort('high')).toBe('high');
  });

  it('is case-insensitive', () => {
    expect(parseStructureReasoningEffort('LOW')).toBe('low');
    expect(parseStructureReasoningEffort('Medium')).toBe('medium');
    expect(parseStructureReasoningEffort('HIGH')).toBe('high');
  });

  it('trims surrounding whitespace', () => {
    expect(parseStructureReasoningEffort('  low  ')).toBe('low');
    expect(parseStructureReasoningEffort('\tmedium\n')).toBe('medium');
  });

  it('rejects a garbage string', () => {
    expect(parseStructureReasoningEffort('extreme')).toBeNull();
    expect(parseStructureReasoningEffort('true')).toBeNull();
    expect(parseStructureReasoningEffort('1')).toBeNull();
  });

  it('rejects an empty string', () => {
    expect(parseStructureReasoningEffort('')).toBeNull();
    expect(parseStructureReasoningEffort('   ')).toBeNull();
  });

  it('returns null when unset', () => {
    expect(parseStructureReasoningEffort(undefined)).toBeNull();
  });
});
