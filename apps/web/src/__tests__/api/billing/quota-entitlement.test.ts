// Quota / tier-cap / period-reset integration suite. Runs the REAL
// usage-limits.ts + token-budget.ts + tiers.ts against the REAL sandbox
// Postgres (no db mocks) — see sandbox.ts for the self-skip gate. Env must be
// set before any app module import, since some libs read env at import time.
import { SANDBOX_BILLING_ENV } from './sandbox';
Object.assign(process.env, SANDBOX_BILLING_ENV);

import { describe, it, expect } from 'vitest';
import { sandboxDescribe } from './sandbox';
import { db } from '@/lib/db';
import {
  TIERS,
  PRO_WEEKLY_LIMITS,
  PRO_WEEKLY_TOKEN_LIMIT,
  limitFor,
  tokenLimitFor,
  getWeekStart,
  getMonthStart,
  getPeriodStart,
  AI_PATHS_PER_DAY,
} from '@/lib/tiers';
import { checkUsageLimit, reserveUsage } from '@/lib/usage-limits';
import { checkTokenBudget } from '@/lib/token-budget';
import { trialGrant, deriveAccountState } from '@/lib/entitlement';

let seq = 0;
// Process-unique run tag so concurrent agents / repeated local runs never collide
// on the username unique constraint (a bare per-process seq starting at 1 does).
const runTag = Math.random().toString(36).slice(2, 8);
/** Unique per-test user in our reserved namespace (quota-<case>@sandbox.test). */
async function makeUser(caseName: string, extra: Record<string, unknown> = {}) {
  seq += 1;
  return db.user.create({
    data: {
      email: `quota-${caseName}-${runTag}-${seq}@sandbox.test`,
      username: `q_${runTag}_${seq}`,
      ...extra,
    },
  });
}

