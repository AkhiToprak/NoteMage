# Phase 10 — Duolingo-Style Learning Paths

## Context

Phase 9 detached learn surfaces from notebooks into `/learn`. The current `PathView` ([apps/web/src/components/learn/PathView.tsx](apps/web/src/components/learn/PathView.tsx)) already renders a winding path of nodes, but:

- A "node" is one material (one page OR one flashcard set OR one quiz).
- Clicking a node `router.push`es to a separate route, kicking the user out of the path.
- Content is referenced (links to existing pages/sets), not generated specifically for the path. The structure was AI-generated, but the actual learning content (theory text, flashcards, quizzes) was either re-used from notebook material or had to be generated lazily on first open.
- Visual language is functional but doesn't communicate progress or motivate completion the way Duolingo does.

**Goal:** Make `/learn/paths` feel like Duolingo. Every checkpoint bundles 2–4 activities (theory → flashcards → quiz), opens inline in a slide-in drawer, and ALL of its content is generated upfront so a user can start, pause, and resume without ever waiting on the AI mid-session.

**Decisions confirmed up-front:**
- **Hard cutover.** No users yet → drop existing `StudyMaterial` data, redesign schema cleanly.
- **Theory is path-internal.** New `TheoryContent` model lives only inside checkpoints; not exposed in the notebook tree.
- **"Watch-it-generate" UX.** Path creation returns immediately with a `generating` status; a progress modal streams per-slot progress over SSE. User can close the modal and server keeps generating (Coolify-hosted Node process stays alive).

---

## Glossary

- **Path** = `StudyPlan` (existing). A user's full curriculum.
- **Section** = `StudyPhase` (existing, renamed in UI). A unit of the path. Rendered with a sticky section banner.
- **Checkpoint** = `CheckpointSlot` (new). One node on the path. Bundles 2–4 activities.
- **Activity** = `CheckpointActivity` (new). One step inside a checkpoint: theory / flashcards / quiz.
- **Checkpoint kind** = `learning` | `review` | `assessment`.

---

## Schema (target end-state)

Hard cutover migration: drop `StudyMaterial` + `CheckpointAttempt` (or rename `CheckpointAttempt` → `AssessmentAttempt`), add 3 new models, add 2 fields on `StudyPlan`.

```prisma
model StudyPlan {
  // existing fields…
  generationStatus   String  @default("ready")  // "queued" | "generating" | "ready" | "failed"
  generationProgress Json?                       // { totalSlots, completedSlots, currentSlot, currentActivity }
  generationError    String? @db.Text
  // relations…
  // REMOVED: phases → materials path. Phases now have slots.
}

model StudyPhase {
  // existing fields…
  slots CheckpointSlot[]
  // REMOVED: materials StudyMaterial[]
}

model CheckpointSlot {
  id                  String   @id @default(cuid())
  phaseId             String
  title               String
  description         String?  @db.Text
  kind                String   @default("learning")  // "learning" | "review" | "assessment"
  sortOrder           Int      @default(0)
  prerequisiteSlotIds String[] @default([])
  starsEarned         Int      @default(0)            // 0-3, from assessment activity
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  phase      StudyPhase           @relation(fields: [phaseId], references: [id], onDelete: Cascade)
  activities CheckpointActivity[]
}

model CheckpointActivity {
  id             String  @id @default(cuid())
  slotId         String
  kind           String                            // "theory" | "flashcards" | "quiz"
  title          String
  sortOrder      Int     @default(0)
  completed      Boolean @default(false)
  completedAt    DateTime?
  // Polymorphic refs — exactly one populated per kind.
  theoryId       String? @unique
  flashcardSetId String? @unique
  quizSetId      String? @unique

  slot         CheckpointSlot @relation(fields: [slotId], references: [id], onDelete: Cascade)
  theory       TheoryContent? @relation(fields: [theoryId], references: [id], onDelete: Cascade)
  flashcardSet FlashcardSet?  @relation(fields: [flashcardSetId], references: [id], onDelete: Cascade)
  quizSet      QuizSet?       @relation(fields: [quizSetId], references: [id], onDelete: Cascade)
}

model TheoryContent {
  id        String   @id @default(cuid())
  title     String
  body      Json                          // TipTap JSON (renderable by a stripped-down PageEditor)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  activity  CheckpointActivity?
}

model AssessmentAttempt {                  // renamed from CheckpointAttempt
  id         String   @id @default(cuid())
  slotId     String                        // was phaseId
  userId     String
  score      Int
  total      Int
  percentage Float
  starsEarned Int                          // 1 if passed at 70%, 2 at 85%, 3 at 95%
  attemptedAt DateTime @default(now())

  slot CheckpointSlot @relation(fields: [slotId], references: [id], onDelete: Cascade)
  user User           @relation(fields: [userId], references: [id], onDelete: Cascade)
}
```

