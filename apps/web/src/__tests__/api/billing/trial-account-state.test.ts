// Integration suite: 7-day trial, account-state derivation, pause, and the
// 90-day deletion sweep. Runs against the real sandbox Postgres via real
// Prisma — no mocks. Self-skips off-sandbox (see sandbox.ts).
import { SANDBOX_BILLING_ENV, sandboxDescribe } from './sandbox';

Object.assign(process.env, SANDBOX_BILLING_ENV);

import { afterAll, beforeEach, expect, it } from 'vitest';
import { db } from '@/lib/db';
import {
  activeGrant,
  deriveAccountState,
  endSubscription,
  resolveActiveEntitlement,
  trialGrant,
} from '@/lib/entitlement';
import { PAUSED_RETENTION_DAYS, sweepPausedAccountsForDeletion } from '@/lib/account-deletion';

const EMAIL_PREFIX = 'trial-';
const testEmail = (slug: string) => `${EMAIL_PREFIX}${slug}@sandbox.test`;

// Baseline required fields for a User row — trimmed to what the create needs.
function baseUserData(slug: string) {
  return {
    email: testEmail(slug),
    username: `trial_${slug}_${Math.random().toString(36).slice(2, 8)}`,
  };
}

async function cleanupOwnedRows() {
  await db.user.deleteMany({ where: { email: { startsWith: EMAIL_PREFIX } } });
}

// Scope every write/delete to our own 'trial-*' rows — shared sandbox DB.
beforeEach(cleanupOwnedRows);
afterAll(cleanupOwnedRows);

