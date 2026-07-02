import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SerializedPath, SerializedPathSlot } from '@/lib/path-loader';

const mocks = vi.hoisted(() => ({
  db: {
    studyPlan: { count: vi.fn() },
    studyMinute: { count: vi.fn() },
    weaknessNudgeLog: { findFirst: vi.fn() },
  },
  loadPathsForUser: vi.fn(),
  serializePath: vi.fn((path: SerializedPath) => path),
  cacheGetOrSet: vi.fn(),
  cacheDel: vi.fn(),
  weaknessTrainingUiEnabled: vi.fn(),
  flashcardReviewQueueEnabled: vi.fn(),
  loadConceptWeakAreaRows: vi.fn(),
  countDueFlashcards: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@/lib/path-loader', () => ({
  CANCELLING_STATUS: 'cancelling',
  loadPathsForUser: mocks.loadPathsForUser,
  serializePath: mocks.serializePath,
}));
vi.mock('@/lib/redis-cache', () => ({
  cacheGetOrSet: mocks.cacheGetOrSet,
  cacheDel: mocks.cacheDel,
}));
vi.mock('@/lib/feature-flags', () => ({
  weaknessTrainingUiEnabled: mocks.weaknessTrainingUiEnabled,
  flashcardReviewQueueEnabled: mocks.flashcardReviewQueueEnabled,
}));
vi.mock('@/lib/concept-weak-areas-loader', () => ({
  loadConceptWeakAreaRows: mocks.loadConceptWeakAreaRows,
}));
vi.mock('@/lib/flashcard-review-queue', () => ({
  countDueFlashcards: mocks.countDueFlashcards,
}));

import { deriveDashboardDataFromPaths, getDashboardData } from './dashboard-data';

function activity(id: string, kind: string, completed: boolean) {
  return {
    id,
    kind,
    title: kind,
    sortOrder: 0,
    completed,
    theoryId: kind === 'theory' ? `${id}-theory` : null,
    flashcardSetId: kind === 'flashcards' ? `${id}-cards` : null,
    quizSetId: kind === 'quiz' ? `${id}-quiz` : null,
  };
}

function slot(overrides: Partial<SerializedPathSlot> & Pick<SerializedPathSlot, 'id' | 'kind' | 'completed'>): SerializedPathSlot {
  return {
    title: overrides.id,
    description: null,
    sortOrder: 0,
    starsEarned: 0,
    bestPercentage: null,
    prerequisiteSlotIds: [],
    unlocked: true,
    incompleteGeneration: false,
    generating: false,
    prunedActivityKinds: [],
    isActive: false,
    activities: [],
    ...overrides,
  };
}

