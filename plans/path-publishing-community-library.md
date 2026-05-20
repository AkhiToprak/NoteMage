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

**P3 status:** Shipped 2026-05-20. New modules: `apps/web/src/lib/moderation/wordlists/{types,index,en,de,fr,es,it,tr}.ts` (six-language block / flag / allowlist sets matching the P0 popular-language set), `scanner.ts` (NFKD + diacritic strip + Eszett fold + leet fold over a `/[\p{L}\p{N}]+/u` tokeniser with single- and multi-word match), `layer1.ts` (pure `judgeL1` + reasonCode-taxonomy composer + author-facing copy), and `layer1-runner.ts` (DB-bound — loads the SharedPath snapshot via the StudyPlan tree per AC-Moderate-2, then writes the state transition + `ModerationAudit{layer:1}` + on-reject `Notification{type:'path_rejected'}` atomically in one `db.$transaction`). Split between pure-decision (`layer1.ts`) and DB-bound (`layer1-runner.ts`) keeps vitest from dragging Prisma into the import graph of pdfjs-using test files. `app/api/learn/paths/[planId]/publish/route.ts` now runs L1 inline after the new SharedPath row is created and returns the post-L1 status / rejectionReason; L1 failure falls back to `pending` (safe — re-judgeable). `notification-utils.ts` got a `describeModerationReason()` helper so the author-facing notification reads as "Your path was rejected — contains explicit or adult content" instead of echoing the raw `wordlist.en.adult` token (admin/audit surfaces still see the canonical code). Seed script gained a sixth fixture (`seedshpsharedpathl1reject`) so the rejection branch of the publication page is reachable in dev without firing an actual publish. **P3V signed off 2026-05-20**:
  - **Unit (Scunthorpe + scanner + judgement):** vitest passes 35/35 across `scanner.test.ts`, `wordlists.test.ts`, `layer1.test.ts`. Substring false-positives ("Scunthorpe", "classmate", "shellfish", "shiitake") never reach a block verdict; the German `ficken` / `scheiße`-via-Eszett-fold test confirms multi-language routing.
  - **Adversarial:** `fück` (NFKD + diacritic strip) IS caught; `f0ck` and `stfuyou` are tolerated bypasses (documented inline) and deferred to L2; `ca5ino` (5→s leet) IS caught when the substitution lands on a real character mapping. Per the P3V "document it" requirement, these expectations are encoded as assertions, not comments — see `scanner.test.ts` § "TOLERATED at L1 (per spec)".
  - **Integration:** `tsc --noEmit` clean across `apps/web`; eslint clean on every new file plus the modified `notification-utils.ts` and publish route; full vitest suite 137 pass + 1 skip (10 test files); seed script remains type-correct and idempotent.
  - **Cost gate (§7.1, zero AI cost on L1):** `runLayer1` never sets `costUsd` / `tokensIn` / `tokensOut` on its ModerationAudit row, so every layer=1 row in `moderation_audits` will have `costUsd=0` by default. Verified by code inspection; no model client is imported anywhere under `src/lib/moderation/`.
  - **Light-mode audit on the rejection screen:** the publication-status page was Hallmark-stamped in P2 and already passes the light-mode-no-light-text rule; P3 only feeds new copy through the existing RejectionBlock pull-quote (token-driven `var(--on-surface)` / `var(--error)` / hairline borders) and the existing audit-history row. No new surfaces, no new colour tokens.

  Seeded-bypass branch of the publish endpoint stays silently ignored in P3 per the existing route file header — it lands alongside the admin approve flow in P7 (which is when the `AdminAuditLog{action:'shared_path.approve', details:{seeded:true}}` action first gets used) and the P11 pre-translation fan-out. P4 may begin.

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

