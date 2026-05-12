# Personal Duolingo Rework — Manual Test Plan

Living checklist for the rework defined in [personal-duolingo-rework.md](personal-duolingo-rework.md). Run the relevant section before merging each phase; run the **End-to-end smoke** at the close of Phase 7.

## How to use

- Tests are grouped by phase. As each phase ships, its `[NEW]` items become `[REGRESS]` for subsequent phases — flip the tag when you re-run.
- A failure on any line blocks merge until either fixed or explicitly accepted with a follow-up issue.
- Run the **Setup** block once per testing session.

### Tag legend

- `[REGRESS]` — runs on already-shipped surfaces; must still pass after every later phase.
- `[NEW]` — new acceptance check introduced by this phase.
- `[WEB]` — desktop Chrome / Safari at ≥1280px.
- `[MOBILE-WEB]` — Chrome DevTools device toolbar at 390×844 (iPhone 14).
- `[iOS]` — actual iOS WebView shell build, not DevTools emulation.
- `[DB]` — direct DB inspection via Prisma Studio or `psql`.
- `[LOGS]` — server stdout in `pnpm dev:web` terminal or Coolify container logs.
- `[E2E]` — end-to-end smoke; runs only after Phase 7 lands.

---

## Setup (run once per session)

- [ ] `pnpm -r typecheck` clean from repo root
- [ ] `pnpm dev:web` running on `localhost:3000`
- [ ] Test account signed in with: ≥2 notebooks, ≥1 with an existing study plan, ≥1 pre-rework quiz attempt (for regression)
- [ ] iOS shell build available for `[iOS]` lines
- [ ] Browser tested in **both** `data-theme="light"` and `data-theme="dark"` — verify no light text on light surfaces (per the light-mode-no-light-text rule)
- [ ] DevTools Network tab open for backend-shape checks
- [ ] DevTools Console open — no uncaught errors should appear during any test below

---

## Phase 0 — XP/Level removal (status: DONE)

- [ ] `[REGRESS]` `[WEB]` Profile page renders without "Level X" or XP bar
- [ ] `[REGRESS]` `[WEB]` Sidebar profile chip shows no level number
- [ ] `[REGRESS]` `[DB]` `\d users` in psql: no `xp` or `level` columns
- [ ] `[REGRESS]` `apps/web/scripts/backfill-cosmetics-from-levels.ts` does not exist on disk
- [ ] `[REGRESS]` `[WEB]` Cosmetic catalog UI shows no "Level X required" badges

---

## Phase 1 — Question Engine v2 (status: DONE, MC only)

- [ ] `[REGRESS]` `[WEB]` Open a pre-rework quiz attempt → renders as 4-option MC unchanged
- [ ] `[REGRESS]` `[WEB]` Submit answers on a pre-rework quiz → final score matches the previously recorded result
- [ ] `[NEW]` `[WEB]` Click "Generate quiz" CTA in a notebook → loading completes without error
- [ ] `[NEW]` `[WEB]` Network: backend response for new quiz shows `kind: 'mc'` on every question
- [ ] `[NEW]` `[WEB]` Each question renders via `MCRenderer` (4 radio options + submit)
- [ ] `[NEW]` `[WEB]` Submit a wrong answer → response is `{ isCorrect: false, feedback: <string> }`
- [ ] `[NEW]` `[WEB]` Submit a correct answer → response is `{ isCorrect: true, feedback: <string> }`
- [ ] `[NEW]` `[DB]` `SELECT id, "userAnswer" FROM quiz_answers ORDER BY id DESC LIMIT 5;` → `userAnswer` JSONB populated with the submitted payload (not null)
- [ ] `[NEW]` `[WEB]` Unknown-kind fallback — `[DB]` set one question to a kind not yet registered (e.g. `UPDATE quiz_questions SET kind='match_pairs' WHERE id='<id>';`) → reload quiz → graceful "Question type not supported" UI, no crash, no console errors

---

## Phase 2A — Fill-blank / Translation / Word-bank / Match-pairs (status: NOT BUILT)

Run this whole block for **each** of the four types. Generate a quiz with that kind by triggering the QUIZ_TOOL_V2 prompt or by seeding via `[DB]` insert.

### Per-renderer baseline (all four types)

