# P0 spec — Path publishing & community library

> Companion to `plans/path-publishing-community-library.md`. This is the P0 deliverable: the requirements freeze and domain-model spec that anchors P1+. P0V verification record is at the bottom of this file. **Sign-off on the P0V section is the gate to start P1.**

Authored 2026-05-20.

---

## 1. Glossary

- **SharedPath** — a `StudyPlan` snapshot published to the community library, with moderation state.
- **PathTranslation** — a `(SharedPath, language)` cached translation row; the read-side cache and the write-side single-flight key.
- **ModerationAudit** — append-only per-layer log of every L1/L2/L3/L5 verdict on a SharedPath.
- **Ticket** — human-actionable work item. v1 type is `moderation_review` (L3 escalations); the table is generic so future review types reuse it.
- **Seed path** — admin-curated SharedPath flagged `seeded=true`; bypasses moderation. Distinct from "any path published by an admin user".

---

## 2. Acceptance criteria (per journey)

ACs are journey-scoped, named `AC-<journey>-<n>`, and traced back to the originating constraint in [`path-publishing-community-library.md` §1](path-publishing-community-library.md). System-level ACs live in §6 of that plan.

### 2.1 Author publishes a path
- **AC-Publish-1** Only the owner of `StudyPlan` can publish; a non-owner `POST` returns 404 (not 403, to avoid existence leak).
- **AC-Publish-2** Publish is rejected when `StudyPlan.generationStatus !== 'ready'` (`generating`/`queued`/`failed` all fail with a typed error).
- **AC-Publish-3** Publishing the same plan twice returns the existing `SharedPath` row idempotently — no duplicate publications.
- **AC-Publish-4** On publish, `SharedPath` snapshots `language`, `subjects`, slot count, and phase count at the moment of publishing. Later edits to the source `StudyPlan` do not retroactively mutate the SharedPath listing.
- **AC-Publish-5** A published SharedPath starts in `moderationStatus='pending'`, runs L1 inside the request, and the API returns the resulting state (typically `auditing_l2` after L1 passes, or `rejected` if L1 blocks).
- **AC-Publish-6** Author can unpublish at any moderation state via `DELETE /api/community/paths/[shareId]`; any open moderation `Ticket` for that path gets auto-dismissed with `resolutionNote="path deleted by author"`.
- **AC-Publish-7** Author sees a status chip on the path card reflecting moderation state, with the chip's copy reviewed in both dark and light mode.

### 2.2 User browses the community library
- **AC-Browse-1** Library endpoint returns **only** `moderationStatus='approved'` SharedPaths.
- **AC-Browse-2** Filters compose: `subject × language × minSlots/maxSlots × sort(popular|recent)`. Empty filter = all approved paths.
- **AC-Browse-3** Search is `ILIKE` over `SharedPath.title` and `SharedPath.description`, case-insensitive, length-capped at 100 chars.
- **AC-Browse-4** Pagination defaults to `limit=20`, hard-cap `limit=50`. `totalPages` reflects filtered count.
- **AC-Browse-5** Library route requires auth in v1; unauth visits redirect to `/auth/login`.
- **AC-Browse-6** Detail page shows phase + slot titles but **not** theory/quiz content (content is gated behind clone or translate-then-view).
- **AC-Browse-7** All library surfaces pass the light-mode-no-light-text audit and keyboard-nav baseline.
- **AC-Browse-8** List cards and detail pages expose the path's public social signals as user-visible metrics: **view count, clone count (a.k.a. "people studying this"), rating average + rating count**. These are the only quality signals shown publicly in v1 — comments and free-text reviews are deferred to v2.
- **AC-Browse-9** Sort options include `popular | recent | rating`. `rating` sort uses `ratingAverage DESC` filtered to `ratingCount >= MIN_RATING_SAMPLES` (default **5**) so a single 5-star vote doesn't outrank a 4.8/200; rows below the sample threshold fall back to the secondary `popular` ordering.

### 2.3 User clones a path
- **AC-Clone-1** Clone is auth-required; clone target must be approved (404 otherwise — same existence-leak policy).
- **AC-Clone-2** Clone deep-copies `StudyPlan + StudyPhase + CheckpointSlot + CheckpointActivity + Theory/Flashcard/Quiz content` with fresh IDs.
- **AC-Clone-3** Clone resets progress: no `AssessmentAttempt`, `starsEarned=0`, `bestPercentage=null` everywhere.
- **AC-Clone-4** `StudyPlan.clonedFromSharedPathId` is set on the new plan; this is the analytics anchor.
- **AC-Clone-5** Clone is idempotent per `(userId, sharedPathId)` — re-cloning returns the existing plan ID rather than duplicating.
- **AC-Clone-6** Cloning increments `SharedPath.downloadCount` exactly once per unique cloner. The increment happens in the same transaction as the new `StudyPlan` insert (no race-double-count).
- **AC-Clone-7** Edits the original author makes after publishing do not flow into existing clones (fork model).

