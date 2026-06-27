// onboarding-real-generation P2 — preview generation railings + orchestrator.
//
// The provider seam (`forcedStructuredCall`) is mocked so the whole
// `generatePathPreview` flow runs offline: it proves one corpus → a valid
// PreviewResult (2 questions, bounded nodes) and that validate-and-repair
// recovers from a malformed first pass. The pure railings (corpus cap, repair
// loop, prompt builders) are unit-tested directly.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// db is only touched by best-effort usage logging in the structure path; mock it
// so nothing reaches a real Prisma client.
const mockDb = vi.hoisted(() => ({
  aiUsageEvent: { create: vi.fn().mockResolvedValue({}) },
}));
vi.mock('./db', () => ({ db: mockDb }));

// The single provider seam every stage funnels through.
const routing = vi.hoisted(() => ({ forcedStructuredCall: vi.fn() }));
vi.mock('./path-generator-routing', () => routing);

import {
  generatePathPreview,
  generateWithRepair,
  PreviewGenerationError,
  type PreviewMeta,
} from './path-preview';
import { buildPreviewQuizPrompt, buildPathStructurePrompt } from './path-prompts';
import type { SubjectId } from './path-subjects';

// ── canned model outputs ─────────────────────────────────────────────────────

function cannedStructure() {
  // One section with FIVE learning slots — exceeds the preview cap so the trim +
  // enforceSpacedReviews bounding is exercised.
  return {
    title: 'Intro to SQL',
    description: 'A short tour of relational databases.',
    phases: [
      {
        title: 'Section 1: Tables',
        description: 'How relational data is stored.',
        slots: [1, 2, 3, 4, 5].map((n) => ({
          title: `Concept ${n}`,
          kind: 'learning' as const,
          topicHint: `Teaches concept number ${n}.`,
          objective: `Explain concept ${n}.`,
        })),
      },
    ],
  };
}

function cannedTheory() {
  return {
    title: 'Rows and Records',
    introduction: 'A row is a single record in a table. Each column describes one attribute.',
    keyPoints: ['A row is one record', 'A column is one attribute', 'Tables hold many rows'],
    examples: [{ label: 'Students table', explanation: 'One row is one student; columns are name, age.' }],
    summary: 'Rows are records; columns are fields.',
  };
}

function mcQuestion() {
  return {
    topic: 'Database basics',
    prompt: 'What does a row usually represent?',
    options: [
      { id: 'A', text: 'A single record' },
      { id: 'B', text: 'A column name' },
      { id: 'C', text: 'A password' },
      { id: 'D', text: 'A relationship' },
    ],
    correct: 'A',
    source: 'Your notes · §1',
    hint: 'Think of one item in the table.',
    okBubble: 'Exactly.',
    okWhy: 'A row is one record — e.g. one student.',
    noBubble: 'You mixed up rows and columns.',
    noWhy: 'A row is one record; a column is one attribute.',
  };
}

function trueFalseQuestion() {
  return {
    topic: 'Keys',
    prompt: 'A primary key uniquely identifies a row.',
    options: [
      { id: 'A', text: 'True' },
      { id: 'B', text: 'False' },
    ],
    correct: 'A',
    source: 'Your notes · §2',
    hint: 'Think uniqueness.',
    okBubble: 'Yes.',
    okWhy: 'A primary key is unique per row.',
    noBubble: 'Actually it is true.',
    noWhy: 'Primary keys uniquely identify rows.',
    weakPoint: { title: 'Keys', desc: 'You understood rows, but keys need another look.' },
  };
}

function cannedQuestions() {
  return { questions: [mcQuestion(), trueFalseQuestion()] };
}

type CallCtx = { anthropicTool: { name: string } };

const META: PreviewMeta = { title: 'Intro to SQL', goal: 'pass my exam', language: 'en' };

beforeEach(() => {
  routing.forcedStructuredCall.mockReset();
  mockDb.aiUsageEvent.create.mockClear();
});

// ── orchestrator: one corpus → valid PreviewResult ───────────────────────────

