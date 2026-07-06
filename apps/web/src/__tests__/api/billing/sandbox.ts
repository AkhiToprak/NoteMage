// Shared gate for billing sandbox integration tests. These suites drive the
// real route handlers into a real Postgres — they may run ONLY against the
// local Docker sandbox. With any other DATABASE_URL (including the remote
// Supabase from .env) every suite self-skips. Never weaken this check.
import { describe } from 'vitest';

export const SANDBOX_DATABASE_URL =
  'postgresql://notemage:sandbox@localhost:5433/notemage_sandbox';

export function isSandboxDb(): boolean {
  const url = process.env.DATABASE_URL ?? '';
  return url.includes('localhost:5433') && url.includes('notemage_sandbox');
}

/** `describe` on the sandbox DB, `describe.skip` everywhere else. */
export const sandboxDescribe = isSandboxDb() ? describe : describe.skip;

/**
 * Canonical fake billing env shared by all sandbox suites.
 * Variant ids: 101=weekly 102=monthly 103=yearly, 201/202/203 = PPP twins.
 * Assign to process.env BEFORE importing any app module.
 */
export const SANDBOX_BILLING_ENV = {
  LEMONSQUEEZY_WEBHOOK_SECRET: 'sandbox-ls-secret',
  LEMONSQUEEZY_PRO_VARIANT_IDS: '101,102,103,201,202,203',
  LEMONSQUEEZY_PRO_WEEKLY_VARIANT_IDS: '101,201',
  REVENUECAT_WEBHOOK_AUTH: 'sandbox-rc-auth',
};
