import { describe, it, expect, afterEach } from 'vitest';
import { resolveModel } from './model-routing';

/**
 * Mage answer runs on GLM (flag-independent, hard-defaulted like path
 * generation): GLM-4.7 for normal answers, GLM-5.2 for `deep`. MAGE_ANSWER_MODEL
 * pins a model; MODEL_COMPOSITION_LEGACY=1 reverts to Claude (Haiku / Sonnet by
 * mode) as the rollback. chat-stream falls back to Claude on a GLM failure.
 */
describe("resolveModel('mage-answer') — runs on GLM", () => {
  afterEach(() => {
    delete process.env.MAGE_ANSWER_MODEL;
    delete process.env.MODEL_COMPOSITION_LEGACY;
    delete process.env.GLM_COMPOSITION;
  });

  it('default / quick / strict → GLM-4.7 (glm-haiku) on OpenRouter', () => {
    for (const ctx of [{}, { mode: 'quick' as const }, { mode: 'strict' as const }]) {
      const m = resolveModel('mage-answer', ctx);
      expect(m.token).toBe('glm-haiku');
      expect(m.provider).toBe('openrouter');
      expect(m.model).toMatch(/glm-4\.7/);
    }
  });

  it('deep → GLM-5.2 (glm-sonnet) on OpenRouter', () => {
    const m = resolveModel('mage-answer', { mode: 'deep' });
    expect(m.token).toBe('glm-sonnet');
    expect(m.provider).toBe('openrouter');
    expect(m.model).toMatch(/glm-5\.2/);
  });

  it('is GLM regardless of GLM_COMPOSITION (hard-defaulted)', () => {
    delete process.env.GLM_COMPOSITION;
    expect(resolveModel('mage-answer').provider).toBe('openrouter');
    process.env.GLM_COMPOSITION = '1';
    expect(resolveModel('mage-answer').provider).toBe('openrouter');
  });

  it('MAGE_ANSWER_MODEL pins the model and overrides the mode', () => {
    process.env.MAGE_ANSWER_MODEL = 'haiku';
    expect(resolveModel('mage-answer', { mode: 'deep' })).toMatchObject({
      token: 'haiku',
      provider: 'anthropic',
    });
    process.env.MAGE_ANSWER_MODEL = 'sonnet';
    expect(resolveModel('mage-answer', { mode: 'quick' })).toMatchObject({
      token: 'sonnet',
      provider: 'anthropic',
    });
  });

  it('MODEL_COMPOSITION_LEGACY reverts to Claude Haiku (Sonnet removed app-wide)', () => {
    process.env.MODEL_COMPOSITION_LEGACY = '1';
    // Sonnet was removed app-wide (commit 059b3e22): legacy deep-mode Mage no
    // longer upgrades to Sonnet — both modes resolve to Haiku.
    expect(resolveModel('mage-answer', { mode: 'quick' })).toMatchObject({
      token: 'haiku',
      provider: 'anthropic',
    });
    expect(resolveModel('mage-answer', { mode: 'deep' })).toMatchObject({
      token: 'haiku',
      provider: 'anthropic',
    });
  });
});

/**
 * onboarding-real-generation P2 (D4) — the anonymous pre-signup PREVIEW (the
 * make-or-break first impression, only ~3 small calls). SONNET REMOVED (commit
 * 059b3e22): it now runs on GLM-5.2 (`glm-sonnet`, the flagship that replaced
 * Sonnet for path gen), env-pinnable via PATH_PREVIEW_MODEL, and deliberately NOT
 * downgraded by MODEL_COMPOSITION_LEGACY.
 */
describe("resolveModel('path-preview') — onboarding preview", () => {
  afterEach(() => {
    delete process.env.PATH_PREVIEW_MODEL;
    delete process.env.MODEL_COMPOSITION_LEGACY;
  });

  it('defaults to GLM-5.2 (glm-sonnet via OpenRouter)', () => {
    const m = resolveModel('path-preview');
    expect(m.token).toBe('glm-sonnet');
    expect(m.provider).toBe('openrouter');
  });

  it('PATH_PREVIEW_MODEL pins the model (e.g. =haiku to cut cost)', () => {
    process.env.PATH_PREVIEW_MODEL = 'haiku';
    expect(resolveModel('path-preview').token).toBe('haiku');
  });

  it('does NOT downgrade under MODEL_COMPOSITION_LEGACY — quality is the point', () => {
    process.env.MODEL_COMPOSITION_LEGACY = '1';
    expect(resolveModel('path-preview').token).toBe('glm-sonnet');
  });
});

/**
 * GLM migration v1 — path generation runs ENTIRELY on GLM-5.2 as the default
 * (flag-independent; see resolvePathStage). All four stages resolve to
 * glm-sonnet for both basic and ultra. Per-stage PATH_<STAGE>_MODEL overrides
 * still win, and MODEL_COMPOSITION_LEGACY=1 reverts paths to the prior routing.
 */
