import { describe, it, expect, afterEach } from 'vitest';
import { resolveModel, type ModelFeature } from './model-routing';

// Every retired routing env var — set/cleared per test to prove they are
// ignored after the Claude excision.
const RETIRED = [
  'MODEL_COMPOSITION_LEGACY',
  'GLM_COMPOSITION',
  'PATH_PROVIDER',
  'PATH_PROVIDER_QUIZ',
  'CHAT_PROVIDER_FREE',
  'CLASSIFIER_PROVIDER',
];

function clearRetired() {
  for (const name of RETIRED) delete process.env[name];
}

/**
 * Mage answer runs on GLM (hard-defaulted, like path generation): GLM-4.7 for
 * normal answers, GLM-5.2 for `deep`. MAGE_ANSWER_MODEL pins a model. Claude is
 * gone — a `haiku`/`sonnet` pin resolves to its GLM equivalent.
 */
describe("resolveModel('mage-answer') — runs on GLM", () => {
  afterEach(() => {
    delete process.env.MAGE_ANSWER_MODEL;
    clearRetired();
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

  it('is GLM regardless of any retired composition env var', () => {
    process.env.GLM_COMPOSITION = '1';
    process.env.MODEL_COMPOSITION_LEGACY = '1';
    expect(resolveModel('mage-answer').provider).toBe('openrouter');
  });

  it('MAGE_ANSWER_MODEL=haiku pins glm-haiku and overrides the mode', () => {
    process.env.MAGE_ANSWER_MODEL = 'haiku';
    expect(resolveModel('mage-answer', { mode: 'deep' })).toMatchObject({
      token: 'glm-haiku',
      provider: 'openrouter',
    });
    process.env.MAGE_ANSWER_MODEL = 'sonnet';
    expect(resolveModel('mage-answer', { mode: 'quick' })).toMatchObject({
      token: 'glm-sonnet',
      provider: 'openrouter',
    });
  });
});

/**
 * onboarding-real-generation P2 (D4) — the anonymous pre-signup PREVIEW runs on
 * GLM-5.2 (`glm-sonnet`), env-pinnable via PATH_PREVIEW_MODEL.
 */
describe("resolveModel('path-preview') — onboarding preview", () => {
  afterEach(() => {
    delete process.env.PATH_PREVIEW_MODEL;
    clearRetired();
  });

  it('defaults to GLM-5.2 (glm-sonnet via OpenRouter)', () => {
    const m = resolveModel('path-preview');
    expect(m.token).toBe('glm-sonnet');
    expect(m.provider).toBe('openrouter');
  });

  it('PATH_PREVIEW_MODEL=haiku pins glm-haiku (to cut cost)', () => {
    process.env.PATH_PREVIEW_MODEL = 'haiku';
    expect(resolveModel('path-preview').token).toBe('glm-haiku');
  });

  it('retired MODEL_COMPOSITION_LEGACY does not change it', () => {
    process.env.MODEL_COMPOSITION_LEGACY = '1';
    expect(resolveModel('path-preview').token).toBe('glm-sonnet');
  });
});

/**
 * Path stage split — structure + theory default to GLM-5.2 (quality surfaces);
 * the per-slot volume stages (flashcards, quiz) default to GLM-4.7-flash on
 * BASIC paths and stay on GLM-5.2 for ULTRA. Per-stage PATH_<STAGE>_MODEL
 * overrides still win; retired env vars are ignored.
 */
describe('resolveModel — path stage split (GLM-5.2 quality / GLM-4.7-flash volume)', () => {
  afterEach(() => {
    clearRetired();
    delete process.env.PATH_QUIZ_MODEL;
  });

  it('structure + theory → glm-sonnet (GLM-5.2) for basic AND ultra', () => {
    for (const f of ['path-structure', 'path-theory'] as const) {
      for (const ultra of [false, true]) {
        const m = resolveModel(f, { ultra });
        expect(m.provider).toBe('openrouter');
        expect(m.token).toBe('glm-sonnet');
        expect(m.model).toMatch(/glm-5\.2/);
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

  it('PATH_QUIZ_MODEL=sonnet pins a stage to glm-sonnet (Claude alias → GLM)', () => {
    process.env.PATH_QUIZ_MODEL = 'sonnet';
    expect(resolveModel('path-quiz')).toMatchObject({ token: 'glm-sonnet', provider: 'openrouter' });
  });

  it('retired MODEL_COMPOSITION_LEGACY does not put paths on Gemini/Claude', () => {
    process.env.MODEL_COMPOSITION_LEGACY = '1';
    expect(resolveModel('path-quiz').provider).toBe('openrouter');
    expect(resolveModel('path-structure', { ultra: true }).provider).toBe('openrouter');
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
 * The formerly-Haiku non-path slots HARD-DEFAULT to GLM — essay/page-generate on
 * GLM-4.7 (glm-haiku); the high-volume structured chat slots (chat-generate,
 * chat-intent) on GLM-4.7-flash (glm-flash). Retired env vars are ignored;
 * per-feature overrides win; a `haiku`/`sonnet` pin resolves to its GLM
 * equivalent.
 */
describe('resolveModel — formerly-Haiku non-path slots run on GLM', () => {
  afterEach(() => {
    clearRetired();
    delete process.env.ESSAY_MODEL;
  });

  const glmHaikuSlots = ['page-generate', 'essay'] as const;
  const glmFlashSlots = ['chat-generate', 'chat-intent'] as const;

  it('default: essay/page-generate → glm-haiku, chat slots → glm-flash', () => {
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

  it('retired GLM_COMPOSITION / MODEL_COMPOSITION_LEGACY leave them on GLM', () => {
    process.env.GLM_COMPOSITION = '1';
    process.env.MODEL_COMPOSITION_LEGACY = '1';
    for (const f of glmHaikuSlots) {
      expect(resolveModel(f)).toMatchObject({ token: 'glm-haiku', provider: 'openrouter' });
    }
    for (const f of glmFlashSlots) {
      expect(resolveModel(f)).toMatchObject({ token: 'glm-flash', provider: 'openrouter' });
    }
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

  it('CHAT_GEMINI_DISABLED=1 forces chat-plain to GLM-4.7-flash (not Gemini)', () => {
    process.env.CHAT_GEMINI_DISABLED = '1';
    for (const tier of ['FREE', 'PRO'] as const) {
      expect(resolveModel('chat-plain', { tier })).toMatchObject({
        token: 'glm-flash',
        provider: 'openrouter',
      });
    }
    delete process.env.CHAT_GEMINI_DISABLED;
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
    for (const f of ['essay', 'path-theory', 'path-quiz', 'chat-generate'] as const) {
      expect(resolveModel(f).token).not.toBe('deepseek-flash');
    }
  });
});

/**
 * The full excision matrix: for every feature × {no pin, PIN=haiku, PIN=sonnet}
 * the resolved provider is always 'openrouter' or 'gemini' (never a dead Claude
 * provider), and a haiku/sonnet pin resolves to glm-haiku/glm-sonnet. Exam
 * study-plan / report-summary are Gemini-only: a non-Gemini pin is coerced back
 * to flash-lite (Gemini). The other pinnable features honour the GLM alias.
 */
describe('resolveModel — excision matrix (no pin / haiku pin / sonnet pin)', () => {
  const ALL_FEATURES: ModelFeature[] = [
    'essay',
    'path-classify',
    'chat-title',
    'path-structure',
    'path-theory',
    'path-flashcards',
    'path-quiz',
    'quiz-verify',
    'path-preview',
    'chat-plain',
    'chat-generate',
    'chat-intent',
    'mage-answer',
    'doc-summarize',
    'page-generate',
    'video-ingest',
    'exam-study-plan',
    'exam-mock-questions',
    'exam-weak-analysis',
    'exam-report-summary',
    'concept-backfill-classify',
    'weakness-session-generate',
    'weakness-misconception-tag',
  ];

  // The per-feature env var a pin is written to. Features whose pin is
  // coerced to a Gemini token (video-ingest, exam-*) or that ignore the pin
  // (quiz-verify) are noted inline in the assertions.
  const PIN_ENV: Partial<Record<ModelFeature, string>> = {
    essay: 'ESSAY_MODEL',
    'path-classify': 'CLASSIFIER_MODEL',
    'chat-title': 'TITLE_MODEL',
    'path-structure': 'PATH_STRUCTURE_MODEL',
    'path-theory': 'PATH_THEORY_MODEL',
    'path-flashcards': 'PATH_FLASHCARDS_MODEL',
    'path-quiz': 'PATH_QUIZ_MODEL',
    'path-preview': 'PATH_PREVIEW_MODEL',
    'chat-plain': 'CHAT_PLAIN_MODEL',
    'chat-generate': 'CHAT_GENERATE_MODEL',
    'chat-intent': 'CHAT_INTENT_MODEL',
    'mage-answer': 'MAGE_ANSWER_MODEL',
    'doc-summarize': 'DOCSUM_MODEL',
    'page-generate': 'PAGE_GENERATE_MODEL',
    'exam-mock-questions': 'EXAM_MOCK_QUESTIONS_MODEL',
    'exam-weak-analysis': 'EXAM_WEAK_ANALYSIS_MODEL',
    'concept-backfill-classify': 'CONCEPT_BACKFILL_MODEL',
    'weakness-session-generate': 'WEAKNESS_SESSION_MODEL',
    'weakness-misconception-tag': 'WEAKNESS_MISCONCEPTION_MODEL',
    // Gemini-only (pin coerced back to a Gemini token):
    'exam-study-plan': 'EXAM_STUDY_PLAN_MODEL',
    'exam-report-summary': 'EXAM_REPORT_MODEL',
    'video-ingest': 'VIDEO_INGEST_MODEL',
  };

  // Features that IGNORE a haiku/sonnet pin and stay on Gemini flash-lite.
  const GEMINI_ONLY = new Set<ModelFeature>([
    'exam-study-plan',
    'exam-report-summary',
    'video-ingest',
  ]);
  // Features that ignore all pins entirely.
  const NO_PIN = new Set<ModelFeature>(['quiz-verify']);

  afterEach(() => {
    clearRetired();
    for (const env of Object.values(PIN_ENV)) delete process.env[env];
  });

  it('every feature with no pin resolves to openrouter or gemini', () => {
    for (const f of ALL_FEATURES) {
      const m = resolveModel(f);
      expect(['openrouter', 'gemini']).toContain(m.provider);
    }
  });

  for (const [pin, expectedToken] of [
    ['haiku', 'glm-haiku'],
    ['sonnet', 'glm-sonnet'],
  ] as const) {
    it(`PIN=${pin} → ${expectedToken} where honoured, coerced to gemini flash-lite for Gemini-only features`, () => {
      for (const f of ALL_FEATURES) {
        if (NO_PIN.has(f)) continue;
        const env = PIN_ENV[f];
        if (!env) continue;
        process.env[env] = pin;
        const m = resolveModel(f);
        expect(['openrouter', 'gemini']).toContain(m.provider);
        if (GEMINI_ONLY.has(f)) {
          expect(m.provider).toBe('gemini');
          expect(m.token).toBe('flash-lite');
        } else {
          expect(m.token).toBe(expectedToken);
          expect(m.provider).toBe('openrouter');
        }
        delete process.env[env];
      }
    });
  }
});

// Weakness Training Phase 1A — the slot-backfill classifier stays on the cheap
// tier, wired to mirror `exam-weak-analysis`.
describe("resolveModel('concept-backfill-classify') — cheap tier", () => {
  afterEach(() => {
    clearRetired();
    delete process.env.CONCEPT_BACKFILL_MODEL;
    delete process.env.EXAM_WEAK_ANALYSIS_MODEL;
  });

  it('resolves identically to exam-weak-analysis (both flash-lite / gemini)', () => {
    expect(resolveModel('concept-backfill-classify')).toEqual(resolveModel('exam-weak-analysis'));
    expect(resolveModel('concept-backfill-classify')).toMatchObject({
      token: 'flash-lite',
      provider: 'gemini',
    });
  });

  it('CONCEPT_BACKFILL_MODEL=haiku pins glm-haiku', () => {
    process.env.CONCEPT_BACKFILL_MODEL = 'haiku';
    expect(resolveModel('concept-backfill-classify')).toMatchObject({
      token: 'glm-haiku',
      provider: 'openrouter',
    });
  });
});

// Weakness Training Phase 1B — the remediation session generator tracks
// exam-mock-questions (same path-quiz routing tier).
describe("resolveModel('weakness-session-generate') — mirrors exam-mock-questions", () => {
  afterEach(() => {
    clearRetired();
    delete process.env.WEAKNESS_SESSION_MODEL;
    delete process.env.EXAM_MOCK_QUESTIONS_MODEL;
  });

  it('resolves identically to exam-mock-questions under default env (glm-flash)', () => {
    const weakness = resolveModel('weakness-session-generate');
    const examMock = resolveModel('exam-mock-questions');
    expect(weakness).toEqual(examMock);
    expect(weakness.token).toBe('glm-flash');
  });

  it('WEAKNESS_SESSION_MODEL=sonnet pins glm-sonnet', () => {
    process.env.WEAKNESS_SESSION_MODEL = 'sonnet';
    expect(resolveModel('weakness-session-generate')).toMatchObject({
      token: 'glm-sonnet',
      provider: 'openrouter',
    });
  });
});
