import { describe, it, expect } from 'vitest';
import {
  resolveMageActionCards,
  describeMageActionMenu,
  pickRecommendedActions,
  MAX_ACTION_CARDS,
  type MageActionContext,
} from './mage-actions';

const examCtx: MageActionContext = {
  type: 'exam',
  ids: { examId: 'e1', notebookId: 'nb1' },
};
const pathLessonCtx: MageActionContext = {
  type: 'lesson',
  ids: { pathId: 'p1', slotId: 's1' },
};
const quizCtx: MageActionContext = {
  type: 'quiz-question',
  ids: { notebookId: 'nb1', quizSetId: 'q1' },
};

describe('resolveMageActionCards — href building', () => {
  it('builds authorized deep links for navigation actions', () => {
    const cards = resolveMageActionCards(['OPEN_PATH', 'OPEN_LESSON'], pathLessonCtx);
    expect(cards.map((c) => c.href)).toEqual([
      '/learn/paths/p1',
      '/learn/paths/p1?slot=s1',
    ]);
    // All navigation → low risk, navigate kind, no confirm.
    expect(cards.every((c) => c.risk === 'low' && c.kind === 'navigate' && !c.confirm)).toBe(true);
  });

  it('nests the quiz viewer under its study pack', () => {
    const [card] = resolveMageActionCards(['OPEN_QUIZ'], quizCtx);
    expect(card.href).toBe('/study-packs/nb1/quizzes/q1');
  });

  it('builds the high-risk prefill targets with ?edit=', () => {
    const cards = resolveMageActionCards(['EDIT_EXAM_SCOPE', 'CHANGE_EXAM_DATE', 'CREATE_PATH'], examCtx);
    expect(cards.map((c) => [c.id, c.href, c.risk, c.kind])).toEqual([
      ['EDIT_EXAM_SCOPE', '/exam/e1?edit=scope', 'high', 'prefill'],
      ['CHANGE_EXAM_DATE', '/exam/e1?edit=date', 'high', 'prefill'],
      // Path creation runs through the wizard; needs no context id.
      ['CREATE_PATH', '/study-packs/new', 'high', 'prefill'],
    ]);
  });
});

describe('resolveMageActionCards — dropping dead/unsafe cards', () => {
  it('drops a navigation card whose required ids are missing', () => {
    // OPEN_QUIZ needs BOTH notebookId + quizSetId; a path-bundle quiz has no
    // standalone viewer → no dangling card.
    const cards = resolveMageActionCards(['OPEN_QUIZ'], {
      type: 'quiz-question',
      ids: { quizSetId: 'q1' },
    });
    expect(cards).toEqual([]);
  });

  it('never turns a gate-controlled action into a card', () => {
    const cards = resolveMageActionCards(['REVEAL_ANSWER'], quizCtx, { includeGeneration: true });
    expect(cards).toEqual([]);
  });

  it('de-dups repeated offered ids', () => {
    const cards = resolveMageActionCards(['OPEN_PATH', 'OPEN_PATH'], pathLessonCtx);
    expect(cards).toHaveLength(1);
  });
});

describe('resolveMageActionCards — generation gate (Phase 7 seam)', () => {
  const genCtx: MageActionContext = { type: 'path', ids: { pathId: 'p1', examId: 'e1' } };

  it('excludes medium-risk generation cards by default', () => {
    const cards = resolveMageActionCards(
      ['START_WEAK_TOPIC_SESSION', 'CREATE_PRACTICE_SET', 'START_EXAM_SIMULATION'],
      genCtx,
    );
    expect(cards).toEqual([]);
  });

  it('includes them (with confirm copy, no href) when generation is enabled', () => {
    const cards = resolveMageActionCards(['CREATE_PRACTICE_SET'], genCtx, {
      includeGeneration: true,
    });
    expect(cards).toHaveLength(1);
    const [card] = cards;
    expect(card.risk).toBe('medium');
    expect(card.kind).toBe('generate');
    expect(card.href).toBeUndefined();
    expect(card.confirm?.confirmLabel).toBeTruthy();
  });
});

describe('pickRecommendedActions — server-authoritative validation', () => {
  const offered = resolveMageActionCards(
    ['OPEN_PATH', 'OPEN_EXAM', 'EDIT_EXAM_SCOPE', 'CHANGE_EXAM_DATE', 'CREATE_PATH'],
    { type: 'exam', ids: { pathId: 'p1', examId: 'e1' } },
  );

  it('keeps only offered ids, preserving offered order', () => {
    const picked = pickRecommendedActions(offered, ['CREATE_PATH', 'OPEN_PATH']);
    expect(picked.map((c) => c.id)).toEqual(['OPEN_PATH', 'CREATE_PATH']);
  });

  it('drops ids the server never offered (no fabricated actions)', () => {
    const picked = pickRecommendedActions(offered, ['OPEN_PATH', 'DELETE_EVERYTHING']);
    expect(picked.map((c) => c.id)).toEqual(['OPEN_PATH']);
  });

  it('caps at MAX_ACTION_CARDS', () => {
    const picked = pickRecommendedActions(
      offered,
      offered.map((c) => c.id),
    );
    expect(picked).toHaveLength(MAX_ACTION_CARDS);
    expect(offered.length).toBeGreaterThan(MAX_ACTION_CARDS);
  });

  it('returns nothing for a non-array or empty recommendation', () => {
    expect(pickRecommendedActions(offered, null)).toEqual([]);
    expect(pickRecommendedActions(offered, 'OPEN_PATH')).toEqual([]);
    expect(pickRecommendedActions(offered, [])).toEqual([]);
    expect(pickRecommendedActions([], ['OPEN_PATH'])).toEqual([]);
  });
});

describe('describeMageActionMenu', () => {
  it('is empty when nothing is offered', () => {
    expect(describeMageActionMenu([])).toBe('');
  });

  it('lists each offered id for the model', () => {
    const cards = resolveMageActionCards(['OPEN_PATH', 'EDIT_EXAM_SCOPE'], examCtx);
    const cardsWithPath = resolveMageActionCards(['OPEN_PATH'], pathLessonCtx);
    const menu = describeMageActionMenu([...cardsWithPath, ...cards]);
    expect(menu).toContain('OPEN_PATH');
    expect(menu).toContain('EDIT_EXAM_SCOPE');
    expect(menu).toContain('annotate_answer.actions');
  });
});