- [ ] `[NEW]` `[WEB]` Renders at 1440px without overlap or overflow
- [ ] `[NEW]` `[MOBILE-WEB]` Renders at 390px without horizontal scroll
- [ ] `[NEW]` `[WEB]` Correct answer accepted → green feedback + `isCorrect: true`
- [ ] `[NEW]` `[WEB]` Wrong answer rejected → red feedback + `isCorrect: false`
- [ ] `[NEW]` `[WEB]` Submit blocked when input is empty / required slots unfilled
- [ ] `[NEW]` `[iOS]` Touch-only usability — completes the question without a physical keyboard or mouse where possible

### Fill-blank specifics

- [ ] `[NEW]` `[WEB]` `caseSensitive: false` payload — "Paris" and "paris" both accepted
- [ ] `[NEW]` `[WEB]` `caseSensitive: true` payload — "paris" rejected when answer is "Paris"
- [ ] `[NEW]` `[WEB]` Single-typo within 0.85 Levenshtein ratio accepted (e.g. "Pariis" → "Paris")
- [ ] `[NEW]` `[WEB]` Heavy typo below 0.85 ratio rejected (e.g. "Parsi" → "Paris" depending on threshold; tune copy if borderline)

### Translation specifics

- [ ] `[NEW]` `[WEB]` Language-tag chip displays `targetLanguage` above the input
- [ ] `[NEW]` `[WEB]` Accent tolerance at 0.75 threshold — "el libro rojo" and "el libro rójo" both accepted
- [ ] `[NEW]` `[WEB]` Wrong word rejected — "la libro rojo" fails

### Word-bank specifics

- [ ] `[NEW]` `[WEB]` Drag a token from bank into slot → token leaves bank, fills slot
- [ ] `[NEW]` `[WEB]` Drag placed token back to bank → slot empties, token returns
- [ ] `[NEW]` `[MOBILE-WEB]` Tap token → tap slot to place; tap placed token → returns to bank
- [ ] `[NEW]` `[WEB]` Submit disabled until every slot filled
- [ ] `[NEW]` `[WEB]` All slots correct → green; one wrong → red feedback on the wrong slot only
- [ ] `[NEW]` `[iOS]` Drag-drop and tap-to-place both work in WebView (no mouse-only assumption)

### Match-pairs specifics

- [ ] `[NEW]` `[WEB]` Click left item then right item → connection line drawn (SVG layer)
- [ ] `[NEW]` `[WEB]` Re-click a left item already connected → clears that connection
- [ ] `[NEW]` `[WEB]` All pairs correct → all lines highlight green
- [ ] `[NEW]` `[WEB]` Any pair wrong → that line shows red on submit
- [ ] `[NEW]` `[WEB]` SVG line animations only touch `transform` / `opacity` (DevTools → inspect → check computed transition props)

### AI generation smoke (all four)

- [ ] `[NEW]` `[WEB]` Trigger generation 3× on a notebook → at least one question of each of the four kinds appears across the runs (regen until covered)

---

## Phase 2B — Sentence-reorder / Equation (status: NOT BUILT)

### Sentence-reorder

- [ ] `[NEW]` `[WEB]` Tokens display in shuffled order on load
- [ ] `[NEW]` `[WEB]` Reorder via drag — token order updates visually
- [ ] `[NEW]` `[MOBILE-WEB]` Reorder via tap-and-promote (tap = move to end, or whatever the pattern lands on)
- [ ] `[NEW]` `[WEB]` Submit correct order → pass
- [ ] `[NEW]` `[WEB]` Submit wrong order → fail with feedback

### Equation entry

- [ ] `[NEW]` `[WEB]` Expected `2x+3`, type `2x + 3` → pass (whitespace tolerant)
- [ ] `[NEW]` `[WEB]` Type `3 + 2x` → pass (algebraic equivalence)
- [ ] `[NEW]` `[WEB]` Type `2x+4` → fail
- [ ] `[NEW]` `[WEB]` Numeric tolerance honored — expected `3.14`, type `3.14159` with `tolerance: 0.01` → pass
- [ ] `[NEW]` `[WEB]` Malformed input ("2x++3") → rejected with parse-error feedback, not a crash

---

## Phase 3 — Mascot reaction engine (logic only) (status: NOT BUILT)

