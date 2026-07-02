import { beforeEach, describe, expect, it, vi } from 'vitest';

// ─── mocks ──────────────────────────────────────────────────────────────
//
// `weakness-nudges.ts` talks to: the DB (`@/lib/db`), the feature flag
// gate, `enqueueJob` (background-jobs.ts), the shared weak-area loader, and
// the email module. All mocked here, mirroring `concept-misconception-tag.
// test.ts`'s idiom, so both the pure trigger functions and the DB-wired
// orchestration (`evaluateAndNudgeUser`, `runWeaknessNudgeSweepPage`) can be
// exercised without a real database.

const mocks = vi.hoisted(() => ({
  weaknessNudgeSweepEnabled: vi.fn(),
  enqueueJob: vi.fn(),
  loadConceptWeakAreaRows: vi.fn(),
  sendWeaknessNudgeEmail: vi.fn(),
  userNotificationPreferencesFindUnique: vi.fn(),
  userFindUnique: vi.fn(),
  conceptMasteryFindMany: vi.fn(),
  conceptAttemptEventFindMany: vi.fn(),
  weaknessNudgeLogCreate: vi.fn(),
  weaknessNudgeLogFindMany: vi.fn(),
  weaknessNudgeLogFindFirst: vi.fn(),
  weaknessNudgeLogUpdateMany: vi.fn(),
  nudgeSweepWatermarkUpsert: vi.fn(),
  nudgeSweepWatermarkUpdate: vi.fn(),
}));

vi.mock('@/lib/feature-flags', () => ({
  weaknessNudgeSweepEnabled: mocks.weaknessNudgeSweepEnabled,
}));

vi.mock('@/lib/background-jobs', () => ({
  enqueueJob: mocks.enqueueJob,
}));

vi.mock('@/lib/concept-weak-areas-loader', () => ({
  loadConceptWeakAreaRows: mocks.loadConceptWeakAreaRows,
}));

vi.mock('@/lib/weakness-nudge-email', async () => {
  const actual = await vi.importActual<typeof import('./weakness-nudge-email')>(
    './weakness-nudge-email',
  );
  return {
    ...actual,
    sendWeaknessNudgeEmail: mocks.sendWeaknessNudgeEmail,
  };
});

vi.mock('@/lib/db', () => ({
  db: {
    userNotificationPreferences: { findUnique: mocks.userNotificationPreferencesFindUnique },
    user: { findUnique: mocks.userFindUnique },
    conceptMastery: { findMany: mocks.conceptMasteryFindMany },
    conceptAttemptEvent: { findMany: mocks.conceptAttemptEventFindMany },
    weaknessNudgeLog: {
      create: mocks.weaknessNudgeLogCreate,
      findMany: mocks.weaknessNudgeLogFindMany,
      findFirst: mocks.weaknessNudgeLogFindFirst,
      updateMany: mocks.weaknessNudgeLogUpdateMany,
    },
    nudgeSweepWatermark: {
      upsert: mocks.nudgeSweepWatermarkUpsert,
      update: mocks.nudgeSweepWatermarkUpdate,
    },
  },
}));

import { Prisma } from '@prisma/client';
import {
  IGNORED_WEAK_DAYS,
  RETEST_FAILURE_STREAK,
  RECENT_ACTIVITY_SUPPRESSION_HOURS,
  MAX_DIGEST_CONCEPTS,
  SWEEP_PAGE_SIZE,
  findIgnoredWeakConcepts,
  findGraduationAvailableConcepts,
  findRustyTransitionConcepts,
  findRetestFailureStreakConcepts,
  assembleDigest,
  digestSeverity,
  loggedDigestSeverity,
  isoDateKey,
  isoWeekKey,
  evaluateAndNudgeUser,
  resolveNudgesForUser,
  runWeaknessNudgeSweepPage,
  type RetestEvent,
  type TriggerResult,
} from './weakness-nudges';
import type { ConceptWeakArea } from './concept-weak-areas';

// ─── fixtures ───────────────────────────────────────────────────────────

