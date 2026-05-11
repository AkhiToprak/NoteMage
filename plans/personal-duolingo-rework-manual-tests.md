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