- [ ] `[NEW]` `[WEB]` DevTools console: `import('/src/lib/quiz-reactions.ts').then(m => console.log(m.computeReaction({ correctStreak: 3, wrongStreak: 0 })))` → returns `{ pose: 'bow' | 'wink', oneShot: 'cheer-small', message: 'Three!' | <variant>, intensity: <low|mid|high> }`
- [ ] `[NEW]` `[WEB]` `correctStreak: 5` → `oneShot: 'cheer-big'`, intensity bumps
- [ ] `[NEW]` `[WEB]` `correctStreak: 7` → biggest tier; message variant from "Unstoppable!" / equivalent bank
- [ ] `[NEW]` `[WEB]` `wrongStreak: 2` → `pose: 'thinking'`, no oneShot, comfort message
- [ ] `[NEW]` `[WEB]` `wrongStreak: 3` → `pose: 'sad'`, `oneShot: 'comfort'`, "Want a hint?" copy
- [ ] `[NEW]` `[WEB]` Below thresholds (e.g. streak 1 or 2 correct) → returns `null`
- [ ] `[NEW]` `[WEB]` Setting `quizReactions: 'off'` → `computeReaction` returns `null` regardless of streak
- [ ] `[NEW]` `[WEB]` Setting `quizReactions: 'minimal'` → only fires at 5+, perfect, checkpoint (3-streak skipped)
- [ ] `[NEW]` `[WEB]` Setting `quizReactions: 'all'` → all tiers fire
- [ ] `[NEW]` `[WEB]` `prefers-reduced-motion: reduce` (OS toggle) → reaction returned but `oneShot` is `null` (or pose-only static render)
- [ ] `[NEW]` `[WEB]` Audio toggle off (default) → reaction returned without `audio` field, or audio field present but layer mutes it
- [ ] `[NEW]` `[WEB]` Audio toggle on → reaction returns `audio: 'streak-soft' | 'streak-mid' | ...`

---

## Phase 4 — Wire reactions into quiz player (status: NOT BUILT)

- [ ] `[NEW]` `[WEB]` Get 3 correct in a row → corner-peek mascot appears ~1s, fades; copy from streak-small bank
- [ ] `[NEW]` `[WEB]` Get 5 correct in a row → bigger reaction + `sparkle` oneShot
- [ ] `[NEW]` `[WEB]` Get 7+ correct in a row → biggest tier reaction + double sparkle
- [ ] `[NEW]` `[WEB]` Get 2 wrong in a row → thinking pose + "Take your time." copy
- [ ] `[NEW]` `[WEB]` Get 3+ wrong in a row → sad pose + comfort copy + **the question's `hint` field auto-reveals** below the prompt
- [ ] `[NEW]` `[WEB]` Finish quiz at 100% (≥5 questions) → full-overlay celebration + confetti + `celebrate` oneShot
- [ ] `[NEW]` `[WEB]` Reactions don't block input — during fade, click "Next" → advances without delay
- [ ] `[NEW]` `[WEB]` Streak resets correctly — answer right, right, wrong, right → reaction for the wrong-streak (1) is null, then small streak starts over
- [ ] `[REGRESS]` `[WEB]` Existing MC-only quiz (Phase 1 surface) now also fires reactions on the right triggers
- [ ] `[NEW]` `[iOS]` Reactions render correctly inside WebView; full-overlay celebration doesn't break scroll/back-button

---

## Phase 5 — Learn path (gating + checkpoints) (status: NOT BUILT)

### Schema / data

- [ ] `[NEW]` `[DB]` New `StudyPhase.gateStrategy` column exists, default `'open'`
- [ ] `[NEW]` `[DB]` `StudyMaterial.prerequisiteMaterialIds` column exists (Postgres text array)
- [ ] `[NEW]` `[DB]` `checkpoint_attempts` table exists with `(id, phaseId, userId, score, percentage, passed, attemptedAt)`
- [ ] `[REGRESS]` `[DB]` Pre-Phase-5 study plans have `gateStrategy='open'` (no breaking change)

### Path UI

- [ ] `[NEW]` `[WEB]` Navigate to `/learn` → returns 200, renders without error
- [ ] `[NEW]` `[WEB]` Renders one path per notebook with a study plan
- [ ] `[NEW]` `[WEB]` Phase 0 / first phase starts unlocked; later phases locked
- [ ] `[NEW]` `[WEB]` Locked node = circular button with `hide-behind-hat-v2.png` mascot, `--surface-container-low` bg
- [ ] `[NEW]` `[WEB]` Locked node click → no-op (cursor stays default; no quiz opens)
- [ ] `[NEW]` `[WEB]` Active node = pulsing `--primary` ring; DevTools verifies animation only touches `transform` + `opacity` (no `transition-all`)
- [ ] `[NEW]` `[WEB]` Completed node = filled `--primary` with checkmark icon
- [ ] `[NEW]` `[WEB]` Checkpoint node = larger, uses `graduation-v2.png` mascot
- [ ] `[NEW]` `[WEB]` No gradients anywhere in the path UI
- [ ] `[NEW]` `[WEB]` Both `data-theme="light"` and `data-theme="dark"` render with no light text on light surfaces

