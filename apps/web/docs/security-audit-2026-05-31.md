# NoteMage — Full-Repo Security & Bug Audit

**Date:** 2026-05-31
**Auditor:** Claude (Opus 4.8), risk-prioritized per-subsystem review (the `/security-review` methodology applied across the whole codebase, since the tool is diff-only and the tree is clean).
**Audited tree:** working branch `security/prisma-equals-wrap` @ `7e98033`.
**Deploy source:** `main` / `origin/main` @ `74973e1` (Coolify auto-deploys `main` → `notemage.app`).
**Method:** 12 subsystem passes (security lens + correctness-bug lens), every Critical/High finding re-verified by reading the code path and confirming reachability. Report-only — no code was changed.

> ⚠️ **The audited tree is NOT what is deployed.** See [§1](#1-deployment--branch-hygiene-read-first). Findings note their status on `main` (production) explicitly.

---

## Executive summary

The application is, on the whole, **well-engineered and security-conscious**: ownership scoping is consistent across the large notebook/study-content CRUD surface, admin RBAC is enforced on every `/api/admin/*` route, the moderation pipeline is fail-closed, payment webhooks verify signatures with constant-time comparison + DB-level idempotency, and AI cost is metered. Today's hardening pass (rate limits, HSTS, CSP, diag removal) is real and present on `main`.

**But the headline is a process failure with a Critical consequence:** the patch for an **authenticated remote-code-execution bug (mathjs CVE-2026-40897, CVSS 8.8)** was written today but **never merged to `main`**, so **production is running the exploitable code right now**. Several reachable High-severity authorization/SSRF/privacy issues compound this.

### Severity distribution

| Severity | Count | Themes |
|---|---:|---|
| **Critical** | 1 | Authenticated RCE live on production (unmerged fix) |
| **High** | 9 | Self-upgrade to PRO, cross-tenant write IDOR, unauthenticated PII disclosure (×2), internal-secret leak, SSRF, cross-tenant file read, websocket authz, pending-invitee access |
| **Medium** | 13 | Score forgery, DoS/ReDoS, RC entitlement, idempotency, shared-image scope, rate-limit gaps, lock takeover, role demotion, import DoS, xlsx CVE, enumeration, 3rd-party script, ws-server debug leak, MSAL cross-wire |
| **Low** | 14 | Lockout race, fail-open limiter, quota under-count, dead committed secret, validation hardening, locale grading, link-protocol, etc. |
| **Info / verified-safe** | — | CSP posture, webhook correctness, IDOR-clean matrices, OneNote OAuth, parsers |

### Remediation priority (do these before launch, in order)

1. **Merge `security/mathjs-cve-2026-40897` into `main` and redeploy.** (NM-C1) Until then prod has an authenticated RCE.
2. **Consolidate the unmerged security branches.** Three separate `security/*` branches each hold part of the fixes; none has everything. Decide a single integration branch → `main`.
3. Fix the reachable Highs: `/sync` ownership (NM-H1), flashcard-review IDOR (NM-H2), the two unauthenticated profile leaks (NM-H3/H4), debug-endpoint secret leak (NM-H5), SSRF (NM-H6), storage prefix scoping (NM-H7), websocket join authz (NM-H8), pending-invitee gate (NM-H9).
4. Work the Medium list (score forgery, DoS caps, xlsx, the Figma script, ws-server `/debug`).

---

## 1. Deployment & branch hygiene (READ FIRST)

This is the single most important context. The security work done "today" lives on **separate, partially-overlapping, unmerged branches**, and the branch currently checked out is itself not `main`:

| Commit | What it fixes | On `main` (deployed)? | On audited branch? |
|---|---|:--:|:--:|
| `3603c03` | rate limits 50→5, HSTS, Report-Only CSP, removed `/api/diag/bypass-env` | ✅ yes | ✅ yes |
| `29100b6` | Prisma `{equals}` operator-injection hardening (defense-in-depth) | ❌ **no** | ✅ yes |
| `d44b5ea` | **mathjs RCE patch + `safe-math.ts` sandbox** | ❌ **no** | ❌ **no** |

`d44b5ea` exists only on branch `security/mathjs-cve-2026-40897`. Verified on `main`: `safe-math.ts` is absent, `quiz-grading.ts:6` imports raw `* as math from 'mathjs'`, `quiz-grading.ts:363,380` call `math.parse`/`math.evaluate` on user input, `package.json:91` pins `"mathjs": "^13.0.0"`, lockfile resolves the vulnerable **13.2.3**.

**Secondary caveat — `node_modules` ≠ lockfile.** The local `node_modules` was installed from a feature branch's lockfile (it symlinks mathjs 15.2.0), which is why a naive "is the file there?" check misleads. Several subagent observations about "installed versions" (e.g. dompurify) reflect `node_modules`, not the committed lockfile that actually deploys. **Trust the lockfile / `git show main:` for deploy-state questions.**

---

## 2. Scope & coverage

**In scope:** `apps/web/` (Next.js app) + `packages/shared/` + root tooling. **Excluded:** `apps/mobile/`, `apps/desktop/` (not built/deployed — their dependency CVEs are noted but not triaged).

**Subsystems reviewed (12):** code-execution (Piston) · billing/webhooks/entitlement · auth/session/middleware · safe-math/quiz-grading · notebook structural CRUD · study-content CRUD · groups + cowork · community/publishing/admin/moderation · uploads/import/SSRF · AI generation pipelines · cross-cutting platform + user routes · frontend XSS + `packages/shared` trust boundary.

---

## 3. Findings

Format: **ID — Title** · severity · `location` · *on main?* — description / impact / fix / confidence.

### CRITICAL

#### NM-C1 — Authenticated RCE via mathjs (CVE-2026-40897), live on production
- **Severity:** Critical · `apps/web/src/lib/quiz-grading.ts:6,363-364,380-381`, `apps/web/package.json:91`, `pnpm-lock.yaml` (mathjs 13.2.3) · **on main: YES (exploitable)**
- **Type:** RCE / dangerous eval of untrusted input via vulnerable dependency.
- **Description:** `gradeEquation` parses and evaluates a user-submitted `equation` answer string through unrestricted mathjs 13.2.3 (`math.parse(userExpression).evaluate(scope)` and `math.evaluate(userExpression)`). mathjs ≤13.x has parser escapes that reach the JS `Function` constructor. The defense-in-depth `safe-math.ts` sandbox + version bump that fixes this (`d44b5ea`) is **not merged to `main`**.
- **Attack/impact:** Any authenticated user creates a quiz with an `equation` question in their own notebook, then `POST /api/notebooks/[id]/quiz-sets/[setId]/attempts` with a malicious `expression` → arbitrary JS on the server. The server holds `SUPABASE_SERVICE_ROLE_KEY` and provider API keys in env → full data/secret compromise.
- **Fix:** Merge `security/mathjs-cve-2026-40897` into `main` and redeploy. Confirm the lockfile resolves mathjs ≥15.2.0 and `quiz-grading.ts` routes through `safeParse`/`safeEvaluate`. Then add the durable mitigations in NM-M2/M3 (pre-parse allowlist + length cap + rate limit).
- **Confidence:** High. Reachable by any authenticated user. *(Verified directly against `main`.)*

### HIGH

#### NM-H1 — `/sync` lets any user claim any Lemon Squeezy subscription → self-upgrade to PRO + subscription hijack
- **Severity:** High · `apps/web/app/api/billing/lemonsqueezy/sync/route.ts:26-33` → `apps/web/src/lib/lemonsqueezy.ts:161-170,124-144` · **on main: YES** (mitigated only by LS not yet being live)
- **Type:** Privilege escalation / IDOR (broken object ownership).
- **Description:** The route authenticates the caller, takes an arbitrary `subscriptionId` from the body, and calls `syncLemonSqueezyAfterCheckout({ userId: <caller>, subscriptionId })`. That fetches the subscription from the LS API and calls `provisionFromLemonSqueezySubscription(<caller>, sub)` — which writes `tier:'PRO'` + `lemonSqueezyCustomerId`/`lemonSqueezySubscriptionId` onto the caller **without ever checking the subscription belongs to them**.
- **Attack/impact:** A free user POSTs any valid LS `subscriptionId` (short, enumerable integers) and is provisioned PRO. Because the customer/subscription id columns are `@unique`, this also detaches the legitimate owner from their paying subscription (cross-tenant hijack). The webhook path is safe (binds via signed `custom_data.user_id`); only this user-callable fallback skips the check.
- **Fix:** Before provisioning in `/sync`, require the fetched subscription's true owner (`custom_data.user_id`, or `customer_id` matching the caller's `lemonSqueezyCustomerId`) to equal the caller; reject otherwise. Never treat a body-supplied `subscriptionId` as proof of ownership.
- **Confidence:** High. Reachable; fix before enabling Lemon Squeezy in production. *(Verified.)*

