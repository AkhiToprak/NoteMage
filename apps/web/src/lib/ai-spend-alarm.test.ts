import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  db: {
    aiUsageEvent: {
      aggregate: vi.fn(),
      groupBy: vi.fn(),
    },
  },
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mocks.db }));
vi.mock('@sentry/nextjs', () => ({ captureMessage: mocks.captureMessage }));

import { checkAiSpendAlarm } from './ai-spend-alarm';
import { computeCacheHitRatio } from './ai-usage';

// A non-daily hour so only the hourly window runs unless a test opts in.
const NON_DAILY = new Date('2026-07-07T12:00:00Z');
const DAILY = new Date('2026-07-07T06:00:00Z');

function aggReturns(costBySince: (since: Date) => number) {
  mocks.db.aiUsageEvent.aggregate.mockImplementation(
    async ({ where }: { where: { createdAt: { gte: Date } } }) => ({
      _sum: { costUsd: costBySince(where.createdAt.gte) },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  mocks.db.aiUsageEvent.groupBy.mockResolvedValue([
    { feature: 'path-generate', _sum: { costUsd: 4 } },
    { feature: 'chat-plain', _sum: { costUsd: 2 } },
  ]);
  delete process.env.AI_SPEND_ALARM_HOURLY_USD;
  delete process.env.AI_SPEND_ALARM_DAILY_USD;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('checkAiSpendAlarm — hourly', () => {
  it('fires when hourly spend exceeds the default $5 threshold', async () => {
    aggReturns(() => 7.5);
    await checkAiSpendAlarm(NON_DAILY);

    expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
    const [msg, opts] = mocks.captureMessage.mock.calls[0];
    expect(msg).toBe('ai-spend-alarm: hourly');
    expect(opts.level).toBe('warning');
    expect(opts.extra.windowUsd).toBe(7.5);
    expect(opts.extra.thresholdUsd).toBe(5);
    expect(opts.extra.topFeatures).toEqual([
      { feature: 'path-generate', costUsd: 4 },
      { feature: 'chat-plain', costUsd: 2 },
    ]);
  });

  it('does not fire when spend is at or below the threshold', async () => {
    aggReturns(() => 5); // not strictly greater than 5
    await checkAiSpendAlarm(NON_DAILY);
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });

  it('honors the env-var threshold override', async () => {
    process.env.AI_SPEND_ALARM_HOURLY_USD = '10';
    aggReturns(() => 8);
    await checkAiSpendAlarm(NON_DAILY);
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });
});

describe('checkAiSpendAlarm — daily gating', () => {
  it('skips the daily check outside the daily UTC hour', async () => {
    aggReturns(() => 100); // over daily $50 but under is irrelevant — hourly also fires
    await checkAiSpendAlarm(NON_DAILY);
    // Only the hourly alarm — never a daily one.
    expect(mocks.captureMessage).toHaveBeenCalledTimes(1);
    expect(mocks.captureMessage.mock.calls[0][0]).toBe('ai-spend-alarm: hourly');
  });

  it('fires the daily alarm at the daily UTC hour when the 24h window is over threshold', async () => {
    const dayAgo = new Date(DAILY.getTime() - 24 * 60 * 60 * 1000);
    // Keep the hourly window quiet; only the 24h window is hot.
    aggReturns((since) => (since.getTime() === dayAgo.getTime() ? 80 : 1));
    await checkAiSpendAlarm(DAILY);

    const labels = mocks.captureMessage.mock.calls.map((c) => c[0]);
    expect(labels).toContain('ai-spend-alarm: daily');
    expect(labels).not.toContain('ai-spend-alarm: hourly');
  });
});

describe('checkAiSpendAlarm — resilience', () => {
  it('never throws when the aggregate query fails', async () => {
    mocks.db.aiUsageEvent.aggregate.mockRejectedValue(new Error('db down'));
    await expect(checkAiSpendAlarm(NON_DAILY)).resolves.toBeUndefined();
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });
});

describe('computeCacheHitRatio', () => {
  it('is read / (read + input)', () => {
    expect(computeCacheHitRatio(30, 10)).toBe(0.75);
  });
  it('is 0 when the denominator is 0', () => {
    expect(computeCacheHitRatio(0, 0)).toBe(0);
  });
});
