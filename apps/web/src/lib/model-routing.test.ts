import { describe, it, expect, afterEach } from 'vitest';
import { resolveModel } from './model-routing';

/**
 * Mage Revolution Phase 9 — the answer `mode` picks the model tier through
 * `resolveModel('mage-answer', { mode })`. `deep` upgrades to Sonnet; `quick`
 * and `strict` stay on Haiku. A Mage answer is always Anthropic (it runs the
 * citation / annotate_answer tools), never Gemini, regardless of mode or tier.
 */
describe("resolveModel('mage-answer') — Phase 9 mode → tier", () => {
  afterEach(() => {
    delete process.env.MAGE_ANSWER_MODEL;
    delete process.env.MODEL_COMPOSITION_LEGACY;
  });

  it('routes deep mode to Sonnet', () => {
    const m = resolveModel('mage-answer', { mode: 'deep' });
    expect(m.token).toBe('sonnet');
    expect(m.provider).toBe('anthropic');
  });

  it('keeps quick and strict on Haiku', () => {
    expect(resolveModel('mage-answer', { mode: 'quick' }).token).toBe('haiku');
    expect(resolveModel('mage-answer', { mode: 'strict' }).token).toBe('haiku');
  });

  it('defaults (no mode) to Haiku', () => {
    expect(resolveModel('mage-answer').token).toBe('haiku');
  });

  it('always resolves to Anthropic, never Gemini', () => {
    for (const mode of ['quick', 'deep', 'strict'] as const) {
      expect(resolveModel('mage-answer', { mode, tier: 'FREE' }).provider).toBe('anthropic');
    }
  });

  it('MAGE_ANSWER_MODEL pins the model and overrides the mode', () => {
    process.env.MAGE_ANSWER_MODEL = 'haiku';
    expect(resolveModel('mage-answer', { mode: 'deep' }).token).toBe('haiku');
    process.env.MAGE_ANSWER_MODEL = 'sonnet';
    expect(resolveModel('mage-answer', { mode: 'quick' }).token).toBe('sonnet');
  });

  it('keeps the Haiku default under MODEL_COMPOSITION_LEGACY (no regression)', () => {
    process.env.MODEL_COMPOSITION_LEGACY = '1';
    expect(resolveModel('mage-answer', { mode: 'quick' }).token).toBe('haiku');
    expect(resolveModel('mage-answer', { mode: 'deep' }).token).toBe('sonnet');
  });
});

/**
 * onboarding-real-generation P2 (D4) — the anonymous pre-signup PREVIEW runs on
 * Sonnet (the make-or-break first impression, only ~3 small calls). It is an
 * Anthropic call, env-pinnable via PATH_PREVIEW_MODEL, and is deliberately NOT
 * downgraded by MODEL_COMPOSITION_LEGACY.
 */
describe("resolveModel('path-preview') — onboarding preview", () => {
  afterEach(() => {
    delete process.env.PATH_PREVIEW_MODEL;
    delete process.env.MODEL_COMPOSITION_LEGACY;
  });

  it('defaults to Sonnet on Anthropic', () => {
    const m = resolveModel('path-preview');
    expect(m.token).toBe('sonnet');
    expect(m.provider).toBe('anthropic');
  });

  it('PATH_PREVIEW_MODEL pins the model (e.g. =haiku to cut cost)', () => {
    process.env.PATH_PREVIEW_MODEL = 'haiku';
    expect(resolveModel('path-preview').token).toBe('haiku');
  });

  it('does NOT downgrade under MODEL_COMPOSITION_LEGACY — quality is the point', () => {
    process.env.MODEL_COMPOSITION_LEGACY = '1';
    expect(resolveModel('path-preview').token).toBe('sonnet');
  });
});