#### NM-H2 — Flashcard review IDOR: cross-tenant write to any user's card
- **Severity:** High · `apps/web/app/api/notebooks/[id]/flashcard-sets/[setId]/review/route.ts:27,37-45` · **on main: YES**
- **Type:** IDOR / broken object-level authorization (cross-tenant write).
- **Description:** The handler verifies the **notebook** is the caller's (`notebook.findFirst({ id: notebookId, userId })`), but then loads the card with `flashcard.findFirst({ where: { id: flashcardId, flashcardSetId: setId } })` — `setId` is **never** verified to belong to that notebook (every sibling route, e.g. `study-session/route.ts`, does this check). It then `flashcard.update`s SM-2 fields.
- **Attack/impact:** Attacker calls `POST /api/notebooks/{ownNotebook}/flashcard-sets/{victimSet}/review` with a victim `flashcardId` → silently corrupts another user's spaced-repetition schedule (force every card "due now", or max the interval). Reachable because middleware does not gate `/api/*` (NM-M1).
- **Fix:** Add the standard guard before the card lookup: `const set = await db.flashcardSet.findFirst({ where: { id: setId, notebookId } }); if (!set) return notFoundResponse(...)`.
- **Confidence:** High. *(Verified — clear deviation from the codebase-wide pattern.)*

