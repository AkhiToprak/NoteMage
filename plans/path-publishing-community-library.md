# Plan: Path publishing & community library (V-model phased delivery)

> Companion to project memory `project_path_publishing_idea.md`. Approved 2026-05-20.

---

## 1. Context — why we are doing this

Three pre-existing constraints converge on the same answer:

- **Freemium unit economics**: per-free-user AI COGS must stay ≤ ~0.3 CHF target / ~1 CHF hard ceiling. The current free-tier allowance of 3 AI-generated paths/month at `checkUsageLimit('ai_study_plan')` is the dominant cost driver — a Pro path generation today routes through Anthropic Sonnet / Gemini for structure + theory + flashcards + quizzes per slot. Free users are not unit-positive at this allowance.
- **Paths-led growth**: paths are the front door. Marketing leans on them. Free users **must** experience a path within seconds of signup or the funnel breaks.
- **Single Pro tier**: one paid tier has to cover everything for free users — no PLUS subsidy lane. So either free users pay (no), free generation gets gated tighter (kills the funnel), or **free users get paths from somewhere that isn't a fresh AI call**.

The intersection is: **let users publish their paths**, **seed a curated library**, **let other users browse / clone / translate** — and **pull AI path generation out of the free tier entirely**, because the value prop ("I have a Duolingo-style path") survives without per-free-user AI burn. Translation costs are amortised across users with a `(path_id, language)` cache. Discovery doubles as a growth surface.

The side-effect is that the moderation pipeline forces us to finally build the **admin dashboard** that doesn't exist yet — admin APIs exist (`/api/admin/waitlist`, `/api/admin/stats`, `/api/admin/users`) but there is no UI binding them together.

---

## 2. Why V-model (not iterative "ship & fix")

Most of this project's existing plans use phased forward-execution with a final manual-test pass (e.g. `plans/personal-duolingo-rework-manual-tests.md`). V-model is stricter: **each build phase has its own paired verification gate, and the next phase does not start until the gate passes.**

This is the right shape for this work because:

- **Moderation surfaces are correctness-critical.** A wrongly-approved path is public; a wrongly-published wordlist bypass is a brand risk. Iterating live is not acceptable.
- **Cost gates are part of correctness here.** Each AI-using phase (L2, L3, translation, pre-translation) has a measured-cost gate that must pass before the next phase. Skipping that gate is how unit economics quietly break.
- **The free-tier switchover (Phase 12) is irreversible-feeling for users.** Everything upstream of it has to be solid; we should arrive at it with a clean test record.
- **A multi-layer pipeline is the kind of thing where bugs hide between layers** — V-model makes each layer's contract explicit and tested independently before they're chained.

Gate rule: **no phase N+1 work begins until phase N's verification (`NV`) is signed off** (manual checklist on the test plan + automated tests green + cost gate measured where applicable). If a gate fails, fix in N before continuing — don't roll N's bugs into N+1.

---

## 3. Cross-cutting design decisions

Decisions that span phases, made up front so phases don't drift:

