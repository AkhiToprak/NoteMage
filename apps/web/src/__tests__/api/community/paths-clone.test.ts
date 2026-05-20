// Integration tests for POST /api/community/paths/[shareId]/clone (P9).
//
// Strategy mirrors paths-detail.test.ts: mock the auth + db boundaries
// and assert the route handler's contract.
//
// AC mapping (P0 spec §2.3 + §4.6):
//   - AC-Clone-1: auth required (401) + path must be approved (404).
//   - AC-Clone-2: deep-copy of plan + phases + slots + activities +
//     theory/flashcards/quizzes — fresh IDs (verified via the nested-
//     create shape; Prisma allocates the cuids).
//   - AC-Clone-3: progress reset on every cloned row.
//   - AC-Clone-4: clonedFromSharedPathId set on the new StudyPlan.
//   - AC-Clone-5: idempotency — re-cloning returns the existing planId
//     with `alreadyCloned: true` and DOES NOT re-copy or re-increment.
//   - AC-Clone-6: downloadCount increment lives inside the same
//     transaction as the StudyPlan insert.
//   - AC-Clone-7: edits to the original (post-publish) don't flow into
//     existing clones — covered structurally because the clone takes a
//     forensic copy at clone time, not a live reference. Asserted by
//     verifying the nested-create payload carries copied values, not
//     references / FKs back to the source plan's IDs.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  getAuthUserId: vi.fn(),
  dbMock: {
    sharedPath: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    studyPlan: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock('@/lib/auth', () => ({ getAuthUserId: mocks.getAuthUserId }));
vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));

import { POST } from '../../../../app/api/community/paths/[shareId]/clone/route';

const callPost = (shareId: string) => {
  const req = new NextRequest(
    `http://localhost/api/community/paths/${shareId}/clone`,
    { method: 'POST' },
  );
  return POST(req, { params: Promise.resolve({ shareId }) });
};