### Interaction & gating

- [ ] `[NEW]` `[WEB]` Tap active lesson node → quiz player opens with that lesson's questions
- [ ] `[NEW]` `[WEB]` Pass quiz with ≥80% → return to path → next lesson node transitions to "active"
- [ ] `[NEW]` `[WEB]` Pass phase checkpoint with ≥80% → next phase unlocks → `graduation` full-overlay reaction fires
- [ ] `[NEW]` `[WEB]` Fail checkpoint (e.g. 50%) → no unlock; "Try again" CTA visible
- [ ] `[NEW]` `[WEB]` `[DB]` Each checkpoint attempt logs a row in `checkpoint_attempts` with correct `passed` value

### Server-side guard

- [ ] `[NEW]` `[WEB]` Grab a locked lesson's quiz URL from Network tab on the path → paste into address bar → server-side check refuses (UI shows locked-state placeholder OR redirects to path)
- [ ] `[NEW]` `[WEB]` GET `/api/study-plans/<id>/phases/<phaseId>/unlock-status` for a locked phase → `{ locked: true, reason: <string> }`
- [ ] `[NEW]` `[WEB]` Same endpoint for an unlocked phase → `{ locked: false }`

### iOS

- [ ] `[NEW]` `[iOS]` `/learn` renders at iPhone viewport without horizontal scroll
- [ ] `[NEW]` `[iOS]` Locked nodes remain unclickable on touch
- [ ] `[NEW]` `[iOS]` Active nodes tappable; quiz opens within the shell

---

## Phase 6 — Promotion / nav surfaces (status: NOT BUILT)

### Sidebar

- [ ] `[NEW]` `[WEB]` "Learn" entry appears in sidebar
- [ ] `[NEW]` `[WEB]` Position is **above** "Notebooks"
- [ ] `[NEW]` `[WEB]` Icon is Material Symbols `school` (Outlined variant)
- [ ] `[NEW]` `[WEB]` Click → navigates to `/learn`
- [ ] `[NEW]` `[WEB]` Active-route highlight matches existing sidebar pattern

### Dashboard hero card

- [ ] `[NEW]` `[WEB]` `/dashboard` renders `PathHeroCard` component
- [ ] `[NEW]` `[WEB]` Card shows current phase name + percent complete + CTA
- [ ] `[NEW]` `[WEB]` Click CTA → `/learn` opens, scrolled to active node
- [ ] `[NEW]` `[WEB]` User with no active path → card shows "Generate a learn path" CTA instead

### Onboarding prompt

- [ ] `[NEW]` `[WEB]` Fresh signup → upload first notebook → modal/prompt "Generate a learn path?" appears
- [ ] `[NEW]` `[WEB]` Accept → backend call uses `STUDY_PLAN_TOOL` with `gateStrategy='sequential'` (verify in Network)
- [ ] `[NEW]` `[WEB]` Decline → no path created (`[DB]` `SELECT COUNT(*) FROM study_plans WHERE userId='<id>'` returns 0)

### iOS WebView

- [ ] `[NEW]` `[iOS]` Sidebar "Learn" tab visible and tappable
- [ ] `[NEW]` `[iOS]` Tap "Learn" → `/learn` opens directly (no detour to `/`, per native-shells-skip-landing rule)
- [ ] `[NEW]` `[iOS]` Onboarding prompt fires on first-notebook upload inside shell

---

## Phase 7 — Achievements + polish (status: CODE COMPLETE, manual pass pending)

### New achievements (each unlocks a cosmetic via `unlockCosmeticsForAchievement`)

Unlock mapping (in `src/lib/achievements.ts`): `perfect_quiz → title.perfectionist`,
`streak_10_in_a_row → title.unstoppable`, `phase_complete → title.pathfinder`,
`path_complete → title.master`, `checkpoint_ace → title.ace`,
`comeback → title.comeback-kid`. All six are new title slugs added in this PR.