const USER_ID = 'user-1';
const NOW = new Date('2026-07-01T12:00:00.000Z');

function area(overrides: Partial<ConceptWeakArea> & { conceptId: string }): ConceptWeakArea {
  return {
    conceptId: overrides.conceptId,
    label: overrides.label ?? `Concept ${overrides.conceptId}`,
    planId: overrides.planId ?? 'plan-1',
    slotId: overrides.slotId ?? 'slot-1',
    band: overrides.band ?? 'weak',
    masteryScore: overrides.masteryScore ?? 40,
    lcb: overrides.lcb ?? 0.3,
    weightedTotal: overrides.weightedTotal ?? 5,
    impactPoints: overrides.impactPoints ?? 1,
    impact: overrides.impact ?? 'medium',
    daysSinceLastAttempt: 'daysSinceLastAttempt' in overrides ? overrides.daysSinceLastAttempt! : 1,
    whyFlagged: overrides.whyFlagged ?? 'Scored below target on recent attempts.',
  };
}

function makeUniqueError(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '0.0.0',
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── pure trigger functions ──────────────────────────────────────────────

describe('findIgnoredWeakConcepts', () => {
  it('fires on a weak concept untouched for >= IGNORED_WEAK_DAYS', () => {
    const areas = [area({ conceptId: 'c1', band: 'weak', daysSinceLastAttempt: IGNORED_WEAK_DAYS })];
    expect(findIgnoredWeakConcepts(areas)).toHaveLength(1);
  });

  it('fires on a never-attempted weak concept (null days)', () => {
    const areas = [area({ conceptId: 'c1', band: 'weak', daysSinceLastAttempt: null })];
    expect(findIgnoredWeakConcepts(areas)).toHaveLength(1);
  });

  it('does NOT fire just under the threshold (near-miss)', () => {
    const areas = [
      area({ conceptId: 'c1', band: 'weak', daysSinceLastAttempt: IGNORED_WEAK_DAYS - 1 }),
    ];
    expect(findIgnoredWeakConcepts(areas)).toHaveLength(0);
  });

  it('does NOT fire on a rusty (non-weak) band even if stale', () => {
    const areas = [area({ conceptId: 'c1', band: 'rusty', daysSinceLastAttempt: 30 })];
    expect(findIgnoredWeakConcepts(areas)).toHaveLength(0);
  });
});

describe('findGraduationAvailableConcepts', () => {
  it('fires for every strengthening-status concept row given', () => {
    const rows = [{ conceptId: 'c1', label: 'Fractions' }];
    const result = findGraduationAvailableConcepts(rows);
    expect(result).toHaveLength(1);
    expect(result[0].whyFlagged).toContain('Fractions');
  });

  it('does NOT fire on an empty input (no strengthening rows)', () => {
    expect(findGraduationAvailableConcepts([])).toHaveLength(0);
  });
});

describe('findRustyTransitionConcepts', () => {
  it('fires on a rusty concept never previously nudged for rusty', () => {
    const areas = [area({ conceptId: 'c1', band: 'rusty' })];
    const result = findRustyTransitionConcepts(areas, new Set());
    expect(result).toHaveLength(1);
  });

  it('does NOT fire again once already nudged for rusty (dedup)', () => {
    const areas = [area({ conceptId: 'c1', band: 'rusty' })];
    const result = findRustyTransitionConcepts(areas, new Set(['c1']));
    expect(result).toHaveLength(0);
  });

  it('does NOT fire on a weak (non-rusty) band', () => {
    const areas = [area({ conceptId: 'c1', band: 'weak' })];
    expect(findRustyTransitionConcepts(areas, new Set())).toHaveLength(0);
  });
});

describe('findRetestFailureStreakConcepts', () => {
  function events(...results: boolean[]): RetestEvent[] {
    return results.map((isCorrect) => ({ conceptId: 'c1', label: 'Verb Tenses', isCorrect }));
  }

  it(`fires when the last ${RETEST_FAILURE_STREAK} weakness-session events are both incorrect`, () => {
    const map = new Map<string, RetestEvent[]>([['c1', events(false, false)]]);
    expect(findRetestFailureStreakConcepts(map)).toHaveLength(1);
  });

  it('does NOT fire on a near-miss (one correct in the streak)', () => {
    const map = new Map<string, RetestEvent[]>([['c1', events(false, true)]]);
    expect(findRetestFailureStreakConcepts(map)).toHaveLength(0);
  });

  it('does NOT fire with fewer than RETEST_FAILURE_STREAK events', () => {
    const map = new Map<string, RetestEvent[]>([['c1', events(false)]]);
    expect(findRetestFailureStreakConcepts(map)).toHaveLength(0);
  });
});

// ─── digest assembly ──────────────────────────────────────────────────────

describe('assembleDigest', () => {
  it('unions 4 simultaneous triggers into one digest ordered by priority', () => {
    const digest = assembleDigest([
      { kind: 'retest_failing', candidates: [{ conceptId: 'c1', label: 'A', whyFlagged: 'a' }] },
      { kind: 'rusty', candidates: [{ conceptId: 'c2', label: 'B', whyFlagged: 'b' }] },
      { kind: 'ignored_weak', candidates: [{ conceptId: 'c3', label: 'C', whyFlagged: 'c' }] },
      {
        kind: 'graduation_available',
        candidates: [{ conceptId: 'c4', label: 'D', whyFlagged: 'd' }],
      },
    ]);

    expect(digest.triggerKinds).toEqual(['retest_failing', 'rusty', 'ignored_weak', 'graduation_available']);
    expect(digest.concepts.map((c) => c.conceptId)).toEqual(['c1', 'c2', 'c3', 'c4']);
  });

  it('caps at MAX_DIGEST_CONCEPTS and dedupes a concept across triggers', () => {
    const many = Array.from({ length: MAX_DIGEST_CONCEPTS + 3 }, (_, i) => ({
      conceptId: `c${i}`,
      label: `L${i}`,
      whyFlagged: `w${i}`,
    }));
    const digest = assembleDigest([
      { kind: 'ignored_weak', candidates: many },
      // Same concept id as the first ignored_weak candidate — should be
      // deduped, not double-counted.
      { kind: 'rusty', candidates: [many[0]] },
    ]);
    expect(digest.concepts).toHaveLength(MAX_DIGEST_CONCEPTS);
  });

  it('produces no triggerKinds when every candidate list is empty', () => {
    const digest = assembleDigest([
      { kind: 'ignored_weak', candidates: [] },
      { kind: 'rusty', candidates: [] },
    ]);
    expect(digest.triggerKinds).toHaveLength(0);
  });
});

// ─── digestSeverity / loggedDigestSeverity (§14.1 ESCALATED, §14.8 4.4b) ──

function candidate(conceptId: string): { conceptId: string; label: string; whyFlagged: string } {
  return { conceptId, label: conceptId, whyFlagged: conceptId };
}

describe('digestSeverity', () => {
  it('retest_failing counts double: does not blindly outrank a larger non-retest digest', () => {
    const withRetest: TriggerResult[] = [
      { kind: 'retest_failing', candidates: [candidate('c1')] },
    ];
    const withoutRetest: TriggerResult[] = [
      { kind: 'ignored_weak', candidates: [candidate('c1'), candidate('c2'), candidate('c3')] },
    ];
    // Concretely: 1 concept * 2 (retest) = 2, vs 3 concepts * 1 = 3 — so
    // retest_failing does NOT blindly beat a much larger non-retest digest;
    // the "counts double" rule is a multiplier on count, not an override.
    expect(digestSeverity(withRetest)).toBe(2);
    expect(digestSeverity(withoutRetest)).toBe(3);
  });

  it('retest_failing doubles the concept count when present', () => {
    const results: TriggerResult[] = [
      { kind: 'retest_failing', candidates: [candidate('c1'), candidate('c2')] },
    ];
    expect(digestSeverity(results)).toBe(4);
  });

  it('plain count comparison when retest_failing is absent from both', () => {
    const one: TriggerResult[] = [{ kind: 'ignored_weak', candidates: [candidate('c1')] }];
    const three: TriggerResult[] = [
      {
        kind: 'ignored_weak',
        candidates: [candidate('c1'), candidate('c2'), candidate('c3')],
      },
    ];
    expect(digestSeverity(three)).toBeGreaterThan(digestSeverity(one));
    expect(digestSeverity(one)).toBe(1);
    expect(digestSeverity(three)).toBe(3);
  });

  it('a retest_failing trigger with zero candidates does not count as "present"', () => {
    const results: TriggerResult[] = [
      { kind: 'retest_failing', candidates: [] },
      { kind: 'ignored_weak', candidates: [candidate('c1')] },
    ];
    expect(digestSeverity(results)).toBe(1);
  });

  it('dedupes a concept counted under multiple triggers', () => {
    const results: TriggerResult[] = [
      { kind: 'ignored_weak', candidates: [candidate('c1')] },
      { kind: 'rusty', candidates: [candidate('c1')] },
    ];
    expect(digestSeverity(results)).toBe(1);
  });
});

describe('loggedDigestSeverity', () => {
  it('matches digestSeverity for an equivalent persisted row (retest_failing present)', () => {
    const live = digestSeverity([
      { kind: 'retest_failing', candidates: [candidate('c1'), candidate('c2')] },
    ]);
    const logged = loggedDigestSeverity({ triggerKinds: ['retest_failing'], conceptIds: ['c1', 'c2'] });
    expect(logged).toBe(live);
  });

  it('matches digestSeverity for an equivalent persisted row (no retest_failing)', () => {
    const live = digestSeverity([{ kind: 'ignored_weak', candidates: [candidate('c1')] }]);
    const logged = loggedDigestSeverity({ triggerKinds: ['ignored_weak'], conceptIds: ['c1'] });
    expect(logged).toBe(live);
  });
});

// ─── window keys ────────────────────────────────────────────────────────

describe('isoDateKey / isoWeekKey', () => {
  it('formats a UTC calendar date', () => {
    expect(isoDateKey(new Date('2026-07-01T23:59:59.000Z'))).toBe('2026-07-01');
  });

  it('formats an ISO week', () => {
    expect(isoWeekKey(new Date('2026-07-01T12:00:00.000Z'))).toMatch(/^2026-W\d{2}$/);
  });
});

// ─── evaluateAndNudgeUser ─────────────────────────────────────────────────

describe('evaluateAndNudgeUser', () => {
  function stubClean() {
    mocks.userNotificationPreferencesFindUnique.mockResolvedValue({ weakSpotNudges: true });
    mocks.userFindUnique.mockResolvedValue({
      email: 'learner@example.com',
      emailVerified: new Date('2026-01-01'),
      lastSeenAt: new Date('2026-06-20T00:00:00.000Z'), // well outside 48h suppression
    });
    mocks.loadConceptWeakAreaRows.mockResolvedValue([]);
    mocks.conceptMasteryFindMany.mockResolvedValue([]);
    mocks.conceptAttemptEventFindMany.mockResolvedValue([]);
    mocks.weaknessNudgeLogFindMany.mockResolvedValue([]);
    mocks.weaknessNudgeLogFindFirst.mockResolvedValue(null);
    mocks.weaknessNudgeLogCreate.mockResolvedValue({});
    mocks.weaknessNudgeLogUpdateMany.mockResolvedValue({ count: 0 });
    mocks.sendWeaknessNudgeEmail.mockResolvedValue(true);
  }

  it('pref=false short-circuits before any mastery read', async () => {
    mocks.userNotificationPreferencesFindUnique.mockResolvedValue({ weakSpotNudges: false });

    const result = await evaluateAndNudgeUser(USER_ID, NOW);

    expect(result.evaluated).toBe(false);
    expect(mocks.loadConceptWeakAreaRows).not.toHaveBeenCalled();
    expect(mocks.userFindUnique).not.toHaveBeenCalled();
  });

  it('recent activity (lastSeenAt within 48h) suppresses the nudge', async () => {
    stubClean();
    mocks.userFindUnique.mockResolvedValue({
      email: 'learner@example.com',
      emailVerified: new Date('2026-01-01'),
      lastSeenAt: new Date(NOW.getTime() - (RECENT_ACTIVITY_SUPPRESSION_HOURS - 1) * 60 * 60 * 1000),
    });

    const result = await evaluateAndNudgeUser(USER_ID, NOW);

    expect(result.triggered).toBe(false);
    expect(mocks.loadConceptWeakAreaRows).not.toHaveBeenCalled();
  });

  it('4 simultaneous triggers produce exactly one in-app log and one email', async () => {
    stubClean();
    mocks.loadConceptWeakAreaRows.mockResolvedValue([]);
    // deriveConceptWeakAreas needs raw ConceptWeakAreaRow-shaped mastery
    // rows to produce weak/rusty areas — feed it via the loader mock so
    // `derived.areas` contains both a weak and a rusty concept.
    mocks.loadConceptWeakAreaRows.mockResolvedValue([
      {
        conceptId: 'weak-1',
        label: 'Weak One',
        planId: 'p1',
        slotId: 's1',
        status: 'weak',
        weightedCorrect: 1,
        weightedTotal: 5,
        attemptCount: 5,
        lastAttemptAt: new Date(NOW.getTime() - IGNORED_WEAK_DAYS * 24 * 60 * 60 * 1000),
        lastCorrectAt: null,
        peakLcb: 0.3,
      },
      {
        conceptId: 'rusty-1',
        label: 'Rusty One',
        planId: 'p1',
        slotId: 's1',
        status: 'rusty',
        weightedCorrect: 3,
        weightedTotal: 6,
        attemptCount: 6,
        lastAttemptAt: new Date(NOW.getTime() - 30 * 24 * 60 * 60 * 1000),
        lastCorrectAt: null,
        peakLcb: 0.8,
      },
    ]);
    mocks.conceptMasteryFindMany.mockResolvedValue([
      { conceptId: 'strengthening-1', concept: { label: 'Strengthening One' } },
    ]);
    mocks.conceptAttemptEventFindMany.mockImplementation(({ where }: { where: { conceptId: string } }) => {
      if (where.conceptId === 'weak-1') {
        return Promise.resolve([
          { isCorrect: false, concept: { label: 'Weak One' } },
          { isCorrect: false, concept: { label: 'Weak One' } },
        ]);
      }
      return Promise.resolve([]);
    });

    const result = await evaluateAndNudgeUser(USER_ID, NOW);

    expect(result.triggered).toBe(true);
    expect(mocks.weaknessNudgeLogCreate).toHaveBeenCalledTimes(2); // in_app + email
    expect(mocks.sendWeaknessNudgeEmail).toHaveBeenCalledTimes(1);

    const inAppCall = mocks.weaknessNudgeLogCreate.mock.calls.find(
      (c) => c[0].data.channel === 'in_app',
    );
    expect(inAppCall).toBeDefined();
    expect(inAppCall![0].data.triggerKinds).toEqual(
      expect.arrayContaining(['retest_failing', 'rusty', 'ignored_weak', 'graduation_available']),
    );
  });

  it('windowKey unique collision (P2002) on the weekly email row skips the send', async () => {
    stubClean();
    mocks.loadConceptWeakAreaRows.mockResolvedValue([
      {
        conceptId: 'weak-1',
        label: 'Weak One',
        planId: 'p1',
        slotId: 's1',
        status: 'weak',
        weightedCorrect: 1,
        weightedTotal: 5,
        attemptCount: 5,
        lastAttemptAt: new Date(NOW.getTime() - IGNORED_WEAK_DAYS * 24 * 60 * 60 * 1000),
        lastCorrectAt: null,
        peakLcb: 0.3,
      },
    ]);
    mocks.weaknessNudgeLogCreate.mockImplementation(({ data }: { data: { channel: string } }) => {
      if (data.channel === 'email') throw makeUniqueError();
      return Promise.resolve({});
    });

    const result = await evaluateAndNudgeUser(USER_ID, NOW);

    expect(result.inAppLogged).toBe(true);
    expect(result.emailSent).toBe(false);
    expect(mocks.sendWeaknessNudgeEmail).not.toHaveBeenCalled();
  });

  it('windowKey unique collision (P2002) on the in-app row stops before the email rung', async () => {
    stubClean();
    mocks.loadConceptWeakAreaRows.mockResolvedValue([
      {
        conceptId: 'weak-1',
        label: 'Weak One',
        planId: 'p1',
        slotId: 's1',
        status: 'weak',
        weightedCorrect: 1,
        weightedTotal: 5,
        attemptCount: 5,
        lastAttemptAt: new Date(NOW.getTime() - IGNORED_WEAK_DAYS * 24 * 60 * 60 * 1000),
        lastCorrectAt: null,
        peakLcb: 0.3,
      },
    ]);
    mocks.weaknessNudgeLogCreate.mockRejectedValue(makeUniqueError());

    const result = await evaluateAndNudgeUser(USER_ID, NOW);

    expect(result.triggered).toBe(false);
    expect(mocks.sendWeaknessNudgeEmail).not.toHaveBeenCalled();
  });

  it('unverified email skips the email rung but still logs in-app', async () => {
    stubClean();
    mocks.userFindUnique.mockResolvedValue({
      email: 'learner@example.com',
      emailVerified: null,
      lastSeenAt: new Date('2026-06-20T00:00:00.000Z'),
    });
    mocks.loadConceptWeakAreaRows.mockResolvedValue([
      {
        conceptId: 'weak-1',
        label: 'Weak One',
        planId: 'p1',
        slotId: 's1',
        status: 'weak',
        weightedCorrect: 1,
        weightedTotal: 5,
        attemptCount: 5,
        lastAttemptAt: new Date(NOW.getTime() - IGNORED_WEAK_DAYS * 24 * 60 * 60 * 1000),
        lastCorrectAt: null,
        peakLcb: 0.3,
      },
    ]);

    const result = await evaluateAndNudgeUser(USER_ID, NOW);

    expect(result.inAppLogged).toBe(true);
    expect(result.emailSent).toBe(false);
    expect(mocks.sendWeaknessNudgeEmail).not.toHaveBeenCalled();
  });

  it('no triggers fire → no log rows written', async () => {
    stubClean();
    const result = await evaluateAndNudgeUser(USER_ID, NOW);
    expect(result.triggered).toBe(false);
    expect(mocks.weaknessNudgeLogCreate).not.toHaveBeenCalled();
  });

  // ─── ESCALATED severity flip (§14.1, §14.8 4.4b) ────────────────────────

  function stubOneWeakConcept() {
    // Severity 1: a single ignored_weak concept, no retest_failing.
    mocks.loadConceptWeakAreaRows.mockResolvedValue([
      {
        conceptId: 'weak-1',
        label: 'Weak One',
        planId: 'p1',
        slotId: 's1',
        status: 'weak',
        weightedCorrect: 1,
        weightedTotal: 5,
        attemptCount: 5,
        lastAttemptAt: new Date(NOW.getTime() - IGNORED_WEAK_DAYS * 24 * 60 * 60 * 1000),
        lastCorrectAt: null,
        peakLcb: 0.3,
      },
    ]);
  }

  function stubRetestFailingConcept() {
    // Severity 2: one retest_failing concept (1 concept * 2).
    mocks.loadConceptWeakAreaRows.mockResolvedValue([
      {
        conceptId: 'weak-1',
        label: 'Weak One',
        planId: 'p1',
        slotId: 's1',
        status: 'weak',
        weightedCorrect: 1,
        weightedTotal: 5,
        attemptCount: 5,
        lastAttemptAt: new Date(NOW.getTime() - IGNORED_WEAK_DAYS * 24 * 60 * 60 * 1000),
        lastCorrectAt: null,
        peakLcb: 0.3,
      },
    ]);
    mocks.conceptAttemptEventFindMany.mockImplementation(({ where }: { where: { conceptId: string } }) => {
      if (where.conceptId === 'weak-1') {
        return Promise.resolve([
          { isCorrect: false, concept: { label: 'Weak One' } },
          { isCorrect: false, concept: { label: 'Weak One' } },
        ]);
      }
      return Promise.resolve([]);
    });
  }

  it('strictly-higher severity today flips a prior unresolved nudged row to escalated', async () => {
    stubClean();
    stubRetestFailingConcept();
    mocks.weaknessNudgeLogFindFirst.mockResolvedValue({
      id: 'prior-log-1',
      triggerKinds: ['ignored_weak'],
      conceptIds: ['weak-1'], // severity 1 < today's severity 2 (retest_failing)
    });

    const result = await evaluateAndNudgeUser(USER_ID, NOW);

    expect(result.triggered).toBe(true);
    expect(mocks.weaknessNudgeLogUpdateMany).toHaveBeenCalledWith({
      where: { id: 'prior-log-1', state: 'nudged' },
      data: { state: 'escalated' },
    });
    // The escalation flip is a state upgrade on the PRIOR row, never a
    // second email — only one 'email' channel create call max.
    const emailCreates = mocks.weaknessNudgeLogCreate.mock.calls.filter(
      (c) => c[0].data.channel === 'email',
    );
    expect(emailCreates.length).toBeLessThanOrEqual(1);
  });

  it('equal severity today does NOT flip the prior row', async () => {
    stubClean();
    stubOneWeakConcept(); // severity 1
    mocks.weaknessNudgeLogFindFirst.mockResolvedValue({
      id: 'prior-log-1',
      triggerKinds: ['ignored_weak'],
      conceptIds: ['other-weak-concept'], // severity 1 == today's severity 1
    });

    await evaluateAndNudgeUser(USER_ID, NOW);

    expect(mocks.weaknessNudgeLogUpdateMany).not.toHaveBeenCalled();
  });

  it('lower severity today does NOT flip the prior row', async () => {
    stubClean();
    stubOneWeakConcept(); // severity 1
    mocks.weaknessNudgeLogFindFirst.mockResolvedValue({
      id: 'prior-log-1',
      triggerKinds: ['retest_failing'],
      conceptIds: ['a', 'b'], // severity 4 > today's severity 1
    });

    await evaluateAndNudgeUser(USER_ID, NOW);

    expect(mocks.weaknessNudgeLogUpdateMany).not.toHaveBeenCalled();
  });

  it('a resolved prior row is never considered for escalation (query excludes non-nudged state)', async () => {
    stubClean();
    stubRetestFailingConcept();
    // The findFirst query itself is scoped to state:'nudged' — simulate the
    // "nothing eligible" case a resolved-only history would produce.
    mocks.weaknessNudgeLogFindFirst.mockResolvedValue(null);

    await evaluateAndNudgeUser(USER_ID, NOW);

    expect(mocks.weaknessNudgeLogFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ userId: USER_ID, channel: 'in_app', state: 'nudged' }),
      }),
    );
    expect(mocks.weaknessNudgeLogUpdateMany).not.toHaveBeenCalled();
  });
});