describe('generatePathPreview — happy path', () => {
  beforeEach(() => {
    routing.forcedStructuredCall.mockImplementation(async (ctx: CallCtx) => {
      switch (ctx.anthropicTool.name) {
        case 'create_path_structure':
          return cannedStructure();
        case 'create_theory_section':
          return cannedTheory();
        case 'create_preview_questions':
          return cannedQuestions();
        default:
          throw new Error(`unexpected tool ${ctx.anthropicTool.name}`);
      }
    });
  });

  it('returns structure + lesson + exactly 2 questions from one corpus', async () => {
    const result = await generatePathPreview({ corpus: 'Relational databases store data in tables.', meta: META });

    expect(result.title).toBe('Intro to SQL');
    expect(result.lesson.title).toBe('Rows and Records');
    expect(result.lesson.body.type).toBe('doc');
    expect(result.lesson.text.length).toBeGreaterThan(0);
    expect(result.questions).toHaveLength(2);
  });

  it('bounds the structure to a single short section (trim + spaced-review enforcement)', async () => {
    const { structure } = await generatePathPreview({ corpus: 'x'.repeat(200), meta: META });

    expect(structure.phases).toHaveLength(1);
    const slots = structure.phases[0].slots;
    // 5 raw learning slots → trimmed to 3 → enforce adds 1 review + 1 assessment.
    expect(slots.length).toBeGreaterThanOrEqual(2);
    expect(slots.length).toBeLessThanOrEqual(6);
    expect(slots[slots.length - 1].kind).toBe('assessment');
  });

  it('shapes questions to sample-run shape with the weakPoint pinned to the last only', async () => {
    const { questions } = await generatePathPreview({ corpus: 'notes', meta: META });

    expect(questions.map((q) => q.id)).toEqual(['q1', 'q2']);
    expect(questions[0].weakPoint).toBeUndefined();
    expect(questions[1].weakPoint).toBeDefined();
    for (const q of questions) {
      expect(q.options.some((o) => o.id === q.correct)).toBe(true);
      expect(q.source.length).toBeGreaterThan(0);
      expect(q.okBubble.length).toBeGreaterThan(0);
      expect(q.noWhy.length).toBeGreaterThan(0);
    }
  });

  it('routes every call through the path-preview feature (Sonnet)', async () => {
    await generatePathPreview({ corpus: 'notes', meta: META });
    for (const call of routing.forcedStructuredCall.mock.calls) {
      expect(call[0].featureOverride).toBe('path-preview');
    }
  });
});

// ── validate-and-repair: malformed first pass recovers ───────────────────────

describe('generatePathPreview — validate/repair', () => {
  it('recovers when the first questions response is malformed (one repair retry)', async () => {
    let questionCalls = 0;
    routing.forcedStructuredCall.mockImplementation(async (ctx: CallCtx) => {
      if (ctx.anthropicTool.name === 'create_path_structure') return cannedStructure();
      if (ctx.anthropicTool.name === 'create_theory_section') return cannedTheory();
      // questions: malformed (1 question) first, valid (2) on the repair.
      questionCalls += 1;
      return questionCalls === 1 ? { questions: [mcQuestion()] } : cannedQuestions();
    });

    const { questions } = await generatePathPreview({ corpus: 'notes', meta: META });
    expect(questions).toHaveLength(2);
    expect(questionCalls).toBe(2);
  });

  it('throws PreviewGenerationError when questions never validate', async () => {
    routing.forcedStructuredCall.mockImplementation(async (ctx: CallCtx) => {
      if (ctx.anthropicTool.name === 'create_path_structure') return cannedStructure();
      if (ctx.anthropicTool.name === 'create_theory_section') return cannedTheory();
      return { questions: [mcQuestion()] }; // always wrong count
    });

    await expect(generatePathPreview({ corpus: 'notes', meta: META })).rejects.toBeInstanceOf(
      PreviewGenerationError,
    );
  });
});

// ── generateWithRepair (the shareable railing) ───────────────────────────────