- [ ] `[NEW]` `[WEB]` `perfect_quiz` — take a ≥5-question quiz, score 100% → unlock fires → cosmetic appears in inventory + toast
- [ ] `[NEW]` `[WEB]` `streak_10_in_a_row` — in a single quiz session, get 10 correct in a row → unlock
- [ ] `[NEW]` `[WEB]` `phase_complete` — finish all lessons in a phase (including checkpoint) → unlock
- [ ] `[NEW]` `[WEB]` `path_complete` — finish all phases in a path → unlock
- [ ] `[NEW]` `[WEB]` `checkpoint_ace` — pass a checkpoint with 100% on first attempt → unlock
- [ ] `[NEW]` `[WEB]` `comeback` — within a single session, get 3 wrong then 5 right → unlock

### Telemetry

> **Sink shape:** Phase 7 ships a thin sink only. Client-side events (`quiz.*`)
> POST `/api/telemetry`, which `console.info`s a structured line. Server-side
> events (`path.*`) bypass the HTTP hop and emit the same line directly from
> the attempts route. Verify Network tab for the two `quiz.*` events; verify
> server stdout (`[telemetry] {...}` lines in `pnpm dev:web` output or Coolify
> logs) for the two `path.*` events.

- [ ] `[NEW]` `[WEB]` On streak milestone (3/5/7/10/+5) → `quiz.streak_hit` event POSTs to `/api/telemetry`
- [ ] `[NEW]` `[WEB]` On 100% finish on ≥5-question quiz → `quiz.perfect` event POSTs to `/api/telemetry`
- [ ] `[NEW]` `[LOGS]` On phase finish → `[telemetry] {... "event":"path.phase_completed" ...}` in server stdout
- [ ] `[NEW]` `[LOGS]` On checkpoint pass → `[telemetry] {... "event":"path.checkpoint_passed" ...}` in server stdout

### Polish

- [ ] `[NEW]` `[WEB]` `requiredLevel` field absent from `/api/cosmetics/catalog` response on every item
- [ ] `[NEW]` `[WEB]` Cosmetic UI shows no "Level X required" badges or copy anywhere
- [ ] `[NEW]` `[WEB]` Reduced-motion full audit — OS toggle on → walk every new animated surface (path pulse, mascot reactions, checkpoint overlay, hero CTA) → each respects the media query (no transform/opacity animation, or fade-only fallback)
- [ ] `[NEW]` `[WEB]` Sound design pass (if audio opted in) — every SFX present, normalized, no clipping

---

## Phase 9 — Learn Hub detachment from notebooks (status: SHIPPED through 9.5; 9.6 polish in flight)

Plan reference: [personal-duolingo-rework-phase-9.md](personal-duolingo-rework-phase-9.md). The whole rework moves paths / flashcards / quizzes / chats out of the notebook sidebar into a top-level `/learn` hub with four tabs, and gives chats / paths cross-notebook scope plus an "Inbox" notebook for ad-hoc uploads.

### 9.1 — Schema integrity

- [ ] `[NEW]` `[WEB]` Existing user's chats / flashcard sets / quiz sets / paths still load in their notebook-scoped views (no rows lost in the backfill)
- [ ] `[NEW]` `[DB]` `SELECT COUNT(*) FROM notebook_chats WHERE "userId" IS NULL;` → 0 (every row has a userId after backfill)
- [ ] `[NEW]` `[DB]` Same check for `flashcard_sets`, `quiz_sets`, `study_plans` → all return 0

### 9.2 — Inbox + cross-notebook API surface

- [ ] `[NEW]` `[WEB]` First `POST /api/learn/uploads` creates an Inbox notebook (`[DB]` `SELECT id, kind FROM notebooks WHERE "userId"=… AND kind='inbox';` returns one row)
- [ ] `[NEW]` `[WEB]` Second `POST /api/learn/uploads` reuses the same Inbox notebook (still one row)
- [ ] `[NEW]` `[WEB]` `PATCH /api/notebooks/<inboxId>` (rename) → server returns 4xx / forbidden
- [ ] `[NEW]` `[WEB]` `DELETE /api/notebooks/<inboxId>` → server returns 4xx / forbidden
- [ ] `[NEW]` `[WEB]` `POST /api/learn/chats` with pages from notebook A + notebook B → first-message turn loads context from both (verify server log lists both Page rows)
- [ ] `[NEW]` `[LOGS]` Auto-title fires within ~3s of first user message → `[telemetry] {... "event":"chat.title_generated" ...}` in server stdout
- [ ] `[NEW]` `[WEB]` Second user message in the same chat does NOT trigger another rename (title stays as the generated 3–5 word phrase)