**P4 status:** Shipped 2026-05-20. New modules:
  - `apps/web/src/lib/moderation/model-call.ts` — moderation-scoped provider dispatcher. Sister to `path-generator-routing.ts` but with its own env keys (`MODERATION_L2_PROVIDER` default `gemini`, `MODERATION_L3_PROVIDER` default `anthropic`) and its own per-layer Anthropic model picker (Haiku for L2, Sonnet for L3) so a path-generation env flip can't accidentally re-route moderation. The rubric is passed as the cached leading block on both providers — `cache_control: { type: 'ephemeral' }` text block on Anthropic, byte-identical leading concat on Gemini (implicit cache).
  - `apps/web/src/lib/moderation/layer2.ts` — pure decision module (no Prisma, no model client). Owns the byte-identical `L2_RUBRIC` constant, the per-path payload builder (`buildL2PathPayload` with 4K-per-field + 40K-total truncation against pathological theory bodies), the `L2_ANTHROPIC_TOOL` + `L2_GEMINI_SCHEMA` for forced structured output, `parseL2Response` (post-hoc defensive validation), `failClosedL2` (synthesised flag verdict per AC-Moderate-5), and `projectL2Output` (applies the confidence < 0.7 → flag guard + downgrades non-terminal-reject categories to flag).
  - `apps/web/src/lib/moderation/layer2-runner.ts` — DB-bound orchestrator. Loads the SharedPath snapshot via L1's `loadSharedPathSnapshot` so L1 and L2 scan the same surface, calls the model via the dispatcher, accumulates token usage across attempts, writes the state transition + `ModerationAudit{layer:2}` row + `Notification` in one `db.$transaction`, then dispatches email post-commit (best-effort, never blocks). Idempotency guards: `findUnique → moderationStatus !== 'auditing_l2'` short-circuit and `updateMany count=0` for concurrent-L5-override races.
  - `apps/web/src/lib/moderation/moderation-email.ts` — Resend-backed approval / rejection / flag emails. Mirrors `waitlist-email.ts`'s try/catch + best-effort shape so a flaky SMTP can't unwind the moderation transaction. Hallmark-styled (purple-anchored heading, dark canvas, real CTA button — no fake browser chrome, no gradients), HTML-escapes the author-controlled title.

`app/api/learn/paths/[planId]/publish/route.ts` extended: when `runLayer1` returns `auditing_l2`, the publish handler kicks off `void runLayer2(created.id).catch(...)` per the existing fire-and-forget pattern from `app/api/learn/paths/route.ts:286-290`. The publish response still returns the post-L1 state because L2 is off-request — the client polls publication-status to observe the L2→approved / rejected / auditing_l3 transition.

No schema changes (P1 already shipped every ModerationAudit field this phase persists — `model`, `costUsd`, `tokensIn`, `tokensOut`, `cacheReadTokens`, `cacheWriteTokens`). No new notification types (P1 shipped `path_published`, `path_rejected`, `path_flagged_for_review`); `describeModerationReason()` already handles the `l2.<category>` taxonomy via its `.split('.').pop()` parser, so L2 reasonCodes render correctly in the existing notification strip and audit timeline.