- **Mirror `SharedNotebook`, do not invent.** `SharedPath` parallels `SharedNotebook` (`apps/web/prisma/schema.prisma:1017-1045`) field-for-field where possible: `id, pathId, sharedById, visibility, title, description, coverImageUrl, downloadCount, viewCount, …`. Diverges only where moderation requires extra state.
- **Moderation state machine, not flags.** SharedPath has `moderationStatus: 'pending' | 'auditing_l2' | 'auditing_l3' | 'flagged_pending_human' | 'approved' | 'rejected'`. Mirrors `ImportJob.status` (`schema.prisma:254-278`). Every transition logs a `ModerationAudit` row.
- **Reuse `AdminAuditLog` + `logAdminAction()`** (`apps/web/src/lib/admin-audit.ts:1-35`) for every admin-taken action; add new `AdminAction` enum entries rather than a new audit table.
- **Reuse `Notification`** (`schema.prisma:872-885`) with new types: `'path_published' | 'path_rejected' | 'path_flagged_for_review'`. No new notification system.
- **Reuse provider routing** (`apps/web/src/lib/path-generator-routing.ts`) for all moderation and translation AI calls. Each gets an env var (e.g. `MODERATION_L2_PROVIDER`, `TRANSLATION_PROVIDER`) defaulting to the cheapest sensible option.
- **Reuse prompt caching** via `buildCachedSystem()` (`apps/web/src/lib/path-prompts.ts:62-96`) for the moderation rubric and the translation system prompt — the static parts of the prompt are byte-identical across all calls, so Anthropic prompt-cache reuse is automatic.
- **Async work follows the existing fire-and-forget pattern.** No queue gets introduced. Path-generation already runs as a background task off the request (`apps/web/app/api/learn/paths/route.ts:72-299`); moderation, translation pre-bake, and pre-translation follow the same shape with status polling.
- **Single-flight lock per `(sharedPathId, language)`** for translation to prevent duplicate AI calls under concurrent first-requests. Implementation: row-level lock on `PathTranslation` insert (`ON CONFLICT DO NOTHING` then re-read).
- **Cost gates are enforced numerically.** Each AI-using phase has a budget threshold; verification cannot pass if measured cost exceeds it.
- **Feature flags for risky transitions.** The free-tier path-gen cutoff (Phase 12) is behind a flag so it can be reverted without redeploy.
- **Light-mode audit on every new surface** — no light-coloured UI text on light surfaces.

---

## 4. Critical files (anchors — phases edit/extend these)

| Concern | File | Why it matters |
|---|---|---|
| Schema | `apps/web/prisma/schema.prisma` | All new models (`SharedPath`, `PathTranslation`, `ModerationAudit`, `Ticket`); new `Notification` types; `language` field on `StudyPlan` |
| Path entry API | `apps/web/app/api/learn/paths/route.ts` | Tier gate change in Phase 12 |
| Tier gate | `apps/web/src/lib/usage-limits.ts` + `apps/web/src/lib/tiers.ts` | `ai_study_plan` limit → 0 for FREE in Phase 12 |
| Path provider routing | `apps/web/src/lib/path-generator-routing.ts` | Moderation + translation reuse this pattern |
| Prompt caching | `apps/web/src/lib/path-prompts.ts` | `buildCachedSystem()` reused for moderation rubric + translation system prompt |
| Cost tracking | `apps/web/src/lib/path-generator-cost.ts` | Extend with moderation + translation cost rows |
| Admin auth gate | `apps/web/src/lib/auth.ts:18-22` | `getAdminUserId()` reused for every admin endpoint |
| Admin audit | `apps/web/src/lib/admin-audit.ts` | New `AdminAction` enum entries |
| Notifications | `apps/web/src/lib/notification-utils.ts` | Render new notification types |
| Email | `apps/web/src/lib/waitlist-email.ts` | Pattern reused for moderation outcome emails |
| Path list UI | `apps/web/app/(dashboard)/learn/paths/page.tsx` | "Publish" entry point + "browse community library" link |
| Existing precedent | `apps/web/app/api/community/notebooks/route.ts` | Copy-paste-adapt for `/api/community/paths` |

---

## 5. Phase plan (build → verify, build → verify, …)

Notation: `Pn` = phase `n` build. `PnV` = phase `n` verification gate. Gate **must** pass before `Pn+1` starts.

---

### P0 — Requirements freeze & domain model spec
**Build:**
- Write acceptance criteria (ACs) for each user journey: publish, browse, clone, translate, moderate, admin-review, free-tier switchover.
- Write the data-model spec (entities, relations, indices, FK cascade behaviour) for `SharedPath`, `PathTranslation`, `ModerationAudit`, `Ticket`.
- Sketch API contracts for: `/api/learn/paths/[planId]/publish`, `/api/community/paths` (list+filter), `/api/community/paths/[shareId]` (detail w/ `?lang=` translation), `/api/community/paths/[shareId]/clone`, `/api/admin/tickets`, `/api/admin/tickets/[id]`.
- Specify the free-tier transition: exact tier-limit values and rollout flag.
- Decide the **popular language set** for Phase 11 pre-translation (initial proposal: de, en, fr, es, it, tr — to be confirmed).
- Decide the **per-audit / per-translation cost budgets** (numbers, not feelings) — these become the Phase 4/10/11 gate thresholds.

