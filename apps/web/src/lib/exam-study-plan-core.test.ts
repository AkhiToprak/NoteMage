import { describe, it, expect } from 'vitest';
import {
  buildPlanCandidates,
  schedulePlanItems,
  assemblePlanView,
  itemHref,
  itemReason,
  isoDayDiff,
  type PlanGenInput,
  type PlanItemRow,
} from './exam-study-plan-core';

function baseInput(over: Partial<PlanGenInput> = {}): PlanGenInput {
  return {
    examId: 'ex1',
    daysUntil: 6,
    readiness: 55,
    hasGradedMaterial: true,
    format: 'written',
    primaryPathId: 'p1',
    primaryPathTitle: 'JS Core',
    slots: [
      { id: 's1', title: 'Closures', kind: 'learning', completed: false, unlocked: true, bestPercentage: 40, activities: [{ id: 'a1', kind: 'theory', title: 't', completed: false, quizSetId: null, flashcardSetId: null, theoryId: 'th1' }] },
      { id: 's2', title: 'Promises', kind: 'learning', completed: false, unlocked: true, bestPercentage: null, activities: [{ id: 'a2', kind: 'flashcards', title: 'f', completed: false, quizSetId: null, flashcardSetId: 'fs1', theoryId: null }] },
      { id: 's3', title: 'Done node', kind: 'learning', completed: true, unlocked: true, bestPercentage: 90, activities: [] },
      { id: 's4', title: 'Generators', kind: 'learning', completed: false, unlocked: true, bestPercentage: null, activities: [{ id: 'a4', kind: 'theory', title: 't', completed: false, quizSetId: null, flashcardSetId: null, theoryId: 'th4' }] },
    ],
    weakAreas: [
      { title: 'Closures', mastery: 40, band: 'urgent', impactPoints: 8, sourceType: 'path', sourceId: 'p1' },
      { title: 'Event loop', mastery: 62, band: 'needs_practice', impactPoints: 4, sourceType: 'quiz_set', sourceId: 'q1' },
    ],
    ...over,
  };
}

describe('buildPlanCandidates', () => {
  it('front-loads weak topics, matches path weak topics to their slot, and never invents readinessDelta', () => {
    const cs = buildPlanCandidates(baseInput());
    // Weak topics come first.
    expect(cs[0].title).toBe('Closures');
    expect(cs[0].weakPoint).toBe(true);
    expect(cs[0].urgency).toBe(3);
    expect(cs[0].kind).toBe('quiz');
    // Path-sourced weak topic matched its slot → deep-link to the mission.
    expect(cs[0].refType).toBe('slot');
    expect(cs[0].refId).toBe('s1');
    expect(cs[0].href).toBe('/exam/ex1/mission/s1');
    expect(cs[0].readinessDelta).toBe(8);

    // Quiz-sourced weak topic has no slot match → weak-areas board, no delta col link.
    const eventLoop = cs.find((c) => c.title === 'Event loop')!;
    expect(eventLoop.refType).toBeNull();
    expect(eventLoop.href).toBe('/exam/ex1/weak-areas');
    expect(eventLoop.kind).toBe('review');
  });

  it('adds a fresh slot, a mock, and a final-revision; skips completed + already-weak slots', () => {
    const cs = buildPlanCandidates(baseInput());
    const titles = cs.map((c) => c.title);
    expect(titles).toContain('Promises'); // fresh, not weak
    expect(cs.find((c) => c.title === 'Promises')!.kind).toBe('flashcards');
    expect(titles).not.toContain('Done node'); // completed
    expect(cs.filter((c) => c.title === 'Closures').length).toBe(1); // weak, not re-added as fresh
    expect(cs.some((c) => c.kind === 'mock')).toBe(true);
    expect(cs.some((c) => c.kind === 'final_revision')).toBe(true);
  });

  it('omits the mock when there is no graded material or the exam is imminent', () => {
    expect(buildPlanCandidates(baseInput({ hasGradedMaterial: false })).some((c) => c.kind === 'mock')).toBe(false);
    expect(buildPlanCandidates(baseInput({ daysUntil: 1 })).some((c) => c.kind === 'mock')).toBe(false);
  });

  it('returns nothing when there is no scoped material at all', () => {
    expect(buildPlanCandidates(baseInput({ slots: [], weakAreas: [], hasGradedMaterial: false })).length).toBe(0);
  });
});

