import { describe, it, expect } from 'vitest';
import {
  deriveExamReadiness,
  PASSIVE_ITEM_WEIGHT,
  type ExamPathReadiness,
  type ExamQuizReadiness,
  type ExamReadinessInput,
} from './exam-readiness';

// Fixture helpers — keep each test's intent obvious by defaulting the noise.
function path(p: Partial<ExamPathReadiness> & { id: string }): ExamPathReadiness {
  return {
    title: `Path ${p.id}`,
    readiness: 0,
    totalCheckpoints: 10,
    doneCheckpoints: 0,
    weakCheckpoints: [],
    ...p,
  };
}

function quiz(q: Partial<ExamQuizReadiness> & { id: string }): ExamQuizReadiness {
  return {
    title: `Quiz ${q.id}`,
    questionCount: 10,
    bestPercentage: null,
    sourcePathId: null,
    ...q,
  };
}

const EMPTY: ExamReadinessInput = { paths: [], quizSets: [], passive: [] };

describe('deriveExamReadiness — empty / passive-only scope', () => {
  it('reports an empty, ungraded, 0% exam when nothing is scoped', () => {
    const r = deriveExamReadiness(EMPTY);
    expect(r.isEmpty).toBe(true);
    expect(r.hasGradedMaterial).toBe(false);
    expect(r.readiness).toBe(0);
    expect(r.items).toHaveLength(0);
    expect(r.weakTopics).toHaveLength(0);
  });

  it('treats passive-only scope as 0% with no graded material', () => {
    const r = deriveExamReadiness({
      paths: [],
      quizSets: [],
      passive: [
        { type: 'page', id: 'pg1', title: 'Chapter 1 notes' },
        { type: 'document', id: 'doc1', title: 'Biology.pdf' },
      ],
    });
    expect(r.isEmpty).toBe(false);
    expect(r.hasGradedMaterial).toBe(false);
    expect(r.readiness).toBe(0);
    expect(r.counts.passive).toBe(2);
    expect(r.items.every((i) => i.passive && i.score === 0)).toBe(true);
  });
});

describe('deriveExamReadiness — never-attempted counts as 0', () => {
  it('scores a never-attempted quiz set at 0 (not excluded)', () => {
    const r = deriveExamReadiness({
      paths: [],
      quizSets: [quiz({ id: 'q1', bestPercentage: null })],
      passive: [],
    });
    expect(r.hasGradedMaterial).toBe(true);
    expect(r.readiness).toBe(0);
    const item = r.items.find((i) => i.id === 'q1')!;
    expect(item.attempted).toBe(false);
    expect(item.score).toBe(0);
    // A never-attempted scoped quiz is a weak topic at 0%.
    expect(r.weakTopics.some((w) => w.source.id === 'q1' && w.pct === 0)).toBe(true);
  });

  it('drags an otherwise-strong exam down via the untouched quiz', () => {
    const r = deriveExamReadiness({
      paths: [],
      quizSets: [
        quiz({ id: 'q1', questionCount: 10, bestPercentage: 100 }),
        quiz({ id: 'q2', questionCount: 10, bestPercentage: null }),
      ],
      passive: [],
    });
    // (100*10 + 0*10) / 20 = 50
    expect(r.readiness).toBe(50);
  });
});

describe('deriveExamReadiness — no double counting', () => {
  it('counts a quiz set scoped both directly AND via its path only once', () => {
    const scopedPath = path({
      id: 'p1',
      readiness: 80,
      totalCheckpoints: 10,
      doneCheckpoints: 8,
    });
    const directQuiz = quiz({
      id: 'q1',
      questionCount: 10,
      bestPercentage: 0,
      sourcePathId: 'p1', // belongs to the scoped path → must be dropped
    });

    const withDup = deriveExamReadiness({ paths: [scopedPath], quizSets: [directQuiz], passive: [] });
    const withoutDup = deriveExamReadiness({ paths: [scopedPath], quizSets: [], passive: [] });

    // The path-owned quiz is dropped, so readiness matches the path-only result.
    expect(withDup.counts.quizSets).toBe(0);
    expect(withDup.items.some((i) => i.id === 'q1')).toBe(false);
    expect(withDup.readiness).toBe(withoutDup.readiness);
    expect(withDup.readiness).toBe(80);
  });

  it('keeps a quiz whose sourcePathId is NOT in scope', () => {
    const r = deriveExamReadiness({
      paths: [path({ id: 'p1', readiness: 80, totalCheckpoints: 10, doneCheckpoints: 8 })],
      quizSets: [quiz({ id: 'q1', bestPercentage: 40, sourcePathId: 'other-path' })],
      passive: [],
    });
    expect(r.counts.quizSets).toBe(1);
    expect(r.items.some((i) => i.id === 'q1')).toBe(true);
  });
});

describe('deriveExamReadiness — weighting', () => {
  it('weights paths by checkpoint count', () => {
    const r = deriveExamReadiness({
      paths: [
        path({ id: 'big', readiness: 90, totalCheckpoints: 30, doneCheckpoints: 27 }),
        path({ id: 'small', readiness: 30, totalCheckpoints: 5, doneCheckpoints: 1 }),
      ],
      quizSets: [],
      passive: [],
    });
    // (90*30 + 30*5) / 35 = 2850/35 = 81.43 → 81
    expect(r.readiness).toBe(81);
  });

  it('passive material nudges but does not dominate graded readiness', () => {
    const graded = deriveExamReadiness({
      paths: [path({ id: 'p1', readiness: 100, totalCheckpoints: 10, doneCheckpoints: 10 })],
      quizSets: [],
      passive: [],
    });
    const withPassive = deriveExamReadiness({
      paths: [path({ id: 'p1', readiness: 100, totalCheckpoints: 10, doneCheckpoints: 10 })],
      quizSets: [],
      passive: [{ type: 'page', id: 'pg1', title: 'Notes' }],
    });
    expect(graded.readiness).toBe(100);
    // (100*10 + 0*PASSIVE_ITEM_WEIGHT) / (10 + PASSIVE_ITEM_WEIGHT)
    const expected = Math.round((100 * 10) / (10 + PASSIVE_ITEM_WEIGHT));
    expect(withPassive.readiness).toBe(expected);
    expect(withPassive.readiness).toBeLessThan(graded.readiness);
  });
});

describe('deriveExamReadiness — weak topics', () => {
  it('aggregates weak path checkpoints + weak quizzes, ascending, capped', () => {
    const r = deriveExamReadiness({
      paths: [
        path({
          id: 'p1',
          readiness: 60,
          totalCheckpoints: 10,
          doneCheckpoints: 6,
          weakCheckpoints: [
            { title: 'Cell Respiration', pct: 41 },
            { title: 'Photosynthesis', pct: 68 },
          ],
        }),
      ],
      quizSets: [
        quiz({ id: 'q1', title: 'Osmosis quiz', bestPercentage: 55 }),
        quiz({ id: 'q2', title: 'Mastered quiz', bestPercentage: 95 }), // above gate → not weak
      ],
      passive: [],
    });
    const titles = r.weakTopics.map((w) => w.title);
    expect(titles).toEqual(['Cell Respiration', 'Osmosis quiz', 'Photosynthesis']);
    expect(titles).not.toContain('Mastered quiz');
    expect(r.weakTopics[0].source).toEqual({ type: 'path', id: 'p1' });
  });
});