// A minimal but structurally-complete source SharedPath / plan graph.
// Carries exactly one of each activity kind (theory / flashcards /
// quiz) so the deep-copy branches are all exercised by the default
// happy-path test. Individual tests can override branches by mutating
// a deep-clone of this fixture.
function buildSourceFixture() {
  return {
    id: 'shp-1',
    moderationStatus: 'approved' as const,
    language: 'en',
    subjects: ['coding', 'general'],
    title: 'Source path',
    description: 'Source description',
    plan: {
      title: 'Source plan',
      description: 'Source plan description',
      phases: [
        {
          title: 'Phase 1',
          description: 'P1 desc',
          sortOrder: 0,
          gateStrategy: 'open' as const,
          slots: [
            {
              title: 'Slot 1 — theory',
              description: 'S1 desc',
              kind: 'learning',
              sortOrder: 0,
              prerequisiteSlotIds: ['some-source-slot-id'],
              activities: [
                {
                  kind: 'theory',
                  title: 'Theory activity',
                  sortOrder: 0,
                  theory: {
                    title: 'Theory body title',
                    body: { type: 'doc', content: [] },
                  },
                  flashcardSet: null,
                  quizSet: null,
                },
              ],
            },
            {
              title: 'Slot 2 — flashcards',
              description: null,
              kind: 'review',
              sortOrder: 1,
              prerequisiteSlotIds: [],
              activities: [
                {
                  kind: 'flashcards',
                  title: 'Cards activity',
                  sortOrder: 0,
                  theory: null,
                  flashcardSet: {
                    title: 'Cards set',
                    source: 'ai',
                    flashcards: [
                      {
                        question: 'Q1',
                        answer: 'A1',
                        sortOrder: 0,
                        images: [
                          {
                            side: 'front',
                            fileName: 'cover.png',
                            filePath: '/uploads/cover.png',
                            fileSize: 1234,
                            mimeType: 'image/png',
                            sortOrder: 0,
                          },
                        ],
                      },
                      {
                        question: 'Q2',
                        answer: 'A2',
                        sortOrder: 1,
                        images: [],
                      },
                    ],
                  },
                  quizSet: null,
                },
              ],
            },
            {
              title: 'Slot 3 — quiz',
              description: null,
              kind: 'assessment',
              sortOrder: 2,
              prerequisiteSlotIds: [],
              activities: [
                {
                  kind: 'quiz',
                  title: 'Quiz activity',
                  sortOrder: 0,
                  theory: null,
                  flashcardSet: null,
                  quizSet: {
                    title: 'Quiz set',
                    questions: [
                      {
                        kind: 'mc' as const,
                        payload: null,
                        question: 'What is 2+2?',
                        options: ['3', '4', '5', '6'],
                        correctIndex: 1,
                        hint: 'arithmetic',
                        correctExplanation: 'right',
                        wrongExplanation: 'nope',
                        sortOrder: 0,
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------
// AC-Clone-1 — auth + existence-leak guards
// ---------------------------------------------------------------------

describe('POST /api/community/paths/[shareId]/clone — auth (AC-Clone-1)', () => {
  it('returns 401 when the requester is unauthenticated', async () => {
    mocks.getAuthUserId.mockResolvedValueOnce(null);

    const res = await callPost('shp-1');

    expect(res.status).toBe(401);
    // The route MUST NOT have touched the DB on a non-auth request.
    expect(mocks.dbMock.sharedPath.findUnique).not.toHaveBeenCalled();
    expect(mocks.dbMock.studyPlan.findFirst).not.toHaveBeenCalled();
    expect(mocks.dbMock.$transaction).not.toHaveBeenCalled();
  });

  it('returns 404 when the SharedPath does not exist', async () => {
    mocks.getAuthUserId.mockResolvedValueOnce('user-1');
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(null);

    const res = await callPost('missing');

    expect(res.status).toBe(404);
    expect(mocks.dbMock.studyPlan.findFirst).not.toHaveBeenCalled();
    expect(mocks.dbMock.$transaction).not.toHaveBeenCalled();
  });

  it.each([
    'pending',
    'auditing_l2',
    'auditing_l3',
    'flagged_pending_human',
    'rejected',
  ])(
    'returns 404 for non-approved status %s (existence-leak guard)',
    async (status) => {
      mocks.getAuthUserId.mockResolvedValueOnce('user-1');
      mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce({
        id: 'shp-x',
        moderationStatus: status,
      });

      const res = await callPost('shp-x');

      expect(res.status).toBe(404);
      // No transaction, no clone-lookup — same shape as the never-
      // existed branch above. The 404 must not narrow timing.
      expect(mocks.dbMock.studyPlan.findFirst).not.toHaveBeenCalled();
      expect(mocks.dbMock.$transaction).not.toHaveBeenCalled();
    },
  );
});

// ---------------------------------------------------------------------
// AC-Clone-5 — idempotency on existing clone
// ---------------------------------------------------------------------

describe('POST /api/community/paths/[shareId]/clone — idempotency (AC-Clone-5)', () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue('user-1');
    mocks.dbMock.sharedPath.findUnique.mockResolvedValue({
      id: 'shp-1',
      moderationStatus: 'approved',
    });
  });

  it('returns the existing planId with alreadyCloned=true and DOES NOT re-clone', async () => {
    mocks.dbMock.studyPlan.findFirst.mockResolvedValueOnce({ id: 'plan-existing' });

    const res = await callPost('shp-1');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { planId: 'plan-existing', alreadyCloned: true },
    });
    // AC-Clone-6 — no transaction, no downloadCount increment on the
    // idempotent retry. A naive implementation that always increments
    // would fail this assertion.
    expect(mocks.dbMock.$transaction).not.toHaveBeenCalled();
    expect(mocks.dbMock.sharedPath.update).not.toHaveBeenCalled();
  });

  it('queries existing clones with (userId, clonedFromSharedPathId)', async () => {
    mocks.dbMock.studyPlan.findFirst.mockResolvedValueOnce({ id: 'plan-existing' });

    await callPost('shp-1');

    expect(mocks.dbMock.studyPlan.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1', clonedFromSharedPathId: 'shp-1' },
      }),
    );
  });
});

// ---------------------------------------------------------------------
// AC-Clone-2 + AC-Clone-3 + AC-Clone-4 + AC-Clone-6 — happy-path deep
// copy + progress reset + analytics anchor + transactional increment
// ---------------------------------------------------------------------

describe('POST /api/community/paths/[shareId]/clone — first clone (AC-Clone-2/3/4/6)', () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue('user-1');
    // First call: pre-check existence + approved.
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce({
      id: 'shp-1',
      moderationStatus: 'approved',
    });
    // No existing clone on the pre-check path.
    mocks.dbMock.studyPlan.findFirst.mockResolvedValueOnce(null);
    // Second findUnique call: the full source snapshot for the deep-
    // copy. Carries the canonical theory + flashcards + quiz mix.
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(buildSourceFixture());
    // $transaction(async (tx) => ...) — execute the callback against a
    // tx-shaped mock that hands back deterministic IDs. The route
    // returns the result of the callback.
    mocks.dbMock.$transaction.mockImplementation(
      async (callback: (tx: typeof mocks.dbMock) => Promise<unknown>) => {
        const tx = {
          ...mocks.dbMock,
          studyPlan: {
            ...mocks.dbMock.studyPlan,
            // Fresh: no race-clone exists when the in-tx check fires.
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: 'plan-new' }),
          },
          sharedPath: {
            ...mocks.dbMock.sharedPath,
            update: vi.fn().mockResolvedValue({ id: 'shp-1' }),
          },
        };
        return callback(tx);
      },
    );
  });

  it('returns 200 with the new planId + alreadyCloned=false', async () => {
    const res = await callPost('shp-1');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { planId: 'plan-new', alreadyCloned: false },
    });
  });

  it('opens a single transaction wrapping the create + downloadCount increment (AC-Clone-6)', async () => {
    await callPost('shp-1');

    expect(mocks.dbMock.$transaction).toHaveBeenCalledTimes(1);
    // The route MUST NOT call sharedPath.update outside the
    // transaction — the +1 lives strictly inside the tx so a rollback
    // doesn't leak it.
    expect(mocks.dbMock.sharedPath.update).not.toHaveBeenCalled();
  });

  it('passes a sensible timeout to the interactive transaction (large clones)', async () => {
    await callPost('shp-1');

    // Second arg to $transaction is the options bag.
    const opts = mocks.dbMock.$transaction.mock.calls[0][1];
    expect(opts).toEqual(expect.objectContaining({ timeout: expect.any(Number) }));
    expect(opts.timeout).toBeGreaterThanOrEqual(15_000);
  });

  it('writes a deep-copy whose StudyPlan carries clonedFromSharedPathId + cloner userId (AC-Clone-4)', async () => {
    let createPayload: Parameters<typeof mocks.dbMock.studyPlan.create>[0] | null = null;
    mocks.dbMock.$transaction.mockImplementationOnce(
      async (callback: (tx: typeof mocks.dbMock) => Promise<unknown>) => {
        const tx = {
          ...mocks.dbMock,
          studyPlan: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn((args) => {
              createPayload = args;
              return Promise.resolve({ id: 'plan-new' });
            }),
          },
          sharedPath: {
            ...mocks.dbMock.sharedPath,
            update: vi.fn().mockResolvedValue({ id: 'shp-1' }),
          },
        };
        return callback(tx);
      },
    );

    await callPost('shp-1');

    expect(createPayload).not.toBeNull();
    const data = createPayload!.data;
    expect(data.userId).toBe('user-1');
    expect(data.clonedFromSharedPathId).toBe('shp-1');
    // AC-Clone-7 — the SharedPath's language + subjects snapshot is
    // copied onto the new plan; nothing references the source plan or
    // SharedPath IDs (other than the analytics anchor). Edits to the
    // original SharedPath after this commit do not flow into this
    // cloned plan because the values are forensic.
    expect(data.language).toBe('en');
    expect(data.subjects).toEqual(['coding', 'general']);
    expect(data.source).toBe('manual');
    expect(data.generationStatus).toBe('ready');
  });

  it('deep-copies phases + slots + activities with the source content (AC-Clone-2)', async () => {
    let createPayload: Parameters<typeof mocks.dbMock.studyPlan.create>[0] | null = null;
    mocks.dbMock.$transaction.mockImplementationOnce(
      async (callback: (tx: typeof mocks.dbMock) => Promise<unknown>) => {
        const tx = {
          ...mocks.dbMock,
          studyPlan: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn((args) => {
              createPayload = args;
              return Promise.resolve({ id: 'plan-new' });
            }),
          },
          sharedPath: {
            ...mocks.dbMock.sharedPath,
            update: vi.fn().mockResolvedValue({ id: 'shp-1' }),
          },
        };
        return callback(tx);
      },
    );

    await callPost('shp-1');

    const phases = createPayload!.data.phases.create;
    expect(phases).toHaveLength(1);

    const slots = phases[0].slots.create;
    expect(slots).toHaveLength(3);
    expect(slots.map((s: { title: string }) => s.title)).toEqual([
      'Slot 1 — theory',
      'Slot 2 — flashcards',
      'Slot 3 — quiz',
    ]);

    // Slot kinds carry through verbatim — learning / review /
    // assessment slot-kind composition rule survives the clone.
    expect(slots.map((s: { kind: string }) => s.kind)).toEqual([
      'learning',
      'review',
      'assessment',
    ]);

    // AC-Clone-3 — slot-level progress is reset.
    for (const slot of slots) {
      expect(slot.starsEarned).toBe(0);
      expect(slot.bestPercentage).toBeNull();
      // Cross-plan FK references (prereq slot IDs from the SOURCE plan)
      // would dangle on the clone — the route clears them.
      expect(slot.prerequisiteSlotIds).toEqual([]);
    }

    // Activity branches —
    const theoryActivity = slots[0].activities.create[0];
    expect(theoryActivity.kind).toBe('theory');
    expect(theoryActivity.completed).toBe(false);
    expect(theoryActivity.completedAt).toBeNull();
    expect(theoryActivity.theory).toEqual({
      create: { title: 'Theory body title', body: { type: 'doc', content: [] } },
    });
    expect(theoryActivity.flashcardSet).toBeUndefined();
    expect(theoryActivity.quizSet).toBeUndefined();

    const cardsActivity = slots[1].activities.create[0];
    expect(cardsActivity.kind).toBe('flashcards');
    expect(cardsActivity.flashcardSet.create.userId).toBe('user-1');
    expect(cardsActivity.flashcardSet.create.title).toBe('Cards set');
    // Cloned content surfaces as user-curated regardless of the
    // original "ai" source — keeps it out of AI-quota and cohort
    // filters.
    expect(cardsActivity.flashcardSet.create.source).toBe('manual');
    const cards = cardsActivity.flashcardSet.create.flashcards.create;
    expect(cards).toHaveLength(2);
    expect(cards[0]).toEqual(
      expect.objectContaining({
        question: 'Q1',
        answer: 'A1',
        sortOrder: 0,
        // AC-Clone-3 — SR fields reset to SM-2 defaults.
        easeFactor: 2.5,
        interval: 0,
        repetitions: 0,
        nextReviewAt: null,
        lastReviewAt: null,
      }),
    );
    // FlashcardImage carries by-metadata copy; the cloned card points
    // at the same blob path.
    expect(cards[0].images.create).toEqual([
      expect.objectContaining({
        side: 'front',
        fileName: 'cover.png',
        filePath: '/uploads/cover.png',
        fileSize: 1234,
        mimeType: 'image/png',
      }),
    ]);
    // Card 2 has no images — the nested-create stays undefined rather
    // than passing an empty `{ create: [] }`.
    expect(cards[1].images).toBeUndefined();

    const quizActivity = slots[2].activities.create[0];
    expect(quizActivity.kind).toBe('quiz');
    expect(quizActivity.quizSet.create.userId).toBe('user-1');
    expect(quizActivity.quizSet.create.title).toBe('Quiz set');
    const questions = quizActivity.quizSet.create.questions.create;
    expect(questions).toHaveLength(1);
    expect(questions[0]).toEqual(
      expect.objectContaining({
        kind: 'mc',
        question: 'What is 2+2?',
        options: ['3', '4', '5', '6'],
        correctIndex: 1,
        hint: 'arithmetic',
        correctExplanation: 'right',
        wrongExplanation: 'nope',
        sortOrder: 0,
      }),
    );
  });

  it('increments downloadCount inside the transaction with +1 (AC-Clone-6)', async () => {
    let updateArg: { where: { id: string }; data: unknown } | null = null;
    mocks.dbMock.$transaction.mockImplementationOnce(
      async (callback: (tx: typeof mocks.dbMock) => Promise<unknown>) => {
        const tx = {
          ...mocks.dbMock,
          studyPlan: {
            findFirst: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: 'plan-new' }),
          },
          sharedPath: {
            ...mocks.dbMock.sharedPath,
            update: vi.fn((args) => {
              updateArg = args;
              return Promise.resolve({ id: 'shp-1' });
            }),
          },
        };
        return callback(tx);
      },
    );

    await callPost('shp-1');

    expect(updateArg).not.toBeNull();
    expect(updateArg).toEqual({
      where: { id: 'shp-1' },
      data: { downloadCount: { increment: 1 } },
    });
  });

  it('returns 404 if the path is unpublished between pre-check and snapshot load', async () => {
    // Reset fixtures and re-arrange: pre-check sees approved, but the
    // post-pre-check snapshot load sees no plan (unpublished mid-flight).
    mocks.dbMock.sharedPath.findUnique.mockReset();
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce({
      id: 'shp-1',
      moderationStatus: 'approved',
    });
    mocks.dbMock.studyPlan.findFirst.mockReset();
    mocks.dbMock.studyPlan.findFirst.mockResolvedValueOnce(null);
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(null);

    const res = await callPost('shp-1');

    expect(res.status).toBe(404);
    expect(mocks.dbMock.$transaction).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------
// In-tx race re-check
// ---------------------------------------------------------------------

describe('POST /api/community/paths/[shareId]/clone — in-tx idempotency race', () => {
  beforeEach(() => {
    mocks.getAuthUserId.mockResolvedValue('user-1');
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce({
      id: 'shp-1',
      moderationStatus: 'approved',
    });
    // Pre-check finds no clone.
    mocks.dbMock.studyPlan.findFirst.mockResolvedValueOnce(null);
    mocks.dbMock.sharedPath.findUnique.mockResolvedValueOnce(buildSourceFixture());
  });

  it('returns the racer-winner planId + alreadyCloned=true when the in-tx re-check finds one', async () => {
    const txStudyPlanCreate = vi.fn();
    const txSharedPathUpdate = vi.fn();
    mocks.dbMock.$transaction.mockImplementationOnce(
      async (callback: (tx: typeof mocks.dbMock) => Promise<unknown>) => {
        const tx = {
          ...mocks.dbMock,
          studyPlan: {
            // Race: another request committed between our pre-check
            // and the start of the tx. We see the winner here and bail
            // with the alreadyCloned signal.
            findFirst: vi.fn().mockResolvedValue({ id: 'plan-winner' }),
            create: txStudyPlanCreate,
          },
          sharedPath: {
            ...mocks.dbMock.sharedPath,
            update: txSharedPathUpdate,
          },
        };
        return callback(tx);
      },
    );

    const res = await callPost('shp-1');
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body).toEqual({
      success: true,
      data: { planId: 'plan-winner', alreadyCloned: true },
    });
    // AC-Clone-6 — racer-second clone MUST NOT increment downloadCount
    // and MUST NOT create a second plan.
    expect(txStudyPlanCreate).not.toHaveBeenCalled();
    expect(txSharedPathUpdate).not.toHaveBeenCalled();
  });
});
