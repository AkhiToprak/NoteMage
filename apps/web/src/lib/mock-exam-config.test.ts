import { describe, it, expect } from 'vitest';
import {
  parseMockConfig,
  defaultMockConfig,
  durationLabel,
  MIN_QUESTIONS,
  MAX_QUESTIONS,
  MIN_DURATION_SEC,
  MAX_DURATION_SEC,
  DEFAULT_MOCK_KINDS,
  MOCK_TYPE_PRESETS,
} from './mock-exam-config';

describe('parseMockConfig — validation + clamping', () => {
  it('falls back to the quick preset for an unknown/empty payload', () => {
    const c = parseMockConfig({});
    expect(c.type).toBe('quick');
    expect(c.questionCount).toBe(MOCK_TYPE_PRESETS.quick.questionCount);
    expect(c.questionKinds).toEqual(DEFAULT_MOCK_KINDS);
  });

  it('honors a valid type and seeds from its preset when fields are missing', () => {
    const c = parseMockConfig({ type: 'final' });
    expect(c.type).toBe('final');
    expect(c.difficulty).toBe(MOCK_TYPE_PRESETS.final.difficulty);
    expect(c.hints).toBe(MOCK_TYPE_PRESETS.final.hints);
  });

  it('clamps the question count into [MIN, MAX]', () => {
    expect(parseMockConfig({ questionCount: 999 }).questionCount).toBe(MAX_QUESTIONS);
    expect(parseMockConfig({ questionCount: 1 }).questionCount).toBe(MIN_QUESTIONS);
    expect(parseMockConfig({ questionCount: 14 }).questionCount).toBe(14);
  });

  it('treats durationSec <= 0 as untimed and clamps positive values into the band', () => {
    expect(parseMockConfig({ durationSec: 0 }).durationSec).toBe(0);
    expect(parseMockConfig({ durationSec: -50 }).durationSec).toBe(0);
    expect(parseMockConfig({ durationSec: 10 }).durationSec).toBe(MIN_DURATION_SEC);
    expect(parseMockConfig({ durationSec: 999999 }).durationSec).toBe(MAX_DURATION_SEC);
    expect(parseMockConfig({ durationSec: 600 }).durationSec).toBe(600);
  });

  it('intersects question kinds with the safe set and never returns an empty list', () => {
    expect(parseMockConfig({ questionKinds: ['mc', 'code_write', 'garbage'] }).questionKinds).toEqual(['mc']);
    expect(parseMockConfig({ questionKinds: [] }).questionKinds).toEqual(DEFAULT_MOCK_KINDS);
    expect(parseMockConfig({ questionKinds: ['code_write'] }).questionKinds).toEqual(DEFAULT_MOCK_KINDS);
    // de-dupes
    expect(parseMockConfig({ questionKinds: ['mc', 'mc', 'true_false'] }).questionKinds).toEqual(['mc', 'true_false']);
  });

  it('dedups + caps focus topics, dropping non-strings', () => {
    const c = parseMockConfig({ topics: ['Cells', 'cells', '  Energy  ', 42, ''] });
    expect(c.topics).toEqual(['Cells', 'Energy']);
  });

  it('coerces a non-boolean hints value to the preset default', () => {
    expect(parseMockConfig({ type: 'quick', hints: 'yes' }).hints).toBe(MOCK_TYPE_PRESETS.quick.hints);
    expect(parseMockConfig({ hints: false }).hints).toBe(false);
  });
});

describe('defaultMockConfig', () => {
  it('produces a within-bounds config for every preset', () => {
    for (const type of ['quick', 'full', 'weakness', 'final'] as const) {
      const c = defaultMockConfig(type);
      expect(c.questionCount).toBeGreaterThanOrEqual(MIN_QUESTIONS);
      expect(c.questionCount).toBeLessThanOrEqual(MAX_QUESTIONS);
      expect(c.questionKinds.length).toBeGreaterThan(0);
    }
  });
});

describe('durationLabel', () => {
  it('formats untimed, minutes, and hours', () => {
    expect(durationLabel(0)).toBe('No time limit');
    expect(durationLabel(600)).toBe('10 min');
    expect(durationLabel(3600)).toBe('1 h');
    expect(durationLabel(5400)).toBe('1 h 30 min');
  });
});