function path(overrides: Partial<SerializedPath> = {}): SerializedPath {
  return {
    id: 'path-1',
    title: 'Biology sprint',
    description: null,
    notebookId: 'nb-1',
    notebookTitle: 'Biology',
    notebookColor: null,
    notebookKind: null,
    contextNotebookIds: [],
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    endDate: new Date('2026-01-31T00:00:00.000Z'),
    source: 'ai',
    ultra: false,
    language: 'en',
    generationStatus: 'ready',
    generationError: null,
    updatedAt: '2026-01-02T00:00:00.000Z',
    generationMode: null,
    subjects: ['biology'],
    subjectWeights: [1],
    phases: [
      {
        id: 'phase-1',
        title: 'Cell basics',
        description: null,
        sortOrder: 0,
        status: 'active',
        gateStrategy: 'checkpoint',
        unlocked: true,
        slots: [
          slot({
            id: 'slot-1',
            title: 'Read cells',
            kind: 'learning',
            completed: true,
            activities: [activity('a1', 'theory', true), activity('a2', 'flashcards', true)],
          }),
          slot({
            id: 'slot-2',
            title: 'Practice organelles',
            kind: 'learning',
            completed: false,
            activities: [activity('a3', 'theory', false), activity('a4', 'flashcards', false)],
          }),
          slot({
            id: 'slot-3',
            title: 'Cells checkpoint',
            kind: 'assessment',
            completed: false,
            activities: [activity('a5', 'quiz', false)],
          }),
        ],
      },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cacheGetOrSet.mockImplementation((_key: string, _ttl: number, load: () => Promise<unknown>) => load());
  mocks.weaknessTrainingUiEnabled.mockReturnValue(false);
  mocks.flashcardReviewQueueEnabled.mockReturnValue(false);
  mocks.db.weaknessNudgeLog.findFirst.mockResolvedValue(null);
});

describe('deriveDashboardDataFromPaths', () => {
  it('returns an empty dashboard when there are no usable paths', () => {
    expect(deriveDashboardDataFromPaths([], false)).toEqual({
      hasUsablePath: false,
      studiedToday: false,
      active: null,
      conceptWeakSpots: null,
      dueFlashcards: null,
      nudgeState: null,
    });
  });

  it('derives the active path cockpit fields from the current path tree', () => {
    const data = deriveDashboardDataFromPaths([path()], true);

    expect(data.studiedToday).toBe(true);
    expect(data.active).toMatchObject({
      id: 'path-1',
      title: 'Biology sprint',
      sourceLabel: 'From Biology',
      notebookTitle: 'Biology',
      subjects: ['biology'],
      units: 1,
      lessons: 5,
      pathCount: 1,
      stats: {
        progressPct: 33,
        doneCheckpoints: 1,
        totalCheckpoints: 3,
        weakTopicName: 'Cell basics',
        weakTopicCount: 0,
      },
      nextSlot: {
        id: 'slot-2',
        title: 'Practice organelles',
        kind: 'learning',
        href: '/learn/paths/path-1?slot=slot-2',
        ctaLabel: 'Continue studying',
      },
      checkpoint: {
        title: 'Cells checkpoint',
        lessonsUntil: 1,
      },
      askTopic: 'Practice organelles',
    });
  });

  it('leaves nextSlot null for a completed path so the page renders Review path', () => {
    const completed = path({
      phases: [
        {
          id: 'phase-1',
          title: 'Complete',
          description: null,
          sortOrder: 0,
          status: 'active',
          gateStrategy: 'checkpoint',
          unlocked: true,
          slots: [
            slot({
              id: 'slot-1',
              kind: 'assessment',
              title: 'Final checkpoint',
              completed: true,
              starsEarned: 3,
              bestPercentage: 98,
              activities: [activity('a1', 'quiz', true)],
            }),
          ],
        },
      ],
    });

    const data = deriveDashboardDataFromPaths([completed], false);

    expect(data.active?.stats.progressPct).toBe(100);
    expect(data.active?.nextSlot).toBeNull();
    expect(data.active?.checkpoint).toBeNull();
  });
});

describe('getDashboardData', () => {
  it('uses the cache when there is no active path work', async () => {
    let cached: unknown;
    mocks.cacheGetOrSet.mockImplementation(async (_key: string, _ttl: number, load: () => Promise<unknown>) => {
      cached ??= await load();
      return cached;
    });
    mocks.db.studyPlan.count.mockResolvedValue(0);
    mocks.db.studyMinute.count.mockResolvedValue(1);
    mocks.loadPathsForUser.mockResolvedValue([path()]);

    await getDashboardData('user-1');
    await getDashboardData('user-1');

    expect(mocks.cacheGetOrSet).toHaveBeenCalledTimes(2);
    expect(mocks.loadPathsForUser).toHaveBeenCalledTimes(1);
  });

  it('bypasses Redis when a path is generating or translating', async () => {
    mocks.db.studyPlan.count.mockResolvedValue(1);
    mocks.db.studyMinute.count.mockResolvedValue(0);
    mocks.loadPathsForUser.mockResolvedValue([path({ generationStatus: 'generating' })]);

    await getDashboardData('user-1');

    expect(mocks.cacheGetOrSet).not.toHaveBeenCalled();
    expect(mocks.loadPathsForUser).toHaveBeenCalledTimes(1);
  });
});

// ─── nudgeState (Weakness Training Phase 4.4b, plan §14.4 rung 1, §14.8) ──

describe('getDashboardData — nudgeState', () => {
  beforeEach(() => {
    mocks.db.studyPlan.count.mockResolvedValue(1); // bypass Redis cache path
    mocks.db.studyMinute.count.mockResolvedValue(0);
    mocks.loadPathsForUser.mockResolvedValue([path()]);
  });

  it('is null when the weakness UI flag is off, even with an unresolved row present', async () => {
    mocks.weaknessTrainingUiEnabled.mockReturnValue(false);
    mocks.db.weaknessNudgeLog.findFirst.mockResolvedValue({
      state: 'escalated',
      conceptIds: ['c1', 'c2'],
    });

    const data = await getDashboardData('user-1');

    expect(data.nudgeState).toBeNull();
    expect(mocks.db.weaknessNudgeLog.findFirst).not.toHaveBeenCalled();
  });

  it('is null when the flag is on but there is no unresolved in-app row', async () => {
    mocks.weaknessTrainingUiEnabled.mockReturnValue(true);
    mocks.loadConceptWeakAreaRows.mockResolvedValue([]);
    mocks.db.weaknessNudgeLog.findFirst.mockResolvedValue(null);

    const data = await getDashboardData('user-1');

    expect(data.nudgeState).toBeNull();
    expect(mocks.db.weaknessNudgeLog.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', channel: 'in_app', state: { in: ['nudged', 'escalated'] } },
      }),
    );
  });

  it('populates { escalated: false, badgeCount } for a nudged row', async () => {
    mocks.weaknessTrainingUiEnabled.mockReturnValue(true);
    mocks.loadConceptWeakAreaRows.mockResolvedValue([]);
    mocks.db.weaknessNudgeLog.findFirst.mockResolvedValue({
      state: 'nudged',
      conceptIds: ['c1', 'c2', 'c3'],
    });

    const data = await getDashboardData('user-1');

    expect(data.nudgeState).toEqual({ escalated: false, badgeCount: 3 });
  });

  it('populates { escalated: true, badgeCount } for an escalated row', async () => {
    mocks.weaknessTrainingUiEnabled.mockReturnValue(true);
    mocks.loadConceptWeakAreaRows.mockResolvedValue([]);
    mocks.db.weaknessNudgeLog.findFirst.mockResolvedValue({
      state: 'escalated',
      conceptIds: ['c1'],
    });

    const data = await getDashboardData('user-1');

    expect(data.nudgeState).toEqual({ escalated: true, badgeCount: 1 });
  });

  it('caps badgeCount at 9', async () => {
    mocks.weaknessTrainingUiEnabled.mockReturnValue(true);
    mocks.loadConceptWeakAreaRows.mockResolvedValue([]);
    mocks.db.weaknessNudgeLog.findFirst.mockResolvedValue({
      state: 'nudged',
      conceptIds: Array.from({ length: 12 }, (_, i) => `c${i}`),
    });

    const data = await getDashboardData('user-1');

    expect(data.nudgeState).toEqual({ escalated: false, badgeCount: 9 });
  });
});

// ─── negative: this feature never triggers a takeover ────────────────────
//
// §14.4's rule ("full-screen takeovers stay reserved for streak/cosmetic
// milestones") extends to the nudge escalation tile — a corrective nudge as
// a takeover reads punitive. This module has no rendering surface of its
// own, so the guarantee is structural: `nudgeState` is a plain data shape
// (no component, no import of any Takeover module) and the source text
// contains no reference to a takeover component.
describe('dashboard-data.ts — no takeover import (4.4b negative test)', () => {
  it('the module source never imports or references a Takeover component', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    const source = await fs.readFile(path.join(__dirname, 'dashboard-data.ts'), 'utf-8');
    expect(source).not.toMatch(/takeover/i);
  });
});