// ─── resolveNudgesForUser ─────────────────────────────────────────────────

describe('resolveNudgesForUser', () => {
  it('flips only nudged/escalated rows to resolved', async () => {
    mocks.weaknessNudgeLogUpdateMany.mockResolvedValue({ count: 2 });
    await resolveNudgesForUser(USER_ID);

    expect(mocks.weaknessNudgeLogUpdateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, state: { in: ['nudged', 'escalated'] } },
      data: { state: 'resolved', resolvedAt: expect.any(Date) },
    });
  });

  it('never throws even if the DB call rejects', async () => {
    mocks.weaknessNudgeLogUpdateMany.mockRejectedValue(new Error('db down'));
    await expect(resolveNudgesForUser(USER_ID)).resolves.toBeUndefined();
  });
});

// ─── runWeaknessNudgeSweepPage — watermark cursor resume ─────────────────

describe('runWeaknessNudgeSweepPage', () => {
  it('is a no-op when the flag is off', async () => {
    mocks.weaknessNudgeSweepEnabled.mockReturnValue(false);
    const result = await runWeaknessNudgeSweepPage();
    expect(result).toEqual({ processed: 0, done: true });
    expect(mocks.nudgeSweepWatermarkUpsert).not.toHaveBeenCalled();
  });

  it('same-day continuation resumes from the cursor and skips processed users', async () => {
    mocks.weaknessNudgeSweepEnabled.mockReturnValue(true);
    const today = new Date('2026-07-01T08:00:00.000Z');
    mocks.nudgeSweepWatermarkUpsert.mockResolvedValue({
      id: 'singleton',
      lastRunAt: new Date('2026-07-01T02:00:00.000Z'), // earlier today
      lastCursor: 'user-50',
    });
    mocks.conceptMasteryFindMany.mockResolvedValue([{ userId: 'user-51' }, { userId: 'user-52' }]);
    mocks.userNotificationPreferencesFindUnique.mockResolvedValue({ weakSpotNudges: false }); // fast no-op per user
    mocks.nudgeSweepWatermarkUpdate.mockResolvedValue({});

    vi.setSystemTime(today);
    const result = await runWeaknessNudgeSweepPage();
    vi.useRealTimers();

    expect(mocks.conceptMasteryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: { gt: 'user-50' } } }),
    );
    expect(result.processed).toBe(2);
  });

  it('a new day resets the cursor to null', async () => {
    mocks.weaknessNudgeSweepEnabled.mockReturnValue(true);
    const today = new Date('2026-07-02T08:00:00.000Z');
    mocks.nudgeSweepWatermarkUpsert.mockResolvedValue({
      id: 'singleton',
      lastRunAt: new Date('2026-07-01T23:00:00.000Z'), // yesterday
      lastCursor: 'user-999',
    });
    mocks.conceptMasteryFindMany.mockResolvedValue([]);
    mocks.nudgeSweepWatermarkUpdate.mockResolvedValue({});

    vi.setSystemTime(today);
    await runWeaknessNudgeSweepPage();
    vi.useRealTimers();

    expect(mocks.conceptMasteryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: undefined }),
    );
  });

  it('a full page self-enqueues a continuation and reports done:false', async () => {
    mocks.weaknessNudgeSweepEnabled.mockReturnValue(true);
    mocks.nudgeSweepWatermarkUpsert.mockResolvedValue({
      id: 'singleton',
      lastRunAt: null,
      lastCursor: null,
    });
    const fullPage = Array.from({ length: SWEEP_PAGE_SIZE }, (_, i) => ({ userId: `user-${i}` }));
    mocks.conceptMasteryFindMany.mockResolvedValue(fullPage);
    mocks.userNotificationPreferencesFindUnique.mockResolvedValue({ weakSpotNudges: false });
    mocks.nudgeSweepWatermarkUpdate.mockResolvedValue({});
    mocks.enqueueJob.mockResolvedValue({});

    const result = await runWeaknessNudgeSweepPage();

    expect(result.done).toBe(false);
    expect(mocks.enqueueJob).toHaveBeenCalledWith(
      'weakness.nudge_sweep',
      {},
      expect.objectContaining({ maxAttempts: 1 }),
    );
  });

  it('a partial page reports done:true and does not self-enqueue', async () => {
    mocks.weaknessNudgeSweepEnabled.mockReturnValue(true);
    mocks.nudgeSweepWatermarkUpsert.mockResolvedValue({
      id: 'singleton',
      lastRunAt: null,
      lastCursor: null,
    });
    mocks.conceptMasteryFindMany.mockResolvedValue([{ userId: 'user-1' }]);
    mocks.userNotificationPreferencesFindUnique.mockResolvedValue({ weakSpotNudges: false });
    mocks.nudgeSweepWatermarkUpdate.mockResolvedValue({});

    const result = await runWeaknessNudgeSweepPage();

    expect(result.done).toBe(true);
    expect(mocks.enqueueJob).not.toHaveBeenCalled();
  });
});