### 9.3 — Chats hub

- [ ] `[NEW]` `[WEB]` Create a chat picking pages from two notebooks plus one Inbox file → first AI turn surfaces all three context sources
- [ ] `[NEW]` `[WEB]` Old `GET /notebooks/<id>/chats/<chatId>` URL → 301-redirects to `/learn/chats/<chatId>`
- [ ] `[NEW]` `[WEB]` A chat-history message containing `[flashcard_set:<id>]` resolves to the flashcard player view
- [ ] `[NEW]` `[WEB]` Same for `[quiz_set:<id>]` → resolves to the quiz player
- [ ] `[NEW]` `[WEB]` Left rail groups chats by primary notebook (color dot matches notebook color); pulses the active chat on `chatId` change

### 9.4 — Cross-notebook paths + grouped hubs

- [ ] `[NEW]` `[WEB]` Manual-mode path drawing materials from two notebooks → all materials clickable from `/learn/paths/<planId>`; clicking each opens the material in its own notebook
- [ ] `[NEW]` `[WEB]` Pass a checkpoint quiz on a cross-notebook plan → next phase unlocks (path-gating user-scoped, not notebook-scoped)
- [ ] `[NEW]` `[WEB]` `/learn/flashcards` groups sets by source notebook with the color dot; Inbox group renders first; "Cross-notebook" group renders last
- [ ] `[NEW]` `[WEB]` `/learn/quizzes` same grouping pattern
- [ ] `[NEW]` `[WEB]` Generate flashcards from a page → redirect to `/learn/flashcards?highlight=<id>` → matching card pulses + scrolls into view (same for quizzes)

### 9.5 — Notebook sidebar + Generate dropdown

- [ ] `[NEW]` `[WEB]` Notebook sidebar shows only: sections / pages tree, workspace search, mascot, timer widget, Co-Work bar (no chat list, no flashcard manager trigger, no quiz creator, no first-path prompt)
- [ ] `[NEW]` `[WEB]` Clicking the Sparkles toolbar icon shows four entries: Generate Flashcards / Generate Quiz / Generate Mind Map / Ask the Mage / Generate Study Path
- [ ] `[NEW]` `[WEB]` Each Generate entry routes correctly (flashcards → `/learn/flashcards?highlight=…`, quiz → `/learn/quizzes?highlight=…`, ask the mage → opens `CreateChatModal` pre-filled with the current page)
- [ ] `[NEW]` `[WEB]` Light-theme audit: walk `/learn/paths`, `/learn/flashcards`, `/learn/quizzes`, `/learn/chats`, the CreateChatModal — no white / near-white text on light surfaces (per `feedback_light_mode_no_light_text`)

### 9.6 — Schema cleanup + telemetry + Sentry

- [ ] `[NEW]` `[DB]` `\d chat_messages` in psql shows `notebookId` as nullable (no NOT NULL constraint)
- [ ] `[NEW]` `[WEB]` Send a first message in an inbox-only chat (no primary notebook) → `[DB]` `SELECT "notebookId" FROM chat_messages WHERE "chatId"=…;` shows NULL on the persisted rows (not the Inbox notebook id as placeholder)
- [ ] `[NEW]` `[WEB]` Navigate between Learn tabs (paths → flashcards → quizzes → chats) → DevTools Network shows one `learn.tab_view` POST per transition (not on every render)
- [ ] `[NEW]` `[LOGS]` First user message in a brand-new chat → `[telemetry] {... "event":"chat.title_generated" ...}` lands in server stdout within ~3s
- [ ] `[NEW]` `[LOGS]` Force a title-gen failure (e.g. drop the Anthropic key in dev env, send first message) → `[telemetry] {... "event":"chat.title_gen_failed" ...}` line appears
- [ ] `[NEW]` `[WEB]` Create a chat with context pages from two notebooks where one page is intentionally a canvas (no extractable text) → next Sentry event during the request carries a `chat-stream` breadcrumb with `skippedCount >= 1`
- [ ] `[NEW]` `[WEB]` Create a chat that spans two or more notebooks → DevTools Network shows one `chat.multi_notebook_created` POST with `contextNotebookCount >= 2`
- [ ] `[NEW]` `[WEB]` Upload a file into Inbox via the CreateChatModal → DevTools Network shows one `chat.inbox_upload` POST with `fileType` + `fileSizeKb`