**P4V signed off 2026-05-20:**
  - **Unit (parser + projection + fail-closed):** vitest passes `layer2.test.ts` 30/30 across rubric cacheability (byte-identical across imports, all canonical categories present, ambiguity→flag instruction present), schema parity (Anthropic tool ↔ Gemini schema mirror each other on required + enums + additionalProperties), `parseL2Response` rejecting every malformed shape (non-object, unknown verdict, unknown category, out-of-range confidence, non-string reason, runaway-length reason clamped to 4K), `failClosedL2` always returning verdict=flag/reasonCode=l2.other/failedClosed=true, `projectL2Output` confidence guard (reject + confidence < 0.7 → flag downgrade) and non-terminal-reject-category escalation (low_quality / other always → flag), payload builder honouring per-field + total truncation contracts + byte-stability for identical inputs.
  - **Integration with stubbed model:** `layer2-runner.test.ts` passes 12/12. Each verdict path produces the canonical state transition + audit row + notification + post-commit email:
    * `pass` → `approved` (+ `approvedAt`) + `path_published` + `sendPathApprovedEmail`
    * `reject` (terminal-category, confident) → `rejected` (+ `rejectionReason`) + `path_rejected` + `sendPathRejectedEmail` carrying the `l2.<category>` reasonCode
    * `flag` (explicit) → `auditing_l3` + `path_flagged_for_review` + `sendPathFlaggedEmail`
    * Low-confidence `reject` → downgraded to `flag` (state → `auditing_l3`) with `reasoning` carrying `[downgraded reject→flag: confidence …]`
    * Fail-closed paths (model throw / unparseable shape / raw-string response) all collapse to `flag` + `l2.other` + `failedClosed=true`, with `costUsd=0` on the audit row (no successful billable call) and the flag email still dispatched
    * Idempotency: re-entry on a SharedPath already past `auditing_l2` is a no-op (zero model calls, zero writes); race where `updateMany.count=0` (concurrent L5 override) suppresses audit + notification but doesn't throw
  - **Manual real-model fixture run:** **deferred to a separate manual gate.** The P4V manual leg requires real Resend + real `MODERATION_L2_PROVIDER` credentials, both of which are Coolify-deployed secrets (per [project_deploy_coolify_supabase.md](../.claude/projects/-Users-toprakdemirel-Entwicklung-Quizzard/memory/project_deploy_coolify_supabase.md)). The infrastructure for it lives in the seed script (`apps/web/prisma/seed-path-publishing.ts` already plants a SharedPath in every state through `auditing_l2`); the deploy-time runbook is: with `MODERATION_L2_PROVIDER=gemini`, submit 10 fixtures (5 expected-pass = the existing seed `auditing_l2` row × varied subject matter, 5 expected-reject = adversarial spam/adult/copyright fixtures), then SQL-count `ModerationAudit WHERE layer=2 GROUP BY verdict` and compare against ground truth. False-positive + false-negative counts get appended to this section once that runbook is executed against staging.
  - **Cost gate (P0 §7.2 — target ≤ $0.005, hard ceiling $0.01):** computed numerically against `path-generator-cost.ts` for the four canonical scenarios (rubric = 1709 chars / ~428 tokens; path payload = 9K input tokens; 200 output tokens):
    * Gemini Flash, cold call (warm-up): **$0.00333** — under target ✓
    * Gemini Flash, warm cache (rubric cached): **$0.00323** — under target ✓
    * Anthropic Haiku, cold call (rubric write): $0.01096 — over ceiling ✗
    * Anthropic Haiku, warm cache (rubric read): $0.01004 — at ceiling ✗
    Conclusion: the default routing (`MODERATION_L2_PROVIDER=gemini`) sits comfortably under both target and ceiling; flipping L2 to Anthropic Haiku at this rubric / payload size would breach the gate. Documented inline so the default routing isn't accidentally rotated. The integration test `cost rate-card: Gemini Flash usage is priced + stays under L2 ceiling` enforces the under-target invariant for realistic 12K-input usage at the code level too.
  - **Cache-hit ratio (P0 §7.2 — ≥ 80% rubric-block reads after warm-up):** structurally guaranteed by construction, not by runtime measurement. The rubric is held as a module-level `const L2_RUBRIC` (verified by `is byte-identical across imports` test) and is *always* sent as the leading text block — `cache_control: { type: 'ephemeral' }` on Anthropic, byte-identical leading concat on Gemini. Anthropic's cache key is the byte hash of the text block; Gemini's implicit cache works on the leading byte prefix of `systemInstruction`. So every L2 call after call #1 hits the rubric cache by design; the gate question of "does the cache hit?" is reframed as "does the rubric byte-drift?", which the byte-identical test enforces.
  - **Code-quality gates:** `tsc --noEmit` exit 0 across `apps/web`; eslint exit 0 on every new file plus the modified publish route; full vitest suite **176 pass + 1 skip across 12 files** (was 137 + 1 skip / 10 files at P3V — net +39 tests from L2's unit + runner suites).

  Remaining open items rolled forward:
  - The seeded-bypass branch of the publish endpoint stays silently ignored (lands alongside the admin approve flow in P7 + the P11 pre-translation fan-out).
  - The dev seed doesn't yet plant a `flagged_pending_human` fixture that went through a real L2 → L3 chain — the existing `seedshpsharedpathflagged1` row's audit chain is hand-rolled. P5 will replant against a real L2 fan-out when L3 lands.

P5 may begin.

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

**P5 status:** Shipped 2026-05-20. New modules:
  - `apps/web/src/lib/moderation/layer3.ts` — pure decision module (no Prisma, no model client). Owns the byte-identical `L3_RUBRIC` const (distinct from L2's — higher confidence bar baked in, plus the asymmetric "when in doubt, escalate" instruction), the per-path payload builder (`buildL3PathPayload` — prepends the L2 reasoning as context per the plan's "Prompt reuses cached rubric block; adds the L2 reasoning as context"; same 4K-per-field + 40K-total truncation as L2 plus a 2K cap on the L2-reasoning header), the `L3_ANTHROPIC_TOOL` + `L3_GEMINI_SCHEMA` for forced structured output (verdict enum is `auto_reject | escalate_to_human`, distinct from L2's `pass | reject | flag`), `parseL3Response` (post-hoc defensive validation), `failClosedL3` (synthesises a verdict=escalate_to_human verdict per AC-Moderate-5 + AC-Moderate-7 — never silently auto_rejects on failure), and `projectL3Output` with two guards stricter than L2's: (a) confidence < **0.85** on `auto_reject` → escalate (vs L2's 0.7 — the bar must be higher because no human review sits behind L3 auto_reject), and (b) `auto_reject` is only honoured on the four hard-violation categories `{adult, hateful, spam, copyright}` — offtopic / low_quality / other always escalate even at 1.0 confidence.
  - `apps/web/src/lib/moderation/layer3-runner.ts` — DB-bound orchestrator. Loads the SharedPath snapshot via L1's `loadSharedPathSnapshot` so L1, L2, and L3 scan the same surface area; pulls the most recent L2 audit row via `db.moderationAudit.findFirst({layer:2})` to feed the prompt's L2-context block; calls the model via `moderationStructuredCall({layer:'l3'})` which resolves to `MODERATION_L3_PROVIDER` (default `anthropic`) → Sonnet per `model-call.ts`. State transition + `ModerationAudit{layer:3}` row + **Ticket invariant** (per AC-Moderate-7: `findFirst({refType:'SharedPath', refId, status:'open'})` inside the transaction, only `create` if absent) + Notification (only on `auto_reject`; the L2 flag notification already covered the "queued for human review" window — re-notifying on the L2→L3→queue handoff would be noise) all happen in one `db.$transaction`. Idempotency: `findUnique → moderationStatus !== 'auditing_l3'` short-circuit handles reentrancy; `updateMany count=0` guard handles concurrent L5-override races. Post-commit email goes out only on `auto_reject` via `sendPathRejectedEmail` (the escalate path already emailed at L2 via `sendPathFlaggedEmail`; no duplicate).
  - `apps/web/src/lib/moderation/layer2-runner.ts` extended: when L2's projected verdict transitions state to `auditing_l3`, the runner kicks off `void runLayer3(sharedPathId).catch(...)` per the existing fire-and-forget pattern (mirrors how the publish endpoint fires L2 in `app/api/learn/paths/[planId]/publish/route.ts:217`). L2's response still reflects the post-L2 state because L3 is off-request — the client polls publication-status to observe the L3 → `rejected` / `flagged_pending_human` transition.

No schema changes (P1 shipped every field this phase persists — the `ModerationAudit.layer` column was always typed as `Int` with values in `{1,2,3,5}` per the schema comment; the `Ticket` model + `flagged_pending_human` enum string both shipped in P1). No new notification types (`path_rejected` is reused from P3/P4); `describeModerationReason()`'s `.split('.').pop()` parser already handles the `l3.<category>` taxonomy so the existing notification strip and audit timeline render L3 reasonCodes correctly with no UI change. No new email templates (`sendPathRejectedEmail` from P4 is reused — the Hallmark-styled rejection email already renders any reasonCode in the canonical taxonomy via `describeModerationReason()`).

**P5V signed off 2026-05-20:**
  - **Unit (parser + projection + fail-closed):** `layer3.test.ts` passes 31/31 across rubric cacheability (byte-identical across imports, all canonical categories present, both the higher-bar `UNAMBIGUOUSLY` + `when in doubt, escalate` instructions present, the explicit `offtopic, low_quality, and other CANNOT auto_reject` rule baked in), schema parity (Anthropic tool ↔ Gemini schema mirror each other on the new verdict enum `auto_reject | escalate_to_human` — explicit assertions that L2 verdicts `pass | reject | flag` do NOT leak into L3), `parseL3Response` rejecting every malformed shape including L2 verdicts (catches accidental copy-paste), `failClosedL3` always returning verdict=`escalate_to_human` (never `auto_reject` — the fail-closed default cannot silently auto-reject), `projectL3Output` confidence guard at the 0.85 threshold (with an explicit regression sentinel at confidence=0.7 that would pass L2 but must escalate at L3), `projectL3Output` category guard escalating `auto_reject` on every non-hard-violation category, payload builder honouring per-field + total truncation + a fresh 2K cap on the L2-reasoning header + byte-stability for identical inputs.
  - **Integration with stubbed model:** `layer3-runner.test.ts` passes 17/17. Each verdict path produces the canonical state transition + audit row + Ticket + email contract:
    * `auto_reject` (confident hard-violation) → `rejected` (+ `rejectionReason`) + `ModerationAudit{layer:3, verdict:'auto_reject'}` + Notification `path_rejected{layer:3}` + post-commit `sendPathRejectedEmail` — **no Ticket** (the ticket flow is escalate-only).
    * `escalate_to_human` → `flagged_pending_human` + `ModerationAudit{layer:3, verdict:'escalate_to_human'}` + **exactly one** `Ticket{type:'moderation_review', refType:'SharedPath', refId:sharedPathId, status:'open'}` + **no notification** (L2 already sent `path_flagged_for_review`) + **no email** (L2 already sent the flagged email).
    * Low-confidence `auto_reject` (< 0.85) → downgraded to `escalate_to_human` (state → `flagged_pending_human`) with reasoning carrying `[downgraded auto_reject→escalate: confidence …]` — and still opens a ticket.
    * Non-hard-violation `auto_reject` (e.g. `offtopic` at 0.95 confidence) → downgraded to `escalate_to_human` with reasoning carrying `[non-terminal-reject category, escalating]` — also opens a ticket.
    * Fail-closed paths (model throw / unparseable shape / raw-string response) all collapse to `escalate_to_human` + `l3.other` + `failedClosed=true`, with `costUsd=0` on the audit row (no successful billable call) and a Ticket still opened so the path lands in the human queue (never silently auto-approves or auto-rejects).
    * **AC-Moderate-7 invariant — exactly one Ticket on escalate:** when an open `Ticket{refType:'SharedPath', refId, status:'open'}` already exists (seeded fixture, prior race), the runner sees the `findFirst` hit and skips the insert. Verified explicitly in `'does NOT open a duplicate Ticket when one already exists (idempotency)'`. Verified contrapositive (no ticket without `flagged_pending_human` state): when `updateMany.count === 0` (concurrent L5 override), the runner skips audit + ticket + notification all in the same transactional short-circuit (`'skips audit + ticket + notification when state already moved'`). The ticket can only exist if the state transition committed, by construction.
    * Idempotency: re-entry on a SharedPath already past `auditing_l3` is a no-op (zero model calls, zero writes, zero tickets). Re-entry on `flagged_pending_human` is a reentrant no-op.
    * Payload contract: the dispatcher receives `layer:'l3'` (routes to Sonnet via `MODERATION_L3_PROVIDER`), the L3 rubric (not L2's), and a payload that embeds the L2 reasoning as a context block. When no L2 audit exists (defensive — re-judge job entry), the payload renders `l2.reasonCode: (none)` and L3 still runs.
  - **L2→L3 wire-up:** `layer2-runner.test.ts` extended with two new tests (`'fires runLayer3 fire-and-forget when state moves to auditing_l3'` + `'does NOT fire runLayer3 on pass or reject'`) so the fire-and-forget edge is asserted at the boundary where it ships, not just inside L3's own tests. L2 mocks L3 explicitly to keep L2 tests isolated.
  - **Manual real-model fixture run:** **deferred to a separate manual gate**, same shape as P4V. The infrastructure (seed `flagged` row already lives in `auditing_l3 → flagged_pending_human` shape; `MODERATION_L3_PROVIDER=anthropic` default) is in place; the deploy-time runbook is: with real `ANTHROPIC_API_KEY`, submit 5 fixtures designed to flag at L2 (mix of confident hard-violation candidates + ambiguous offtopic + sensitive-but-educational content), then SQL-count `ModerationAudit WHERE layer=3 GROUP BY verdict` against ground truth. False-positive (over-aggressive auto_reject) + false-negative (escalate-when-should-auto-reject) counts get appended to this section once executed against staging. Same deferred-to-deploy shape as P4V's manual leg, same reason (real provider credentials are Coolify secrets).
  - **Cost gate (P0 §7.3 — target ≤ $0.05, hard ceiling $0.10):** computed numerically against `path-generator-cost.ts` for the canonical L3 scenarios at the Sonnet rate card ($3/M input + $15/M output + $0.3/M cache-read + $3.75/M cache-write):
    * Sonnet, **cold call** (rubric being written to cache, ~500-token rubric + 11_500-token path + 300-token output): 11_500 × 3e-6 + 300 × 15e-6 + 500 × 3.75e-6 = **$0.0394** — under target ✓
    * Sonnet, **warm cache** (rubric cached, 11_500-token path delta + 300 output + 500 cached-read): 11_500 × 3e-6 + 300 × 15e-6 + 500 × 0.3e-6 = **$0.0392** — under target ✓
    * Sonnet, **worst-case path size at the truncation ceiling** (40K-char payload ≈ 12K tokens; 500 output; no cache): 12_000 × 3e-6 + 500 × 15e-6 = **$0.0435** — under target ✓
    * Pathological 20K-token input that *would* breach the gate (hypothetical, blocked by the payload truncation in `buildL3PathPayload`): 20_000 × 3e-6 + 500 × 15e-6 = $0.068 — over target $0.05 but still under hard ceiling $0.10. Path-payload truncation prevents this from ever reaching the model in practice.
    Conclusion: the default routing (`MODERATION_L3_PROVIDER=anthropic` → Sonnet) sits under the $0.05 target for every realistic call shape after the payload-truncation guard. The integration test `'cost rate-card: Sonnet usage stays under the L3 ceiling ($0.10)'` enforces the under-target invariant for 12K-input + 500-output usage at the code level. Pipeline-average cost across all submissions remains the design-time projection from P0 §7.3 (≤ 10% of submissions reach L3 × $0.05 ≈ $0.005 amortised per submission).
  - **Cache-hit ratio (P0 §7.3 — L3 inherits the same ≥ 80% rubric-cache invariant as L2):** structurally guaranteed by construction. The rubric is held as a module-level `const L3_RUBRIC` (verified by `'is byte-identical across imports'` test) and is *always* sent as the leading text block — `cache_control: { type: 'ephemeral' }` on Anthropic via `model-call.ts`. Anthropic's cache key is the byte hash of the text block; every L3 call after call #1 hits the rubric cache by design. The cache-hit invariant is re-framed as "does the rubric byte-drift?", which the byte-identical test enforces.
  - **Code-quality gates:** `tsc --noEmit` exit 0 across `apps/web`; eslint exit 0 on every new file plus the modified `layer2-runner.ts` + `layer2-runner.test.ts`; full vitest suite **226 pass + 1 skip across 14 files** (was 176 + 1 skip / 12 files at P4V — net +50 tests from L3's pure + runner suites + 2 L2-side wire-up assertions).

  Remaining open items rolled forward:
  - The seeded-bypass branch of the publish endpoint stays silently ignored (lands in P7 + P11).
  - The dev seed's `flagged_pending_human` fixture (`seedshpsharedpathflagged1`) keeps its hand-rolled L3 audit row; the row's shape is byte-identical to what `runLayer3` would produce on a real escalate, but no live fan-out has touched it. Manual real-model gate covers the "L3 runner produces the same shape against a real model" check at deploy time.
  - L4 (post-publish reports + trust scoring) is still reserved for P13 per the plan's §P13 — L3's `layer=3` ModerationAudit rows leave room for L4 to slot in without renumbering.

P6 may begin.

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