**P0V — Verification gate:**
- AC walk-through against the freemium-economics ceiling: does the design plausibly hit ≤ 0.3 CHF target?
- Schema review: every FK has a deletion strategy, every new field has an index where it'll be queried.
- API contract review: backward-compatible with `/api/community/notebooks` patterns; nothing breaks existing surfaces.
- Sign-off recorded in this plan file ("P0V signed off YYYY-MM-DD") before P1 begins.

**P0 status:** Spec lives in [`path-publishing-community-library-p0-spec.md`](./path-publishing-community-library-p0-spec.md) (ACs, data model, API contracts, free-tier transition, popular-language set, cost budgets, decisions on the §9 open questions). **P0V signed off 2026-05-20** — see §8 of the spec for the AC / schema / API gate write-ups. P1 may begin.

---

### P1 — Database & domain types
**Build:**
- Add `SharedPath`, `ModerationAudit`, `PathTranslation`, `Ticket` to `apps/web/prisma/schema.prisma`. Add `language String?` to `StudyPlan` and backfill plan (default to creator's preferred language or `'en'`).
- Add new `AdminAction` literals (`'shared_path.approve'`, `'shared_path.reject'`, `'ticket.resolve'`, `'ticket.assign'`) in `apps/web/src/lib/admin-audit.ts`.
- Add new `Notification` types in `apps/web/src/lib/notification-utils.ts`.
- Generate the migration **offline** via `prisma migrate diff` (per project dev-tooling convention).
- Update shared types in `packages/shared/` for any cross-app shape (e.g. `SharedPathDTO`).
- Add a dev seed script: 1 admin, 2 users, 5 StudyPlans, SharedPaths in every state (`pending`, `auditing_l2`, `flagged_pending_human`, `approved`, `rejected`).

**P1V — Verification gate:**
- Migration applies cleanly on a fresh DB and on a clone of prod-shape.
- `corepack pnpm --filter web prisma generate` clean.
- `tsc` clean on changed files only (project-wide lint baseline is red — scope to changed files).
- Seed script produces a DB state that downstream phases can boot against.
- Schema diff reviewed for unintended migrations (no accidental column drops on existing tables).

---

### P2 — Publish submission API (state machine only, no moderation logic)
**Build:**
- `POST /api/learn/paths/[planId]/publish` — auth-gated, owner-only; creates `SharedPath{moderationStatus:'pending'}`; idempotent (returns existing record on retry).
- `GET /api/learn/paths/[planId]/publication-status` — author polls.
- `DELETE /api/community/paths/[shareId]` — author can unpublish (any status).
- Author-facing UX: status chip on path card + dedicated status page describing what stage the audit is at and why if rejected.

**P2V — Verification gate:**
- Unit: rejects non-owned paths; rejects paths in `generating`/`failed` status; rejects already-published paths.
- Integration: submit → `pending` row exists → manually flip to `approved` via seed → public surface (Phase 8 not built yet, so verify via direct DB read + JSON dump).
- Manual: status chip renders correctly in dark and light themes; copy is clear in each state.

**P2 status:** Shipped 2026-05-20. New endpoints: `POST /api/learn/paths/[planId]/publish`, `GET /api/learn/paths/[planId]/publication-status`, `DELETE /api/community/paths/[shareId]` (204 no body; auto-dismisses open `Ticket`s; `AdminAuditLog{action:'shared_path.unpublish'}` when an admin force-deletes). Idempotent publish via `SharedPath @@unique([planId])` plus a P2002 race-recovery branch. Author UX wired through: chip on path card + dedicated `/learn/paths/[planId]/publication` page with polling, audit timeline, and two-step Unpublish flow. `path-loader.ts` extended so `SerializedPath` ships a nullable `publication` companion (zero extra round-trips for the list view). Admin-only `seeded` shortcut is silently ignored in P2 — it lands with the moderation pipeline in P3/P7/P11. **P2V signed off 2026-05-20**: `prisma generate` clean, `tsc --noEmit` exit 0 across apps/web, eslint clean on all new files, schema untouched. Pre-existing `react-hooks/set-state-in-effect` baseline on the path list page was not introduced by P2 (verified via `git stash`). P3 may begin.

---

### P3 — Moderation Layer 1 (wordlist filter, sync)
**Build:**
- Wordlist source: `apps/web/src/lib/moderation/wordlists/{en,de,...}.ts` with both block- and flag-lists (block = auto-reject, flag = mark for L2 scrutiny). Languages chosen to match popular set from P0.
- Filter scans title, description, slot titles, theory text, flashcard fronts/backs.
- Block hits → `SharedPath.moderationStatus = 'rejected'` + `ModerationAudit{layer:1, verdict:'reject', reasonCode}` + Notification to author.
- Pass → transition to `auditing_l2`.

**P3V — Verification gate:**
- Unit: known blocked words rejected; whitelist (substring false-positive like "scunthorpe") honoured; multi-language wordlist applied based on path language.
- Integration: end-to-end submit with bad content stops at `rejected`; clean content moves to `auditing_l2`.
- Manual: rejection notification reaches author with a reason; light-mode audit on the rejection screen.
- Adversarial: unicode look-alike / leetspeak fixtures — verify expected behaviour matches the spec from P0 (some bypass tolerated and caught by L2; document it).

---

### P4 — Moderation Layer 2 (cheap-model audit, async)
**Build:**
- Background task triggered when SharedPath enters `auditing_l2`. Fire-and-forget per existing async pattern.
- Provider via `MODERATION_L2_PROVIDER` env (default: Gemini Flash or Haiku — cheapest sensible).
- Prompt: shallow safety + spam + obvious-off-topic check, returning a constrained JSON verdict `{verdict: 'pass'|'reject'|'flag', reasonCode, confidence}`. Use `buildCachedSystem()` so the rubric prompt is cacheable across all calls.
- `pass` → state → `approved`; Notification + email.
- `reject` → state → `rejected`; Notification + email with reason code.
- `flag` → state → `auditing_l3`.

**P4V — Verification gate:**
- Unit: prompt parser handles malformed JSON, model errors, timeouts (defaults to `flag` on parse failure so nothing slips through).
- Integration with stubbed model: each verdict path produces correct state transitions and notifications.
- Manual: real model run on 10 fixtures (5 expected-pass, 5 expected-reject) — false-positive and false-negative counts recorded in the verification log.
- **Cost gate:** mean L2 audit cost recorded via `apps/web/src/lib/path-generator-cost.ts`; must be below the P0-defined budget for L2 (expected: small single-digit cents per audit).
- Cache-hit ratio measured: rubric prompt should hit cache after the first call.

---

### P5 — Moderation Layer 3 (detailed audit on flag)
**Build:**
- Triggered only when L2 returns `flag` → `SharedPath.moderationStatus = 'auditing_l3'`.
- Stronger model via `MODERATION_L3_PROVIDER` (default: Sonnet).
- Prompt reuses cached rubric block; adds the L2 reasoning as context.
- Verdicts: `auto_reject` | `escalate_to_human`.
- `auto_reject` → `rejected`; Notification.
- `escalate_to_human` → `flagged_pending_human` + create `Ticket{type:'moderation_review', refType:'SharedPath', refId, status:'open'}`.

**P5V — Verification gate:**
- Unit: same JSON-parse robustness as L2.
- Integration: L2 `flag` → L3 either auto-rejects or creates a ticket — invariant: every L3 escalate must produce exactly one `Ticket` row.
- Manual: 5 fixtures designed to flag; verify L3 reasoning is sensible.
- **Cost gate:** mean L3 cost recorded; budget is higher than L2 (smaller volume), but still bounded per P0.
- Verify no ticket exists without a SharedPath in `flagged_pending_human`.

---

### P6 — Admin dashboard skeleton + tickets surface
**Build:**
- New route group `apps/web/app/(admin)/admin/` gated by `getAdminUserId()`. Non-admin returns 404 to avoid leaking existence.
- Dashboard home: consolidates existing `/api/admin/stats`, `/api/admin/waitlist`, `/api/admin/users` into a single nav.
- `Tickets` page: lists open tickets, sortable by createdAt; detail view shows the SharedPath summary, full `ModerationAudit` history, and the AI reasoning from L2/L3.
- No moderation decision-making yet (P7); this phase is the surface only.

**P6V — Verification gate:**
- RBAC: non-admin GET returns 404; admin GET returns dashboard.
- Existing admin metrics still load through the new UI.
- Manual walkthrough: admin sees tickets in correct order; ticket detail shows the full audit history.
- a11y baseline + light-mode audit on every new admin screen.

---

### P7 — Moderation Layer 5 (human review wired to dashboard)
**Build:**
- From ticket detail: `Approve` and `Reject(reason)` buttons.
- `Approve` → SharedPath → `approved`; ModerationAudit{layer:5, verdict:'pass'}; AdminAuditLog{action:'shared_path.approve'}; Ticket → `resolved`; Notification to author.
- `Reject` → SharedPath → `rejected`; ModerationAudit{layer:5, verdict:'reject', reasonCode}; AdminAuditLog{action:'shared_path.reject'}; Ticket → `resolved`; Notification + email to author with reason.

**P7V — Verification gate:**
- E2E approve: submit obvious-flag content → L1 pass → L2 flag → L3 escalate → ticket → admin approves → path is publicly listed → author notified.
- E2E reject: same path up to admin rejects → path stays private → author notified with reason.
- Audit log contains every admin action with admin ID and target.
- Idempotency: approving an already-approved ticket is a no-op, not an error.
- Manual: timing — full pipeline from submit to "approved" (excluding human wait) measured and recorded.

---

### P8 — Community library UI (browse / search / filter)
**Build:**
- Public route `apps/web/app/(public)/learn/community/` (or under dashboard if auth required to browse — TBD with user; default = auth required for v1, public SEO surfaces are a v2 concern).
- Lists `SharedPath.moderationStatus = 'approved'` only.
- Filters: subject (reuse existing taxonomy), `language`, length (slot count), popularity (downloadCount).
- Search: `ILIKE` over title + description (start simple, FTS later if needed).
- API: `/api/community/paths` — pagination, filters, search — mirrors `/api/community/notebooks` patterns from `apps/web/app/api/community/notebooks/route.ts:6-125`.
- Detail page `apps/web/app/(public)/learn/community/[shareId]/page.tsx` — previews phase + checkpoint structure (titles), reserves full theory/quiz content until clone or translate.

**P8V — Verification gate:**
- Pagination correctness against 100+ fixture rows.
- Filter combinations return expected sets (matrix test: subject × language × popularity).
- Search relevance: top-K manual inspection on a known fixture corpus.
- Mobile responsiveness — library is mostly a study-side surface, so mobile matters.
- a11y baseline + light-mode audit.

---

### P9 — Path cloning (fork-on-clone)
**Build:**
- `POST /api/community/paths/[shareId]/clone` — creates a private `StudyPlan` for the requester, deep-copying phases + checkpoint slots + activities + theory/flashcards/quiz content.
- Tracks `clonedFromSharedPathId` on the new StudyPlan (new column added in P1).
- Increments `SharedPath.downloadCount`.
- Idempotent: if requester already has a clone of this `SharedPath`, returns existing clone (don't duplicate).
- Does NOT copy progress / streak / completion state — fresh start.

**P9V — Verification gate:**
- Unit: clone preserves structure but assigns fresh IDs; existing IDs unchanged.
- Edits to the original (republished) do NOT affect existing clones (fork model verified).
- Manual: free user clones a public path and starts using it — validates the value prop end-to-end.
- Idempotency: repeated clone requests return the same plan ID.
- Cost: pure DB operation, no AI — cost gate trivially met.

---

### P10 — Translation cache + on-demand translation
**Build:**
- `GET /api/community/paths/[shareId]?lang=de` — if `PathTranslation` cached for `(shareId, 'de')`, serve from cache; else translate inline (synchronous on first request, bounded ~30s) and write to cache.
- Translation prompt with `buildCachedSystem()` for the system / instruction block so it cache-hits.
- **Single-flight:** unique constraint on `(sharedPathId, targetLanguage)` + `INSERT … ON CONFLICT DO NOTHING` → wait → re-read. Prevents 2 concurrent users triggering 2 AI calls.
- **Rate limit** per user + per IP on translation triggers (anti-abuse cap).
- **Per-language daily budget guard** — if today's translation spend in language `L` exceeds the budget, refuse new on-demand translations into `L` with a "try later" UX. Pre-baked popular languages are exempt because they're free at view time.
- Source of truth for translation: copy the SharedPath snapshot into the translation row at creation time so future edits to original (rare; would require re-publish flow) don't desync cached translations.

**P10V — Verification gate:**
- Unit: first request → AI call + cache write; second request → cache hit, zero AI call.
- Concurrency: 5 parallel requests for the same `(path, lang)` → exactly 1 AI call (verified via mock provider call counter).
- Manual: translate a known German path to English; verify content is readable English; verify second request is instant.
- **Cost gate:** mean per-translation cost recorded; ≤ P0 budget.
- Rate limit: 6th request from same user/IP within window → 429.
- Daily-budget guard: simulated over-budget condition rejects gracefully.

---

### P11 — Popular-language pre-translation (background, popularity-gated)
**Build:**
- Config: `POPULAR_LANGUAGES` env var (initial set from P0), `POPULARITY_THRESHOLD` env var (default 10 — see P0 spec §3 / §6).
- **Trigger (revised per P0 spec — popularity-gated, not eager):** the pre-translation fan-out fires under exactly three conditions: (a) on `approve` for **seeded** paths only (cache-warm the free-funnel anchor); (b) on **clone** when the post-increment `downloadCount` first crosses `POPULARITY_THRESHOLD` (atomic guard via `popularityTriggeredAt`); (c) on **admin manual trigger** via `POST /api/admin/paths/[shareId]/pretranslate` (`AdminAction: 'shared_path.pretranslate_force'`) — also covers one-off backfill of pre-rule rows. Fire-and-forget, sequential per language with backoff. Skip languages where a `PathTranslation` row already exists.
- The admin manual-trigger endpoint also serves the `POPULAR_LANGUAGES` set-change backfill use case.

**P11V — Verification gate:**
- **Seeded path** approved → polling for `PathTranslation` rows shows one per popular language within N seconds.
- **Community path** approved → `PathTranslation` rows stay zero. Then 10th clone arrives → fan-out fires within N seconds. 11th clone is a no-op (idempotency via `popularityTriggeredAt`).
- Viewing a pre-translated path in any popular lang hits cache, zero AI call (verified via mock provider counter).
- **Cost gate:** bulk pre-translation cost per popular/seeded path measured against P0 budget ≤ $0.50; total expected monthly pre-translation spend projected against `(seeded_count + community_popular_count_per_month)` — must clear the revised P0 ceiling of **$100/month**.
- Failure handling: if a per-language pre-translation fails, it's retried on the next view-time fallback to on-demand, not silently dropped.
- Concurrent clones at the threshold boundary → exactly one fan-out (race-tested).

---

### P12 — Curated seed library + free-tier switchover (the big one)
**Build:**
- Author and publish N≥20 curated seed paths via the admin dashboard. Seeded paths bypass moderation (marked `seeded=true` or published by an admin role — decision in P0).
- **Free-tier change:** `checkUsageLimit('ai_study_plan')` returns 0 for FREE tier (vs current 3). Implement behind a feature flag `FREE_TIER_AI_PATHS_DISABLED=true` so it can be reverted without redeploy.
- **Free-tier UX update:** when a free user hits the "create path" CTA, they land at the community library with messaging explaining that paths come from the library (and AI generation is part of Pro). Pro users see the unchanged flow.
- **Telemetry:** track free-user library-clone count, free-user retention (D1/D7), and AI COGS per free user before and after the flag flip.

**P12V — Verification gate:**
- E2E: brand-new free-user signup → onboarding → lands at library → clones a seed path → uses it through to first activity completion.
- Regression: Pro user can still generate AI paths (unchanged flow).
- **Activation measurement window:** 1 week with the flag on. AC for go/no-go:
  - Free-user activation rate (define activation in P0) does not drop more than X% vs baseline.
  - Free-user-week-1 retention does not drop more than Y%.
  - Free-user AI COGS drops to near-zero except translation tail.
- **Rollback plan rehearsed:** flip flag off, verify free users get AI generation back within 1 minute.
- Light-mode + dark-mode audit on the new free-tier "create path" landing UX.

---

### P13 — Reserved (Layer 4: post-publish reports / trust scoring)
**Build:** Deferred. Re-plan when P1–P12 are stable in production.
**Sketch:** `Report` model linked to SharedPath; user-facing "report this path" affordance; aggregation triggers re-moderation; trust score on `User` auto-flags first N publications.
**P13V — Verification gate:** TBD when designed.

---

## 6. Final acceptance gate (system-level, after P12V)

Trace each AC back to the original constraint that motivated this work:

- **AC-Economics:** measured per-free-user AI COGS ≤ 0.3 CHF target over a 7-day window post-switchover. Traces back to freemium unit economics.
- **AC-Front-door:** a brand-new free user gets onto a real path within 60 seconds of signup, no AI generation. Traces back to paths-led growth.
- **AC-Moderation:** zero public paths have ever bypassed moderation in audit logs. Verified by SQL: every `SharedPath.moderationStatus='approved'` has a corresponding `ModerationAudit` chain.
- **AC-Translation:** viewing a published path in any popular language never triggers an AI call (measured over a 24h window).
- **AC-Auditability:** every admin moderation action appears in `AdminAuditLog` with admin ID + target. No orphan tickets.
- **AC-a11y:** every new surface passes the light-mode-no-light-text rule + keyboard nav baseline.

---

## 7. Risks & mitigations

| Risk | Mitigation |
|---|---|
| L2/L3 cost overrun under load | Per-author submission rate limit; cost guard daily cap; cache-hit ratio monitored |
| Translation cost overrun | Per-language daily budget guard (P10); rate limit per user/IP; popular set kept conservatively small (start ≤ 6 langs) |
| Seed library quality too thin → free users churn | Manually curate; commit to N≥20 quality paths before flipping the FREE flag; activation/retention gates in P12V |
| Free-user activation regression | Feature-flagged switchover (P12); 1-week measurement; rehearsed rollback |
| SharedNotebook bypasses moderation today | Out of scope — but **flag for a separate plan** because the same risk applies and the moderation infra here is reusable |
| Coolify env vars missed | Pre-deploy checklist: every new env var (provider keys, popular-language set, feature flags) listed and confirmed in Coolify container env before merging |
| Moderation false negatives (bad content gets through) | L1+L2+L3 layered defense; P13 reports flow is the recovery; admin manual audit log is the forensic trail |
| Moderation false positives (good content rejected) | All rejections come with reason codes and an appeal path → ticket creation by author (not in v1, but the data model supports it) |

---

## 8. Out of scope (v1)

- Live-subscribe clone model (only fork-on-clone in v1).
- Creator attribution / monetization / "verified author" badges.
- Translation of user-private (unpublished) paths.
- Layer 4 (P13) — reports/trust scoring.
- Retrofitting moderation onto `SharedNotebook` — same problem, separate plan.
- Public/SEO-visible community surface (auth required for v1; SEO is v2).
- **Comments** on public paths — deferred to v2. Ratings (1–5 stars) **are in v1** per P0 spec §2.4 / §3.10; comments are held back because they'd double the moderation surface and we want rating-only data first to know if comments are needed. Reuses `NotebookComment` infra when revisited.

---

## 9. Open questions to resolve in P0

- Exact subject taxonomy for filters — reuse existing or extend?
- Public/unauth library vs auth-required — see "Out of scope".
- Seed-content rights — admin-published paths' visibility model (is `SharedPath.publishedById = adminId` enough, or do we need a `seeded` flag for analytics?).
- Numerical cost budgets per audit type and translation type — these become P4V/P5V/P10V/P11V gate thresholds.
- Popular-language set — proposal: de, en, fr, es, it, tr.
- Activation/retention regression tolerances for the AC in P12V.