### 2.4 User rates a path
- **AC-Rate-1** Auth-required. `POST /api/community/paths/[shareId]/rating` with body `{ value: 1..5 }`. Idempotent upsert per `(userId, sharedPathId)` — re-submitting changes the existing rating, doesn't create a duplicate.
- **AC-Rate-2** Rating is rejected on non-approved SharedPaths (404, same existence-leak policy as the rest of the public surface).
- **AC-Rate-3** `SharedPath.ratingAverage` (`Float?`) and `SharedPath.ratingCount` (`Int`) are denormalized aggregates updated **atomically in the same transaction** as the underlying `PathRating` row insert/update/delete. List views read these aggregates directly — no per-row subquery.
- **AC-Rate-4** `DELETE /api/community/paths/[shareId]/rating` clears the requester's rating; aggregates recompute in the same transaction.
- **AC-Rate-5** List endpoint returns `ratingAverage` and `ratingCount` only. Detail endpoint additionally returns `userRating` (the requester's own value, null if not rated) — a join we accept on the detail page but not in the list query.
- **AC-Rate-6** No rate-limiting on rating submission in v1 — the unique-per-`(user, path)` constraint upper-bounds spam (a user can only hold one rating per path; updates are bounded). Review-bombing defense is deferred to P13 (reports + trust scoring).

### 2.5 User views a path in a non-source language
- **AC-Translate-1** `GET /api/community/paths/[shareId]?lang=<src>` returns the source snapshot (no AI call).
- **AC-Translate-2** First request for `(shareId, lang)` where lang ≠ source: AI call fires, `PathTranslation` row is written, response is the translated payload.
- **AC-Translate-3** Subsequent requests for the same `(shareId, lang)` are cache hits — **zero AI calls** verified by mock-provider counter.
- **AC-Translate-4** Concurrent first-requests for the same `(shareId, lang)` from N users produce **exactly 1** AI call (single-flight via `INSERT … ON CONFLICT DO NOTHING` on the unique `(sharedPathId, language)`).
- **AC-Translate-5** While a translation is in-flight, concurrent requesters receive `{ translation: { status: 'translating' } }` and the client polls.
- **AC-Translate-6** Translation cost is recorded per row (`costUsd`, `tokensIn`, `tokensOut`) and contributes to the per-language daily budget guard.
- **AC-Translate-7** When today's spend in language L exceeds `TRANSLATION_DAILY_BUDGET_<L>_USD`, on-demand translations into L return 429 with a "try later" body. Pre-baked popular languages are unaffected (already on disk).
- **AC-Translate-8** Per-user and per-IP rate limits on translation triggers (6 requests / 10 min / user, 12 / 10 min / IP). Sixth request → 429.
- **AC-Translate-9** Translation snapshots the SharedPath content at translation time; later content edits do not retroactively desync cached translations (re-publish flow is out of scope for v1).
- **AC-Translate-10** Every **cache-miss** translation an authenticated user triggers counts against their `path_translation` quota. Quota shape differs by tier: **FREE is a lifetime allowance** (5 total, never resets) — reuses the existing `LIFETIME_LIMITS` mechanism that already covers `pdf_import`. **PRO is monthly** (50 per calendar month, anti-abuse safety cap). Cache hits, source-language views, and pre-baked popular-language views do **not** count (no AI call was triggered by this user). The increment fires only after the AI call succeeds — failed translations don't burn quota.
- **AC-Translate-11** When a FREE user has exhausted their **lifetime** `path_translation` quota, the endpoint returns **402** (upgrade copy: "You've used your free translations. Upgrade to Pro to translate more paths, or view this one in a popular language") and does **not** trigger the AI call. The cap is checked **before** the per-language daily budget so users see a personal-cap message, not a server-side "try later".
- **AC-Translate-12** When a PRO user hits the 50/month anti-abuse cap, the endpoint returns **429** with copy pointing at support — the cap is a safety net, not a product feature, so the message reflects that.
- **AC-Translate-13** Pre-translation to popular languages is **popularity-gated**, not eager. A community SharedPath fans out pre-translations only when its `downloadCount` first crosses `POPULARITY_THRESHOLD` (default **10**), tracked via a `popularityTriggeredAt` timestamp set atomically (first writer wins, subsequent crossings no-op). Paths that never reach the threshold accrue zero pre-translation cost; their viewers pay on-demand inline.
- **AC-Translate-14** Two bypasses skip the popularity gate and pre-translate immediately on `approve`: (a) **seeded paths** (`seeded=true`) because they anchor the free funnel and must be cache-warm for the first user; (b) **admin manual trigger** (`AdminAction: 'shared_path.pretranslate_force'`) for editorial curation and for one-off backfill of pre-rule-shipping rows. Both bypasses still respect the per-translation cost ceiling.
- **AC-Translate-15** The popularity trigger is **idempotent**. Once `popularityTriggeredAt` is set on a SharedPath, subsequent clones do not re-fan-out, even if a previous language fan-out failed (failed languages are retried via on-demand view fallback per AC-Translate-9 / the existing P11V failure-handling rule).

### 2.6 Moderation pipeline (L1→L2→L3→L5)
- **AC-Moderate-1** Every approved SharedPath has a complete `ModerationAudit` chain: at least one L1 pass row, at least one L2 verdict row, optionally L3 + L5 rows when escalation occurred. No approval without a chain.
- **AC-Moderate-2** L1 (wordlist) is synchronous within the publish request; it inspects title, description, slot titles, theory text, flashcard fronts/backs, quiz question stems.
- **AC-Moderate-3** L1 supports per-language wordlists keyed off `SharedPath.language`; substring false-positives are honoured via a per-language allowlist.
- **AC-Moderate-4** L2 runs async (fire-and-forget post-request), uses the cheapest sensible model (`MODERATION_L2_PROVIDER`, default Gemini 2.5 Flash or Haiku), returns `{verdict, reasonCode, confidence}`.
- **AC-Moderate-5** L2 malformed-JSON or model-error defaults to verdict=`flag` (fail-closed — nothing slips through automatically).
- **AC-Moderate-6** L3 runs only when L2 returns `flag`. L3 verdicts are `auto_reject` or `escalate_to_human`.
- **AC-Moderate-7** Every L3 `escalate_to_human` creates **exactly one** `Ticket{type:'moderation_review', refType:'SharedPath', refId, status:'open'}` — invariant enforced by a unique on `(refType, refId, status='open')` partial index OR by code-side existence check before insert (P0 decision: code-side, since partial unique indices add migration friction; the code path that creates the ticket also re-checks `status` to make the check tight).
- **AC-Moderate-8** Author receives a `Notification` and an email on every terminal state transition: `path_published`, `path_rejected`, `path_flagged_for_review` (the last for visibility while sitting in a human queue).
- **AC-Moderate-9** L2/L3 rubric prompts are byte-identical across calls so Anthropic prompt caching activates; on Anthropic, the rubric block uses `cache_control: { type: 'ephemeral' }` via `buildCachedSystem()`.

### 2.7 Admin reviews a flagged path
- **AC-Admin-1** All admin moderation endpoints are gated by `getAdminUserId()`; non-admin returns 404 (not 403).
- **AC-Admin-2** Admin dashboard ticket queue is sorted oldest-open-first by `Ticket.createdAt`.
- **AC-Admin-3** Ticket detail surfaces: the SharedPath summary (title, description, phase/slot count), the **full** `ModerationAudit` chain (all layers, all reasoning), and a link to the author profile.
- **AC-Admin-4** Approve and Reject actions are idempotent: approving an already-approved ticket is a no-op (still logs nothing the second time).
- **AC-Admin-5** Every admin moderation action writes an `AdminAuditLog` row with `adminId`, `action`, `targetId=sharedPathId`, and details JSON. Reject also records `reasonCode` + optional `note`.
- **AC-Admin-6** Reject sends both a `Notification` AND an email to the author with the reason code.
- **AC-Admin-7** Admin can also unpublish an approved path via the same surface (`shared_path.unpublish`); the public listing disappears within one cache TTL.

### 2.8 Free-tier switchover
- **AC-Switch-1** With `FREE_TIER_AI_PATHS_DISABLED=true`, `checkUsageLimit(user, 'ai_study_plan')` returns `allowed=false` for `FREE` users; `POST /api/learn/paths` rejects with 402-style copy pointing at the community library.
- **AC-Switch-2** With the same flag, Pro users see the unchanged generation flow (regression-tested).
- **AC-Switch-3** Free user landing surface after CTA: routes to `/learn/community` with a banner explaining AI generation is part of Pro.
- **AC-Switch-4** Telemetry captures: free-user library-clone count, free-user D1/D7 retention, free-user AI COGS — before flag flip baseline and after-flip rolling 7-day window.
- **AC-Switch-5** Rollback is a single env-var change: setting `FREE_TIER_AI_PATHS_DISABLED=false` restores AI generation for FREE within one minute (verified by container reload, no redeploy).
- **AC-Switch-6** Activation rate drop ≤ 15% relative, D7 retention drop ≤ 10% relative, D1 retention drop ≤ 5% relative across the 1-week post-flip window — otherwise rollback per the gate in P12V.

---

## 3. Data model spec

> Rules of engagement: every FK has an `onDelete` strategy; every column queried in a list view or filter has an index; cuid PKs throughout to match the existing schema.

### 3.1 `SharedPath` (parallels `SharedNotebook` at [schema.prisma:1017-1045](../apps/web/prisma/schema.prisma))

| Column | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `planId` | `String` | FK → `StudyPlan.id`, `onDelete: Cascade`. Path deleted → publication deleted. |
| `sharedById` | `String` | FK → `User.id`, `onDelete: Cascade`. Mirrors `SharedNotebook.sharedById`. |
| `title` | `String` | Snapshot from plan; author can override at publish time. |
| `description` | `String? @db.Text` | Optional richer description shown in detail view. |
| `coverImageUrl` | `String?` | Reuse pattern from `SharedNotebook`. |
| `language` | `String` | BCP-47-style lowercase code, e.g. `"en"`. Snapshotted from `StudyPlan.language`. |
| `subjects` | `String[] @default([])` | Snapshotted from `StudyPlan.subjects` — drives subject filter. |
| `phaseCount` | `Int @default(0)` | Snapshot — avoid joining for list views. |
| `slotCount` | `Int @default(0)` | Snapshot — drives `minSlots`/`maxSlots` filter without join. |
| `moderationStatus` | `String @default("pending")` | Enum (string for compat): `pending \| auditing_l2 \| auditing_l3 \| flagged_pending_human \| approved \| rejected`. |
| `rejectionReason` | `String? @db.Text` | Free-text reason composed from `ModerationAudit.reasonCode` at terminal-reject time; surfaced to author. |
| `seeded` | `Boolean @default(false)` | True for admin-curated paths; bypasses L1/L2/L3. **Distinct from publisher being admin** so admin-test publishes still go through moderation. |
| `downloadCount` | `Int @default(0)` | Incremented on clone (unique per cloner — see AC-Clone-6). |
| `viewCount` | `Int @default(0)` | Detail-view counter; rate-limited per user/day to avoid inflation. |
| `ratingAverage` | `Float?` | Denormalized mean of all `PathRating.value` rows for this path. Null when `ratingCount = 0`. Updated atomically in the same transaction as `PathRating` writes (§3.10). |
| `ratingCount` | `Int @default(0)` | Denormalized rating-row count. Read directly by list endpoints — no per-row aggregation. |
| `approvedAt` | `DateTime?` | Set on transition into `approved`; drives "recent additions" sort. (No longer auto-triggers pre-translation for non-seeded paths — see `popularityTriggeredAt`.) |
| `popularityTriggeredAt` | `DateTime?` | Set the first time the path fans out pre-translations. Atomic guard against double-fan-out under concurrent clones. Set by (a) approve flow if `seeded=true`, (b) clone-side check when `downloadCount` crosses `POPULARITY_THRESHOLD`, or (c) admin `pretranslate_force` action. Null forever if the path never reaches popularity and is never admin-promoted. |
| `createdAt` | `DateTime @default(now())` | |
| `updatedAt` | `DateTime @updatedAt` | |

Relations:
- `plan: StudyPlan` ← `planId`
- `sharedBy: User` ← `sharedById`
- `translations: PathTranslation[]`
- `audits: ModerationAudit[]`
- `ratings: PathRating[]`
- `clones: StudyPlan[]` (reverse of `StudyPlan.clonedFromSharedPathId`)

Indices:
- `@@unique([planId])` — one current publication per plan (re-publish = delete + insert).
- `@@index([sharedById])` — "my publications".
- `@@index([moderationStatus, createdAt])` — admin queue + audit ordering.
- `@@index([moderationStatus, language, downloadCount(sort: Desc)])` — primary library list query (`status='approved' AND language=? ORDER BY downloadCount`).
- `@@index([approvedAt(sort: Desc)])` — "recently added" sort.
- `@@index([moderationStatus, ratingAverage(sort: Desc)])` — `sort=rating`. App-level filter `ratingCount >= MIN_RATING_SAMPLES` (default 5) applied as a post-scan predicate; acceptable at v1 volumes.
- `@@index([seeded, moderationStatus])` — seed-content analytics.

### 3.2 `PathTranslation`

| Column | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `sharedPathId` | `String` | FK → `SharedPath.id`, `onDelete: Cascade`. |
| `language` | `String` | Target BCP-47 lowercase code. |
| `status` | `String @default("translating")` | `translating \| ready \| failed`. The row's existence is the single-flight lock; status is observable progress. |
| `title` | `String?` | Translated title. Null while `status='translating'`. |
| `description` | `String? @db.Text` | Translated description. |
| `payload` | `Json?` | Translated phases/slots/activities/theory/flashcards/quizzes — the full translatable surface. Null while translating, populated atomically on success. Snapshot of SharedPath content at translation time. |
| `error` | `String? @db.Text` | Set when `status='failed'`. |
| `provider` | `String?` | Model id used (e.g. `gemini-2.5-flash`). Null while translating. |
| `costUsd` | `Float @default(0)` | Final cost; used by daily-budget guard aggregation. |
| `tokensIn` | `Int @default(0)` | |
| `tokensOut` | `Int @default(0)` | |
| `cacheReadTokens` | `Int @default(0)` | For prompt-cache hit-rate analysis. |
| `cacheWriteTokens` | `Int @default(0)` | |
| `createdAt` | `DateTime @default(now())` | |
| `updatedAt` | `DateTime @updatedAt` | |

Indices:
- `@@unique([sharedPathId, language])` — **single-flight lock + cache key in one constraint**. `INSERT … ON CONFLICT DO NOTHING; SELECT` is the standard read-or-create pattern.
- `@@index([sharedPathId])` — list translations for a SharedPath (detail page).
- `@@index([language, createdAt])` — per-language daily-budget aggregation. (Aggregation is `SUM(costUsd) WHERE language=? AND createdAt >= today_utc`; the composite index lets Postgres index-scan the slice.)
- `@@index([status, createdAt])` — operational visibility into stuck `translating` rows.

### 3.3 `ModerationAudit`

| Column | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `sharedPathId` | `String` | FK → `SharedPath.id`, `onDelete: Cascade`. |
| `layer` | `Int` | `1 \| 2 \| 3 \| 5`. (Layer 4 reserved for P13 reports/trust.) |
| `verdict` | `String` | Per-layer ranges: L1 `pass\|reject`; L2 `pass\|reject\|flag`; L3 `auto_reject\|escalate_to_human`; L5 `pass\|reject`. |
| `reasonCode` | `String?` | Taxonomy: `wordlist.<lang>.<category>`, `l2.<category>`, `l3.<category>`, `l5.<category>`. Free-text categories: `adult, hateful, spam, offtopic, low_quality, copyright, other`. |
| `reasoning` | `String? @db.Text` | Model output (L2/L3) or admin note (L5). |
| `actorId` | `String?` | FK → `User.id`, `onDelete: SetNull`. Set for L5; null for L1/L2/L3. |
| `model` | `String?` | Model id when L2/L3; null otherwise. |
| `costUsd` | `Float @default(0)` | |
| `tokensIn` | `Int @default(0)` | |
| `tokensOut` | `Int @default(0)` | |
| `cacheReadTokens` | `Int @default(0)` | |
| `cacheWriteTokens` | `Int @default(0)` | |
| `createdAt` | `DateTime @default(now())` | Append-only — no `updatedAt`. |

Indices:
- `@@index([sharedPathId, createdAt])` — ordered audit history per path.
- `@@index([layer, verdict, createdAt])` — quality reporting ("L2 false-positive rate this week").
- `@@index([actorId])` — "all decisions by admin X" trail.

### 3.4 `Ticket` (generic; v1 only `moderation_review`)

| Column | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `type` | `String` | v1 only `moderation_review`. |
| `refType` | `String` | v1 only `SharedPath`. |
| `refId` | `String` | Not an FK so the table stays generic; consistency enforced at the application layer. |
| `status` | `String @default("open")` | `open \| assigned \| resolved \| dismissed`. |
| `assigneeId` | `String?` | FK → `User.id`, `onDelete: SetNull`. |
| `resolvedById` | `String?` | FK → `User.id`, `onDelete: SetNull`. Distinct from assignee (could be a different admin who closes it). |
| `resolvedAt` | `DateTime?` | |
| `resolutionNote` | `String? @db.Text` | Free-text; on auto-dismiss carries `"path deleted by author"`. |
| `createdAt` | `DateTime @default(now())` | |
| `updatedAt` | `DateTime @updatedAt` | |

Indices:
- `@@index([status, createdAt])` — open queue (most common admin query).
- `@@index([refType, refId])` — "find ticket for this path".
- `@@index([assigneeId, status])` — "my tickets".
- `@@index([type, status])` — future-proofs when more ticket types arrive.

### 3.5 `StudyPlan` additions (P1 migration)

| Column | Type | Notes |
|---|---|---|
| `language` | `String @default("en")` | Backfill: `"en"` for all existing rows (we don't have user-language data to drive a smarter default; rely on subsequent edits). |
| `clonedFromSharedPathId` | `String?` | FK → `SharedPath.id`, `onDelete: SetNull`. Analytics anchor; SetNull so a clone survives the source publication being deleted. |

New index: `@@index([clonedFromSharedPathId])`.

### 3.6 `Notification` additions

No new model, no schema change — the type field is already free-text (`String`). P1 adds these literals as a discriminated union in TypeScript and a render path in [`notification-utils.ts`](../apps/web/src/lib/notification-utils.ts):

- `path_published` — `{ shareId, title }`
- `path_rejected` — `{ shareId, title, reasonCode, layer }`
- `path_flagged_for_review` — `{ shareId, title }` (informational; tells the author it's queued for human review)

### 3.7 `AdminAction` enum additions in [`admin-audit.ts`](../apps/web/src/lib/admin-audit.ts)

Six new literals (string-union, no DB change — `AdminAuditLog.action` is `String`):

- `shared_path.approve`
- `shared_path.reject`
- `shared_path.unpublish`
- `shared_path.pretranslate_force` — manual popularity-trigger override; also covers the one-off backfill use case the plan's §P11 mentions.
- `ticket.resolve`
- `ticket.assign`

### 3.8 `FeatureType` + tier-limit additions in [`tiers.ts`](../apps/web/src/lib/tiers.ts)

One new `FeatureType` literal — `'path_translation'` — and matching `limits` entries on both tiers:

| Tier | `path_translation` limit | Shape |
|---|---|---|
| `FREE` | `5` | **Lifetime** — reuses `LIFETIME_LIMITS.FREE` (which already includes `'pdf_import'`). Sum across all months, never resets. Once a free user has spent 5 cache-miss translations across their entire account lifetime, they get the 402 upgrade prompt on the 6th. |
| `PRO` | `50` | **Monthly** — standard `UsageRecord` per-month counter. Acts as the anti-abuse safety cap required by [`feedback_ethical_pricing.md`](../../.claude/projects/-Users-toprakdemirel-Entwicklung-Quizzard/memory/feedback_ethical_pricing.md); never shipped as `-1`. |

Implementation: extend `FeatureType` in `tiers.ts`, add the limit values in both `FREE.limits` and `PRO.limits`, append `'path_translation'` to `LIFETIME_LIMITS.FREE`. No schema change — `UsageRecord` already covers both monthly and lifetime semantics via `isLifetimeLimit()`.

Increment site: in the translation flow (§4.5), `incrementUsage(userId, 'path_translation')` fires **only after** the AI call returns success. Failed translations do not burn quota. Cache hits never call `checkUsageLimit` or `incrementUsage` — translation cap is solely a cache-miss concern.

### 3.9 FK cascade behaviour audit

| FK | onDelete | Rationale |
|---|---|---|
| `SharedPath.planId → StudyPlan` | Cascade | Author deletes the source plan → publication can't survive. |
| `SharedPath.sharedById → User` | Cascade | Author account deletion removes their publications. |
| `PathTranslation.sharedPathId → SharedPath` | Cascade | Translations are derived data; deleting the path discards them. |
| `ModerationAudit.sharedPathId → SharedPath` | Cascade | Audit chain is derived; orphan audits have no use. |
| `ModerationAudit.actorId → User` | SetNull | We retain the audit trail even after an admin account is deleted; the deletion itself is logged elsewhere. |
| `PathRating.sharedPathId → SharedPath` | Cascade | Ratings are tied to the path; deleting the path discards them. Aggregates on `SharedPath` go with it. |
| `PathRating.userId → User` | Cascade | A user deleting their account removes their ratings (matches `NotebookRating` precedent at `schema.prisma:1178`). Aggregates must be recomputed for affected paths in the same transaction. |
| `Ticket.assigneeId → User` | SetNull | Assignee leaves the org → ticket survives as unassigned. |
| `Ticket.resolvedById → User` | SetNull | Same reasoning. |
| `Ticket.refType/refId` | (no FK) | Generic table; integrity enforced in code. Side effect: on `SharedPath` delete the code path auto-dismisses open tickets (see AC-Publish-6). |
| `StudyPlan.clonedFromSharedPathId → SharedPath` | SetNull | A clone survives the source publication being unpublished/deleted. |

### 3.10 `PathRating` (mirrors [`NotebookRating`](../apps/web/prisma/schema.prisma) at lines 1169–1182)

| Column | Type | Notes |
|---|---|---|
| `id` | `String @id @default(cuid())` | |
| `sharedPathId` | `String` | FK → `SharedPath.id`, `onDelete: Cascade`. |
| `userId` | `String` | FK → `User.id`, `onDelete: Cascade`. |
| `value` | `Int` | 1..5; enforced by application + a check constraint at migration time. |
| `createdAt` | `DateTime @default(now())` | |
| `updatedAt` | `DateTime @updatedAt` | Bumped when the user changes their rating value. |

Indices:
- `@@unique([sharedPathId, userId])` — one rating per user per path. Drives the idempotent-upsert flow.
- `@@index([sharedPathId])` — list ratings for a path (rare query; mostly the aggregates on `SharedPath` carry the load).

**Aggregate-write contract:** every `PathRating` insert / update / delete runs inside the same DB transaction that recomputes `SharedPath.ratingAverage` and `SharedPath.ratingCount` for the affected path. The recompute is a single `UPDATE shared_paths SET ratingAverage=(SELECT AVG(value) FROM path_ratings WHERE shared_path_id=?), ratingCount=(SELECT COUNT(*) FROM path_ratings WHERE shared_path_id=?) WHERE id=?` — cheap because `ratingCount` is rarely huge per-path. Done atomically so list queries never see a half-updated aggregate.

### 3.11 Migration strategy notes (P1 anchor)

- Migrations generated **offline** via `prisma migrate diff` per [`project_dev_tooling.md`](../../.claude/projects/-Users-toprakdemirel-Entwicklung-Quizzard/memory/project_dev_tooling.md).
- All adds are additive (new tables + new nullable columns on `StudyPlan` with defaults) — no existing column is dropped or retyped. A schema-diff review in P1V confirms zero unintended migrations on the existing models.
- `SharedPath.seeded` and `StudyPlan.language` are both backed by sane defaults so no application-level backfill script is required.

---

## 4. API contracts

> All endpoints reuse the response helpers from [`api-response.ts`](../apps/web/src/lib/api-response.ts). Auth is via `getAuthUserId(request)`; admin endpoints additionally check `getAdminUserId(request)` from [`auth.ts`](../apps/web/src/lib/auth.ts). Non-admin hitting admin endpoints returns **404**, not 403 — matches the existing admin-route convention and avoids existence leaks.

### 4.1 `POST /api/learn/paths/[planId]/publish`

- **Auth:** user; owner-only (404 for non-owners).
- **Body:** `{ title?: string, description?: string, coverImageUrl?: string, seeded?: boolean }` — `seeded` is **admin-only**; any non-admin passing `seeded=true` is silently treated as `false`.
- **Preconditions:** `StudyPlan.generationStatus === 'ready'`. Other values → 409 `path_not_ready`.
- **Idempotency:** if `SharedPath` already exists for `planId`, return it as 200 (do not re-run L1).
- **Effects (regular path):** creates `SharedPath{moderationStatus:'pending'}` → runs L1 inline (sync) → if L1 passes, transitions to `auditing_l2` and fires L2 async → returns the resulting state.
- **Effects (seeded path, admin + `seeded=true`):** creates `SharedPath{moderationStatus:'approved', approvedAt:now(), seeded:true, popularityTriggeredAt:now()}` directly — skips L1/L2/L3 entirely. Writes `AdminAuditLog{action:'shared_path.approve', details:{seeded:true}}` for auditability (per §5.4). Fires the popular-language pre-translation fan-out (P11) immediately, so seeded paths are cache-warm for the first viewer.
- **Response 200:** `{ shareId, moderationStatus, rejectionReason?, createdAt }`
- **Errors:** 401 / 404 / 409 / 500

### 4.2 `GET /api/learn/paths/[planId]/publication-status`

- **Auth:** user; owner-only (404 otherwise).
- **Response 200:** `{ shareId, moderationStatus, rejectionReason?, lastAuditAt, audits: Array<{ layer, verdict, reasonCode?, createdAt }> }` (audit summary is safe to expose to the author for their own path).
- **Response 404:** plan has no publication.

### 4.3 `DELETE /api/community/paths/[shareId]`

- **Auth:** user; owner-only OR admin.
- **Effects:** deletes `SharedPath` row (cascades `PathTranslation`, `ModerationAudit`); auto-dismisses any open `Ticket` referencing this path with `resolutionNote="path deleted by author"` or `…by admin`.
- **Response 204:** no body.

### 4.4 `GET /api/community/paths`

- **Auth:** user (v1; public unauth is v2).
- **Query:** `page`, `limit≤50`, `search≤100`, `subject`, `language`, `minSlots`, `maxSlots`, `sort=popular|recent|rating`, `filter=all|mine` (default `all`).
- **Filtering:** `where: { moderationStatus: 'approved', language?, subjects: { has: subject }, slotCount: { gte: minSlots, lte: maxSlots } }`. Search is `ILIKE` over `title` and `description`.
- **Sort:** `popular` → `downloadCount DESC, approvedAt DESC`; `recent` → `approvedAt DESC`; `rating` → filter `ratingCount >= MIN_RATING_SAMPLES` (default 5) then `ratingAverage DESC`, with rows below the sample threshold falling through to the `popular` secondary ordering at the tail of the page (per AC-Browse-9).
- **Response 200:** `{ paths: SharedPathListItem[], total, page, limit, totalPages }` — same envelope as [`/api/community/notebooks`](../apps/web/app/api/community/notebooks/route.ts).
- **`SharedPathListItem`:** `{ shareId, title, description, coverImageUrl, language, subjects, phaseCount, slotCount, downloadCount, viewCount, ratingAverage, ratingCount, seeded, approvedAt, author: { id, username, avatarUrl } }`. Rating fields come straight from the denormalized columns on `SharedPath` (§3.1 / §3.10) — no per-row aggregation.

### 4.5 `GET /api/community/paths/[shareId]`

- **Auth:** user.
- **Query:** `lang?` (BCP-47 lowercase). Omitted → source language.
- **Behaviour:** returns 404 if `moderationStatus !== 'approved'`. When `lang` differs from the source language, looks up `PathTranslation`:
  - `ready` → cache hit, return translated payload. **No quota check, no increment.**
  - `translating` → return source + `{ translation: { status: 'translating' } }`; client polls. No quota check (the originating user already paid the quota when they triggered it).
  - `failed` → return source + `{ translation: { status: 'failed', error } }`; client offers retry (which re-runs the quota check).
  - missing → cache-miss path. Order of checks: (1) per-user/per-IP rate limit; (2) `checkUsageLimit(userId, 'path_translation')` — FREE lifetime cap, PRO monthly cap; on fail return **402** (FREE) or **429** (PRO) with appropriate copy and **do not** call the model; (3) per-language daily budget guard; on fail return **429** "try later"; (4) `INSERT … ON CONFLICT DO NOTHING` to seize the single-flight lock; if we inserted, run translation inline (bounded ~30s); else re-read; (5) on AI-call success, `incrementUsage(userId, 'path_translation')`. Failed AI calls do not increment.
- **Effects:** increments `viewCount` (rate-limited 1/user/day); on cache-miss success, increments `UsageRecord` for `path_translation`.
- **Response 200:** `{ shareId, language, source, translation?, userRating? }` — `source` is the full SharedPath snapshot including `ratingAverage` and `ratingCount`; `translation` (if requested) carries the translated overlay or its status; `userRating` is the requester's own rating (1–5 integer, or `null` if they haven't rated). The detail page is the only place `userRating` is computed (one extra indexed lookup) — list views deliberately don't include it.

### 4.6 `POST /api/community/paths/[shareId]/clone`

- **Auth:** user.
- **Preconditions:** `moderationStatus === 'approved'` (404 otherwise).
- **Idempotency:** if a `StudyPlan` with `userId=current, clonedFromSharedPathId=shareId` exists, return `{ planId }` for it.
- **Effects:** transactional deep-copy of plan + phases + slots + activities + theory/flashcards/quizzes; sets `clonedFromSharedPathId`; copies `language` and `subjects` from SharedPath; resets progress; increments `SharedPath.downloadCount` in the same transaction. **Post-commit side-effect:** atomic `UPDATE shared_paths SET popularityTriggeredAt=NOW() WHERE id=? AND popularityTriggeredAt IS NULL AND downloadCount >= POPULARITY_THRESHOLD` — if 1 row affected, fire-and-forget the popular-language pre-translation fan-out (P11). First writer wins; concurrent clones collapse to one fan-out.
- **Response 200:** `{ planId, alreadyCloned: boolean }`.

### 4.7 `GET /api/admin/tickets`

- **Auth:** admin (404 otherwise).
- **Query:** `status` (default `open,assigned`), `type` (default `moderation_review`), `page`, `limit`.
- **Sort:** `createdAt ASC` (oldest first).
- **Response 200:** `{ tickets: TicketListItem[], total, page, limit, totalPages }`.

### 4.8 `GET /api/admin/tickets/[id]`

- **Auth:** admin.
- **Response 200:** `{ ticket, sharedPath: { shareId, title, description, language, subjects, phaseCount, slotCount, sharedBy, moderationStatus }, audits: ModerationAudit[] }`.

### 4.9 `POST /api/admin/tickets/[id]/approve` and `…/reject`

- **Auth:** admin.
- **Body (`reject` only):** `{ reasonCode: string, note?: string }`.
- **Effects (approve):** sets `SharedPath.moderationStatus='approved'`, `approvedAt=now()`; writes `ModerationAudit{layer:5, verdict:'pass'}`; writes `AdminAuditLog{action:'shared_path.approve'}`; updates ticket to `resolved`; notifies author (`path_published`). **Does not fire pre-translation** — community paths reach pre-translation via the popularity gate (AC-Translate-13). Pre-translation on approve only happens for seeded paths, and seeded paths bypass moderation tickets entirely. Idempotent.
- **Effects (reject):** sets `SharedPath.moderationStatus='rejected'`, `rejectionReason=<composed>`; writes `ModerationAudit{layer:5, verdict:'reject', reasonCode, reasoning=note}`; writes `AdminAuditLog{action:'shared_path.reject', details:{reasonCode}}`; updates ticket to `resolved`; notifies author (`path_rejected`) and sends email.
- **Response 200:** `{ ticketId, sharedPathStatus }`.

### 4.10 `POST /api/admin/paths/[shareId]/pretranslate`

- **Auth:** admin (404 otherwise).
- **Preconditions:** `SharedPath.moderationStatus === 'approved'`.
- **Effects:** atomically sets `popularityTriggeredAt = NOW()` if currently null; fires-and-forget the popular-language pre-translation fan-out (P11); writes `AdminAuditLog{action:'shared_path.pretranslate_force', targetId:shareId}`. Idempotent — if `popularityTriggeredAt` was already set, the endpoint returns 200 without firing a duplicate fan-out (the existing `PathTranslation` unique constraint would no-op the fan-out anyway, but the audit log row is suppressed).
- **Use cases:** (a) editorial curator promotes a high-quality path before it accumulates 10 clones; (b) one-off backfill after P11 deploy for paths sitting above the threshold with no fan-out yet (the plan's §P11 "rare backfill" use case).
- **Response 200:** `{ shareId, popularityTriggeredAt }`.

### 4.11 Path ratings (`POST` / `DELETE` / `GET /api/community/paths/[shareId]/rating`)

**`POST /api/community/paths/[shareId]/rating`**
- **Auth:** user.
- **Body:** `{ value: 1..5 }` — integer; non-integer or out-of-range → 400.
- **Preconditions:** target `SharedPath.moderationStatus === 'approved'` (404 otherwise).
- **Effects:** transactional upsert on `PathRating @@unique(sharedPathId, userId)`; recomputes `SharedPath.ratingAverage` and `SharedPath.ratingCount` inside the same transaction.
- **Response 200:** `{ value, ratingAverage, ratingCount }` — returns the fresh aggregates so the client can update the UI without a re-fetch.

**`DELETE /api/community/paths/[shareId]/rating`**
- **Auth:** user.
- **Effects:** deletes the requester's `PathRating` row (no-op if none); recomputes aggregates in the same transaction; `ratingAverage` becomes `null` when `ratingCount` falls to 0.
- **Response 200:** `{ ratingAverage, ratingCount }`.

**`GET /api/community/paths/[shareId]/rating`**
- **Auth:** user.
- **Response 200:** `{ userRating: 1..5 | null, ratingAverage, ratingCount }` — exists for clients that want the rating widget hydrated independently of the full detail payload (`§4.5` already inlines `userRating`, so this endpoint is optional convenience, not load-bearing).

### 4.12 Backward-compatibility audit

| Existing surface | Touched by P0 contracts? | Notes |
|---|---|---|
| `/api/community/notebooks` | No — `/api/community/paths` is a parallel resource, same envelope but distinct path. |
| `/api/admin/waitlist`, `/api/admin/users`, `/api/admin/stats` | No — `/api/admin/tickets` is a new sibling. |
| `/api/learn/paths` (POST) | No P0 change. Modified in P12 behind feature flag. |
| `/api/learn/paths/[planId]/*` existing routes | Not displaced — `[planId]/publish` and `[planId]/publication-status` are new sub-routes. |
| `Notification` shape | Type field is already free-text; new literals fit without migration. |
| `AdminAuditLog` shape | `action` field is `String`; new literals fit without migration. |

No existing route changes contract during P1–P11. Phase 12 is the only contract-shifting moment (tier limit number), and it's reversible behind `FREE_TIER_AI_PATHS_DISABLED`.

---

## 5. Free-tier transition spec (P12 anchors)

Triggered by feature flag `FREE_TIER_AI_PATHS_DISABLED`. Default OFF during P1–P11 so nothing changes user-visibly until the deliberate flip in P12.

### 5.1 Tier-limit values

In [`tiers.ts`](../apps/web/src/lib/tiers.ts), `FREE.limits.ai_study_plan`:

| Flag | Value | Behaviour |
|---|---|---|
| `FREE_TIER_AI_PATHS_DISABLED=false` (default, pre-P12) | `3` | Unchanged from today. |
| `FREE_TIER_AI_PATHS_DISABLED=true` (post-P12) | `0` | `checkUsageLimit` returns `allowed=false`; POST `/api/learn/paths` returns 402-style copy. |

`FREE.limits.ultra_path` stays `0` (already Pro-only). `PRO.limits.ai_study_plan` stays `-1`.

Implementation: read the flag inside `tiers.ts`'s `FREE.limits.ai_study_plan` so the change is one place, not three.

### 5.2 Rollout flag semantics

- Env var: `FREE_TIER_AI_PATHS_DISABLED=true|false`. Pre-deploy checklist (per [project_deploy_coolify_supabase.md](../../.claude/projects/-Users-toprakdemirel-Entwicklung-Quizzard/memory/project_deploy_coolify_supabase.md) pattern) requires this var in Coolify container env before P12 ships.
- Rollback: setting the var back to `false` and restarting the container restores AI generation for FREE users within one minute. **Rehearsed in P12V before the activation-measurement window starts.**

### 5.3 Telemetry attached to switchover

P12 build adds three metrics (rows in an existing `event_log` or equivalent — TBD with the existing analytics surface; not a schema addition by P0):

- `free_user.path_clone` — fires on every clone by a FREE user.
- `free_user.path_generation_blocked` — fires on every blocked generation attempt by a FREE user (helps size the friction).
- `free_user.ai_cost_attributed` — daily roll-up of L2/translation cost per FREE user (computed nightly from `ModerationAudit.costUsd` + `PathTranslation.costUsd` grouped by attributable user).

Activation = "FREE user signs up AND clones at least one path within 60 minutes". This is the metric P12V grades against.

### 5.4 Seed library precondition

P12 cannot ship until **N ≥ 20** seeded paths are live. Seeded paths are published with `seeded=true`, which bypasses L1/L2/L3 (`moderationStatus` jumps direct to `approved`, `approvedAt=now()`). Each seeded path still produces an `AdminAuditLog{action:'shared_path.approve', details:{seeded:true}}` row for auditability.

---

## 6. Decisions (open questions from §9 of the plan)

| Open question | Decision | Rationale |
|---|---|---|
| Subject taxonomy — reuse or extend? | **Reuse.** `SharedPath.subjects` snapshots `StudyPlan.subjects` (the classifier-detected buckets from Phase 10.8). Filter is `subjects: { has: ? }` on the same vocabulary. | Avoids a parallel taxonomy that drifts from path generation. The classifier already commits to a finite bucket list. |
| Public/unauth library or auth-required? | **Auth-required for v1.** | Plan §8 already calls this out as v2. SEO surface is a separate plan. |
| Seed-content rights — admin role or explicit flag? | **Explicit `seeded: Boolean` flag.** Admin-published is necessary but not sufficient. | Allows admins to test publish-flow themselves (without `seeded=true`) and survives admin role changes. Cleaner analytics. |
| Popular-language set | **`de, en, fr, es, it, tr`** (6 langs). | German + English are home languages (user is DE-TR bilingual). FR/ES/IT widen EU coverage. TR is meaningful for the founder's community. Capped at 6 to bound pre-translation cost (see §7.4 — 5 target translations per published path × $0.10 cap = $0.50 bulk per path, exempted from per-language daily budgets at view time). |
| Per-audit / per-translation cost budgets | See **§7** below. | Numbers, not feelings. |
| Per-user translation cap shape | FREE: **5 lifetime** (reuse `LIFETIME_LIMITS`); PRO: **50 / month** (anti-abuse). | FREE matches the existing `pdf_import` lifetime-trial pattern — sampler, not sustainable usage. Lifetime means the cost is bounded over the entire account, not per month, so the per-free-user-monthly burn approaches zero. PRO monthly cap satisfies the "never `-1`" rule from [`feedback_ethical_pricing.md`](../../.claude/projects/-Users-toprakdemirel-Entwicklung-Quizzard/memory/feedback_ethical_pricing.md). |
| Pre-translation trigger strategy | **Popularity-gated**, not eager on approve. Trigger when `downloadCount` first crosses `POPULARITY_THRESHOLD=10`. Seeded paths and admin manual trigger bypass the gate. | Eager pre-translation paid $0.50 per approved path regardless of demand; ~90% of community paths never reach an audience that justifies that spend. Popularity-gating concentrates pre-translation budget on paths that actually have viewers, dropping projected monthly pre-translation cost by ~10× while preserving instant-view UX for paths that matter. Long-tail paths still translate on-demand at the first viewer's quota cost. |
| Social signals on community paths | v1: **view count + clone count + 1–5 ratings**, all publicly displayed. v1: **no comments**. | View/clone are already on `SharedPath`; surfacing them is free. Ratings mirror the existing `NotebookRating` model — small new schema, zero AI cost, gives users quality signal beyond raw popularity. Comments would double the moderation surface (every comment is moderatable content) and we don't yet know if ratings alone suffice — ship ratings, see the data, decide on comments in v2. |
| Activation/retention regression tolerances for P12V | Activation drop ≤ **15% relative**; D1 ≤ **5%**; D7 ≤ **10%**. | Conservative because the library is supposed to *help* activation, not just maintain. A 15% drop is a red flag worth rolling back over; under that, the unit-economics win covers the funnel cost. |

---

## 7. Cost budgets (gate thresholds for P4V / P5V / P10V / P11V)

Currency: **USD**. The freemium ceiling is **0.3 CHF target / 1 CHF hard** per free user per month, which converts at ~1.10 CHF/USD to roughly **0.27 USD target / 0.91 USD ceiling**. Budgets below are picked so post-switchover free users sit comfortably under the target.

### 7.1 Layer 1 (P3)
- **Per audit:** $0 (pure code wordlist scan).
- **Gate:** zero AI cost on L1 verified by zero `ModerationAudit.costUsd` rows from layer=1.

### 7.2 Layer 2 (P4)
- **Per audit target:** ≤ **$0.005**.
- **Per audit hard ceiling (gate fail):** **$0.01**.
- **Sizing:** with Gemini 2.5 Flash @ $0.30/M input + $2.50/M output and prompt caching active, a typical path JSON (≈ 8–12K input tokens after the cached rubric block) + ≈ 200 output tokens prices at ≈ $0.003. Cache hits drop input further.
- **Cache-hit ratio gate:** ≥ **80%** rubric-block cache reads after the warm-up call.

### 7.3 Layer 3 (P5)
- **Per audit target:** ≤ **$0.05**.
- **Per audit hard ceiling:** **$0.10**.
- **Sizing:** Sonnet @ $3.00/M input + $15.00/M output. Same path JSON ≈ $0.03 input + ≈ $0.01 output ≈ $0.04. L3 only runs on L2 `flag` (expected ≤ 10% of submissions), so even a $0.10 audit averaged across all submissions is ≈ $0.01.

### 7.4 Translation (P10/P11)
- **On-demand, per (path, language):** target ≤ **$0.10**, hard ceiling **$0.20**.
- **Pre-translation bulk, per popular/seeded path:** target ≤ **$0.50** for the popular-language fan-out (5 targets × $0.10), hard ceiling **$1.00**. Now triggered by popularity-gate (`downloadCount >= 10`) or seeded/admin bypass — not on every approve.
- **Per-user `path_translation` cap (primary FREE-side cost guard, §3.8):** FREE = **5 lifetime** → worst-case **$0.50** spent on translations across an entire FREE account lifetime. PRO = **50/month** → worst-case **$5/month**. These caps are the *primary* per-user economic guard; the per-language daily budget below is the server-wide *safety net* on top.
- **Per-language daily on-demand budget:** **$5.00/day** per language (`TRANSLATION_DAILY_BUDGET_<L>_USD`); over → 429. Tunable per language; defaults uniform.
- **Cache-hit ratio gate (P10V):** repeated `(shareId, lang)` requests → **100% cache hits** after first call (zero AI call on the 2nd+).
- **Pre-translation projection (P11V):** with popularity-gating, expected pre-translation spend is `(seed_count_bootstrap × $0.50) + (popular_community_paths_per_month × $0.50)`. Seed bootstrap = 20 × $0.50 = **$10 one-time**. Community popular-paths-per-month conservatively projected at **~10%** of published volume; e.g. 600 community paths approved × 10% × $0.50 = **$30/month**. Total monthly burn-in ceiling: **$100/month** (was $300 under eager strategy). Raised once we have real popularity-conversion data.

### 7.5 Cost-tracking integration

All cost rows flow through the existing `path-generator-cost.ts` rate card. P1 adds nothing to the rate-card file — it already knows `gemini-2.5-flash`, `claude-haiku-4-5-20251001`, and `claude-sonnet-4-6`. P3/P4/P5/P10/P11 each persist their own usage in `ModerationAudit` / `PathTranslation` rows, so cost queries can be `SUM(costUsd) … GROUP BY layer / language / day` without joining a separate cost table.

---

## 8. P0V — Verification gate

The gate the plan's §5 P0V asks for, performed inline. **Sign-off recorded below is the gate to start P1.**

### 8.1 AC walk-through against the freemium-economics ceiling

Goal: does the design plausibly hit ≤ 0.3 CHF (~0.27 USD) per free user per month?

Post-switchover residual per-free-user AI cost has three components:

1. **Moderation cost attributed to a free user.** A free user can publish (rarely) — each publish costs ≤ $0.005 (L2) + occasional $0.05 (L3, 10% of paths) ≈ $0.01 expected per publish. Free users publishing > 1 path/month would be unusual but is rate-limited by `ai_study_plan` going to 0 in P12 (they can't generate new paths to publish in the first place — they can only publish paths they had pre-flip, plus clones don't include publish rights). Net: **~$0 per free user per month** in moderation cost.
2. **On-demand translation cost (FREE is lifetime-capped).** A free user viewing a path in a popular language hits the pre-translation cache (free). Only off-popular-set views trigger AI, and the new `path_translation` cap (§3.8) makes this a **5-translation lifetime** allowance, not a monthly one. Worst-case lifetime burn per free user = 5 × $0.10 = **$0.50 total, ever**. Amortised over a 12-month account life this is ≈ **$0.04/month**; over a 6-month life ≈ $0.08/month. Real-world expected value is much lower because most users won't hit off-popular languages at all.
3. **Pre-translation cost amortisation (now popularity-gated).** A pre-translation costs ≤ $0.50/path, paid only when the path crosses `downloadCount ≥ 10` (or is seeded/admin-promoted). By construction, every pre-translated path has ≥ 10 cloners — so per-cloner share is **≤ $0.05** and per-viewer share is strictly lower (views ≥ clones). Long-tail paths that never cross the threshold cost zero in pre-translation; their occasional translation viewers pay on-demand, bounded by the per-user lifetime cap.

**Conclusion:** the design comfortably clears ≤ $0.10/free-user/month under normal usage and the new lifetime translation cap makes the worst-case bounded (max $0.50 across an entire free account lifetime), well under the 0.27 USD/month target even at the cap. **AC-Economics gate passes at design time.** Empirical validation lands in P12V over a 7-day window.

### 8.2 Schema review — FK deletion strategy & query indices

Cross-checked §3.9 (cascade table) and §3.1–3.4, §3.10 (per-model indices) against the queries implied by §4:

| Query (from §4) | Index that serves it | Verdict |
|---|---|---|
| `GET /api/community/paths` filtered by `status='approved' AND language=? ORDER BY downloadCount DESC` | `SharedPath @@index([moderationStatus, language, downloadCount(sort: Desc)])` | ✅ covered |
| Recent additions sort | `SharedPath @@index([approvedAt(sort: Desc)])` + filter on `moderationStatus='approved'` | ✅ covered (composite filter is selective enough; `moderationStatus` is low-cardinality) |
| Rating sort (`sort=rating`) | `SharedPath @@index([moderationStatus, ratingAverage(sort: Desc)])` + app-level `ratingCount >= MIN_RATING_SAMPLES` post-scan filter | ✅ covered; low-sample paths fall through to popular-sort tail |
| Author "my publications" | `SharedPath @@index([sharedById])` | ✅ |
| Admin queue oldest-open-first | `Ticket @@index([status, createdAt])` | ✅ |
| Find ticket for a SharedPath | `Ticket @@index([refType, refId])` | ✅ |
| Read-or-create translation | `PathTranslation @@unique([sharedPathId, language])` | ✅ doubles as single-flight lock |
| Per-language daily budget aggregate | `PathTranslation @@index([language, createdAt])` | ✅ |
| Ordered audit history | `ModerationAudit @@index([sharedPathId, createdAt])` | ✅ |
| Read-or-upsert user rating | `PathRating @@unique([sharedPathId, userId])` | ✅ doubles as idempotency key |
| Clone analytics (paths cloned from X) | `StudyPlan @@index([clonedFromSharedPathId])` | ✅ |

FK deletion strategies: every relation in §3.9 has an explicit `Cascade` or `SetNull` with a documented rationale. No `Restrict` anywhere — and that's intentional: every parent deletion has a sensible default for the child rows.

One non-FK invariant (`Ticket.refType/refId`) is acknowledged: integrity is enforced at the application layer, with the auto-dismiss-on-delete behaviour spelled out in AC-Publish-6 and §4.3.

**Schema review gate passes.**

### 8.3 API contract review — backward-compat with existing patterns

Cross-checked §4 against [`/api/community/notebooks`](../apps/web/app/api/community/notebooks/route.ts):

- Same response envelope: `{ items, total, page, limit, totalPages }`. ✅
- Same pagination defaults: `limit=20`, hard cap `limit=50`. ✅
- Same auth approach (`getAuthUserId`, 401 on miss). ✅
- Same error shape: reuse `unauthorizedResponse`, `internalErrorResponse`, etc. from `api-response.ts`. ✅
- Search semantics: `ILIKE` over title (and description for paths, where for notebooks it's only `name`). Length-capped at 100. ✅
- Admin auth via `getAdminUserId` returning 404 on non-admin. ✅ (mirrors the existing `/api/admin/*` convention)

No existing endpoint changes contract during P1–P11. The single P12-era change (FREE tier `ai_study_plan` limit) is behind a feature flag and reversible.

**API contract review gate passes.**

### 8.4 Sign-off

- AC walk-through against freemium-economics ceiling: **pass** (§8.1)
- Schema review (every FK has a deletion strategy, every queried field has an index): **pass** (§8.2)
- API contract review (backward-compatible with `/api/community/notebooks` and existing admin patterns): **pass** (§8.3)

**P0V signed off 2026-05-20.** P1 may begin.