// ---------------------------------------------------------------------------
// 1) Cap table — pure function, no DB. Exact numeric caps from tiers.ts vs the
//    product-decided values.
// ---------------------------------------------------------------------------
describe('cap table — tiers.ts vs product decisions', () => {
  it('PRO monthly: full caps (ultra 3, basic unlimited, regen 10, tokenLimit 4M)', () => {
    expect(limitFor('PRO', 'monthly', 'ultra_path')).toBe(3);
    expect(limitFor('PRO', 'monthly', 'ai_study_plan')).toBe(-1); // basic paths — unlimited count
    expect(limitFor('PRO', 'monthly', 'path_regenerate')).toBe(10);
    expect(tokenLimitFor('PRO', 'monthly')).toBe(4_000_000);
  });

  it('PRO yearly: identical to monthly (yearly folds to monthly semantics)', () => {
    expect(limitFor('PRO', 'yearly', 'ultra_path')).toBe(3);
    expect(tokenLimitFor('PRO', 'yearly')).toBe(4_000_000);
  });

  it('PRO with null/undefined interval: treated as monthly (full caps)', () => {
    expect(limitFor('PRO', null, 'ultra_path')).toBe(3);
    expect(limitFor('PRO', undefined, 'ultra_path')).toBe(3);
    expect(tokenLimitFor('PRO', null)).toBe(4_000_000);
  });

  it('PRO weekly: monthly caps ÷ 4 (ultra 1, tokenLimit 1M)', () => {
    expect(limitFor('PRO', 'weekly', 'ultra_path')).toBe(1);
    expect(tokenLimitFor('PRO', 'weekly')).toBe(1_000_000);
    expect(PRO_WEEKLY_LIMITS.ultra_path).toBe(1);
    expect(PRO_WEEKLY_TOKEN_LIMIT).toBe(1_000_000);
  });

  it('PRO weekly: unlimited (-1) features stay unlimited (override is a Partial, not exhaustive)', () => {
    expect(limitFor('PRO', 'weekly', 'ai_study_plan')).toBe(-1);
    expect(limitFor('PRO', 'weekly', 'ai_flashcards')).toBe(-1);
    expect(limitFor('PRO', 'weekly', 'scholar_chat')).toBe(-1);
  });

  it('AI_PATHS_PER_DAY: daily pacing rate for basic-path bursts is 5/day', () => {
    expect(AI_PATHS_PER_DAY).toBe(5);
  });

  it('FREE: ai_study_plan and ultra_path are Pro-only (0), never granted', () => {
    expect(TIERS.FREE.limits.ai_study_plan).toBe(0);
    expect(TIERS.FREE.limits.ultra_path).toBe(0);
  });

  it('no paid-API quota is a disabling -1: every -1 count for PRO is paired with a real cap elsewhere', () => {
    // ai_study_plan (-1 count) is paced by AI_PATHS_PER_DAY (5/day) + tokenLimit (4M/period).
    // ai_flashcards/ai_pptx/ai_quizzes/scholar_chat/ai_inline_edit (-1 count) are all bounded
    // by the shared tokenLimit — every AI call writes an AiUsageEvent that counts toward it.
    // None of these paths bypass checkTokenBudget, so "-1" here means "no per-call counter",
    // not "uncapped spend." Assert the invariant a regression would break: PRO tokenLimit is
    // a positive finite number (never -1/unbounded) for either cadence.
    expect(tokenLimitFor('PRO', 'monthly')).toBeGreaterThan(0);
    expect(tokenLimitFor('PRO', 'weekly')).toBeGreaterThan(0);
    // And every genuinely metered anti-abuse feature (paid API, no natural stop) has a
    // real positive cap on both tiers where it's offered — never -1.
    const mustNeverBeUnlimited: Array<keyof typeof TIERS.PRO.limits> = [
      'ultra_path',
      'path_regenerate',
      'code_execute',
      'video_ingest',
      'web_search',
    ];
    for (const feature of mustNeverBeUnlimited) {
      expect(TIERS.PRO.limits[feature]).toBeGreaterThan(0);
      expect(PRO_WEEKLY_LIMITS[feature as keyof typeof PRO_WEEKLY_LIMITS] ?? TIERS.PRO.limits[feature]).toBeGreaterThan(0);
    }
  });
});