`FlashcardSet` and `QuizSet` already have nullable `notebookId` (Phase 9.1). Path-generated sets will set `notebookId = primaryNotebookId` of the path, with no `sectionId`, so they don't pollute the notebook tree (they're only reachable through the checkpoint).

---

## Phase 10.1 — Schema cutover & hard reset

**Migration** (`apps/web/prisma/migrations/2026MMDDHHMMSS_phase10_checkpoint_bundles/migration.sql`):

1. `DELETE FROM "StudyPlan"` — wipes plans, phases, materials, attempts via cascade.
2. Drop `StudyMaterial`, drop `CheckpointAttempt`.
3. Create `CheckpointSlot`, `CheckpointActivity`, `TheoryContent`, `AssessmentAttempt`.
4. Add `generationStatus`, `generationProgress`, `generationError` to `StudyPlan`.

**Code touch:**
- Update [apps/web/prisma/schema.prisma](apps/web/prisma/schema.prisma).
- Delete [apps/web/src/lib/path-gating.ts](apps/web/src/lib/path-gating.ts) material-based gating; rewrite as slot-based (Phase 10.6).
- Delete the now-broken `StudyPlanView` consumer code paths. The `PathView` types in [apps/web/src/components/learn/PathView.tsx](apps/web/src/components/learn/PathView.tsx) get rewritten in Phase 10.5.
- Search-and-remove orphaned references: `apps/web/app/api/notebooks/[id]/study-plans/**`, the `materialId` param in [apps/web/app/api/notebooks/[id]/quiz-sets/[setId]/route.ts](apps/web/app/api/notebooks/[id]/quiz-sets/[setId]/route.ts).

**Files**
- `apps/web/prisma/schema.prisma`
- `apps/web/prisma/migrations/.../migration.sql`
- `apps/web/src/lib/path-gating.ts` (rewrite signature; stub out body returning `available` for everything — re-implemented in Phase 10.6)

**Verify:** `pnpm --filter web prisma migrate dev`, `pnpm --filter web typecheck`. No green-on-broken assumptions — typecheck will surface every consumer needing follow-up.

---

## Phase 10.2 — AI generation tools & orchestrator

The generator produces a path in two stages:

**Stage A — Structure (one AI call):**
- New tool `create_path_structure` (replaces today's `STUDY_PLAN_TOOL`). Output specifies phases, slots per phase, and for each slot: `kind` (learning/review/assessment), a one-line title, and a `topicHint` (what the slot should teach). It does NOT generate the content yet.
- Slot kinds chosen by the AI based on phase position: early phases mostly `learning`, mid `learning` + occasional `review`, last slot of each phase always `assessment`.

**Stage B — Content (1 call per activity, parallel-safe):**
- `create_theory_section` → `TheoryContent` (TipTap JSON, ~300–500 words, 2–3 examples).
- `create_flashcards_for_slot` → `FlashcardSet` with 8–12 cards covering the slot's topic.
- `create_quiz_for_slot` → `QuizSet` with 5–8 mixed-kind questions (mc + true_false + fill_blank).
- Each call gets the slot's `topicHint`, the path title, the section title, and (for review/assessment) summaries of the slots it should review.

**Orchestrator** (`apps/web/src/lib/path-generator.ts`, new):
- `generatePath(planId, opts)` runs as an async fire-and-forget after Stage A persists.
- Updates `StudyPlan.generationStatus` from `queued` → `generating` → `ready`/`failed`.
- For each slot (sequential to keep `generationProgress` coherent and avoid Anthropic rate limits): generate theory, flashcards, quiz in parallel via `Promise.allSettled`. Write each on success. Update `generationProgress` after each slot.
- Errors collected per-activity; if any required activity fails twice (with backoff), mark plan `failed` and stash error in `generationError`. Failure is recoverable: a `POST /api/learn/paths/[planId]/regenerate` endpoint can retry only the missing activities.

**AI client:** Reuse [apps/web/src/lib/anthropic.ts](apps/web/src/lib/anthropic.ts) (Claude Haiku 4.5, 16k output). All 3 content tools use `tool_choice: { type: 'tool', name }` for forced structured output.

**Files**
- `apps/web/src/lib/ai-tools.ts` (add new tool schemas)
- `apps/web/src/lib/path-generator.ts` (new — orchestrator)
- `apps/web/src/lib/path-prompts.ts` (new — system prompts per content kind)

**Verify:** Manual: call `generatePath` from a script with a fake plan, watch DB rows materialize, watch `generationProgress` JSON update.

---

## Phase 10.3 — API: create + SSE progress stream

**`POST /api/learn/paths`** (rewrite of [apps/web/app/api/learn/paths/route.ts](apps/web/app/api/learn/paths/route.ts)):

1. Validate input: `{ title, contextNotebookIds[], primaryNotebookId, targetDays, materialIds[] }` (same shape as today, no breaking change to caller signature for this endpoint).
2. Call Stage A (structure) inline — it's a single AI call, ~3–5s.
3. Create `StudyPlan` + `StudyPhase` rows + empty `CheckpointSlot` rows in one transaction with `generationStatus: 'generating'`.
4. Kick off Stage B: `void generatePath(plan.id).catch(logError)`.
5. Return `{ planId, status: 'generating' }` immediately.

**`GET /api/learn/paths/[planId]/generation`** (new SSE endpoint):

- `Content-Type: text/event-stream`.
- Streams `progress` events: `{ totalSlots, completedSlots, currentSlot: { id, title }, currentActivity: 'theory' | 'flashcards' | 'quiz' }`.
- Emits a final `done` event with the full plan tree, or `error` event on failure.
- Implementation: tail `StudyPlan.generationProgress` via 500ms polling inside the SSE handler (poll the DB, diff, emit). Keeps the SSE handler stateless — orchestrator just writes to DB.
- Reconnect-safe: a client that connects mid-generation gets the current progress immediately and continues streaming.

**`POST /api/learn/paths/[planId]/regenerate`** (new): retry failed activities only.

**`GET /api/learn/paths`** + **`GET /api/learn/paths/[planId]`**: extend response to include `generationStatus` + (for full detail) the nested `phases[].slots[].activities[]` tree.

**Files**
- `apps/web/app/api/learn/paths/route.ts`
- `apps/web/app/api/learn/paths/[planId]/generation/route.ts` (new)
- `apps/web/app/api/learn/paths/[planId]/regenerate/route.ts` (new)
- `apps/web/app/api/learn/paths/[planId]/route.ts` (new — single-plan GET, replaces old `study-plans/[id]`)

**Verify:** `curl -N` the SSE endpoint while a generation runs and confirm events stream live.

---

## Phase 10.4 — Generation progress modal

Triggered from the path create flow (locate the existing `CreatePathModal` or equivalent under [apps/web/app/(dashboard)/learn/paths/](apps/web/app/(dashboard)/learn/paths/)). On submit:

1. Show the "Generating your path" modal immediately.
2. Open `EventSource` to `/api/learn/paths/[planId]/generation`.
3. Render: section list with per-section progress (`Section 1 — 3/4 slots ✓`), the current activity (`Generating quiz for "Verbs in past tense"…`), an overall progress bar, and a tasteful mascot animation (use `thinking` or `holding-wand` pose + `cast` one-shot).
4. Two CTAs: **Keep open** (default — modal stays, transitions to "Ready! Start learning →" when done) and **Run in background** (closes modal, generation continues server-side; toast appears when ready and the paths list refreshes).
5. On `error` event: show an inline retry button that calls `POST /api/learn/paths/[planId]/regenerate`.

**Files**
- `apps/web/src/components/learn/GenerationProgressModal.tsx` (new)
- `apps/web/src/hooks/usePathGenerationStream.ts` (new — wraps EventSource)
- Integrate from the existing create-path UI in `apps/web/app/(dashboard)/learn/paths/`

**Verify:** Open modal, watch sections fill in. Refresh mid-generation — modal auto-reconnects and continues. Close modal, observe completion toast.

---

## Phase 10.5 — Duolingo-style `PathView` redesign

Rewrite [apps/web/src/components/learn/PathView.tsx](apps/web/src/components/learn/PathView.tsx). Keep the file path so consumers don't change; rewrite internals.

**Layout:**
- Container is a single vertical scroll column, max-width 640px on desktop, full-width on mobile.
- Each `StudyPhase` renders as a **sticky section banner** at the top of its block: rounded card, theme color background (primary), white text, shows `SECTION N` (small caps) and the phase title. Right-side: a notebook icon link back to the primary notebook. Banner is `position: sticky; top: 0` and stays pinned while its slots scroll.
- Below the banner: a vertical sequence of slot nodes, alternating left/center/right offsets (existing `idx % 3` pattern from current PathView.tsx:358–360).

**Slot node (90×90 button):**
- Shape: rounded square (border-radius 28px) with a soft `0 4px 0` flat drop-shadow in a darker shade of the slot's color — the layered-shadow look from current code, no gradients.
- Icon (Material Symbols Outlined) varies by `kind`:
  - `learning`: `auto_stories`
  - `review`: `replay`
  - `assessment`: `quiz`
- Color varies by state:
  - `locked` → outline color, desaturated; mascot `hide-behind-hat` floats above (existing pattern, PathView.tsx:181–211)
  - `available` → primary color, hover scales 1.05 with spring `cubic-bezier(0.34, 1.56, 0.64, 1)`
  - `active` → primary color + animated `START` speech bubble above (re-use existing pulse animation PathView.tsx:232–239)
  - `completed` → success color (token `--success`, NOT a default Tailwind green), small checkmark badge; below the node, render 1–3 filled stars based on `slot.starsEarned`
- **Completion ring** around `active` node: SVG circle, stroke-dasharray driven by `activities.filter(a => a.completed).length / activities.length`. Animates from 0 → current on mount.

**Decorative mascots:**
- Between every 3rd–4th slot, render a `<Mascot>` (re-use [apps/web/src/components/mascot/Mascot.tsx](apps/web/src/components/mascot/Mascot.tsx)), absolutely positioned to the opposite side of the path's current offset, size `md`, idle animation. Pose cycles through: `reading` (use `holding-scroll` if reading not present), `painting`, `holding-wand`, `thinking`, `peek`. Mascots have `pointer-events: none` and `z-index: 1` (below slot nodes).

**Section transitions:**
- A subtle divider element between sections (a horizontal wavy line + small section-end marker).

**Animations:**
- Only `transform` and `opacity`, never `transition-all` (per CLAUDE.md guardrails).
- Slot mount: `opacity 0 → 1` over 200ms, stagger by `index * 30ms`.
- Section banner: no animation; sticky position handles itself.
- Respect `prefers-reduced-motion` (existing pattern in PathView.tsx:169–174).

**Theme:** Re-use `var(--primary)`, `var(--outline)`, `var(--success)` etc. NO gradients anywhere. NO light text in light mode — audit all `color` properties when adapting.

**Files**
- `apps/web/src/components/learn/PathView.tsx` (rewrite)
- `apps/web/src/components/learn/SlotNode.tsx` (new — extracted node)
- `apps/web/src/components/learn/SectionBanner.tsx` (new)
- `apps/web/src/components/learn/PathDecorations.tsx` (new — mascot props placement)

**Verify:** Render a mock path with 3 sections × 5 slots × varied states. Scroll to verify sticky banner. Tab through nodes to verify focus-visible states. Toggle `prefers-reduced-motion`.

---

## Phase 10.6 — Checkpoint drawer & embedded viewers

The drawer is the inline activity host. Opens on slot click; never navigates away from `/learn/paths/[planId]`.

**Route:** `apps/web/app/(dashboard)/learn/paths/[planId]/page.tsx` (new — adds the path-detail route). Drawer state lives in URL: `?slot=<slotId>&activity=<activityId>` so the back button works, sharing a link to a specific slot works, and refreshing mid-activity preserves state.

**Drawer UI** (`apps/web/src/components/learn/CheckpointDrawer.tsx`, new):
- Right-side slide-in sheet on desktop (480px wide, full height), bottom sheet on mobile (90vh).
- Header: slot title, kind chip, close button. Progress dots underneath show activity index (●●○).
- **Activity list view** (when no activity selected):
  - Each activity row: icon + title + status (`Not started` / `In progress` / `Done ✓`).
  - "Start" CTA on the next incomplete activity.
- **Activity view** (when `?activity=` set):
  - Theory → render a stripped-down read-only `TheoryViewer` (new component — wraps TipTap with `editable: false`, no toolbar). Reuses extensions from [apps/web/src/components/notebook/PageEditor.tsx](apps/web/src/components/notebook/PageEditor.tsx) but with `editable: false`. Footer: "Mark as read & continue →".
  - Flashcards → embed `FlashcardViewer` from [apps/web/src/components/notebook/FlashcardViewer.tsx](apps/web/src/components/notebook/FlashcardViewer.tsx) (already prop-driven via `initialCards`). Pass `onComplete` callback that PATCHes the activity, advances to next.
  - Quiz → embed `QuizViewer` from [apps/web/src/components/notebook/QuizViewer.tsx](apps/web/src/components/notebook/QuizViewer.tsx). For assessment-kind slots, set `isCheckpoint: true` (existing prop) and on completion submit to a new `AssessmentAttempt` endpoint that computes `starsEarned`.
- Animations: drawer slides in over 220ms with `transform: translateX(100%) → translateX(0)`. Backdrop fades in. ESC closes drawer (with confirmation if mid-activity).

**API for activity progress:**
- `PATCH /api/learn/activities/[activityId]` → `{ completed: true }`. Server updates the row, recomputes slot status (all activities done → slot completed → next slot available), and returns the updated slot.
- `POST /api/learn/slots/[slotId]/assessment` → stores `AssessmentAttempt`, returns `{ starsEarned, passed }`.

**Gate logic** ([apps/web/src/lib/path-gating.ts](apps/web/src/lib/path-gating.ts), full rewrite — was stubbed in 10.1):
- A slot is `available` iff every slot in `prerequisiteSlotIds` is `completed`.
- A slot is `completed` iff every activity is `completed`. Assessment slots additionally require `starsEarned >= 1`.
- A slot is `active` iff it's the first `available && not completed` slot in path order.
- Phases use `gateStrategy = 'sequential'` (the only strategy we support post-10.1).

**Files**
- `apps/web/app/(dashboard)/learn/paths/[planId]/page.tsx` (new)
- `apps/web/src/components/learn/CheckpointDrawer.tsx` (new)
- `apps/web/src/components/learn/TheoryViewer.tsx` (new — read-only TipTap renderer)
- `apps/web/src/components/learn/ActivityList.tsx` (new)
- `apps/web/app/api/learn/activities/[activityId]/route.ts` (new)
- `apps/web/app/api/learn/slots/[slotId]/assessment/route.ts` (new)
- `apps/web/src/lib/path-gating.ts` (full rewrite)

**Verify:** Open path, click slot, drawer opens. Complete each activity, watch list update. Refresh mid-activity — drawer reopens to same activity. Complete final activity, drawer closes, next slot becomes active with completion ring animation. Assessment slot computes stars correctly.

---

## Phase 10.7 — Polish, telemetry, manual test pass

- **Sound effects** (optional, behind a `prefersSilent` user preference if one exists, else default on): slot tap, activity complete, section complete. Files in `public/sounds/`.
- **Mascot reactions** inside drawer: re-use existing `quiz-reactions.ts` and `useStreamingChat.ts` mascot integration. On quiz correct → cheer; wrong → comfort.
- **Telemetry**: emit events `path.generation.started/completed/failed`, `slot.opened`, `activity.completed`, `assessment.completed` via the existing telemetry layer (Phase 7 added it).
- **Accessibility audit:** keyboard nav through nodes (left/right/up/down arrow keys), `aria-current="step"` on active slot, drawer is a proper `role="dialog"` with focus trap.
- **Light-mode audit:** every restyled surface — banner, drawer, slot node states — must NOT use white/light text in `[data-theme='light']`.
- **Manual test plan**: append to [plans/personal-duolingo-rework-manual-tests.md](plans/personal-duolingo-rework-manual-tests.md) a Phase 10 section covering:
  - Create AI path → progress modal → close mid-gen → toast appears
  - Generation failure → retry button works
  - Slot click → drawer → complete all three activities → next slot unlocks
  - Assessment scoring at 70% / 85% / 95% boundaries → correct star counts
  - Browser refresh mid-activity → state restored
  - Mobile bottom-sheet behavior
  - Dark + light theme

**Files**
- `apps/web/src/components/learn/*` (polish)
- `apps/web/src/lib/telemetry.ts` (add events)
- `plans/personal-duolingo-rework-manual-tests.md` (extend)

---

## Critical files referenced (existing, to reuse)

- [apps/web/src/components/notebook/QuizViewer.tsx](apps/web/src/components/notebook/QuizViewer.tsx) — embed in drawer; already prop-driven via `initialQuestions`, `isCheckpoint`, `materialId`.
- [apps/web/src/components/notebook/FlashcardViewer.tsx](apps/web/src/components/notebook/FlashcardViewer.tsx) — embed in drawer; prop-driven via `initialCards`.
- [apps/web/src/components/notebook/PageEditor.tsx](apps/web/src/components/notebook/PageEditor.tsx) — source of TipTap extensions for `TheoryViewer` (use `editable: false`).
- [apps/web/src/components/mascot/Mascot.tsx](apps/web/src/components/mascot/Mascot.tsx) + [apps/web/src/components/mascot/poses.ts](apps/web/src/components/mascot/poses.ts) — decorative props.
- [apps/web/src/lib/anthropic.ts](apps/web/src/lib/anthropic.ts) — AI client.
- [apps/web/src/lib/chat-stream.ts](apps/web/src/lib/chat-stream.ts) — SSE event encoding pattern (`sseEvent` helper) to reuse for `/generation` endpoint.
- [apps/web/src/hooks/useStreamingChat.ts](apps/web/src/hooks/useStreamingChat.ts) — EventSource-style SSE consumer pattern to model `usePathGenerationStream` on.
- [apps/web/app/(dashboard)/learn/layout.tsx](apps/web/app/(dashboard)/learn/layout.tsx) — sticky tab nav; already in place.

## Files to delete

- `apps/web/app/api/notebooks/[id]/study-plans/**` (notebook-scoped path APIs — superseded)
- `apps/web/app/api/study-plans/route.ts` (legacy flat list — superseded by `/api/learn/paths`)
- `apps/web/src/components/notebook/StudyPlanView.tsx` (replaced by new `/learn/paths/[planId]` route)
- `apps/web/app/api/notebooks/[id]/study-plans/generate/route.ts` (replaced by Stage A in new `/api/learn/paths`)
- `?material=` handling inside `apps/web/app/api/notebooks/[id]/quiz-sets/[setId]/route.ts` (material model removed)

## Out of scope

- Spaced-repetition scheduling for review slots — review slots reuse existing flashcard intervals; no new SR engine in this phase.
- Multi-user collaborative paths.
- Importing paths between users.
- Mascot skins / customization (deferred).
- Sound design beyond simple effects.

## Verification (end-to-end)

1. `pnpm --filter web prisma migrate dev` → schema applied cleanly, no broken constraints.
2. `pnpm --filter web typecheck` → green.
3. `pnpm --filter web build` → green (catches `useSearchParams`-style prerender bailouts).
4. Manual: log in, click "Create path" in `/learn/paths`, submit, observe progress modal stream → done. Open the path, click first slot, complete all three activities, watch second slot unlock with ring animation.
5. Manual: refresh during step 4 mid-activity → state restored from URL.
6. Manual: close progress modal mid-gen, navigate away, return to `/learn/paths` → path shows `generating` chip, completion toast appears when ready.
7. Run the Phase 10 section of `plans/personal-duolingo-rework-manual-tests.md` end-to-end.

## Rollout

Six PRs, one per phase (10.1–10.6), with 10.7 as a polish PR that can ship after the others are live. Hard cutover happens at 10.1 — between 10.1 and 10.6 the paths feature is broken (acceptable: no users).

If "broken in main" matters more than expected: gate the entire `/learn/paths` redesign behind a `?v2=1` query param until 10.6 lands, then flip the default. One-line flag check at the top of [apps/web/app/(dashboard)/learn/paths/page.tsx](apps/web/app/(dashboard)/learn/paths/page.tsx).