---

## Phase 10 — Duolingo checkpoint bundles (status: CODE COMPLETE, manual pass pending)

End-to-end coverage for the Phase 10 rework. Run top-to-bottom in **both** dark and light themes (per the light-mode-no-light-text rule).

### Setup
- [ ] [DB] Run the migration: `pnpm --filter web prisma migrate dev`. Confirm `study_materials` and `checkpoint_attempts` are gone, `checkpoint_slots` / `checkpoint_activities` / `theory_content` / `assessment_attempts` exist.
- [ ] [REGRESS] `pnpm -r typecheck` clean from repo root.
- [ ] [REGRESS] `pnpm --filter web build` clean (catches `useSearchParams` prerender bailouts on the new `[planId]` route).

### 10.1 — Schema cutover regression
- [ ] [REGRESS][WEB] Open an existing notebook with quizzes and flashcards — page still loads, quiz player still works, no console errors.
- [ ] [REGRESS][WEB] Hit `GET /api/learn/paths` while signed in → returns `{ data: [] }` for fresh accounts or the existing plans for legacy ones.
- [ ] [NEW][WEB] Hit `POST /api/learn/paths` with no body → 401 / 400 path returns properly (no 500).

### 10.2–10.3 — AI generator + create endpoint
- [ ] [NEW][WEB] Open `/learn/paths` → click into a notebook → trigger the create path flow → submit AI tab with title + 1–5 notes selected → `POST /api/learn/paths` returns `{ data: { planId, status: 'generating' } }`.
- [ ] [NEW][DB] Inspect the new plan in Prisma Studio — `generationStatus = 'generating'`, phases + empty `CheckpointSlot` rows exist within seconds.
- [ ] [NEW][LOGS] Server logs show `path.generation.started` then per-slot `path.generation.slot_completed` events.
- [ ] [NEW][DB] After ~30–90s, `generationStatus = 'ready'`, every slot has `CheckpointActivity` rows linking to `TheoryContent` / `FlashcardSet` / `QuizSet` per slot kind.

### 10.4 — Progress modal
- [ ] [NEW][WEB] Submit a path → the "Building your path…" modal appears immediately (≤ 1s after the AI structure call returns).
- [ ] [NEW][WEB] SSE progress bar advances; per-section row updates `done/total` as slots fill.
- [ ] [NEW][WEB] Mascot does a `sparkle` one-shot every time `completedSlots` ticks up.
- [ ] [NEW][WEB] Click "Run in background" → modal closes, the create-form modal also closes. Navigate to `/learn/paths` → the in-flight path renders as a `GeneratingCard` spinner skeleton; the list polls every 3s and the card swaps for a real `PathView` once generation finishes.
- [ ] [NEW][WEB] Generation failure (kill the Anthropic key temporarily to force failure) → modal flips to "Generation hit a snag" with the server error; "Try again" POSTs to `/regenerate` and the orchestrator retries only the missing activities (idempotent).
- [ ] [NEW][WEB] Refresh the page mid-generation while the modal is open → modal re-opens to the current snapshot via the SSE handler's "initial emit" path.

### 10.5 — Duolingo PathView redesign
- [ ] [NEW][WEB] Sticky section banner pins to the viewport top while its section's slots scroll past; switches to the next section's banner as it scrolls in.
- [ ] [NEW][WEB] Slot states render correctly: locked (mascot hat icon, outline-variant border), available (surface-container background), active (primary fill + pulsing START pill + SVG completion ring tracking `done/total` activities), completed (primary fill + tertiary-container check pill in top-right).
- [ ] [NEW][WEB] Completed assessment slots show 1–3 gold stars below the node matching `slot.starsEarned`.
- [ ] [NEW][WEB] Slots alternate left / center / right alignment via `idx % 3`.
- [ ] [NEW][WEB] Decorative mascots appear every 3rd slot in the column gutter — pose cycles through `holding-scroll` / `painting` / `holding-wand` / `thinking` / `peek`. `pointer-events: none` so clicking through them lands on the actual slot button.
- [ ] [NEW][WEB] Tab through slots — `focus-visible` ring (3px primary outline, 4px offset) appears on the focused node. `aria-current="step"` is set on the active slot only.
- [ ] [NEW][WEB] OS-level prefers-reduced-motion → mount animation + pulse + hover scale + START bob all collapse to no-op.
- [ ] [NEW][WEB] Light mode: every surface, text, and icon stays legible (no white-on-white from the on-primary text against light banners).