describe('generateWithRepair', () => {
  it('returns on the first valid pass without retrying', async () => {
    const call = vi.fn().mockResolvedValue({ v: 1 });
    const r = await generateWithRepair<number>({
      call,
      parse: (raw) => ({ ok: true, data: (raw as { v: number }).v }),
    });
    expect(r.data).toBe(1);
    expect(r.attempts).toBe(1);
    expect(call).toHaveBeenCalledTimes(1);
  });

  it('feeds the failure summary back and recovers on the repair', async () => {
    const call = vi
      .fn()
      .mockResolvedValueOnce({ bad: true })
      .mockResolvedValueOnce({ good: true });
    const r = await generateWithRepair<string>({
      call,
      parse: (raw) =>
        (raw as Record<string, unknown>).good
          ? { ok: true, data: 'ok' }
          : { ok: false, error: 'missing good' },
    });
    expect(r.data).toBe('ok');
    expect(r.attempts).toBe(2);
    // first call gets null, the repair gets the corrective summary.
    expect(call.mock.calls[0][0]).toBeNull();
    expect(call.mock.calls[1][0]).toBe('missing good');
  });

  it('returns null with the last error after both attempts miss', async () => {
    const call = vi.fn().mockResolvedValue({ bad: true });
    const r = await generateWithRepair<string>({
      call,
      parse: () => ({ ok: false, error: 'nope' }),
    });
    expect(r.data).toBeNull();
    expect(r.lastError).toBe('nope');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('treats a thrown call as a failed attempt and retries once', async () => {
    const call = vi.fn().mockRejectedValueOnce(new Error('429')).mockResolvedValueOnce({ ok: 1 });
    const r = await generateWithRepair<number>({
      call,
      parse: (raw) => ({ ok: true, data: (raw as { ok: number }).ok }),
    });
    expect(r.data).toBe(1);
    expect(call).toHaveBeenCalledTimes(2);
  });
});

// ── preview quiz prompt railings ─────────────────────────────────────────────

describe('buildPreviewQuizPrompt', () => {
  const { system, tail } = buildPreviewQuizPrompt({
    pathTitle: 'Intro to SQL',
    slotTitle: 'Rows',
    slotTopicHint: 'rows are records',
    lessonText: 'A row is one record in a table.',
    sourceLabel: 'Your notes',
    language: 'en',
  });

  it('demands exactly two mc/true_false questions in the sample-run shape', () => {
    expect(system).toContain('EXACTLY 2 questions');
    expect(system).toContain('multiple-choice');
    expect(system).toContain('true/false');
    expect(system).toContain('"questions"');
    expect(system).toContain('"weakPoint"');
    expect(system).toContain('"okBubble"');
  });

  it('pins the diagnostic to the SECOND question only', () => {
    expect(system).toContain('SECOND question MUST include a `weakPoint`');
    expect(system).toContain('FIRST question MUST NOT include `weakPoint`');
  });

  it('carries the lesson text and source label into the tail', () => {
    expect(tail).toContain('A row is one record in a table.');
    expect(tail).toContain('Your notes');
  });
});

// ── structure prompt: preview bounding ───────────────────────────────────────

describe('buildPathStructurePrompt — preview vs full', () => {
  const subjects: SubjectId[] = ['general'];
  const base = { title: 'Intro to SQL', hasSourceMaterials: true, subjects, subjectWeights: [1] };

  it('asks for a single short learning-only section in preview mode', () => {
    const { system } = buildPathStructurePrompt({ ...base, maxNodes: 3 });
    expect(system).toContain('SHORT PREVIEW');
    expect(system).toContain('EXACTLY ONE section');
    expect(system).toContain('Do NOT add `review` or `assessment` slots');
    expect(system).not.toContain('Output 3–6 sections');
  });

  it('keeps the full multi-section guidance when maxNodes is unset', () => {
    const { system } = buildPathStructurePrompt({ ...base });
    expect(system).toContain('Output 3–6 sections');
    expect(system).toContain('spaced repetition');
    expect(system).not.toContain('SHORT PREVIEW');
  });
});
