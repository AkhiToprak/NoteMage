import { describe, it, expect } from 'vitest';
import {
  getWeekStart,
  getPeriodStart,
  getMonthStart,
  limitFor,
  tokenLimitFor,
  PRO_WEEKLY_LIMITS,
  TIERS,
} from './tiers';

describe('getWeekStart', () => {
  it('returns the Monday of the week for any weekday (UTC)', () => {
    // 2026-07-08 is a Wednesday → Monday is 2026-07-06.
    expect(getWeekStart(new Date('2026-07-08T15:00:00Z')).toISOString()).toBe(
      '2026-07-06T00:00:00.000Z',
    );
  });
  it('treats Monday as its own week start', () => {
    expect(getWeekStart(new Date('2026-07-06T00:00:00Z')).toISOString()).toBe(
      '2026-07-06T00:00:00.000Z',
    );
  });
  it('rolls Sunday back to the prior Monday (not forward)', () => {
    // 2026-07-12 is a Sunday → its week started Monday 2026-07-06.
    expect(getWeekStart(new Date('2026-07-12T23:59:00Z')).toISOString()).toBe(
      '2026-07-06T00:00:00.000Z',
    );
  });
});

describe('getPeriodStart', () => {
  it('weekly resets weekly, everything else monthly', () => {
    expect(getPeriodStart('weekly').getTime()).toBe(getWeekStart().getTime());
    expect(getPeriodStart('monthly').getTime()).toBe(getMonthStart().getTime());
    expect(getPeriodStart('yearly').getTime()).toBe(getMonthStart().getTime());
    expect(getPeriodStart(null).getTime()).toBe(getMonthStart().getTime());
  });
});

describe('limitFor', () => {
  it('weekly PRO uses the reduced caps', () => {
    expect(limitFor('PRO', 'weekly', 'ultra_path')).toBe(PRO_WEEKLY_LIMITS.ultra_path);
    expect(limitFor('PRO', 'weekly', 'ultra_path')).toBe(1);
    expect(limitFor('PRO', 'weekly', 'ultra_path')).toBeLessThan(
      TIERS.PRO.limits.ultra_path,
    );
  });
  it('weekly PRO inherits unlimited features (-1) not listed in the override', () => {
    expect(limitFor('PRO', 'weekly', 'ai_flashcards')).toBe(-1);
    expect(limitFor('PRO', 'weekly', 'scholar_chat')).toBe(-1);
  });
  it('monthly/yearly/null PRO use the full monthly caps', () => {
    expect(limitFor('PRO', 'monthly', 'ultra_path')).toBe(3);
    expect(limitFor('PRO', 'yearly', 'ultra_path')).toBe(3);
    expect(limitFor('PRO', null, 'ultra_path')).toBe(3);
  });
  it('FREE never gets weekly overrides (no weekly plan)', () => {
    expect(limitFor('FREE', 'weekly', 'ultra_path')).toBe(TIERS.FREE.limits.ultra_path);
  });
});

describe('tokenLimitFor', () => {
  it('weekly PRO is a quarter of the monthly ceiling', () => {
    expect(tokenLimitFor('PRO', 'weekly')).toBe(1_000_000);
    expect(tokenLimitFor('PRO', 'monthly')).toBe(TIERS.PRO.tokenLimit);
    expect(tokenLimitFor('PRO', 'weekly')).toBeLessThan(tokenLimitFor('PRO', 'monthly'));
  });
  it('FREE is unaffected by interval', () => {
    expect(tokenLimitFor('FREE', 'weekly')).toBe(TIERS.FREE.tokenLimit);
  });
});