#### NM-H3 — Activity-heatmap discloses any user's study pattern, even unauthenticated
- **Severity:** High · `apps/web/app/api/user/activity-heatmap/route.ts:21-43` · **on main: YES**
- **Type:** Broken access control / PII disclosure (behavioral pattern-of-life).
- **Description:** The route accepts `?userId=` and returns that user's full per-day study-minute history with **no privacy/friendship check**. The code comment claims the profile page gates `!isPrivate` — but that gate is client-side only. Worse: `getAuthUserId` may return `null`, yet `userId = targetUserId && targetUserId !== authUserId ? targetUserId : authUserId` resolves to the target, and the `if (!userId)` guard passes → **works with no session at all**.
- **Attack/impact:** Anyone (no login) calls `GET /api/user/activity-heatmap?userId=<victim>&days=365` and gets a complete daily activity calendar for any user, including `profilePrivate` users. (The `$queryRaw` is correctly parameterized via `Prisma.sql` — no SQLi; the defect is pure authz.)
- **Fix:** Require a session; when `targetUserId !== authUserId`, load the target's `profilePrivate` and require non-private **or** an accepted friendship (mirror `schools/peers`).
- **Confidence:** High. *(Verified.)*

#### NM-H4 — Achievements endpoint ignores `hideAchievements` / `profilePrivate`, even unauthenticated
- **Severity:** High · `apps/web/app/api/user/achievements/route.ts:10-56` · **on main: YES**
- **Type:** Broken access control / privacy-setting bypass.
- **Description:** `GET /api/user/achievements?userId=<target>` returns the target's unlocked achievements + timestamps with **no** check of `profilePrivate` or `hideAchievements` (both exist in schema and are honored by the profile route). Same unauthenticated-reachable pattern as NM-H3 (enters the `targetUserId && targetUserId !== authUserId` branch when `authUserId` is null).
- **Attack/impact:** Enumerate any user's achievements + precise unlock timestamps (an activity-timing signal) regardless of their explicit privacy toggles.
- **Fix:** In the cross-user branch, require auth and fetch target `profilePrivate`/`hideAchievements`; return empty/403 when private-and-not-friend or hidden.
- **Confidence:** High. *(Verified.)*