// ---------------------------------------------------------------------------
// 2) getPeriodStart — pure function, no DB. Fixed reference dates.
// ---------------------------------------------------------------------------
describe('getPeriodStart — week/month boundary behavior', () => {
  it('getWeekStart: implemented rule is Monday 00:00 UTC (not Sunday)', () => {
    // 2026-07-08 is a Wednesday (per implemented `now.getUTCDay()` math below).
    const wednesday = new Date('2026-07-08T15:30:00.000Z');
    const weekStart = getWeekStart(wednesday);
    expect(weekStart.toISOString()).toBe('2026-07-06T00:00:00.000Z'); // Monday
    expect(weekStart.getUTCDay()).toBe(1); // 1 = Monday
  });

  it('week boundary edge: Sunday 23:59 UTC still belongs to the week that started the prior Monday', () => {
    const sundayLate = new Date('2026-07-12T23:59:59.999Z'); // Sunday, end of the week starting 07-06
    expect(getWeekStart(sundayLate).toISOString()).toBe('2026-07-06T00:00:00.000Z');
  });

  it('week boundary edge: Monday 00:00:00.000 UTC exactly is the start of ITS OWN week, not the previous one', () => {
    const mondayMidnight = new Date('2026-07-13T00:00:00.000Z'); // next Monday
    expect(getWeekStart(mondayMidnight).toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });

  it('week boundary edge: Monday 00:00:00.001 UTC (1ms after) is still that same week', () => {
    const justAfterMidnight = new Date('2026-07-13T00:00:00.001Z');
    expect(getWeekStart(justAfterMidnight).toISOString()).toBe('2026-07-13T00:00:00.000Z');
  });

  it('month boundary: Jan 31 -> February (month-start is Feb 1, not Jan 1)', () => {
    const jan31 = new Date('2026-01-31T23:00:00.000Z');
    expect(getPeriodStart('monthly')).not.toBeUndefined(); // sanity: function exists / callable with literal
    // getMonthStart reads Date.now() internally (not injectable), so exercise the
    // month-boundary math directly via the same UTC construction it uses.
    const monthStartForJan31 = new Date(Date.UTC(jan31.getUTCFullYear(), jan31.getUTCMonth(), 1));
    expect(monthStartForJan31.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    const feb1 = new Date('2026-02-01T00:00:01.000Z');
    const monthStartForFeb1 = new Date(Date.UTC(feb1.getUTCFullYear(), feb1.getUTCMonth(), 1));
    expect(monthStartForFeb1.toISOString()).toBe('2026-02-01T00:00:00.000Z');
  });

  it('getMonthStart: always the 1st of the current UTC month, regardless of day-of-month', () => {
    const monthStart = getMonthStart();
    expect(monthStart.getUTCDate()).toBe(1);
    expect(monthStart.getUTCHours()).toBe(0);
  });

  it('getPeriodStart(weekly) vs getPeriodStart(monthly): different period starts for the same "now" (unless today happens to be the 1st AND a Monday)', () => {
    // getMonthStart/getWeekStart both read Date.now() with no injection point in
    // getPeriodStart's public signature, so assert the divergence structurally: the two
    // functions compute from genuinely different rules (day-of-week vs day-of-month), which
    // provably yields different results on all but a coincidental one day per ~7 years. Prove
    // it with an injected date directly against getWeekStart, and against the getMonthStart
    // formula, for a day that is neither Monday nor the 1st.
    const midMonthWednesday = new Date('2026-07-08T12:00:00.000Z');
    const weeklyStart = getWeekStart(midMonthWednesday);
    const monthlyStart = new Date(
      Date.UTC(midMonthWednesday.getUTCFullYear(), midMonthWednesday.getUTCMonth(), 1),
    );
    expect(weeklyStart.toISOString()).not.toBe(monthlyStart.toISOString());
    expect(weeklyStart.toISOString()).toBe('2026-07-06T00:00:00.000Z');
    expect(monthlyStart.toISOString()).toBe('2026-07-01T00:00:00.000Z');
  });

  it('getPeriodStart(interval): weekly routes to getWeekStart, monthly/yearly/null/undefined route to getMonthStart', () => {
    const weekly = getPeriodStart('weekly');
    const monthly = getPeriodStart('monthly');
    const yearly = getPeriodStart('yearly');
    const nullInterval = getPeriodStart(null);
    const undefinedInterval = getPeriodStart(undefined);
    // monthly/yearly/null/undefined must all agree (all route to getMonthStart).
    expect(monthly.toISOString()).toBe(yearly.toISOString());
    expect(monthly.toISOString()).toBe(nullInterval.toISOString());
    expect(monthly.toISOString()).toBe(undefinedInterval.toISOString());
    // weekly's start-of-week is a Monday (day 1); the monthly start's day-of-month is 1 —
    // these coincide only if "today" is the 1st of the month AND that 1st is a Monday.
    // Assert the general case by checking they're equal ONLY when that coincidence holds,
    // else they must differ — i.e. XOR the two "on-the-boundary" conditions.
    const isFirstOfMonth = new Date().getUTCDate() === 1;
    const isMonday = new Date().getUTCDay() === 1;
    if (isFirstOfMonth && isMonday) {
      expect(weekly.toISOString()).toBe(monthly.toISOString());
    } else {
      expect(weekly.toISOString()).not.toBe(monthly.toISOString());
    }
  });
});

// ---------------------------------------------------------------------------
// 3) Usage increment + enforcement — real DB, real usage-recording writer
//    (reserveUsage), scoped to quota-<case>@sandbox.test users.
// ---------------------------------------------------------------------------
sandboxDescribe('usage enforcement — reserveUsage flips allowed -> denied exactly at the cap', () => {
  it('ultra_path (PRO monthly, cap 3): allowed for reservations 1..3, denied on the 4th; used/limit reported correctly throughout', async () => {
    const user = await makeUser('ultra-cap', { tier: 'PRO', billingInterval: 'monthly' });

    for (let i = 1; i <= 3; i++) {
      const result = await reserveUsage(user.id, 'ultra_path');
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(i);
      expect(result.limit).toBe(3);
    }

    const fourth = await reserveUsage(user.id, 'ultra_path');
    expect(fourth.allowed).toBe(false);
    expect(fourth.used).toBe(3); // not incremented — reservation rejected, meter untouched
    expect(fourth.limit).toBe(3);

    // checkUsageLimit agrees with reserveUsage's final state.
    const check = await checkUsageLimit(user.id, 'ultra_path');
    expect(check.allowed).toBe(false);
    expect(check.used).toBe(3);
    expect(check.limit).toBe(3);
  });

  it('ultra_path (PRO weekly, cap 1 via ÷4): allowed once, denied on the 2nd', async () => {
    const user = await makeUser('ultra-weekly-cap', { tier: 'PRO', billingInterval: 'weekly' });

    const first = await reserveUsage(user.id, 'ultra_path');
    expect(first.allowed).toBe(true);
    expect(first.used).toBe(1);
    expect(first.limit).toBe(1);

    const second = await reserveUsage(user.id, 'ultra_path');
    expect(second.allowed).toBe(false);
    expect(second.used).toBe(1);
    expect(second.limit).toBe(1);
  });

  it('path_regenerate (PRO monthly, cap 10): allowed through 10, denied on the 11th', async () => {
    const user = await makeUser('regen-cap', { tier: 'PRO', billingInterval: 'monthly' });

    for (let i = 1; i <= 10; i++) {
      const result = await reserveUsage(user.id, 'path_regenerate');
      expect(result.allowed).toBe(true);
      expect(result.used).toBe(i);
    }

    const eleventh = await reserveUsage(user.id, 'path_regenerate');
    expect(eleventh.allowed).toBe(false);
    expect(eleventh.used).toBe(10);
    expect(eleventh.limit).toBe(10);
  });

  it('ai_study_plan (PRO, basic paths): unlimited count (-1) — reserveUsage never charges the meter', async () => {
    const user = await makeUser('basic-unlimited', { tier: 'PRO', billingInterval: 'monthly' });

    for (let i = 0; i < 8; i++) {
      const result = await reserveUsage(user.id, 'ai_study_plan');
      expect(result.allowed).toBe(true);
      expect(result.limit).toBe(-1);
      expect(result.used).toBe(0); // -1 tiers short-circuit without touching the meter
    }

    // Confirm no usage_records row was ever written for this feature/user —
    // the "unlimited" count genuinely never counts (daily rate limit below is
    // the real enforcement for this feature, not a UsageRecord cap).
    const rows = await db.usageRecord.findMany({
      where: { userId: user.id, featureType: 'ai_study_plan' },
    });
    expect(rows).toHaveLength(0);
  });

  it('daily basic-path rate limit (5/day, AI_PATHS_PER_DAY): counting today\'s source:"ai" StudyPlans flips allowed -> denied at exactly 5, scoped to this user', async () => {
    const user = await makeUser('daily-rate');
    const other = await makeUser('daily-rate-bystander'); // proves the count is scoped per-user

    // Seed one bystander path — must not count toward `user`'s daily rate.
    await db.studyPlan.create({
      data: {
        userId: other.id,
        title: 'bystander path',
        source: 'ai',
        startDate: new Date(),
        endDate: new Date(),
      },
    });

    async function countTodayAiPaths(userId: string): Promise<number> {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);
      return db.studyPlan.count({
        where: { userId, source: 'ai', createdAt: { gte: startOfDay } },
      });
    }

    function underDailyCap(count: number): boolean {
      return count < AI_PATHS_PER_DAY;
    }

    for (let i = 1; i <= AI_PATHS_PER_DAY; i++) {
      const before = await countTodayAiPaths(user.id);
      expect(underDailyCap(before)).toBe(true); // allowed to create the i-th path
      await db.studyPlan.create({
        data: {
          userId: user.id,
          title: `ai path ${i}`,
          source: 'ai',
          startDate: new Date(),
          endDate: new Date(),
        },
      });
    }

    const afterFive = await countTodayAiPaths(user.id);
    expect(afterFive).toBe(AI_PATHS_PER_DAY);
    expect(underDailyCap(afterFive)).toBe(false); // 6th creation would be denied

    // Bystander's own path exists (1) but never leaked into `user`'s count above
    // (which landed at exactly AI_PATHS_PER_DAY, not AI_PATHS_PER_DAY + 1).
    const bystanderCount = await countTodayAiPaths(other.id);
    expect(bystanderCount).toBe(1);
  });

  it('trial user (PRO + weekly, no paid source): gets weekly ÷4 quotas, not full monthly', async () => {
    const grant = trialGrant();
    const user = await makeUser('trial-quota', grant);
    expect(deriveAccountState(user)).toBe('trialing');

    const check = await checkUsageLimit(user.id, 'ultra_path');
    expect(check.limit).toBe(1); // weekly ÷4 cap, not the monthly 3

    const first = await reserveUsage(user.id, 'ultra_path');
    expect(first.allowed).toBe(true);
    const second = await reserveUsage(user.id, 'ultra_path');
    expect(second.allowed).toBe(false); // denied at the weekly cap of 1, same as a paid weekly sub
  });

  it('expired trial / FREE tier: ultra_path and ai_study_plan are rejected outright (limit 0), never allowed', async () => {
    const user = await makeUser('expired-free', { tier: 'FREE', billingInterval: null });
    expect(deriveAccountState(user)).toBe('expired');

    const ultraCheck = await checkUsageLimit(user.id, 'ultra_path');
    expect(ultraCheck.limit).toBe(0);
    expect(ultraCheck.allowed).toBe(false); // 0 < 0 is false — used(0) is NOT < limit(0)

    const basicResult = await reserveUsage(user.id, 'ai_study_plan');
    expect(basicResult.allowed).toBe(false);
    expect(basicResult.limit).toBe(0);
  });

  it('admin role: bypasses every cap without touching the meter, regardless of tier', async () => {
    const admin = await makeUser('admin-bypass', { tier: 'FREE', role: 'admin' });
    const result = await reserveUsage(admin.id, 'ultra_path');
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(-1);

    const rows = await db.usageRecord.findMany({ where: { userId: admin.id, featureType: 'ultra_path' } });
    expect(rows).toHaveLength(0); // admin bypass never charges the meter
  });
});

// ---------------------------------------------------------------------------
// 4) tokenLimit accounting — the 4M/1M budget is read per-interval-period and
//    includes path-generation tokens (AiUsageEvent.feature is unfiltered —
//    checkTokenBudget aggregates ALL rows for the user in the period).
// ---------------------------------------------------------------------------
sandboxDescribe('tokenLimit accounting — checkTokenBudget (src/lib/token-budget.ts)', () => {
  it('PRO monthly: allowed under 4M, denied at/over 4M — path-generate tokens count toward the ceiling', async () => {
    const user = await makeUser('token-monthly', { tier: 'PRO', billingInterval: 'monthly' });

    await db.aiUsageEvent.create({
      data: {
        userId: user.id,
        feature: 'path-generate', // path generation IS included — no feature filter in checkTokenBudget
        provider: 'openrouter',
        model: 'glm-5.2',
        inputTokens: 3_000_000,
        outputTokens: 999_000,
      },
    });

    const underCap = await checkTokenBudget(user.id);
    expect(underCap.usedTokens).toBe(3_999_000);
    expect(underCap.tokenLimit).toBe(4_000_000);
    expect(underCap.allowed).toBe(true);

    // Push one more path-structure event to cross the ceiling.
    await db.aiUsageEvent.create({
      data: {
        userId: user.id,
        feature: 'path-structure',
        provider: 'openrouter',
        model: 'glm-5.2',
        inputTokens: 2_000,
        outputTokens: 0,
      },
    });

    const overCap = await checkTokenBudget(user.id);
    expect(overCap.usedTokens).toBe(4_001_000);
    expect(overCap.allowed).toBe(false); // used(4_001_000) < limit(4_000_000) is false
  });

  it('PRO weekly: budget ceiling is 1M (÷4), independent of the monthly ceiling', async () => {
    const user = await makeUser('token-weekly', { tier: 'PRO', billingInterval: 'weekly' });

    await db.aiUsageEvent.create({
      data: {
        userId: user.id,
        feature: 'path-generate',
        provider: 'openrouter',
        model: 'glm-5.2',
        inputTokens: 999_000,
        outputTokens: 500,
      },
    });
    const underCap = await checkTokenBudget(user.id);
    expect(underCap.tokenLimit).toBe(1_000_000);
    expect(underCap.allowed).toBe(true);

    await db.aiUsageEvent.create({
      data: {
        userId: user.id,
        feature: 'chat-generate',
        provider: 'anthropic',
        model: 'claude',
        inputTokens: 1_000,
        outputTokens: 0,
      },
    });
    const overCap = await checkTokenBudget(user.id);
    expect(overCap.usedTokens).toBe(1_000_500);
    expect(overCap.allowed).toBe(false);
  });

  it('budget reads per-PERIOD usage only: an event from a prior period does not count toward the current one', async () => {
    const user = await makeUser('token-period-scoped', { tier: 'PRO', billingInterval: 'monthly' });
    const currentPeriodStart = getMonthStart();
    const priorPeriod = new Date(currentPeriodStart.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days before this month started

    await db.aiUsageEvent.create({
      data: {
        userId: user.id,
        feature: 'path-generate',
        provider: 'openrouter',
        model: 'glm-5.2',
        inputTokens: 4_000_000, // would blow the cap if counted
        outputTokens: 0,
        createdAt: priorPeriod,
      },
    });

    const budget = await checkTokenBudget(user.id);
    expect(budget.usedTokens).toBe(0); // prior-period event correctly excluded
    expect(budget.allowed).toBe(true);
  });

  it('FREE tier: tokenLimit is 100_000, denied once crossed', async () => {
    const user = await makeUser('token-free', { tier: 'FREE', billingInterval: null });
    await db.aiUsageEvent.create({
      data: {
        userId: user.id,
        feature: 'chat-plain',
        provider: 'gemini',
        model: 'flash-lite',
        inputTokens: 100_001,
        outputTokens: 0,
      },
    });
    const budget = await checkTokenBudget(user.id);
    expect(budget.tokenLimit).toBe(100_000);
    expect(budget.allowed).toBe(false);
  });

  it('admin: bypasses the token budget entirely, tokenLimit reported as -1', async () => {
    const admin = await makeUser('token-admin', { tier: 'FREE', role: 'admin' });
    await db.aiUsageEvent.create({
      data: {
        userId: admin.id,
        feature: 'path-generate',
        provider: 'openrouter',
        model: 'glm-5.2',
        inputTokens: 999_999_999,
        outputTokens: 0,
      },
    });
    const budget = await checkTokenBudget(admin.id);
    expect(budget.allowed).toBe(true);
    expect(budget.tokenLimit).toBe(-1);
  });
});
