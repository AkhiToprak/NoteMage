import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyQuizVerification, shouldVerifyQuiz, verifyQuiz } from './quiz-verifier';

const mocks = vi.hoisted(() => ({
  callOpenRouter: vi.fn(),
  logAiUsage: vi.fn(),
}));

vi.mock('./openrouter', () => ({ callOpenRouter: mocks.callOpenRouter }));
vi.mock('./ai-usage', () => ({ logAiUsage: mocks.logAiUsage }));
vi.mock('./model-routing', () => ({
  resolveModel: () => ({
    provider: 'openrouter',
    model: 'google/gemini-2.5-flash-lite',
    token: 'or-flash-lite',
  }),
}));

describe('quiz verifier policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.QUIZ_VERIFIER_DISABLED;
  });

  it('always verifies final exams and supports cost-free disabling', () => {
    expect(shouldVerifyQuiz({ slotKind: 'final_exam', sampleKey: 'x', sampleRate: 0 })).toBe(true);
    process.env.QUIZ_VERIFIER_DISABLED = '1';
    expect(shouldVerifyQuiz({ slotKind: 'final_exam', sampleKey: 'x' })).toBe(false);
  });

  it('uses deterministic sampling for ordinary quizzes', () => {
    const first = shouldVerifyQuiz({ slotKind: 'assessment', sampleKey: 'plan:slot', sampleRate: 0.5 });
    const second = shouldVerifyQuiz({ slotKind: 'assessment', sampleKey: 'plan:slot', sampleRate: 0.5 });
    expect(first).toBe(second);
  });

  it('drops failed items without buying a regeneration call', () => {
    const applied = applyQuizVerification(
      ['a', 'b', 'c', 'd'],
      {
        status: 'failed',
        model: 'cheap',
        items: [
          { index: 0, pass: true, issues: [] },
          {
            index: 1,
            pass: false,
            issues: [{ code: 'incorrect_answer_key', severity: 'error', reason: 'wrong key' }],
          },
          { index: 2, pass: true, issues: [] },
          { index: 3, pass: true, issues: [] },
        ],
      },
      3,
    );
    expect(applied).toEqual({ questions: ['a', 'c', 'd'], status: 'filtered', rejectedIndexes: [1] });
  });

  it('keeps the original quiz when filtering would create a hole', () => {
    const items = ['a', 'b', 'c'].map((_, index) => ({
      index,
      pass: index === 0,
      issues:
        index === 0
          ? []
          : [{ code: 'ambiguous_wording' as const, severity: 'error' as const, reason: 'ambiguous' }],
    }));
    expect(
      applyQuizVerification(['a', 'b', 'c'], { status: 'failed', model: 'cheap', items }, 3).status,
    ).toBe('failed_open');
  });
});

describe('verifyQuiz', () => {
  it('routes through OpenRouter with the Google model and logs exact spend', async () => {
    mocks.callOpenRouter.mockResolvedValue({
      text: '',
      finishReason: 'tool_calls',
      toolCalls: [
        {
          name: 'submit_quiz_verification',
          arguments: JSON.stringify({ items: [{ index: 0, pass: true, issues: [] }] }),
        },
      ],
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        cachedTokens: 0,
        costUsd: 0.000018,
        upstreamCostUsd: 0.000016,
      },
    });
    const result = await verifyQuiz({
      userId: 'u1',
      hasSourceMaterials: false,
      questions: [
        {
          kind: 'true_false',
          prompt: 'Water freezes at 0°C at standard pressure.',
          payload: { correct: true },
        },
      ],
    });
    expect(result.status).toBe('passed');
    expect(mocks.callOpenRouter).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'google/gemini-2.5-flash-lite',
        providerOrder: [],
        disableReasoning: true,
      }),
    );
    expect(mocks.logAiUsage).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'openrouter', costUsd: 0.000018 }),
    );
  });
});