describe('schedulePlanItems', () => {
  it('packs weak items onto today, reserves the mock + final revision for the end, drops nothing', () => {
    const cs = buildPlanCandidates(baseInput());
    const ordered = [...cs].sort((a, b) => b.priority - a.priority);
    const scheduled = schedulePlanItems(ordered, { daysUntil: 6, dailyMinutesTarget: 30 });

    expect(scheduled.length).toBe(ordered.length); // nothing dropped
    // The most urgent weak topic lands on today.
    const closures = scheduled.find((s) => s.title === 'Closures')!;
    expect(closures.dayOffset).toBe(0);
    // Final revision is the last study day; the mock sits before it.
    const final = scheduled.find((s) => s.kind === 'final_revision')!;
    const mock = scheduled.find((s) => s.kind === 'mock')!;
    expect(final.dayOffset).toBe(5);
    expect(mock.dayOffset).toBeLessThan(final.dayOffset);
  });

  it('collapses everything onto today when the exam is today', () => {
    const cs = buildPlanCandidates(baseInput({ daysUntil: 0, hasGradedMaterial: true }));
    const scheduled = schedulePlanItems(cs, { daysUntil: 0, dailyMinutesTarget: 40 });
    expect(scheduled.every((s) => s.dayOffset === 0)).toBe(true);
  });
});

describe('itemHref / itemReason', () => {
  it('routes by ref + kind', () => {
    expect(itemHref('e', 'theory', 'slot', 's9')).toBe('/exam/e/mission/s9');
    expect(itemHref('e', 'mock', 'mock', null)).toBe('/exam/e/mock');
    expect(itemHref('e', 'final_revision', null, null)).toBe('/exam/e');
    expect(itemHref('e', 'quiz', null, null)).toBe('/exam/e/weak-areas');
  });
  it('writes honest, urgency-aware reasons with no fabricated numbers', () => {
    expect(itemReason('quiz', true, 3)).toMatch(/lowest-readiness/i);
    expect(itemReason('theory', false, null)).toMatch(/foundation/i);
    expect(itemReason('quiz', true, 3)).not.toMatch(/\d/); // no invented %
  });
});

describe('isoDayDiff', () => {
  it('counts whole days, sign-aware', () => {
    expect(isoDayDiff('2026-06-25', '2026-06-25')).toBe(0);
    expect(isoDayDiff('2026-06-25', '2026-06-28')).toBe(3);
    expect(isoDayDiff('2026-06-25', '2026-06-24')).toBe(-1);
  });
});

describe('assemblePlanView', () => {
  const rows: PlanItemRow[] = [
    { id: 'i1', kind: 'quiz', title: 'A', estMinutes: 14, status: 'done', weakPoint: true, urgency: 3, readinessDelta: 8, refType: 'slot', refId: 's1', scheduledDate: '2026-06-25', sortOrder: 0 },
    { id: 'i2', kind: 'theory', title: 'B', estMinutes: 12, status: 'not_started', weakPoint: false, urgency: null, readinessDelta: null, refType: 'slot', refId: 's2', scheduledDate: '2026-06-25', sortOrder: 1 },
    { id: 'i3', kind: 'final_revision', title: 'C', estMinutes: 30, status: 'not_started', weakPoint: false, urgency: null, readinessDelta: null, refType: null, refId: null, scheduledDate: '2026-06-30', sortOrder: 0 },
  ];

  it('groups by day, computes status + today + counts + milestones', () => {
    const view = assemblePlanView({
      examId: 'ex1',
      planId: 'pl1',
      generatedAt: '2026-06-25T00:00:00.000Z',
      horizonDays: 6,
      dailyMinutesTarget: 30,
      rationale: 'why',
      byMage: true,
      examTitle: 'Final',
      examDate: '2026-07-01T09:00:00.000Z',
      daysUntil: 6,
      readiness: 55,
      primaryPathTitle: 'JS Core',
      items: rows,
      todayIso: '2026-06-25',
    });

    expect(view.days.length).toBe(2);
    expect(view.days[0].dayOffset).toBe(0);
    expect(view.days[0].status).toBe('today');
    expect(view.days[0].items.length).toBe(2);
    expect(view.days[0].totalMinutes).toBe(26);
    expect(view.today.length).toBe(2);
    expect(view.counts).toEqual({ total: 3, done: 1 });
    // Derived hrefs/reasons hydrate from stored fields.
    expect(view.today[0].href).toBe('/exam/ex1/mission/s1');
    // Milestones include a today node and an exam-day terminal.
    expect(view.milestones[0].status).toBe('today');
    expect(view.milestones[view.milestones.length - 1].status).toBe('exam');
  });
});