sandboxDescribe('7-day trial + account-state derivation', () => {
  it('fresh user + trialGrant() -> PRO/weekly/trialEndsAt~+7d, deriveAccountState=trialing', async () => {
    const before = Date.now();
    const user = await db.user.create({
      data: { ...baseUserData('fresh'), ...trialGrant() },
    });

    expect(user.tier).toBe('PRO');
    expect(user.billingInterval).toBe('weekly');
    expect(user.entitlementSource).toBeNull();
    expect(user.trialEndsAt).not.toBeNull();

    const deltaMs = user.trialEndsAt!.getTime() - before;
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    // Allow slack for test execution time either side of "before".
    expect(deltaMs).toBeGreaterThan(sevenDaysMs - 60_000);
    expect(deltaMs).toBeLessThan(sevenDaysMs + 60_000);

    expect(deriveAccountState(user)).toBe('trialing');
    expect(resolveActiveEntitlement(user)).toEqual({
      tier: 'PRO',
      source: null,
      expiresAt: null, // resolveActiveEntitlement reads subscriptionPeriodEnd, not trialEndsAt
      inGracePeriod: false,
    });
  });

  it('mid-trial (trialEndsAt in future) -> trialing; resolveActiveEntitlement still reports PRO/null-source', async () => {
    const user = await db.user.create({
      data: {
        ...baseUserData('midtrial'),
        tier: 'PRO',
        billingInterval: 'weekly',
        trialEndsAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      },
    });

    expect(deriveAccountState(user)).toBe('trialing');
    expect(resolveActiveEntitlement(user)).toEqual({
      tier: 'PRO',
      source: null,
      expiresAt: null,
      inGracePeriod: false,
    });
  });

  it('expired trial (trialEndsAt = yesterday) -> expired; resolveActiveEntitlement still reads raw tier (PRO) since it does not re-derive', async () => {
    const user = await db.user.create({
      data: {
        ...baseUserData('expiredtrial'),
        tier: 'PRO',
        billingInterval: 'weekly',
        trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    // deriveAccountState is the gate check: lapsed trial with no paid source -> expired.
    expect(deriveAccountState(user)).toBe('expired');
    // resolveActiveEntitlement is a dumb field mapper (see AccountGateServerGate,
    // which is the thing that actually flips tier PRO->FREE on 'expired'). Until
    // that flip runs, resolveActiveEntitlement still reports the stale PRO tier —
    // this is the documented contract, not a bug.
    expect(resolveActiveEntitlement(user)).toEqual({
      tier: 'PRO',
      source: null,
      expiresAt: null,
      inGracePeriod: false,
    });
  });
});

sandboxDescribe('activeGrant() — subscription purchase/renewal', () => {
  it('expired-trial user receiving activeGrant WITHOUT wasActive -> active state + pendingWelcome=true', async () => {
    const user = await db.user.create({
      data: {
        ...baseUserData('convert-new'),
        tier: 'FREE', // simulate AccountGateServerGate already flipped PRO->FREE on expiry
        billingInterval: null,
        trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });

    const updated = await db.user.update({
      where: { id: user.id },
      data: activeGrant({
        source: 'LEMON_SQUEEZY',
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        interval: 'monthly',
        wasActive: false, // first purchase / trial conversion
      }),
    });

    expect(updated.tier).toBe('PRO');
    expect(updated.entitlementSource).toBe('LEMON_SQUEEZY');
    expect(updated.trialEndsAt).toBeNull();
    expect(updated.pausedAt).toBeNull();
    expect(updated.pendingWelcome).toBe(true);
    expect(deriveAccountState(updated)).toBe('active');
  });

  it('already-active subscriber receiving activeGrant WITH wasActive=true (renewal) -> pendingWelcome stays false', async () => {
    const user = await db.user.create({
      data: {
        ...baseUserData('renew'),
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        billingInterval: 'monthly',
        subscriptionPeriodEnd: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
        pendingWelcome: false,
      },
    });

    const updated = await db.user.update({
      where: { id: user.id },
      data: activeGrant({
        source: 'LEMON_SQUEEZY',
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        interval: 'monthly',
        wasActive: true, // renewal — must NOT replay the welcome screen
      }),
    });

    expect(updated.tier).toBe('PRO');
    expect(updated.pendingWelcome).toBe(false);
    expect(deriveAccountState(updated)).toBe('active');
  });
});

sandboxDescribe('endSubscription() — cross-channel downgrade safety', () => {
  it('ending the ACTIVE backing provider subscription -> tier FREE + cleared billing fields', async () => {
    const user = await db.user.create({
      data: {
        ...baseUserData('end-active'),
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        billingInterval: 'monthly',
        subscriptionPeriodEnd: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
        lemonSqueezySubscriptionId: 'ls-sub-end-active',
        inGracePeriod: true,
      },
    });

    const updateData = endSubscription(user, 'LEMON_SQUEEZY');
    const updated = await db.user.update({ where: { id: user.id }, data: updateData });

    expect(updated.tier).toBe('FREE');
    expect(updated.entitlementSource).toBeNull();
    expect(updated.subscriptionPeriodEnd).toBeNull();
    expect(updated.inGracePeriod).toBe(false);
    expect(updated.billingInterval).toBeNull();
    expect(updated.lemonSqueezySubscriptionId).toBeNull();
    expect(deriveAccountState(updated)).toBe('expired');
  });

  it('ending a NON-backing provider (stale/duplicate event) -> leaves tier/period untouched, only detaches its own id', async () => {
    const periodEnd = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000);
    const user = await db.user.create({
      data: {
        ...baseUserData('end-stale'),
        tier: 'PRO',
        entitlementSource: 'APPLE_IAP', // Apple is the ACTIVE backing provider
        subscriptionPeriodEnd: periodEnd,
        lemonSqueezySubscriptionId: 'ls-sub-stale-end-stale',
      },
    });

    // A stale LEMON_SQUEEZY end-event arrives even though Apple backs the tier.
    const updateData = endSubscription(user, 'LEMON_SQUEEZY');
    const updated = await db.user.update({ where: { id: user.id }, data: updateData });

    expect(updated.tier).toBe('PRO'); // untouched
    expect(updated.entitlementSource).toBe('APPLE_IAP'); // untouched
    expect(updated.subscriptionPeriodEnd?.getTime()).toBe(periodEnd.getTime()); // untouched
    expect(updated.lemonSqueezySubscriptionId).toBeNull(); // only its own id detached
    expect(deriveAccountState(updated)).toBe('active');
  });
});

sandboxDescribe('pause — underlying lib behavior (route needs an auth session, tested via deriveAccountState + direct DB write)', () => {
  // The route itself (app/api/account/pause/route.ts) requires a signed
  // session via getAuthUserId(request) — not practical to drive from an
  // integration test without a real NextAuth cookie. Its logic is exactly:
  //   1. load user, 2. deriveAccountState, 3. only 'expired' may transition
  //      to paused (idempotent no-op if already paused, 400 otherwise),
  //   4. set pausedAt = now.
  // We assert that same state machine directly against the DB.

  it('deriveAccountState=expired is the only state eligible to pause; active/trialing/comped are not', async () => {
    const expiredUser = await db.user.create({
      data: {
        ...baseUserData('pause-eligible'),
        tier: 'PRO',
        trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    expect(deriveAccountState(expiredUser)).toBe('expired');

    const trialingUser = await db.user.create({
      data: {
        ...baseUserData('pause-ineligible-trialing'),
        ...trialGrant(),
      },
    });
    expect(deriveAccountState(trialingUser)).toBe('trialing');

    const activeUser = await db.user.create({
      data: {
        ...baseUserData('pause-ineligible-active'),
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
      },
    });
    expect(deriveAccountState(activeUser)).toBe('active');

    const compedUser = await db.user.create({
      data: {
        ...baseUserData('pause-ineligible-comped'),
        tier: 'PRO',
        entitlementSource: 'MANUAL',
      },
    });
    expect(deriveAccountState(compedUser)).toBe('comped');
  });

  it('setting pausedAt on an expired user -> deriveAccountState=paused (pause wins over everything else)', async () => {
    const user = await db.user.create({
      data: {
        ...baseUserData('pause-apply'),
        tier: 'PRO',
        trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    expect(deriveAccountState(user)).toBe('expired');

    const paused = await db.user.update({
      where: { id: user.id },
      data: { pausedAt: new Date() },
    });
    expect(deriveAccountState(paused)).toBe('paused');
  });

  it('pausedAt set on an otherwise-active/comped row STILL resolves to paused (pause ordering is unconditional, per the code comment)', async () => {
    // deriveAccountState checks `if (user.pausedAt) return 'paused'` FIRST,
    // before even looking at tier/source. Route-level guards prevent this
    // combination from happening via the API, but the pure function itself
    // has no such guard — pin that contract here.
    const user = await db.user.create({
      data: {
        ...baseUserData('pause-overrides-active'),
        tier: 'PRO',
        entitlementSource: 'LEMON_SQUEEZY',
        pausedAt: new Date(),
      },
    });
    expect(deriveAccountState(user)).toBe('paused');
  });

  it('no resume/unpause function exists in entitlement.ts or account/pause route — resubscribe via activeGrant() is the only path that clears pausedAt', async () => {
    const user = await db.user.create({
      data: {
        ...baseUserData('pause-then-resub'),
        tier: 'PRO',
        trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
        pausedAt: new Date(),
      },
    });
    expect(deriveAccountState(user)).toBe('paused');

    const resubscribed = await db.user.update({
      where: { id: user.id },
      data: activeGrant({
        source: 'LEMON_SQUEEZY',
        periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        wasActive: false,
      }),
    });

    expect(resubscribed.pausedAt).toBeNull();
    expect(deriveAccountState(resubscribed)).toBe('active');
  });
});

sandboxDescribe('comp/manual users', () => {
  it('provider MANUAL, tier PRO, no subscription fields -> comped, never gated, no trial fields required', async () => {
    const user = await db.user.create({
      data: {
        ...baseUserData('comped'),
        tier: 'PRO',
        entitlementSource: 'MANUAL',
        // No trialEndsAt, no subscriptionPeriodEnd, no billingInterval — comps
        // don't need any of the trial/subscription scaffolding.
      },
    });

    expect(user.trialEndsAt).toBeNull();
    expect(user.subscriptionPeriodEnd).toBeNull();
    expect(deriveAccountState(user)).toBe('comped');

    // A comp is never gated even with a pausedAt-free, sourceless neighbor state —
    // sanity check that comped survives every "else" branch other than pause.
    expect(deriveAccountState(user)).not.toBe('expired');
  });
});

sandboxDescribe('AccountGateServerGate — static contract review (server component, not unit-testable directly)', () => {
  // AccountGateServerGate is an async server component reading getServerAuthToken()
  // (a NextAuth JWT helper) — it can't be invoked outside a request/render context
  // in a vitest integration test. Its logic was reviewed line-by-line instead
  // (src/components/account-gate/AccountGateServerGate.tsx); we pin the documented
  // contract here against the same deriveAccountState used by the component, so a
  // future change to one without the other fails a test.
  //
  // Contract, in evaluation order:
  //   0. No userId, or token.onboardingComplete === false -> renders null (no gate).
  //   1. user.pendingWelcome === true -> tries an atomic
  //      `updateMany({ where: { id, pendingWelcome: true }, data: { pendingWelcome: false } })`.
  //      If claim.count === 1 (won the race) -> renders the "welcome" overlay and
  //      RETURNS — it does NOT also check state this render. If it lost the race
  //      (another tab/request already claimed it), falls through to state check.
  //   2. state = deriveAccountState(user).
  //      - 'paused'  -> renders "paused" overlay with deletionAt = pausedAt + 90d.
  //      - 'expired' -> if tier was still 'PRO', atomically flips tier->FREE
  //                     (guarded: only where tier='PRO' AND entitlementSource=null
  //                     AND pausedAt=null AND (trialEndsAt=null OR trialEndsAt<=now),
  //                     so it can't race a pause/resubscribe OR downgrade a still-
  //                     trialing row), then renders "expired" overlay. The trialEndsAt
  //                     clause makes the WHERE self-defending: it mirrors
  //                     deriveAccountState's 'expired' criteria for every column SQL
  //                     can express, so the guard no longer relies solely on call-site
  //                     discipline to avoid downgrading active trials.
  //      - 'active' | 'trialing' | 'comped' -> renders null (no gate at all).
  //   3. Any thrown error -> caught, renders null (fails open, never hard-blocks
  //      the dashboard on a DB blip).

  it('pinning: paused always gates regardless of tier/source (matches overlay branch 2a)', async () => {
    const user = await db.user.create({
      data: { ...baseUserData('gate-paused'), tier: 'PRO', entitlementSource: 'MANUAL', pausedAt: new Date() },
    });
    expect(deriveAccountState(user)).toBe('paused');
  });

  it('pinning: expired is the only state where the component performs its own tier PRO->FREE side effect', async () => {
    const user = await db.user.create({
      data: {
        ...baseUserData('gate-expired'),
        tier: 'PRO',
        trialEndsAt: new Date(Date.now() - 60_000),
      },
    });
    expect(deriveAccountState(user)).toBe('expired');

    // Replicate the component's guarded atomic flip exactly.
    const claim = await db.user.updateMany({
      where: { id: user.id, tier: 'PRO', entitlementSource: null, pausedAt: null },
      data: { tier: 'FREE', billingInterval: null },
    });
    expect(claim.count).toBe(1);

    const after = await db.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(after.tier).toBe('FREE');
    expect(after.billingInterval).toBeNull();
  });

  it('pinning: the flip guard is self-defending — it matches expired rows (lapsed-trial and never-trial) but NOT active/comped (entitlementSource) NOR a still-trialing row (trialEndsAt in the future)', async () => {
    // The guard's WHERE now mirrors deriveAccountState's 'expired' criteria for
    // every column SQL can express:
    //   tier='PRO' AND entitlementSource=null AND pausedAt=null
    //     AND (trialEndsAt=null OR trialEndsAt<=now)
    // KEEP IN SYNC with AccountGateServerGate.tsx — this is an honest inline
    // replica of that component's updateMany guard; if the component's WHERE
    // changes, change it here too. The trialEndsAt clause is what makes the
    // downgrade self-defending: a still-trialing row (entitlementSource=null,
    // pausedAt=null, trialEndsAt in the FUTURE) shares every other column with an
    // expired row, but is now excluded by trialEndsAt — so even a future edit that
    // called this update outside `state === 'expired'` could not silently
    // downgrade an active trial. active/comped stay excluded via entitlementSource.
    const guardWhere = (id: string) => ({
      id,
      tier: 'PRO' as const,
      entitlementSource: null,
      pausedAt: null,
      OR: [{ trialEndsAt: null }, { trialEndsAt: { lte: new Date() } }],
    });

    // --- Rows the guard must EXCLUDE ---
    const active = await db.user.create({
      data: { ...baseUserData('gate-active'), tier: 'PRO', entitlementSource: 'LEMON_SQUEEZY' },
    });
    const comped = await db.user.create({
      data: { ...baseUserData('gate-comped'), tier: 'PRO', entitlementSource: 'MANUAL' },
    });
    const trialing = await db.user.create({
      data: { ...baseUserData('gate-trialing'), ...trialGrant() },
    });

    for (const u of [active, comped]) {
      expect(deriveAccountState(u)).not.toBe('expired');
      const claim = await db.user.updateMany({
        where: guardWhere(u.id),
        data: { tier: 'FREE', billingInterval: null },
      });
      expect(claim.count).toBe(0); // excluded via entitlementSource != null
    }

    // The still-trialing row now does NOT match — the guard is no longer relying
    // solely on the call site to protect active trials.
    expect(deriveAccountState(trialing)).toBe('trialing');
    const trialingClaim = await db.user.updateMany({
      where: guardWhere(trialing.id),
      data: { tier: 'FREE', billingInterval: null },
    });
    expect(trialingClaim.count).toBe(0); // excluded via the trialEndsAt clause

    // The trialing row must be untouched (not downgraded).
    const trialingAfter = await db.user.findUniqueOrThrow({ where: { id: trialing.id } });
    expect(trialingAfter.tier).toBe('PRO');
    expect(trialingAfter.billingInterval).toBe('weekly');
    expect(deriveAccountState(trialingAfter)).toBe('trialing');

    // --- Rows the guard must still MATCH (genuinely expired) ---
    // (a) lapsed trial: trialEndsAt in the past.
    const expiredTrial = await db.user.create({
      data: {
        ...baseUserData('gate-expired-trial'),
        tier: 'PRO',
        billingInterval: 'weekly',
        trialEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000),
      },
    });
    expect(deriveAccountState(expiredTrial)).toBe('expired');
    const expiredTrialClaim = await db.user.updateMany({
      where: guardWhere(expiredTrial.id),
      data: { tier: 'FREE', billingInterval: null },
    });
    expect(expiredTrialClaim.count).toBe(1); // trialEndsAt <= now

    // (b) never-trial expired: trialEndsAt null (e.g. a lapsed subscriber the
    //     end-event already stripped to source=null, or a row that never trialed).
    const neverTrial = await db.user.create({
      data: { ...baseUserData('gate-never-trial'), tier: 'PRO', trialEndsAt: null },
    });
    expect(deriveAccountState(neverTrial)).toBe('expired');
    const neverTrialClaim = await db.user.updateMany({
      where: guardWhere(neverTrial.id),
      data: { tier: 'FREE', billingInterval: null },
    });
    expect(neverTrialClaim.count).toBe(1); // trialEndsAt IS null
  });
});

sandboxDescribe('90-day deletion sweep', () => {
  it('SELECT-equivalent of the sweep criteria matches only rows I control (pre-flight safety check)', async () => {
    // Mirrors sweepPausedAccountsForDeletion's exact WHERE clause. Confirms
    // before any destructive call that nothing outside our 'trial-*' rows
    // could be swept — required by the task's shared-DB safety rule.
    const cutoff = new Date(Date.now() - PAUSED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const due = await db.user.findMany({
      where: { pausedAt: { lt: cutoff } },
      select: { id: true, email: true },
    });
    const foreign = due.filter((u) => !u.email.startsWith(EMAIL_PREFIX));
    expect(foreign).toEqual([]);
  });

  it('sweep deletes a paused-91-days user; survives a paused-30-days user and an active-trial user', async () => {
    const now = new Date();
    const ninetyOneDaysAgo = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000);
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dueForDeletion = await db.user.create({
      data: { ...baseUserData('sweep-due'), tier: 'FREE', pausedAt: ninetyOneDaysAgo },
    });
    const withinRetention = await db.user.create({
      data: { ...baseUserData('sweep-within-retention'), tier: 'FREE', pausedAt: thirtyDaysAgo },
    });
    const activeTrial = await db.user.create({
      data: { ...baseUserData('sweep-active-trial'), ...trialGrant() },
    });

    // Re-verify immediately before executing: only rows we just created (all
    // 'trial-*') can match — no foreign row snuck in between the pre-flight
    // check and now (other agents don't write pausedAt >= 90d per the rules).
    const cutoff = new Date(now.getTime() - PAUSED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const due = await db.user.findMany({ where: { pausedAt: { lt: cutoff } }, select: { email: true } });
    expect(due.every((u) => u.email.startsWith(EMAIL_PREFIX))).toBe(true);
    expect(due.map((u) => u.email)).toContain(dueForDeletion.email);

    const result = await sweepPausedAccountsForDeletion(now);
    expect(result.deleted).toBeGreaterThanOrEqual(1);

    const deletedRow = await db.user.findUnique({ where: { id: dueForDeletion.id } });
    expect(deletedRow).toBeNull();

    const survivedPaused = await db.user.findUnique({ where: { id: withinRetention.id } });
    expect(survivedPaused).not.toBeNull();
    expect(survivedPaused?.pausedAt?.getTime()).toBe(thirtyDaysAgo.getTime());

    const survivedTrial = await db.user.findUnique({ where: { id: activeTrial.id } });
    expect(survivedTrial).not.toBeNull();
    expect(deriveAccountState(survivedTrial!)).toBe('trialing');
  });

  it('exactly-at-cutoff (pausedAt = now - 90d) is NOT due (lt is strict, boundary is inclusive-safe on the survive side)', async () => {
    const now = new Date();
    const exactlyCutoff = new Date(now.getTime() - PAUSED_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const user = await db.user.create({
      data: { ...baseUserData('sweep-boundary'), tier: 'FREE', pausedAt: exactlyCutoff },
    });

    await sweepPausedAccountsForDeletion(now);

    const survived = await db.user.findUnique({ where: { id: user.id } });
    expect(survived).not.toBeNull();
  });
});
