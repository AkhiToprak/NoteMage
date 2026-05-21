// P12V — FREE-tier AI-path switchover flag (plan §P12 / P0 §5.1, AC-Switch-1/2/5).
//
// The flag lives in exactly one place: the `ai_study_plan` getter on
// FREE.limits in tiers.ts. These tests pin the contract that drives the
// whole switchover — the getter is dynamic (reads the env var at access
// time) so a Coolify container restart flips it without a rebuild, which
// is what makes the one-minute rollback (AC-Switch-5) possible.

import { describe, it, expect, afterEach } from 'vitest';
import { TIERS } from '@/lib/tiers';
import { freeTierAiPathsDisabled } from '@/lib/feature-flags';

const ORIGINAL = process.env.FREE_TIER_AI_PATHS_DISABLED;

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.FREE_TIER_AI_PATHS_DISABLED;
  else process.env.FREE_TIER_AI_PATHS_DISABLED = ORIGINAL;
});

describe('freeTierAiPathsDisabled()', () => {
  it('is true only when the env var is exactly "true"', () => {
    process.env.FREE_TIER_AI_PATHS_DISABLED = 'true';
    expect(freeTierAiPathsDisabled()).toBe(true);

    process.env.FREE_TIER_AI_PATHS_DISABLED = 'false';
    expect(freeTierAiPathsDisabled()).toBe(false);

    process.env.FREE_TIER_AI_PATHS_DISABLED = '1';
    expect(freeTierAiPathsDisabled()).toBe(false);

    delete process.env.FREE_TIER_AI_PATHS_DISABLED;
    expect(freeTierAiPathsDisabled()).toBe(false);
  });
});

describe('FREE.limits.ai_study_plan switchover gate', () => {
  it('stays at the legacy 3 when the flag is off (default / "false")', () => {
    delete process.env.FREE_TIER_AI_PATHS_DISABLED;
    expect(TIERS.FREE.limits.ai_study_plan).toBe(3);

    process.env.FREE_TIER_AI_PATHS_DISABLED = 'false';
    expect(TIERS.FREE.limits.ai_study_plan).toBe(3);
  });

  it('drops to 0 when the flag is on (AC-Switch-1)', () => {
    process.env.FREE_TIER_AI_PATHS_DISABLED = 'true';
    expect(TIERS.FREE.limits.ai_study_plan).toBe(0);
  });

  it('is a dynamic getter — flips both ways without re-import (AC-Switch-5 rollback)', () => {
    process.env.FREE_TIER_AI_PATHS_DISABLED = 'true';
    expect(TIERS.FREE.limits.ai_study_plan).toBe(0);

    process.env.FREE_TIER_AI_PATHS_DISABLED = 'false';
    expect(TIERS.FREE.limits.ai_study_plan).toBe(3);
  });

  it('PRO ai_study_plan stays unlimited regardless of the flag (AC-Switch-2)', () => {
    process.env.FREE_TIER_AI_PATHS_DISABLED = 'true';
    expect(TIERS.PRO.limits.ai_study_plan).toBe(-1);

    process.env.FREE_TIER_AI_PATHS_DISABLED = 'false';
    expect(TIERS.PRO.limits.ai_study_plan).toBe(-1);
  });

  it('is enumerable so usage-summary iteration still sees it', () => {
    process.env.FREE_TIER_AI_PATHS_DISABLED = 'true';
    const entries = Object.fromEntries(Object.entries(TIERS.FREE.limits));
    expect(entries.ai_study_plan).toBe(0);
  });
});
