# Launch Report

## TL;DR
Launch security check (payments + rate limits): core payment webhooks/sync and most rate-limited abuse endpoints look thoughtfully implemented. However, there are two concrete weaknesses in the provided code: (1) an admin auth helper is treated as merely falsy (returning 404) instead of returning 401/403 consistently in at least one admin endpoint, and (2) a presence-token endpoint returns a token without rate limiting, making it an easier target for token harvesting/replay/abuse than the rest.

## Verdict
Launch ready: No
Security level: medium

## Detailed Report
Payments & billing: Lemon Squeezy webhook verifies HMAC using raw body and uses an idempotency record (webhookEvent) derived from event name/sub id/status/updated_at; failures release the claim by deleting the webhookEvent. RevenueCat webhook verifies a static shared secret and performs idempotency via webhookEvent, then provisions only when entitlement_ids includes the configured entitlement. Both routes appear reasonably designed against replay/mis-provisioning.

Rate limits & anti-abuse: Multiple endpoints implement per-IP/per-user rate limiting with “fail closed” behavior and additional quota checks (registration, forgot/resend, reset password, password change, tokenized login challenges, AI generation/import, translation, etc.). Admin moderation and admin actions are protected by admin auth checks.

Gaps specific to the supplied code for this launch criteria: The presence-token endpoint lacks rate limiting entirely while minting an HMAC token for downstream WebSocket authentication, which is security-sensitive and can be harvested at scale. Also, at least one admin endpoint uses an existence-leak policy (returning 404 when adminId is missing), which can be fine for some public surfaces, but is inconsistent with other admin endpoints that return 403. That inconsistency can cause operational/test confusion and weakens expected access-control semantics.

## AI Coding Agent Notes
Scope: whole-codebase launch security check focused on Payments, Rate limits.

Payment coverage in supplied files:
- apps/web/app/api/billing/lemonsqueezy/webhook/route.ts: HMAC signature verification on raw body + idempotency via db.webhookEvent.
- apps/web/app/api/billing/lemonsqueezy/sync/route.ts: user-authenticated sync with provider-side resolution (forged subscriptionId handled by owner-matching in sync helper per comments).
- apps/web/app/api/billing/lemonsqueezy/portal/route.ts: portal URL only when Lemon Squeezy entitlement source.
- apps/web/app/api/billing/revenuecat/webhook/route.ts: shared-secret auth header check + idempotency via db.webhookEvent + provision guarded by entitlement_ids + active grant logic.

Rate limit coverage in supplied files:
- apps/web/app/api/auth/[...nextauth]/route.ts: rate limit only applies to credential callback login.
- apps/web/app/api/auth/forgot-password/route.ts and resend-code: per-email cooldown + per-IP cap with fail-closed Redis outages.
- apps/web/app/api/auth/reset-password/route.ts and verify-email: per-IP caps.
- multiple AI and import endpoints: costRateLimit + checkTokenBudget/usage-limits.
- translation endpoint: layered cost-aware rate limiting + usage limit + per-language daily budget + single-flight.

Key issues blocking launch readiness based on provided code:
1) Token minting endpoint for WebSocket presence has no rate limiting.
2) Admin endpoint access semantics: one route returns 404 when admin auth fails, inconsistent with other admin endpoints and potentially weakening expected behavior.

## Code Snippets
### apps/web/app/api/auth/presence-token/route.ts:1-55
Evidence: presence-token endpoint mints tokens for authenticated users but contains no rateLimit calls, unlike other auth/abuse-sensitive endpoints.

```
import { NextRequest } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { successResponse, unauthorizedResponse, internalErrorResponse } from '@/lib/api-response';
import * as crypto from 'crypto';

const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET;
const TOKEN_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * GET /api/auth/presence-token
 * Returns a short-lived HMAC token for authenticating with the WebSocket presence server.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();
    if (!NEXTAUTH_SECRET) return internalErrorResponse('Server misconfigured');

    // `aud` scopes the token to the presence channel so it can't be replayed
    // against any other system that also signs with NEXTAUTH_SECRET. The WS
    // server should verify `aud === 'presence'` (unknown fields are ignored, so
    // this is backward-compatible until that check ships).
    const payloadB64 = Buffer.from(JSON.stringify({ userId, aud: 'presence' })).toString(
      'base64url'
    );
    const expiresB64 = Buffer.from(String(Date.now() + TOKEN_TTL)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', NEXTAUTH_SECRET)
      .update(`${payloadB64}.${expiresB64}`)
      .digest('base64url');

    const token = `${payloadB64}.${expiresB64}.${signature}`;

    return successResponse({ token });
  } catch {
    return internalErrorResponse();
  }
}
```

## Fixable Findings
- ERROR: Presence token minting endpoint lacks rate limiting
  - Location: apps/web/app/api/auth/presence-token/route.ts:1-55
  - apps/web/app/api/auth/presence-token/route.ts mints an HMAC presence token for any authenticated user request but applies no per-user or per-IP rate limiting. This makes token harvesting/abuse more feasible than other sensitive auth flows in the repo (login, password reset, etc.). Add rateLimit using getClientIp and a short cap (e.g., 10/min per user, 60/min per IP) and ensure fail-closed behavior.
- WARNING: Admin endpoint returns 404 on missing admin auth (inconsistent semantics)
  - Location: apps/web/app/api/admin/paths/[shareId]/pretranslate/route.ts:1-89
  - apps/web/app/api/admin/paths/[shareId]/pretranslate/route.ts returns notFoundResponse() when getAdminUserId(request) is falsy. In the supplied admin routes, most other admin endpoints use forbiddenResponse('Admin access required') or similar 403 responses. Returning 404 here is intentional for some public existence-leak surfaces, but for admin-only routes it can confuse monitoring/tests and reduce consistent authorization signaling. Consider switching to forbiddenResponse('Admin access required') (or 401) for admin auth failures, keeping the 404 policy only for non-existent resources if desired.