### 10.6 — Checkpoint drawer
- [ ] [NEW][WEB] Click an unlocked slot on `/learn/paths` → navigates to `/learn/paths/[planId]?slot=<id>` and the drawer slides in from the right.
- [ ] [NEW][WEB] Drawer header shows the kind chip (Learning / Review / Checkpoint), slot title, close button, and per-activity progress dots (●●○).
- [ ] [NEW][WEB] Activity list shows one row per activity with status pill + Start CTA on the next incomplete row.
- [ ] [NEW][WEB] Click Start on a Theory activity → `TheoryViewer` renders the TipTap doc. Click "Mark as read & continue →" → PATCH `/api/learn/activities/[id]` returns the updated slot, drawer pops back to the list, the activity row shows "Done".
- [ ] [NEW][WEB] Open a Flashcards activity → embedded `FlashcardViewer` works. Finish the study session → drawer's `onComplete` fires, activity marks complete.
- [ ] [NEW][WEB] Open a learning-slot Quiz activity → embedded `QuizViewer` works. Submit → PATCH marks the quiz activity complete; the slot's completion ring fills.
- [ ] [NEW][WEB] Open an Assessment-slot Quiz → `isCheckpoint=true` is set. On finish → POST `/api/learn/slots/[slotId]/assessment` runs; the inline result panel shows the star animation (`tertiary-container` filled stars vs `outline-variant` empty).
- [ ] [NEW][WEB] Verify star thresholds: 70% → 1 star, 85% → 2 stars, 95% → 3 stars. Below 70% → 0 stars + slot stays active (not passed).
- [ ] [NEW][WEB] Complete every activity in a slot → slot flips to `completed`, the next slot in flat path order becomes `active` with the completion ring animation.
- [ ] [NEW][WEB] Refresh the page mid-activity — drawer reopens to the same `?slot=X&activity=Y`; the back button works.
- [ ] [NEW][WEB] Press Escape — drawer closes, URL clears `?slot=` and `?activity=`. Previously focused element regains focus.
- [ ] [NEW][MOBILE-WEB] At 390×844, drawer renders as a bottom sheet (`90vh max`, top corners rounded). Slide-up animation runs unless reduced-motion is on.

### 10.7 — Polish + telemetry
- [ ] [NEW][LOGS] Server stdout shows `path.activity.completed` events on activity PATCH and `path.assessment.completed` on assessment POST.
- [ ] [NEW][LOGS] Browser console (or analytics endpoint) shows `path.slot.opened` and `path.activity.opened` events from the drawer.
- [ ] [NEW][WEB] `aria-current="step"` is on the active SlotNode only (inspect via devtools accessibility tab).
- [ ] [NEW][WEB] Light + dark theme passes — every restyled surface (banner, drawer, slot states, modal) reads correctly. No white text in `[data-theme='light']`.

---

## End-to-end smoke (run after Phase 7 lands) [E2E]

- [ ] Fresh signup at `/auth/signup`
- [ ] Onboarding flow completes
- [ ] Upload a notebook on any topic
- [ ] Prompt "Generate a learn path?" → accept
- [ ] `/learn` shows the new path with first lesson active
- [ ] Tap first lesson → quiz opens with mixed question kinds (at least 2 different `kind` values across the question set)
- [ ] Trigger a 3-correct streak → small reaction fires
- [ ] Complete the quiz
- [ ] Return to path → next lesson unlocked
- [ ] Continue through all lessons in phase 1
- [ ] Hit checkpoint → pass with 100% → `checkpoint_ace` achievement unlocks
- [ ] Next phase unlocks
- [ ] Complete remaining phases → `path_complete` achievement unlocks
- [ ] Cosmetic inventory has the new unlocks
- [ ] Telemetry events visible in Network log
- [ ] Repeat the full flow inside the iOS shell — every step works on touch

---

## Maintenance notes

- When a phase ships and its `[NEW]` checks pass, flip those lines to `[REGRESS]` so they're run on every subsequent phase.
- File new bug rows as new checkbox lines under the relevant phase rather than in a separate doc — this stays the single source of truth.
- If a check stops being meaningful (feature removed, requirement changed), strike it through rather than deleting, so the diff history reads cleanly.
