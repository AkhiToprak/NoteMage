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
 * GLM migration v2 — structure + theory default to GLM-5.2 (quality surfaces);
 * the per-slot volume stages (flashcards, quiz) default to GLM-4.7-flash on
 * BASIC paths and stay on GLM-5.2 for ULTRA (600k-char corpora can exceed
 * flash's 203K window; ultra is 3/mo-capped so its spend is bounded). Per-stage
 * PATH_<STAGE>_MODEL overrides still win, and MODEL_COMPOSITION_LEGACY=1
 * reverts paths to the prior routing.
 */
describe('resolveModel — path stage split (GLM-5.2 quality / GLM-4.7-flash volume)', () => {
  afterEach(() => {
    delete process.env.GLM_COMPOSITION;
    delete process.env.MODEL_COMPOSITION_LEGACY;
    delete process.env.PATH_QUIZ_MODEL;
  });

  it('structure + theory → glm-sonnet (GLM-5.2) for basic AND ultra, flag on OR off', () => {
    for (const flag of [false, true]) {
      if (flag) process.env.GLM_COMPOSITION = '1';
      else delete process.env.GLM_COMPOSITION;
      for (const f of ['path-structure', 'path-theory'] as const) {
        for (const ultra of [false, true]) {
          const m = resolveModel(f, { ultra });
          expect(m.provider).toBe('openrouter');
          expect(m.token).toBe('glm-sonnet');
          expect(m.model).toMatch(/glm-5\.2/);
        }
      }
    }
  });

  it('BASIC flashcards + quiz → glm-flash (GLM-4.7-flash)', () => {
    for (const f of ['path-flashcards', 'path-quiz'] as const) {
      const m = resolveModel(f, { ultra: false });
      expect(m.provider).toBe('openrouter');
      expect(m.token).toBe('glm-flash');
      expect(m.model).toMatch(/glm-4\.7-flash/);
    }
  });

  it('ULTRA flashcards + quiz stay on glm-sonnet (context headroom)', () => {
    for (const f of ['path-flashcards', 'path-quiz'] as const) {
      expect(resolveModel(f, { ultra: true })).toMatchObject({
        token: 'glm-sonnet',
        provider: 'openrouter',
      });
    }
  });

  it('a gemini providerOverride is IGNORED — paths never route to Gemini', () => {
    for (const f of ['path-structure', 'path-theory', 'path-flashcards', 'path-quiz'] as const) {
      const m = resolveModel(f, { ultra: true, providerOverride: 'gemini' });
      expect(m.provider).toBe('openrouter');
      expect(m.token).toBe('glm-sonnet');
    }
    expect(resolveModel('path-quiz', { ultra: false, providerOverride: 'gemini' })).toMatchObject({
      token: 'glm-flash',
      provider: 'openrouter',
    });
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

describe('resolveModel — independent quiz verifier', () => {
  it('always routes Gemini 2.5 Flash-Lite through OpenRouter', () => {
    expect(resolveModel('quiz-verify')).toMatchObject({
      provider: 'openrouter',
      model: 'google/gemini-2.5-flash-lite',
      token: 'or-flash-lite',
    });
  });
});

/**
 * The formerly-Haiku non-path slots HARD-DEFAULT to GLM — essay/page-generate
 * on GLM-4.7 (glm-haiku); the high-volume structured chat slots (chat-generate,
 * chat-intent) on GLM-4.7-flash (glm-flash). GLM_COMPOSITION no longer changes
 * them; only MODEL_COMPOSITION_LEGACY=1 reverts them to Claude Haiku. Gemini
 * slots are untouched; per-feature overrides win. (Paths + mage-answer +
 * path-preview are hard-defaulted to GLM elsewhere.)
 */
describe('resolveModel — formerly-Haiku non-path slots run on GLM', () => {
  afterEach(() => {
    delete process.env.GLM_COMPOSITION;
    delete process.env.MODEL_COMPOSITION_LEGACY;
    delete process.env.ESSAY_MODEL;
  });

  const glmHaikuSlots = ['page-generate', 'essay'] as const;
  const glmFlashSlots = ['chat-generate', 'chat-intent'] as const;

  it('default (no flag): essay/page-generate → glm-haiku, chat slots → glm-flash', () => {
    for (const f of glmHaikuSlots) {
      const m = resolveModel(f);
      expect(m.provider).toBe('openrouter');
      expect(m.token).toBe('glm-haiku');
      expect(m.model).toMatch(/glm-4\.7$/);
    }
    for (const f of glmFlashSlots) {
      const m = resolveModel(f);
      expect(m.provider).toBe('openrouter');
      expect(m.token).toBe('glm-flash');
      expect(m.model).toMatch(/glm-4\.7-flash/);
    }
  });

  it('GLM_COMPOSITION=1 leaves them on their GLM tokens (already GLM)', () => {
    process.env.GLM_COMPOSITION = '1';
    for (const f of glmHaikuSlots) {
      expect(resolveModel(f)).toMatchObject({ token: 'glm-haiku', provider: 'openrouter' });
    }
    for (const f of glmFlashSlots) {
      expect(resolveModel(f)).toMatchObject({ token: 'glm-flash', provider: 'openrouter' });
    }
  });

  it('MODEL_COMPOSITION_LEGACY=1 reverts them all to Claude Haiku', () => {
    process.env.MODEL_COMPOSITION_LEGACY = '1';
    for (const f of [...glmHaikuSlots, ...glmFlashSlots]) {
      expect(resolveModel(f)).toMatchObject({ token: 'haiku', provider: 'anthropic' });
    }
  });

  it('path-preview defaults to glm-sonnet (GLM-5.2)', () => {
    expect(resolveModel('path-preview')).toMatchObject({
      token: 'glm-sonnet',
      provider: 'openrouter',
    });
  });

  it('Gemini slots stay on Gemini (chat-plain splits FREE→Flash-Lite, PRO→Flash)', () => {
    expect(resolveModel('chat-plain', { tier: 'PRO' })).toMatchObject({
      provider: 'gemini',
      token: 'flash',
    });
    expect(resolveModel('chat-plain', { tier: 'FREE' })).toMatchObject({
      provider: 'gemini',
      token: 'flash-lite',
    });
    expect(resolveModel('chat-plain').token).toBe('flash-lite');
    expect(resolveModel('chat-title').provider).toBe('gemini');
  });

  it('explicit override pins a slot (e.g. ESSAY_MODEL=glm-5.2)', () => {
    process.env.ESSAY_MODEL = 'glm-5.2';
    expect(resolveModel('essay')).toMatchObject({ token: 'glm-sonnet', provider: 'openrouter' });
  });

  it('glm-flash parses via token name and slug aliases', () => {
    process.env.ESSAY_MODEL = 'glm-flash';
    expect(resolveModel('essay')).toMatchObject({ token: 'glm-flash', provider: 'openrouter' });
    process.env.ESSAY_MODEL = 'glm-4.7-flash';
    expect(resolveModel('essay').token).toBe('glm-flash');
  });

  it('deepseek-flash is a PIN-ONLY token — parses via aliases, no default routes to it', () => {
    for (const alias of ['deepseek-flash', 'deepseek-v4-flash', 'deepseek']) {
      process.env.ESSAY_MODEL = alias;
      const m = resolveModel('essay');
      expect(m).toMatchObject({ token: 'deepseek-flash', provider: 'openrouter' });
      expect(m.model).toMatch(/deepseek-v4-flash/);
    }
    delete process.env.ESSAY_MODEL;
    // No default anywhere resolves to deepseek — spot-check the likely suspects.
    for (const f of ['essay', 'path-theory', 'path-quiz', 'chat-generate'] as const) {
      expect(resolveModel(f).token).not.toBe('deepseek-flash');
    }
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

// Weakness Training Phase 1A — the slot-backfill classifier must stay on the
// cheap tier (it runs one forced-tool call per existing slot during backfill).
// It is wired to mirror `exam-weak-analysis` exactly; this pins that so a future
// routing edit can't silently promote it to a sonnet-tier model.
describe("resolveModel('concept-backfill-classify') — cheap tier", () => {
  afterEach(() => {
    delete process.env.GLM_COMPOSITION;
    delete process.env.MODEL_COMPOSITION_LEGACY;
    delete process.env.CONCEPT_BACKFILL_MODEL;
    delete process.env.EXAM_WEAK_ANALYSIS_MODEL;
  });

  it('resolves identically to exam-weak-analysis across compositions', () => {
    expect(resolveModel('concept-backfill-classify')).toEqual(resolveModel('exam-weak-analysis'));
    process.env.GLM_COMPOSITION = '1';
    expect(resolveModel('concept-backfill-classify')).toEqual(resolveModel('exam-weak-analysis'));
    delete process.env.GLM_COMPOSITION;
    process.env.MODEL_COMPOSITION_LEGACY = '1';
    expect(resolveModel('concept-backfill-classify')).toEqual(resolveModel('exam-weak-analysis'));
  });

  it('never resolves to a sonnet-tier model', () => {
    for (const flags of [{}, { GLM_COMPOSITION: '1' }, { MODEL_COMPOSITION_LEGACY: '1' }]) {
      delete process.env.GLM_COMPOSITION;
      delete process.env.MODEL_COMPOSITION_LEGACY;
      Object.assign(process.env, flags);
      expect(resolveModel('concept-backfill-classify').token).not.toMatch(/sonnet/);
    }
  });

  it('CONCEPT_BACKFILL_MODEL pins the model', () => {
    process.env.CONCEPT_BACKFILL_MODEL = 'haiku';
    expect(resolveModel('concept-backfill-classify')).toMatchObject({
      token: 'haiku',
      provider: 'anthropic',
    });
  });
});

// Weakness Training Phase 1B (§5.1) — the remediation session generator must
// track exam-mock-questions exactly (same path-quiz routing tier), since both
// are single forced-tool calls that should clear the same quality bar.
describe("resolveModel('weakness-session-generate') — mirrors exam-mock-questions", () => {
  afterEach(() => {
    delete process.env.GLM_COMPOSITION;
    delete process.env.MODEL_COMPOSITION_LEGACY;
    delete process.env.WEAKNESS_SESSION_MODEL;
    delete process.env.EXAM_MOCK_QUESTIONS_MODEL;
  });

  it('resolves identically to exam-mock-questions under default env (glm-flash)', () => {
    const weakness = resolveModel('weakness-session-generate');
    const examMock = resolveModel('exam-mock-questions');
    expect(weakness).toEqual(examMock);
    // Non-ultra path-quiz routing → the flash tier (session/practice corpora
    // are 3.5k/14k chars — far under flash's 203K window).
    expect(weakness.token).toBe('glm-flash');
  });

  it('WEAKNESS_SESSION_MODEL pins the model (e.g. =sonnet)', () => {
    process.env.WEAKNESS_SESSION_MODEL = 'sonnet';
    expect(resolveModel('weakness-session-generate')).toMatchObject({
      token: 'sonnet',
      provider: 'anthropic',
    });
  });
});
