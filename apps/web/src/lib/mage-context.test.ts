import { describe, it, expect } from 'vitest';
import { expandMageContext, type MageOwnershipLookup } from './mage-context';
import { deriveAllowedActions, deriveAssistancePolicy } from './mage-types';

/**
 * A fake ownership lookup backed by a set of "owned" ids. Any id NOT in the set
 * (or that throws) is treated as unauthorized — this is the security-critical
 * path the route relies on to drop other users' ids.
 */
function fakeLookup(owned: Set<string>, throwFor: Set<string> = new Set()): MageOwnershipLookup {
  const check = (id: string) => {
    if (throwFor.has(id)) return Promise.reject(new Error('db down'));
    return Promise.resolve(owned.has(id));
  };
  return {
    ownsNotebook: check,
    ownsPath: check,
    ownsExam: check,
    ownsQuizSet: check,
    ownsPage: check,
    ownsSlot: check,
  };
}

describe('expandMageContext — id authorization', () => {
  it('keeps owned ids and drops unauthorized ones', async () => {
    const lookup = fakeLookup(new Set(['nb-mine', 'path-mine']));
    const resolved = await expandMageContext(
      'user-1',
      {
        type: 'path',
        ids: {
          notebookId: 'nb-mine',
          pathId: 'path-mine',
          examId: 'exam-someone-else',
          quizSetId: 'quiz-someone-else',
        },
      },
      { tier: 'PRO', lookup }
    );

    expect(resolved.ids.notebookId).toBe('nb-mine');
    expect(resolved.ids.pathId).toBe('path-mine');
    // Not owned → dropped entirely.
    expect(resolved.ids.examId).toBeUndefined();
    expect(resolved.ids.quizSetId).toBeUndefined();
  });

  it('drops every id when the user owns none', async () => {
    const lookup = fakeLookup(new Set());
    const resolved = await expandMageContext(
      'user-1',
      { type: 'exam', ids: { examId: 'exam-x', notebookId: 'nb-x', slotId: 'slot-x' } },
      { tier: 'PRO', lookup }
    );
    expect(resolved.ids).toEqual({});
  });

  it('fails closed: a throwing lookup drops the id rather than rejecting', async () => {
    const lookup = fakeLookup(new Set(['ok-page']), new Set(['boom-slot']));
    const resolved = await expandMageContext(
      'user-1',
      { type: 'lesson', ids: { pageId: 'ok-page', slotId: 'boom-slot' } },
      { tier: 'FREE', lookup }
    );
    expect(resolved.ids.pageId).toBe('ok-page');
    expect(resolved.ids.slotId).toBeUndefined();
  });

  it('ignores non-string / empty ids without calling the lookup', async () => {
    const lookup = fakeLookup(new Set());
    const resolved = await expandMageContext(
      'user-1',
      // @ts-expect-error — deliberately malformed client input
      { type: 'global', ids: { notebookId: '', pathId: 42, examId: null } },
      { tier: 'PRO', lookup }
    );
    expect(resolved.ids).toEqual({});
  });
});

describe('expandMageContext — normalization', () => {
  it('coerces an unknown type to "global" and an unknown mode to "quick"', async () => {
    const resolved = await expandMageContext(
      'user-1',
      // @ts-expect-error — unknown type/mode from a stale client
      { type: 'bogus', mode: 'turbo' },
      { tier: 'PRO', lookup: fakeLookup(new Set()) }
    );
    expect(resolved.type).toBe('global');
    expect(resolved.mode).toBe('quick');
  });

  it('caps title and selectedText length and trims them', async () => {
    const resolved = await expandMageContext(
      'user-1',
      { type: 'lesson', title: `  ${'t'.repeat(500)}  `, selectedText: 's'.repeat(9000) },
      { tier: 'PRO', lookup: fakeLookup(new Set()) }
    );
    expect(resolved.title).toHaveLength(200);
    expect(resolved.selectedText).toHaveLength(4000);
  });

  it('defaults a missing context to a plain global turn', async () => {
    const resolved = await expandMageContext('user-1', null, {
      tier: 'PRO',
      lookup: fakeLookup(new Set()),
    });
    expect(resolved.type).toBe('global');
    expect(resolved.ids).toEqual({});
    expect(resolved.mode).toBe('quick');
  });
});

describe('deriveAssistancePolicy', () => {
  it('seals answers in an exam', () => {
    expect(deriveAssistancePolicy('exam')).toBe('no-answers');
  });
  it('is hints-first during practice / a live question', () => {
    expect(deriveAssistancePolicy('practice')).toBe('hints-first');
    expect(deriveAssistancePolicy('quiz-question')).toBe('hints-first');
  });
  it('is full everywhere else', () => {
    for (const t of ['global', 'home', 'lesson', 'path', 'my-path', 'study-pack', 'material', 'quiz-result'] as const) {
      expect(deriveAssistancePolicy(t)).toBe('full');
    }
  });

  it('is enforced server-side by expandMageContext (not client-claimed)', async () => {
    const resolved = await expandMageContext(
      'user-1',
      { type: 'exam', ids: {} },
      { tier: 'PRO', lookup: fakeLookup(new Set()) }
    );
    expect(resolved.assistancePolicy).toBe('no-answers');
  });
});

describe('deriveAllowedActions', () => {
  it('offers navigation for owned ids in context', () => {
    const actions = deriveAllowedActions('path', { pathId: 'p1', slotId: 's1' }, false);
    expect(actions).toContain('OPEN_PATH');
    expect(actions).toContain('OPEN_LESSON');
  });

  it('Pro-gates generation actions', () => {
    const free = deriveAllowedActions('path', { pathId: 'p1' }, false);
    const pro = deriveAllowedActions('path', { pathId: 'p1' }, true);
    expect(free).not.toContain('START_WEAK_TOPIC_SESSION');
    expect(free).not.toContain('CREATE_PRACTICE_SET');
    expect(pro).toContain('START_WEAK_TOPIC_SESSION');
    expect(pro).toContain('CREATE_PRACTICE_SET');
  });

  it('never offers generation while answering a live question', () => {
    const actions = deriveAllowedActions('quiz-question', { quizSetId: 'q1', pathId: 'p1' }, true);
    expect(actions).not.toContain('CREATE_PRACTICE_SET');
    expect(actions).not.toContain('START_WEAK_TOPIC_SESSION');
    expect(actions).toContain('OPEN_QUIZ');
  });

  it('exposes exam edit actions (high-risk, opens prefilled UI) for an owned exam', () => {
    const actions = deriveAllowedActions('exam', { examId: 'e1' }, true);
    expect(actions).toEqual(
      expect.arrayContaining(['OPEN_EXAM', 'EDIT_EXAM_SCOPE', 'CHANGE_EXAM_DATE', 'START_EXAM_SIMULATION'])
    );
  });

  it('always allows creating a new path', () => {
    expect(deriveAllowedActions('global', {}, false)).toContain('CREATE_PATH');
  });
});
