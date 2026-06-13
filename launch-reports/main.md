# Launch Report

## TL;DR
Launch security check (Payments + Rate limits) looks generally solid: user-facing login/forgot/reset/register/payment-related endpoints use IP/user rate limiting and fail-closed patterns; payment webhooks verify signatures and use idempotency. Biggest gaps for launch readiness are in admin mutation endpoints lacking any explicit rate limiting and in one billing/webhook control detail: RevenueCat webhook idempotency has no signature/timestamp replay protection beyond provider auth header, and it*

## Verdict
Launch ready: No
Security level: medium

## Detailed Report
Scope: whole-codebase launch security check focused on Payments and Rate limits.

High-level findings:
- Payments hardening: Lemon Squeezy webhook validates HMAC signature using raw request body, checks required fields, and deduplicates via derived eventId in db.webhookEvent. Fulfillment logic provisions/ends subscriptions via shared entitlement helpers.
- iOS RevenueCat webhook: validates Authorization header against REVENUECAT_WEBHOOK_AUTH (constant-time compare) and deduplicates by event id in db.webhookEvent. It ignores events without the entitlement id 'pro' and only provisions when entitlement is currently active based on expiration_at_ms.
- Payment “self-service” flows: Lemon Squeezy portal fetch and subscription sync endpoints bind to the authenticated user id and verify subscription ownership via syncLemonSqueezyAfterCheckout.

Rate limiting:
- Strong coverage on high-abuse unauthenticated flows: forgot-password, resend-code, verify-email, reset-password use rateLimit and per-email/per-IP caps, and generally return consistent messages to avoid enumeration.
- Credential brute force: NextAuth route throttles only credential callback login attempts, leaving other POST flows unthrottled.
- Other sensitive write endpoints shown in the provided files often do not include explicit rate limiting (admin cosmetics grants/revokes; admin user ban/unban/delete; group/share mutations; etc.), but many are already admin-protected.

Missing broad features (explicitly called out for launch report, not fixable via local findings):
- No app-wide / route-group standard rate limiting for admin mutation endpoints is evident in the provided files.
- No central monitoring/alerting for rate-limit saturation, webhook failures, and payment reconciliation drift is evident in the provided/"

## AI Coding Agent Notes
Agent notes (Payments + Rate limits):
- Payments endpoints reviewed (from provided files):
  - apps/web/app/api/billing/lemonsqueezy/webhook/route.ts (signature verification, dedupe, provisioning logic)
  - apps/web/app/api/billing/revenuecat/webhook/route.ts (auth header verification, dedupe)
  - apps/web/app/api/billing/lemonsqueezy/portal/route.ts (self-service portal URL)
  - apps/web/app/api/billing/lemonsqueezy/sync/route.ts (self-service sync)
  - apps/web/app/api/user/tier/route.ts (downgrade control)
- Rate-limit coverage reviewed in provided files:
  - Credential login brute force: apps/web/app/api/auth/[...nextauth]/route.ts
  - forgot-password: apps/web/app/api/auth/forgot-password/route.ts
  - resend-code: apps/web/app/api/auth/resend-code/route.ts
  - verify-email: apps/web/app/api/auth/verify-email/route.ts
  - reset-password: apps/web/app/api/auth/reset-password/route.ts
  - presence-token minting: apps/web/app/api/auth/presence-token/route.ts
  - registration: apps/web/app/api/auth/register/route.ts
  - native google/apple login: apps/web/app/api/auth/native/google/route.ts and .../apple/route.ts
- Admin mutation endpoints (reviewed):
  - apps/web/app/api/admin/users/[id]/route.ts
  - apps/web/app/api/admin/users/[id]/cosmetics/route.ts
  - apps/web/app/api/admin/paths/route.ts and other admin endpoints
  - Observation: these are admin-gated but do not use explicit rate limiting in the shown code.

Launch readiness decision:
- Marked NOT launch-ready due to: absence of explicit rate limiting on critical admin mutation endpoints (local fixable where shown), and a payment webhook control detail for RevenueCat idempotency safety (local fixable if the repo provides webhookEvent schema/constraints; however cannot fully assess without those files).

## Fixable Findings
- WARNING: Admin mutation endpoints lack explicit rate limiting (risk: brute-force admin tools / abuse if admin session/token compromised)
  - Location: apps/web/app/api/admin/users/[id]/route.ts:1-118
  - The shown admin endpoints perform sensitive state changes (ban/unban/delete users; grant/revoke cosmetics). They are admin-authenticated, but there is no explicit rate limiting/cost gating in these handlers. If an admin session is compromised or an internal tool is misconfigured, an attacker could rapidly mutate data. Recommend adding rateLimit/costRateLimit keyed by adminId+action for these routes.
- WARNING: Admin cosmetics grant/revoke endpoint lacks explicit rate limiting
  - Location: apps/web/app/api/admin/users/[id]/cosmetics/route.ts:1-165
  - The cosmetics grant/revoke endpoint is sensitive (writes UserCosmetic + notifications, and can unequip profile cosmetics). It is admin-authenticated but has no explicit rate limiting. Rate limit by adminId and targetId/action to prevent rapid abuse.
- WARNING: RevenueCat webhook replay/dedup safety depends on unique constraint visibility; ensure db.webhookEvent prevents duplicates across retries
  - Location: apps/web/app/api/billing/revenuecat/webhook/route.ts:1-169
  - RevenueCat webhook deduplicates by attempting to insert a row with eventId=event.id and provider=REVENUECAT. If the database does not have a unique constraint on (provider,eventId) (or equivalent), duplicates could grant PRO multiple times. Lemon Squeezy similarly dedups with derived eventId. For RevenueCat, confirm/ensure a unique index and handle unique-violation gracefully (currently it returns duplicate true only on create failure, but if duplicates are allowed it could lead to repeated provisions).