# Security Remediation — 2026-06-13

Companion to `security-audit-2026-06-13.md`. Fixes the confirmed cost-bankruptcy / access-control findings. Implemented by 11 Opus agents (2 foundation + 9 route lanes) plus lead fixes & verification. **No DB migration required** (new meters are string `featureType` keys + an exhaustive `FeatureType` union; atomicity via a Postgres advisory lock).

## Foundation (shared libs)
- **`src/lib/token-budget.ts`** — `checkTokenBudget` now aggregates `AiUsageEvent.inputTokens+outputTokens` for the month instead of only `ChatMessage.tokens`. The monthly ceiling (FREE 100k / PRO 1M) finally counts path generation, page-generate, PDF/video import, moderation, and classify — closing the **critical** blind spot and bounding even PRO's "unlimited" per-feature counts. `recordTokenUsage` kept with a deprecation note.
- **`src/lib/rate-limit.ts`** — added `costRateLimit(key, max, windowMs, cost?)`: fails **closed in production**, open in dev. Module-load `console.error` if `UPSTASH_*` is missing in production.
- **`src/lib/usage-limits.ts`** — added `reserveUsage(userId, feature, amount?)`: atomic check-and-increment inside a `db.$transaction` guarded by `pg_advisory_xact_lock(hashtext(userId:feature))`, killing the gate-then-increment TOCTOU race. Pairs with the existing `refundUsage` (reserve-then-settle).
- **`src/lib/tiers.ts`** — new monthly anti-abuse meters: `path_regenerate` (FREE 5 / PRO 50), `path_translate` (5 / 50), `moderation_audit` (10 / 30), `code_execute` (300 / 3000).
- **`.env.example`** — documents `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` as **required in production**.

## Route lanes
- **Import (pdf/video):** POSTs use `costRateLimit`; both **retry** routes (previously unguarded) now `costRateLimit(5/60s)`; video minutes reserved atomically (refund on dispatch failure). Idempotency/staleness guards preserved.
- **Paths:** `regenerate`→`reserveUsage('path_regenerate')`, `translate`→`reserveUsage('path_translate')`, `publish`→`costRateLimit` + `reserveUsage('moderation_audit')` (kills the publish→unpublish→republish re-moderation loop), all with refund on pre-dispatch abort. `create` switched to `costRateLimit` + a **per-user concurrent-generation cap** (max 3 in-flight `generating` plans).
- **Chat + page-AI:** all AI limiters switched to `costRateLimit`; `pages/[pageId]/generate` limiter re-keyed from **IP-only → per-user** (kills the shared-IP / `X-Forwarded-For`-spoof bypass).
- **code-execute:** `costRateLimit` + DB-backed `reserveUsage('code_execute')` backstop so the abuse ceiling no longer depends solely on Redis.
- **Exports (8 routes):** per-user `rateLimit(10/60s)` (fail-open — compute, not AI $) + 500-item / content-length payload caps before document build.
- **File imports (xlsx/pptx/docx/pdf):** per-user `rateLimit(10/60s)` + hard pre-parse byte caps (25MB docs / 50MB pdf), XLSX cell-count guard. `import-url` left as-is (already hardened: 5MB fetch cap + limiter).
- **Middleware:** global per-IP throttle (`global:ip:<ip>`, 150 req/60s, fail-**open** so a Redis blip can't down the site), after maintenance check, before the API auth-gate, skipping static assets. The only DDoS shock-absorber on Coolify (no edge WAF).
- **Data/PII + WS:** `profile/[username]` gates age/location/school/social handles to owner-or-accepted-friend; `ws-server.ts` presence-token + `/emit` + `/debug` secret compares now `crypto.timingSafeEqual` with length guards, presence `aud='presence'` enforced; `waitlist` limiter fail-closed in prod.

## Verification
- `tsc --noEmit`: **0 errors**.
- Changed-area test suites green (`usage-limits`, `paths-create-switchover`, `paths-publish`, `paths-translate`, `paths-access`(pre-existing), `api-auth-coverage`). Stale mocks updated to teach tests about the new `studyPlan.count`, `reserveUsage`, `costRateLimit`, and `staleGenerationCutoff` calls — no security assertions weakened.
- **`api-auth-coverage` (NM-M1 invariant) is now GREEN** — its `PUBLIC_ALLOWLIST` was reconciled with 3 legitimately-public, already-protected pre-auth routes (`forgot-password`, `reset-password`, `native/google`).
- Remaining red tests (`paths-access`, 4) proven **pre-existing** via stash-baseline diff (fail identically without these changes).

## Accepted residuals (low-risk, documented)
- `pdf-import` POST meters pages after the worker (count known late); `costRateLimit` + the now-effective token budget bound it.
- `community/paths` per-language daily translation budget remains read-then-spend (bounded by the rate limit + single-flight).
- `code-execute` refunds the full reserved cost if a grade run throws mid-loop (never over-charges).

## Outstanding — needs owner decision / infra (NOT code)
1. **Verify `UPSTASH_*` is set in Coolify prod.** Cost routes now fail **closed** in production — if Redis is unconfigured they will block. (Auth routes already fail closed and work, which strongly implies it is set — but confirm.)
2. **RLS** — still absent (0 policies). Intentionally not enabled here: doing so blind could lock out the app depending on Prisma's DB role. Verify the connection role in Supabase and roll out RLS policies separately.
3. **CAPTCHA / proof-of-work on signup** — needs a provider + keys + UX decision (registration already has a fail-closed per-IP cap, but no human-verification).
4. **Supabase Storage bucket `fileSizeLimit`** — set as the authoritative upload cap (code-side byte caps are now in place as defense-in-depth).