#### NM-H5 — Debug endpoint leaks `WS_INTERNAL_SECRET` prefix + length + internal URL to any authenticated user
- **Severity:** High · `apps/web/app/api/debug/cowork-emit-test/route.ts:36-46,101-130` · **on main: YES**
- **Type:** Information disclosure (secret material + internal topology) + unrestricted WS emit.
- **Description:** Gated only by `getAuthUserId` (any user), with **no** `NODE_ENV`/admin check (and middleware doesn't gate `/api/*`). The JSON response returns `WS_INTERNAL_SECRET_first4`, `WS_INTERNAL_SECRET_length`, `WS_INTERNAL_URL_value`, and `NEXT_PUBLIC_WS_URL`. It also accepts an attacker-controlled `?room=` and emits into any room, with the response's `listeners` count acting as a "is session X live" oracle.
- **Attack/impact:** Any logged-in user learns the first 4 chars + exact length of the internal HMAC secret (materially weakens brute-forcing it) and the internal ws-server hostname. **This is the same class of leak that `3603c03` removed from `/api/diag/bypass-env` — this sibling debug route was missed.**
- **Fix:** Early-return 404 when `NODE_ENV === 'production'` and/or require `getAdminUserId`; strip secret-derived fields and the internal URL from the response; reject attacker-controlled `room`.
- **Confidence:** High. *(Verified.)*

#### NM-H6 — SSRF in URL import: DNS-rebind (TOCTOU) + unvalidated redirect-follow
- **Severity:** High · `apps/web/src/lib/url-import.ts:104-116,121-136`; route `apps/web/app/api/notebooks/[id]/sections/[sectionId]/import-url/route.ts` · **on main: YES**
- **Type:** SSRF (read).
- **Description:** `validateUrl` resolves the hostname once via `dns.lookup` and checks `isPrivateIp` (the block-list itself is thorough). But `importFromUrl` then does `fetch(validatedUrl, { redirect: 'follow' })` — (1) `fetch` re-resolves DNS independently, so a low-TTL attacker domain can answer "public" at validation and `169.254.169.254`/`127.0.0.1` at fetch (rebind); (2) redirects are followed with **no per-hop re-validation**, so a public URL can 302 → internal. The extracted page text is returned to the attacker → exfiltration channel.
- **Attack/impact:** Read cloud-metadata (IAM creds on the host), reach internal services, port-scan the VPC. Contrast `import/onenote/import/route.ts` which correctly uses `redirect: 'manual'`.
- **Fix:** Resolve once, validate **every** resolved A/AAAA record, then connect to the validated IP (pin via custom `lookup`/agent). Set `redirect: 'manual'` and re-validate each `Location` hop; cap hops.
- **Confidence:** High. *(Verified.)*

#### NM-H7 — Cross-tenant file read via unscoped storage-path validation + service-role client
- **Severity:** High · `apps/web/src/lib/storage.ts:127-130` + consumers (`sections/[sectionId]/import`, `pages/[pageId]/append-pdf`, `documents`, `learn/uploads`, `import/commit`) · **on main: YES**
- **Type:** IDOR / broken access control (RLS-bypassing).
- **Description:** `validateStoragePath(path, prefix)` only checks `!includes('..') && !includes('//') && startsWith(prefix)` where `prefix` is a **static** top-level string (`'temp-imports/'`, `'documents/'`) — not the caller's own `temp-imports/<userId>/` or `documents/<notebookId>/`. The Supabase client uses `SUPABASE_SERVICE_ROLE_KEY` (bypasses RLS), so the app-layer prefix check is the *only* cross-tenant barrier, and downloads/reads happen by raw path string.
- **Attack/impact:** An authenticated user submits `storagePath: "documents/<victimNotebookId>/<file>"` to an import/append route they own; the service-role client downloads the victim's file and writes the extracted text into the attacker's page. `documents/<notebookId>/...` needs only a (cuid) notebookId (leaks via shares/community/comments) + filename. `temp-imports/<userId>/<ts>-<rand>` is harder to guess.
- **Fix:** Scope the prefix to the caller at each call site: `validateStoragePath(path, \`documents/${notebookId}/\`)` etc. (issuance already encodes the owner). Combine with NM-L11 hardening.
- **Confidence:** High. *(Verified `validateStoragePath`; consumers per subagent.)*

#### NM-H8 — Websocket `cowork:join` (and `edit_mode`/cursor relays) perform no participant authorization
- **Severity:** High · `apps/web/ws-server.ts:347-382,419-427`; enabled by universally-mintable `apps/web/app/api/auth/presence-token/route.ts` · **on main: YES (ws-server deployed separately)**
- **Type:** Broken access control on the real-time channel (IDOR).
- **Description:** `cowork:join` joins the socket to `session:<sessionId>` from a **client-supplied** `sessionId` with zero DB check; the code comment defers authz to "the REST join route" — but the socket emit is an independent channel. A presence token is granted to **every** authenticated user (encodes only `userId`). `cowork:edit_mode` likewise relays to the room with no check that the socket is a participant.
- **Attack/impact:** Any authed user who learns a `sessionId` (it appears in the cowork URL `?cowork=` and chat invite payloads) joins the room and receives all broadcasts (chat text, cursors, page-edit notifications) and can flip the host's "allow edit" flag and inject cursor/page-update events for everyone. Confidentiality + integrity break on live cowork sessions.
- **Fix:** In `cowork:join`, query an active `CoWorkParticipant {sessionId, userId, isActive}` before `socket.join`; gate `edit_mode`/`cursor`/`doc_notify` relays on verified membership (or on `socketCoworkSessions.get(socket.id)?.has(sessionId)`).
- **Confidence:** High. *(Verified the handler + comment.)*

#### NM-H9 — Pending (un-accepted) group invitees are treated as full members
- **Severity:** High · `apps/web/app/api/groups/[id]/route.ts:24-30`; also `groups/[id]/notebooks/route.ts` (share/unshare) · **on main: YES**
- **Type:** Broken access control (membership check omits `status`).
- **Description:** These handlers check only `if (!membership)` and never `membership.status !== 'accepted'`. The invite flow creates a `StudyGroupMember` row with `status:'pending'`, so a user who merely *received* an invite passes the gate. Sibling routes (`messages`, `shared`) correctly require `status === 'accepted'`.
- **Attack/impact:** A pending invitee (who may never accept) can read full group detail (member roster, shared-notebook list, other pending invitees) and share/unshare notebooks into a group they haven't joined. The `groupId` is available from `/api/groups/invitations`.
- **Fix:** Add `|| membership.status !== 'accepted'` to the guard in all three handlers (mirror `messages/route.ts`).
- **Confidence:** High. *(Verified `groups/[id]/route.ts`; siblings per subagent.)*

### MEDIUM

#### NM-M1 — No middleware auth layer for `/api/*` (systemic; root cause of several Highs)
- **Severity:** Medium (architectural/defense-in-depth) · `apps/web/src/middleware.ts:94-103,147-149` · **on main: YES**
- The middleware matcher is broad, but it early-returns header-only for any path not in `AUTH_LOGIC_PATTERNS` — which lists **only page prefixes**, never `/api`. So every API route's auth rests solely on its own handler. This is why NM-H2/H3/H4 are directly reachable. **Fix:** add an `/api` branch that 401s unauthenticated requests except an explicit public allowlist (`/api/auth/*`, webhooks, health), and/or a CI test asserting every `app/api/**/route.ts` calls an auth helper. *(Confirmed by 3 independent reads.)*

#### NM-M2 — `code_write` questions graded on a client-supplied `passed` boolean → score forgery
- **Severity:** Medium · `apps/web/src/lib/quiz-grading.ts:174-183` · **on main: YES** — Grading trusts `userAnswer.passed === true` without re-verifying any code execution. A user POSTs `{ kind:'code_write', passed:true }` to inflate scores/achievements. **Fix:** re-execute server-side during submission, or verify a signed verdict token minted by `/api/quiz/code-execute`. *(Per subagent; quote confirmed.)*

#### NM-M3 — Quiz-attempts endpoint: no rate limit + unbounded equation expression → CPU/ReDoS DoS
- **Severity:** Medium · `apps/web/app/api/notebooks/[id]/quiz-sets/[setId]/attempts/route.ts`, `quiz-grading.ts:356-389` · **on main: YES** — No `rateLimit`, no length cap on `expression`, answers array unbounded, and the variables branch evaluates each expression 4×. Expensive expressions (huge factorials/exponents, deep nesting) pin CPU; also amplifies NM-C1. **Fix:** cap `expression.length` (≤256) and answers count, add `rateLimit`, evaluate with a timeout.

#### NM-M4 — Code-execution rate limit is per-request not per-execution (8× in grade mode) + fail-open + no tier quota
- **Severity:** Medium · `apps/web/app/api/quiz/code-execute/route.ts:86-96,148-173`; `rate-limit.ts:43-48` · **on main: YES** — One limiter token per request, but grade mode runs up to `MAX_TESTS=8` Piston executions/request → ~240 sandbox runs/min/user; the limiter fails open if Redis is down; no per-tier/daily quota on a paid self-hosted backend. **Fix:** charge the limiter per planned execution, fail-closed (or local fallback) on this high-cost route, add a coarse daily quota. *(Piston host is server-env only — no SSRF; whitelist + caps otherwise correct.)*

#### NM-M5 — RevenueCat: PRO granted on `entitlement_ids` membership without checking it's currently active
- **Severity:** Medium · `apps/web/app/api/billing/revenuecat/webhook/route.ts:91,101-114` · **on main: YES** — Gates only on `entitlement_ids.includes('pro')` and grants for any active-ish event without verifying `expiration_at_ms` is in the future; can re-grant/extend PRO from stale events (a null/elapsed expiry sets unbounded PRO). Not attacker-triggerable without the RC secret, but a fail-open. **Fix:** require future `expiration_at_ms` for active grants; reconcile against the RC subscriber API.

#### NM-M6 — Lemon Squeezy idempotency key can suppress a real downgrade
- **Severity:** Medium · `apps/web/app/api/billing/lemonsqueezy/webhook/route.ts:83` · **on main: YES** — Derived id `eventName:subId:updated_at`; two state transitions sharing an `updated_at` second collide and the second is dropped, so a same-second `cancelled`/`expired` after an `updated` can be swallowed → user keeps PRO. **Fix:** include `status` in the key, or upsert latest state by `subId` (last-writer-wins) instead of insert-or-drop. *(Signature verification itself is correct; outside attacker can't forge.)*

#### NM-M7 — Shared-image serving ignores `SharedNotebook` visibility / recipient scoping
- **Severity:** Medium · `apps/web/app/api/uploads/shared-images/[imageId]/route.ts:16-27` · **on main: YES** — Returns any `SharedNotebookImage` to any authed user purely by id, ignoring `visibility` (`public`/`friends`/`specific`) and `sharedWithId`; also sets `Cache-Control: public`. ids are cuids (not enumerable) → Medium. **Fix:** resolve through the parent share and enforce visibility/recipient; `Cache-Control: private` for non-public.

#### NM-M8 — Native Apple sign-in: 50/15-min rate limit (vs 5) on a shared `login:` key
- **Severity:** Medium · `apps/web/app/api/auth/native/apple/route.ts:42` · **on main: YES** — 10× looser than web login and shares the `login:${ip}` namespace. Not a password oracle (requires an Apple-JWKS-signed token), but allows 50/15-min of account-creation/JWKS pressure per IP. **Fix:** own key `native-apple:${ip}`, lower to ~10.

#### NM-M9 — Cowork page-lock take-over on expiry emits no lock-change event
- **Severity:** Medium · `apps/web/app/api/notebooks/[id]/cowork/[sessionId]/lock/[pageId]/route.ts:102-118` · **on main: YES** — The expiry take-over branch doesn't `wsEmit('page_locked')` (the create branch does), so the previous holder keeps editing a page another participant now holds → clobbered edits. **Fix:** emit on take-over; optionally skip take-over while the original holder is still an active participant.

#### NM-M10 — Group `role` route lets a teacher demote the owner → owner locked out of group settings
- **Severity:** Medium · `apps/web/app/api/groups/[id]/role/route.ts:33-58` · **on main: YES** — Caller must be owner/teacher and can't change their own role, but there's no guard that the *target* isn't the `ownerId`. A teacher can set the owner's membership role to `member`; group-setting routes that check `membership.role` then lock the owner out. **Fix:** reject `targetUserId === group.ownerId` (or target role `owner`).

#### NM-M11 — Unbounded import (PDF pages / DOCX-XLSX decompression / no upload size cap) → DoS
- **Severity:** Medium · `apps/web/src/lib/pdfjs-node.ts:230,257`, `signed-url/route.ts:277`, DOCX via `mammoth`, XLSX via `XLSX.read` · **on main: YES** — The structured `pdf-import` pipeline is capped (`MAX_PAGE_IMAGES=1000`), but the legacy direct-import routes and the signed-upload URL enforce no page-count / decompressed-size / upload-size limit (PPTX & Anki *do* cap). 20k-page PDFs or zip-bomb DOCX/XLSX pin CPU/memory. **Fix:** size limit on `createSignedUploadUrl`, cap `doc.numPages`, decompressed-size guards around `mammoth`/`XLSX.read`.

#### NM-M12 — `xlsx` (SheetJS) parses untrusted uploads — known unpatched prototype-pollution + ReDoS
- **Severity:** Medium · `apps/web/src/lib/fileProcessing.ts:46-53`, `sections/[sectionId]/import-xlsx/route.ts` · **on main: YES** — `XLSX.read(buffer)` on untrusted uploads; the npm `xlsx` carries GHSA-4r6h-8v6p-xvw6 (proto-pollution) + GHSA-5pgg-2g8v-p4x9 (ReDoS) with **no fix on npm** (also flagged by `pnpm audit`). **Fix:** move to the patched SheetJS CDN build or `exceljs`; parse in a worker with a CPU timeout + `Object.freeze(Object.prototype)`.

#### NM-M13 — `check-username` is unauthenticated and unthrottled (enumeration oracle)
- **Severity:** Medium · `apps/web/app/api/user/check-username/route.ts:7-25` · **on main: YES** — No auth, no rate limit; a definitive "handle exists" oracle at unlimited rate. Usernames are public, so it's enumeration not credential leakage. **Fix:** IP-keyed `rateLimit`; consider requiring auth.

#### NM-M14 — Third-party Figma capture script loaded in the production root layout
- **Severity:** Medium · `apps/web/app/layout.tsx:185` · **on main: present** — `<script src="https://mcp.figma.com/mcp/html-to-design/capture.js" async>` (comment: "temporary for design export") executes first-party JS on **every** page, with full DOM/`localStorage`/same-origin-fetch access. A compromise/MITM of that endpoint is a standing XSS primitive, and it would force widening any future CSP. **Fix:** remove from the committed layout; load only behind a dev-only check.

#### NM-M15 — ws-server `/debug`, `/online`, `/health` are unauthenticated
- **Severity:** Medium · `apps/web/ws-server.ts:177-185` (+ siblings) · **on main: YES (separate service)** — If the ws-server URL is internet-reachable (it must be for browser sockets), `GET /debug` leaks live `sessionId`s + socket counts + `WS_INTERNAL_SECRET` first4/length with no credentials (corroborates NM-H5/H8). **Fix:** require the internal secret on `/debug`; drop secret-derived fields; consider auth on `/online`.

#### NM-M16 — MSAL singleton may cross-wire OneNote refresh tokens between users
- **Severity:** Medium · `apps/web/src/lib/microsoftAuth.ts:116-120,165-169` · **on main: YES** — `getValidAccessToken` pulls `Object.values(cacheData.RefreshToken)[0]` from a module-level singleton MSAL client whose cache can hold multiple users' tokens in a warm instance → `[0]` may select the wrong user's token under concurrency. **Fix:** per-request client or explicit account filtering by the bound `userId`.

### LOW

- **NM-L1 — Failed-login lockout race** · `auth/config.ts:176-192` · increment-then-reread is non-atomic; parallel wrong-password requests can exceed `MAX_FAILED_ATTEMPTS`. Fix: single `UPDATE ... RETURNING` + set `lockedAt` in one tx. (IP limiter is the primary brute-force gate.)
- **NM-L2 — Rate-limit / IP-cap fail OPEN** · `rate-limit.ts:43-48`, `registration.ts:30-32`, `auth/config.ts:275-283` · Redis error or `ip='unknown'` → control silently disabled (login, register, resend, IP account-cap). Fix: fail-closed (or local fallback) on the security-critical limiters; treat `ip='unknown'` as a block for `enforceIpCap`.
- **NM-L3 — AI quota under-count** · `chat-stream.ts:363-365,982-994`; `chat-title.ts:32-37`; `documents/[docId]/summarize` `?regenerate=true` · meter increment skipped on stream abort; title-gen tokens untracked; forced regenerate burns tokens uncounted. Fairness/COGS, bounded by the monthly token budget. Fix: increment on commit/abort; record title tokens; soft-cap regenerate.
- **NM-L4 — Unbounded path-translation input** · `path-translator.ts:152-178,437-491` · no per-batch size cap (unlike every other AI route). Fix: chunk/refuse oversized activities.
- **NM-L5 — Missing rate limits** · `waitlist/route.ts` (unauth, sends email/row per call — amplification), `search/route.ts` (heaviest read: multi-table `contains` scans), `telemetry/route.ts`. Fix: IP-keyed for waitlist, user-keyed for search/telemetry.
- **NM-L6 — `presence-token` unscoped** · `auth/presence-token/route.ts:19-26` · no audience/nonce, shares `NEXTAUTH_SECRET`; consumer (ws-server) validation is out-of-repo — confirm it checks expiry + uses constant-time compare. Fix: add `aud:'presence'`, dedicated secret.
- **NM-L7 — Committed `FALLBACK_BYPASS_TOKEN`** · `signup-bypass.ts:27-28` · a real 64-hex token baked in source; currently dead code (no importer) but a live credential in git history with misleading docs claiming it's wired in. Fix: delete the module/token; treat as compromised.
- **NM-L8 — Page-image POST trusts client `storagePath`** · `pages/[pageId]/images/route.ts:49-71` · only prefix-validated (`images/`), not bound to `images/{pageId}/`. Low (used for a file-size read on the caller's own page). Fix: tighten prefix to the page.
- **NM-L9 — `gradeEquation` locale/tolerance correctness** · `quiz-grading.ts:356-389` · comma-decimal answers (German UI) mis-parse → marked wrong; tolerance comparison inconsistent between branches (`<` vs `>`); parse errors silently scored 0. Fix: normalize decimals, unify tolerance.
- **NM-L10 — `import-url` rate-limited by spoofable IP only** · `sections/[sectionId]/import-url/route.ts:24-25` · uses raw `url-import:${ip}` not the user-bound `rateLimitKey`; rotating `X-Forwarded-For` resets the limit, easing SSRF probing (NM-H6). Fix: `rateLimitKey('url-import', request, userId)`.
- **NM-L11 — `validateStoragePath` traversal hardening** · `storage.ts:127-130` · misses `%2e%2e`, leading `/`, backslashes, null bytes. Low (Supabase treats keys literally) but it's the boundary for NM-H7. Fix: decode/normalize, reject control chars + absolute/`..` segments.
- **NM-L12 — Import converters store `href` without protocol allowlist** · `contentConverter.ts:637-642`, `onenoteConverter.ts:299-304` · DOCX/OneNote `javascript:` hrefs persisted (mitigated at render by TipTap v3's link allowlist). Fix: validate scheme at import.
- **NM-L13 — `marked` → `innerHTML` on detached node (self-XSS only)** · `PageEditor.tsx:756`, `markdown-to-html.ts` · unsanitized `marked` output on a never-attached div consumed by ProseMirror; non-exploitable today but fragile. Fix: run through `isomorphic-dompurify` (already installed) or parse directly to ProseMirror nodes.
- **NM-L14 — Prisma `{equals}` hardening (`29100b6`) not on `main`** · defense-in-depth gap on production; per the commit's analysis no exploitable operator-injection exists, so Low. Fix: merge with the rest.

---

## 4. Reconciliation with the 2026-05-31 hardening

**Confirmed present on `main` (do not re-flag):** login/register rate limits = 5, HSTS, Report-Only CSP, and `/api/diag/bypass-env` removed (all via `3603c03`).

**Written today but NOT on `main` (the gap):**
- mathjs RCE patch + `safe-math.ts` (`d44b5ea`) → **NM-C1** (production exploitable).
- Prisma `{equals}` wrapping (`29100b6`) → **NM-L14** (non-exploitable, still merge).

**Known-outstanding, confirmed:**
- **CSP is `Content-Security-Policy-Report-Only` with `script-src 'self' 'unsafe-inline'`** → provides **zero** XSS protection today. Flip to enforce + migrate to per-request nonces after verifying zero violations. (Also blocked by NM-M14's remote script.)
- **No password-reset flow** exists (only learn-path progress reset) — confirm intentional before launch.
- Provider-side: deactivate stale live Stripe/EmailJS keys, rotate any secret exposed via NM-H5/M15.

---

## 5. Appendix

### 5a. Dependency advisories (`pnpm audit`, workspace lockfile)
Production-relevant (`apps/web`), upgrade/replace:
- **`xlsx` (SheetJS)** — proto-pollution + ReDoS, **no npm fix** → NM-M12 (replace).
- **`next`** — many advisories; upgrade to the latest patch of the pinned major.
- **`marked`** — ReDoS; upgrade.
- **`dompurify`** (via `isomorphic-dompurify`, and transitively via excalidraw→mermaid) — `pnpm audit` recommends update to ≥3.4.7. *Note the `node_modules`-vs-lockfile discrepancy (see §1): verify the resolved version in the lockfile and upgrade accordingly.*
- **`engine.io` / `ws`** (socket.io / cowork) — upgrade.
- **`postcss`**, **`@anthropic-ai/sdk`** — review/upgrade.
- **`mathjs`** — flagged; resolved by the NM-C1 merge (→15.2.0).

Out of scope (not deployed): `electron`, `@xmldom/xmldom`, `tar`, `ip-address`, `brace-expansion`, `@tootallnate/once`, `tmp` (all `apps/desktop`/`apps/mobile`).

> Baseline tests: the plan called for running `safe-math.test.ts` + `quiz-grading.test.ts`, but those files exist only on the unmerged `security/mathjs-cve-2026-40897` branch (16 passing tests per the commit). Run them as a merge gate, not against `main`.

### 5b. Verified-safe / strong controls (checked, no action)
- **Notebook structural CRUD** — IDOR-clean across all handlers (auth + `userId` scope + nested-id verification); full ✓ matrix produced.
- **Study-content CRUD** — clean except NM-H2; `sourcePathId: null` filtering correct on notebook-scoped lists; exports gated; attempts ownership correct.
- **Admin / community / moderation** — all 12 admin route files enforce `getAdminUserId`; public reads gate on `moderationStatus==='approved'`; moderation L2/L3 fail-closed; clone/report/translate authz + budgets correct; publish blocks visibility pre-approval.
- **Auth** — role/tier/onboarding read fresh from DB (no JWT self-elevation); bcrypt placeholder defeats user-enumeration/timing; email-verification enforced server-side; OAuth account-linking safe; native-Apple JWT verified against Apple JWKS with issuer/audience; session cookies `httpOnly`+`secure`+`sameSite:lax`.
- **Webhooks** — LS HMAC over raw body + `timingSafeEqual` + secret-required (fail-closed); RC auth header constant-time; `WebhookEvent` `@@id([provider,eventId])` dedup.
- **AI pipelines** — every paid LLM route gates on `checkTokenBudget`/quota before calling; provider keys server-only; Gemini JSON normalized + Zod-validated before persist; imported corpus delimited; prompt-injection blast radius limited to self-owned generated content.
- **OneNote OAuth** — HMAC-signed state + timestamp, `redirect:'manual'`, SSRF-safe image fetch (scheme/host allowlist, size/timeout caps), `postMessage` to `window.location.origin`.
- **PPTX / Anki parsers** — zip-traversal rejection, decompressed-size + row caps, magic-byte checks, readonly sqlite, temp cleanup.
- **Frontend XSS** — primary render path is `react-markdown` with no `rehype-raw` (raw HTML escaped); both `dangerouslySetInnerHTML` sinks fed escaped lowlight output; native bridge does not trust spoofable `postMessage`; `target=_blank` carry `rel=noopener`. (`mermaid` not actually installed; verify the deployed dompurify version per §5a.)

### 5c. Subsystem coverage matrix
All 12 subsystems in §2 were reviewed; Critical/High findings were re-verified by direct code reading (NM-C1 against `main`; NM-H1/H2/H3/H4/H5/H6/H7/H8/H9 against the working tree, which is identical to `main` for those files modulo the two unmerged security commits). Medium/Low findings carry the reviewing pass's confidence; none alters the deploy-state conclusions in §1.