describe('resolveModel — path stages default to GLM-5.2', () => {
  afterEach(() => {
    delete process.env.GLM_COMPOSITION;
    delete process.env.MODEL_COMPOSITION_LEGACY;
    delete process.env.PATH_QUIZ_MODEL;
  });

  it('all four path stages → glm-sonnet (GLM-5.2), with the flag on OR off', () => {
    for (const flag of [false, true]) {
      if (flag) process.env.GLM_COMPOSITION = '1';
      else delete process.env.GLM_COMPOSITION;
      for (const f of ['path-structure', 'path-theory', 'path-flashcards', 'path-quiz'] as const) {
        const m = resolveModel(f, { ultra: f === 'path-structure' });
        expect(m.provider).toBe('openrouter');
        expect(m.token).toBe('glm-sonnet');
        expect(m.model).toMatch(/glm-5\.2/);
      }
    }
  });

  it('basic-tier structure is also GLM-5.2 (no Gemini split anymore)', () => {
    expect(resolveModel('path-structure', { ultra: false })).toMatchObject({
      token: 'glm-sonnet',
      provider: 'openrouter',
    });
  });

  it('a gemini providerOverride is IGNORED — paths never route to Gemini', () => {
    for (const f of ['path-structure', 'path-theory', 'path-flashcards', 'path-quiz'] as const) {
      const m = resolveModel(f, { ultra: true, providerOverride: 'gemini' });
      expect(m.provider).toBe('openrouter');
      expect(m.token).toBe('glm-sonnet');
    }
  });

  it('PATH_QUIZ_MODEL still pins a stage back to real Claude', () => {
    process.env.PATH_QUIZ_MODEL = 'haiku';
    expect(resolveModel('path-quiz')).toMatchObject({ token: 'haiku', provider: 'anthropic' });
  });

  it('MODEL_COMPOSITION_LEGACY reverts paths OFF GLM (prior routing)', () => {
    process.env.MODEL_COMPOSITION_LEGACY = '1';
    expect(resolveModel('path-quiz').provider).toBe('anthropic');
    expect(resolveModel('path-structure', { ultra: true }).provider).toBe('anthropic');
  });
});

/**
 * The formerly-Haiku non-path slots (essay, page-generate, chat-generate,
 * chat-intent) now HARD-DEFAULT to GLM-4.7 (glm-haiku) — Haiku was removed
 * app-wide, so GLM_COMPOSITION no longer changes them; only
 * MODEL_COMPOSITION_LEGACY=1 reverts them to Claude Haiku. Gemini slots are
 * untouched; per-feature overrides win. (Paths + mage-answer + path-preview are
 * hard-defaulted to GLM elsewhere.)
 */
describe('resolveModel — formerly-Haiku non-path slots run on GLM-4.7', () => {
  afterEach(() => {
    delete process.env.GLM_COMPOSITION;
    delete process.env.MODEL_COMPOSITION_LEGACY;
    delete process.env.ESSAY_MODEL;
  });

  const glmHaikuSlots = ['page-generate', 'essay', 'chat-generate', 'chat-intent'] as const;

  it('default (no flag): all resolve to glm-haiku (GLM-4.7)', () => {
    for (const f of glmHaikuSlots) {
      const m = resolveModel(f);
      expect(m.provider).toBe('openrouter');
      expect(m.token).toBe('glm-haiku');
      expect(m.model).toMatch(/glm-4\.7/);
    }
  });

  it('GLM_COMPOSITION=1 leaves them on GLM-4.7 (already GLM)', () => {
    process.env.GLM_COMPOSITION = '1';
    for (const f of glmHaikuSlots) {
      expect(resolveModel(f)).toMatchObject({ token: 'glm-haiku', provider: 'openrouter' });
    }
  });

  it('MODEL_COMPOSITION_LEGACY=1 reverts them to Claude Haiku', () => {
    process.env.MODEL_COMPOSITION_LEGACY = '1';
    for (const f of glmHaikuSlots) {
      expect(resolveModel(f)).toMatchObject({ token: 'haiku', provider: 'anthropic' });
    }
  });

  it('path-preview defaults to glm-sonnet (GLM-5.2)', () => {
    expect(resolveModel('path-preview')).toMatchObject({
      token: 'glm-sonnet',
      provider: 'openrouter',
    });
  });

  it('Gemini slots stay on Gemini', () => {
    expect(resolveModel('chat-plain', { tier: 'PRO' }).provider).toBe('gemini');
    expect(resolveModel('chat-title').provider).toBe('gemini');
  });

  it('explicit override pins a slot (e.g. ESSAY_MODEL=glm-5.2)', () => {
    process.env.ESSAY_MODEL = 'glm-5.2';
    expect(resolveModel('essay')).toMatchObject({ token: 'glm-sonnet', provider: 'openrouter' });
  });

  it('MODEL_COMPOSITION_LEGACY wins over GLM_COMPOSITION (no GLM)', () => {
    process.env.GLM_COMPOSITION = '1';
    process.env.MODEL_COMPOSITION_LEGACY = '1';
    // Legacy wins (Claude, not GLM); Sonnet removed app-wide, so deep mode is
    // Haiku not Sonnet — the point of the test (no GLM under legacy) still holds.
    expect(resolveModel('mage-answer', { mode: 'deep' })).toMatchObject({
      token: 'haiku',
      provider: 'anthropic',
    });
  });
});
