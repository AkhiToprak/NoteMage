import { describe, it, expect, vi, beforeEach } from 'vitest';
import { forcedStructuredCall, parseStructureReasoningEffort } from './path-generator-routing';

// L5 arg-spies. Mocking the two provider wrappers + resolveModel lets us assert
// forcedStructuredCall forwards ctx.maxTokens to whichever provider is picked.
// `parseStructureReasoningEffort` (tested below) is a pure fn unaffected by these.
const openRouterSpy = vi.fn(async (_opts: unknown) => ({}) as unknown);
const geminiSpy = vi.fn(async (_opts: unknown) => ({}) as unknown);
const resolveModelSpy = vi.fn();

vi.mock('./path-generator-openrouter', () => ({
  forcedStructuredCallOpenRouter: (opts: unknown) => openRouterSpy(opts),
}));
vi.mock('./path-generator-gemini', () => ({
  forcedStructuredCallGemini: (opts: unknown) => geminiSpy(opts),
}));
vi.mock('./model-routing', () => ({
  resolveModel: (...args: unknown[]) => resolveModelSpy(...args),
}));

const L5_TOOL = { name: 'demo_tool', description: 'd', input_schema: { type: 'object' as const } };
function l5Ctx() {
  return {
    stage: 'quiz' as const,
    corpus: null,
    staticInstructions: 'rules',
    dynamicInstructions: 'tail',
    anthropicTool: L5_TOOL,
    userMessage: 'Generate now.',
    onUsage: () => {},
  };
}

describe('forcedStructuredCall — maxTokens threading (L5)', () => {
  beforeEach(() => {
    openRouterSpy.mockClear();
    geminiSpy.mockClear();
    resolveModelSpy.mockClear();
  });

  it('forwards maxTokens to the OpenRouter wrapper', async () => {
    resolveModelSpy.mockReturnValue({ provider: 'openrouter', model: 'z-ai/glm-4.7-flash' });
    await forcedStructuredCall({ ...l5Ctx(), maxTokens: 4_096 });
    expect(openRouterSpy).toHaveBeenCalledTimes(1);
    expect(openRouterSpy.mock.calls[0][0]).toMatchObject({ maxTokens: 4_096 });
  });

  it('forwards maxTokens as maxOutputTokens to the Gemini wrapper', async () => {
    resolveModelSpy.mockReturnValue({ provider: 'gemini', model: 'gemini-2.5-flash' });
    await forcedStructuredCall({ ...l5Ctx(), maxTokens: 6_000 });
    expect(geminiSpy).toHaveBeenCalledTimes(1);
    expect(geminiSpy.mock.calls[0][0]).toMatchObject({ maxOutputTokens: 6_000 });
  });

  it('omitting maxTokens leaves the wrapper on its own default (undefined)', async () => {
    resolveModelSpy.mockReturnValue({ provider: 'openrouter', model: 'z-ai/glm-4.7-flash' });
    await forcedStructuredCall(l5Ctx());
    expect(openRouterSpy.mock.calls[0][0]).toMatchObject({ maxTokens: undefined });
  });
});

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
