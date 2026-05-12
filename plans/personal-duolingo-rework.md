# NoteMage — Personal Duolingo Rework

## Context

Today, NoteMage's quizzes are 4-option multiple choice and nothing else. Study plans exist but are buried inside `notebooks/[id]/study-plan/[planId]` — the user has to dig through the notebook tree to find them, and there's no gating between phases. Mascots appear cosmetically (sidebar, streak display) but are not wired into the quiz flow.

The goal of this rework: make NoteMage feel like a **personal Duolingo** for whatever the user is studying.

1. **Emotional feedback during quizzes** — mascot reactions on streaks (3/5/7 in a row), wrong streaks (2/3 in a row → encouragement), and perfect scores (full celebration overlay).
2. **Diverse question types** — beyond MC: fill-in-the-blank typed, word-bank drag-to-fill (the volcano example), match pairs, sentence reorder, equation entry, translation. Question type chosen per-question by AI based on context.
3. **Gated learn path** — extend StudyPlan with prerequisites and checkpoint quizzes that the user actually has to pass before unlocking the next lesson. Visual path UI ("Duolingo tree").
4. **Promote it** — top-level "Learn" sidebar nav, dashboard hero, onboarding flow that generates a path on first run.

This is a 6–9 week effort, ~7 sequential phases with parallelism inside each. The plan below is split between **what agents will code** and **what you (user) need to do** while they work — commissioning, copywriting, decisions.

---

## Current state (verified, not assumed)

| Area | Status | Key files |
|---|---|---|
| Quiz schema | MC-only: `options: string[]`, `correctIndex: number` | `apps/web/prisma/schema.prisma:350–423` |
| Quiz player | Single component, radio-button UI | `apps/web/src/components/notebook/QuizViewer.tsx` |
| Quiz grading | Server compares `selectedIdx === correctIndex` | `apps/web/app/api/notebooks/[id]/quiz-sets/[setId]/attempts/route.ts` |
| AI generation | Anthropic SDK + Claude Haiku 4.5, single `QUIZ_TOOL` | `apps/web/src/lib/ai-tools.ts:101–153` |
| Study plan schema | `StudyPlan → StudyPhase → StudyMaterial` (no gating) | `apps/web/prisma/schema.prisma:555–608` |
| Study plan UI | Buried inside notebook view; no main-nav entry | `apps/web/src/components/notebook/StudyPlanView.tsx` |
| Mascot poses | 25 PNGs wired up; CSS animations (no Lottie/Rive) | `apps/web/public/mascot/*.png`, `apps/web/src/components/mascot/poses.ts` |
| Mascot oneShot | `cast`, `celebrate`, `sparkle`, `step-in`, `step-out` already exist | `apps/web/src/components/mascot/Mascot.tsx:37–52` |
| Streak engine | Already built — milestones at 3/7/30/100/365, freeze logic | `apps/web/src/lib/streaks.ts:13–50` |
| Achievements | Solid: `checkAndUnlockAchievements(userId)` runs on `GET /api/user/achievements` | `apps/web/src/lib/achievements.ts`, `achievement-checker.ts` |
| Sidebar | 5 routes only (Dashboard, Profile, Notebooks, Co-Work, Settings) | `apps/web/src/components/layout/Sidebar.tsx:22–40` |
| Native shell guard | Available via `native-bridge.ts` (`isClient`/native checks) | `apps/web/src/lib/native-bridge.ts` |

**What's already there that we'll reuse, not rebuild:**
- Streak primitives (`streaks.ts`) — perfect for in-quiz combo tracking; same conceptual model.
- Mascot `oneShot` system with `'celebrate' | 'sparkle' | 'cast'` — extend, don't replace.
- Achievement unlock pipeline — add new badges, no plumbing rewrite needed.
- AI tool-calling pattern — add a new tool variant alongside `QUIZ_TOOL`.

**Pre-flight blockers (must clear before Phase 1):**
- Outstanding XP-removal cleanup is unfinished. After `main` is deployed and the backfill script (`apps/web/scripts/backfill-cosmetics-from-levels.ts`) is run, drop `User.xp` + `User.level` columns + delete the script. Schema migrations in this rework will conflict if those columns are still present.
- `celebrate-v2.png` and `sad-v2.png` were noted as "dropped from new commissions" but both files exist and are wired in `poses.ts:101–115`. **Confirm these are usable for the reaction system** (Phase 3 leans heavily on them) — otherwise they need replacements before Phase 3 ships.

---

## Target state (what users feel)

- Open NoteMage → "Learn" tab in sidebar (above Notebooks).
- Land on a vertical path. Each notebook with a study plan has its own path; or a single global path generated from active goals.
- Path is segmented by phase. Each phase has 3–6 lesson nodes + 1 checkpoint node. Future nodes are locked with the existing mascot's `hide-behind-hat` pose as the lock icon.
- Tap a lesson node → quiz player opens. Questions are mixed-type: MC, drag-to-fill, match pairs, etc., chosen by the AI for what fits the content.
- Get 3 right in a row → mascot pops up corner-peek style, gives a 1-second cheer, fades.
- Get 5/7 in a row → bigger reaction, sparkle burst.
- Get 2 wrong in a row → mascot appears with `thinking` pose, encouraging copy.
- Finish 100% → full-overlay celebration with `celebrate` pose + confetti + sound (optional).
- Finish phase checkpoint → `graduation` pose unlocks the next phase node.
- Achievement unlocks for: 10-streak, 25-streak, perfect quiz, phase complete, path complete.

---

## Phase plan

Each phase = one PR (or a small PR series). Phases are ordered; **inside** each phase, work is parallelizable across agents where called out.

### Phase 0 — Spec freeze + commission kickoff (Week 1, mostly user-side)

**Agent work:** none (or just write Zod schemas in `packages/shared/`).

**Your work (parallel to all later coding):**
1. Confirm pre-flight blockers cleared (XP column drop).
2. Confirm celebrate/sad pose usability.
3. Decide on the open questions in the **Decision points** section below.
4. Begin commissions (see **Commissioning checklist** below).
5. Draft copy banks (see **Copywriting checklist** below).

### Phase 1 — Question Engine v2 (foundation) (Week 2)

**Single agent. Blocks everything else.**

Schema:
- Add `QuestionKind` enum to `prisma/schema.prisma`: `mc | true_false | fill_blank | word_bank | match_pairs | sentence_reorder | equation | translation`.
- Add `kind: QuestionKind @default(mc)` and `payload Json?` to `QuizQuestion`.
- Migrate existing rows: `kind='mc'`; `payload` stays null (legacy reads keep using `options` + `correctIndex` for one release, then port).

Renderer registry:
- New file `apps/web/src/components/quiz/questionRenderers/index.ts` exporting `RENDERERS: Record<QuestionKind, React.FC<QuestionProps>>`.
- One file per kind under `questionRenderers/` — Phase 1 ships only `MCRenderer.tsx` (extracted from existing `QuizViewer.tsx`).
- `QuizViewer.tsx` becomes a dispatcher that picks the renderer by `question.kind`.

Grading dispatch:
- New `apps/web/src/lib/quiz-grading.ts` exporting `grade(kind, payload, userAnswer): { isCorrect, feedback }`.
- Update `app/api/notebooks/[id]/quiz-sets/[setId]/attempts/route.ts` to call `grade()` instead of inline `selectedIdx === correctIndex`.

Shared types:
- New `packages/shared/src/quiz.ts`: Zod schemas for each `QuestionKind` payload + a discriminated union. Re-exported from `packages/shared/src/index.ts`.
- The schemas are the source of truth for: AI tool input, server validation, client renderers.

AI tool variant:
- Keep `QUIZ_TOOL` for backward compat.
- Add `QUIZ_TOOL_V2` in `apps/web/src/lib/ai-tools.ts` that accepts an array of `{ kind, payload }` questions. Phase 1 only enables `kind='mc'` in the schema (other kinds gated behind the prompt). New kinds get added per Phase 2 sub-phase.

Verification:
- Existing quizzes load and grade identically (regression test).
- New `kind='mc'` questions generated by AI render correctly.
- `tsc` passes across the monorepo (`pnpm -r typecheck`).

### Phase 2A — First batch of new question types (Week 3, 4 agents in parallel)

After Phase 1 lands, four agents work in parallel — one per question type. Translation is in this batch (decided 2026-05-11). Each agent ships:
- Renderer component (`questionRenderers/<Kind>Renderer.tsx`)
- Zod payload schema in `packages/shared/src/quiz.ts`
- Grading branch in `quiz-grading.ts`
- Adds the kind to `QUIZ_TOOL_V2`'s allowed enum + AI prompt examples

**Type 1 — Fill-in-the-blank (typed)**
- Payload: `{ prompt: string, blank: { acceptableAnswers: string[], caseSensitive?: boolean, fuzzyThreshold?: number } }`
- Renderer: text input, fuzzy-match against `acceptableAnswers` (Levenshtein at ratio ≥ 0.85 by default).
- Use case: "What's the capital of France?" → user types "paris".

**Type 2 — Word bank / drag-to-fill (the volcano example)**
- Payload: `{ template: string, slots: Slot[], wordBank: string[] }` where `template` has `{{0}}`, `{{1}}` placeholders and `slots` has the correct answer for each index.
- Renderer: shows the sentence with empty slots; word bank below; drag-drop on desktop, tap-to-place on touch (mobile shell).
- Use `@dnd-kit/core` (already in npm ecosystem; check if installed before adding) — has touch support out of the box.
- Touch policy: tap a token → tap a slot to place; tap a placed token → returns it to the bank.

**Type 3 — Match pairs**
- Payload: `{ pairs: { left: string, right: string }[] }` — render shuffled.
- Renderer: two columns; click left then right to draw a connection line; correct pairs highlight green.
- SVG layer for the connection lines, animated with `transform` only (per CLAUDE.md no-`transition-all` rule).

**Type 4 — Translation** (decided 2026-05-11 to land in this batch)
- Payload: `{ prompt: string, targetLanguage: string, blank: { acceptableAnswers: string[], caseSensitive?: boolean, fuzzyThreshold?: number } }` — same shape as fill-blank plus `targetLanguage`.
- Renderer: reuses the fill-blank text-input renderer with a language-tag chip above the input; `fuzzyThreshold` defaults to 0.75 (looser than fill-blank's 0.85) so accents/diacritics don't trip the answer.
- AI prompt example: "Translate to Spanish: 'the red book'" → user types "el libro rojo".

Verification per type:
- Renders in browser at desktop + mobile width.
- Touch interaction works (test with browser dev tools touch emulation; live test in iOS shell before merging).
- AI can generate 3 valid examples on demand.

### Phase 2B — Second batch of question types (Week 4, optional / parallel)

Same pattern as 2A. Lower priority — ship if path content needs them.

**Type 5 — Sentence reorder** — like word-bank but tokens form a single sequence, no slots.

**Type 6 — Equation entry** — typed math answer. Use `mathjs` (or `expr-eval`) to evaluate equivalence (`2x + 3` and `3 + 2x` both correct). Payload: `{ prompt: string, expectedExpression: string, tolerance?: number }`.

### Phase 3 — Mascot reaction engine (Week 4, parallel to 2B)

**Depends on:** any new poses you commission must be in `apps/web/public/mascot/` and added to `poses.ts` before this phase merges. If you decide to reuse existing poses only, this can run earlier in parallel with 2A.

Files:
- New `apps/web/src/lib/quiz-reactions.ts` — pure logic. Input: streak state. Output: `{ pose, oneShot, message, intensity, audio? } | null`.
- New `apps/web/src/components/quiz/QuizReactionLayer.tsx` — overlay component the player mounts. Listens for reaction events, mounts `<Mascot>` with the right pose, plays one-shot, plays audio (if enabled), fades out.
- Extend `Mascot.tsx`'s `MascotOneShot` type with new entries: `'cheer-small' | 'cheer-big' | 'comfort'`. Each maps to a CSS keyframe in `mascot.module.css`.

Reaction rules (initial, tunable):
| Trigger | Pose | OneShot | Message | Audio |
|---|---|---|---|---|
| 3 correct in a row | `bow` or `wink` (random) | `cheer-small` | "Three!" | streak-soft |
| 5 correct in a row | `celebrate` | `cheer-big` + `sparkle` | "On fire!" | streak-mid |
| 7+ correct in a row | `celebrate` xl | `cheer-big` + `sparkle` x2 | "Unstoppable!" | streak-big |
| 2 wrong in a row | `thinking` | none | "Take your time." | none |
| 3+ wrong in a row | `sad` | `comfort` | "Want a hint?" | none |
| Perfect score | `celebrate` xl, full overlay | `celebrate` + confetti | "100%!" | celebration |
| Phase checkpoint pass | `graduation` lg, full overlay | `celebrate` | "Section complete!" | checkpoint |

Settings:
- Respect `prefers-reduced-motion` — skip oneShots, show static pose only.
- New user setting `quizReactions: 'all' | 'minimal' | 'off'` (add to user preferences).
- Audio defaults off; toggle in settings.

### Phase 4 — Wire reactions into quiz player (Week 5)

- `QuizViewer.tsx` tracks `correctStreak` + `wrongStreak` locally during a session.
- On each answer, fires reaction events into `<QuizReactionLayer />`.
- On quiz finish, computes percentage; if 100%, fires perfect-score reaction; if part of a path checkpoint, fires checkpoint reaction.
- Hint surfaces: when wrong streak hits 3, the existing `hint` field for the question (already in schema) gets auto-revealed with mascot suggesting it.

This phase is small but unlocks the wow-factor — should land before Phase 5 so the user can demo the new feel without the path UI yet.

### Phase 5 — Learn Path: gating + checkpoints (Week 6)

**Schema additions:**
- `StudyPhase`: add `gateStrategy: GateStrategy @default(open)` enum (`open | sequential | checkpoint`).
- `StudyMaterial`: add `prerequisiteMaterialIds: String[]` (Postgres array). When non-empty and gate is sequential/checkpoint, server enforces `material.completed` is false unless all prerequisites are completed.
- New `CheckpointAttempt` model: `(id, phaseId, userId, score, percentage, passed, attemptedAt)` — pass threshold default 80%.

**Backend:**
- New `apps/web/app/api/study-plans/[planId]/phases/[phaseId]/unlock-status` route — returns `{ locked: bool, reason?: string }`.
- Update generation prompt (`STUDY_PLAN_TOOL`) to optionally emit `gateStrategy` and `prerequisiteMaterialIds`.
- Migration: existing study plans default to `gateStrategy='open'` (no breaking change).

**Frontend — Path UI** (the visual centerpiece):
- New route `apps/web/app/(dashboard)/learn/page.tsx`.
- New component `apps/web/src/components/learn/PathView.tsx` — renders one path top-to-bottom.
- Lesson nodes are circular buttons, alternating left/center/right horizontal positions for a "winding" feel without curved SVG paths in v1 (curved SVG is a polish item).
- Locked node = circular button with `hide-behind-hat-v2.png` mascot inside, `--surface-container-low` background.
- Unlocked-not-yet-started = node with material-type icon (Material Symbols: `quiz`, `style` for flashcards, `description` for pages).
- Completed node = filled with `--primary` color, checkmark icon.
- Active node (next available) = pulsing `--primary` ring (animate `transform`/`opacity` only, per CLAUDE.md).
- Checkpoint node at end of phase = larger, uses `graduation` mascot.
- No gradients.

**Promotion bits start here:** the Learn route exists but isn't in the sidebar yet. That's Phase 6.

### Phase 6 — Promotion / nav surfaces (Week 7)

- Add `{ href: '/learn', label: 'Learn', icon: 'school' }` to `Sidebar.tsx` navLinks. Position above "Notebooks".
- Dashboard hero card: "Continue your path" — `apps/web/src/components/features/PathHeroCard.tsx`. Shows current phase, % complete, big CTA button.
- Onboarding: when a new user finishes their first notebook upload, prompt "Generate a learn path?" — calls existing `STUDY_PLAN_TOOL` flow with the new `gateStrategy='sequential'` default.
- Native shell: the `/learn` route works inside iOS WebView. No `isInsideNativeShell()` guard needed for the Learn route itself (it's an authed surface, not a marketing one). But verify the path renders correctly at iPhone viewport.

### Phase 7 — Achievements + polish (Week 8)

New achievements (add to `achievements.ts`):
- `perfect_quiz` — first 100% on a quiz with ≥5 questions
- `streak_10_in_a_row` — 10 correct answers in a row in a single session
- `phase_complete` — first phase finished
- `path_complete` — first full path finished
- `checkpoint_ace` — pass a checkpoint with 100% on first try
- `comeback` — 5 right in a row after a 3-wrong streak

Each links to existing cosmetic catalog (titles, frames, backgrounds) — no new cosmetic types.

Polish:
- Sound design pass (if you opted in for audio).
- Reduced-motion full audit.
- Telemetry: new events `quiz.streak_hit`, `quiz.perfect`, `path.phase_completed`, `path.checkpoint_passed`.
- Remove `requiredLevel` from cosmetic catalog (flagged for "future polish PR" elsewhere; this is that PR).

---

## What you do (user) vs what agents code

### Your queue

#### Commissioning checklist
The 25 existing PNGs in `apps/web/public/mascot/` cover most reactions. Specifically reused:
- `celebrate-v2.png` — perfect-score + cheer-big
- `bow-v2.png`, `wink-v2.png` — small streak cheers
- `thinking-v2.png` — wrong-streak warning
- `sad-v2.png` — wrong-streak comfort
- `graduation-v2.png` — checkpoint complete
- `hide-behind-hat-v2.png` — locked-lesson icon

**Possibly need new (decide after seeing Phase 4 in action):**
- A higher-energy "fist-pump" pose for streak-7+ if `celebrate` feels repetitive at scale.
- A motion-loop variant of `celebrate` if static-PNG-with-CSS-bounce feels flat for the perfect-score full-overlay moment. (Tech change: would require Lottie or Rive — flag this as a Phase 7 optional rather than v1.)

**Confirm with the team:**
- `celebrate` and `sad` were noted as "dropped from new commissions." Are they still usable as-is, or do they need re-commissioning? Phase 3 depends on this.

#### Copywriting checklist
Draft (or use AI to draft, you review) and drop into a single file `apps/web/src/lib/quiz-reactions-copy.ts`:
- 12–20 streak messages (small/mid/big tiers, 4–6 each)
- 8–10 perfect-score messages
- 8–10 wrong-streak comfort messages
- 6–8 checkpoint-pass messages
- 3–4 path-complete messages
- Lock-state copy ("Complete the previous lesson to unlock")

#### Sound checklist (if you opt in)
Five SFX files in `apps/web/public/sounds/`:
- `correct.mp3` (~0.4s ding)
- `wrong.mp3` (~0.4s subtle buzz, not punishing)
- `streak-soft.mp3` (~0.7s woosh)
- `streak-big.mp3` (~1.5s sparkle/chime)
- `checkpoint.mp3` (~2s celebration)

Royalty-free options: Freesound, Pixabay. Keep volume normalized to -14 LUFS.

#### Decisions you need to make (decision points)
1. **Path visual fidelity** — v1 default: alternating-position vertical strip, no curved SVG paths. Curved SVG is Phase 7 polish. Confirm or override.
   - **Recommendation:** keep default. Curved SVG with proper hit-testing is a 1–2 day rabbit hole; the static strip reads as a "path" at real sizing without it.
2. **Sound effects in v1** — default: opt-in, off by default. Confirm or override.
   - **Recommendation:** keep default. Respects users in shared spaces and matches the no-auto-dev-server stance already established for this repo.
3. **Translation question type** — Phase 2A or 2B? If you have language-learning users this should be 2A.
   - **Decided 2026-05-11: Phase 2A.** Translation ships alongside fill-blank / word-bank / match-pairs as the 4th type in the first batch. 4 agents in parallel for 2A; Phase 2B narrows to sentence-reorder + equation-entry.
4. **Existing study plans** — default: keep `gateStrategy='open'` for legacy plans (no breaking change). New plans default to `'sequential'`. Confirm or override.
   - **Recommendation:** keep default. Zero-breaking-change for existing users; the gated experience starts from the next plan they generate.
5. **Migration of existing MC quizzes** — default: rows stay in same table, get `kind='mc'`, `payload=null` for one release; backfilled to `payload` in Phase 7. Confirm or override.
   - **Recommendation:** keep default. Lets Phase 1 ship without a blocking backfill; legacy `options` + `correctIndex` reads keep working in the renderer registry until Phase 7 cleans them up.
6. **Path scope** — one path per notebook (current StudyPlan model) or one global path per user merging all active plans? Default: per-notebook. Per-user is a bigger product call.
   - **Decided 2026-05-12: cross-notebook, now.** `StudyPlan.notebookId` is nullable; a new `contextNotebookIds` array lets a single path draw materials from multiple notebooks. Implementation reference: [personal-duolingo-rework-phase-9.md](personal-duolingo-rework-phase-9.md).
   - **Recommendation:** keep default (per-notebook). Maps cleanly onto the existing `StudyPlan → Notebook` relation and ships fastest; per-user global is a real product question that fits a later phase.
7. **Drag-drop lib** (from the second decision list) — default: `@dnd-kit/core`.
   - **Recommendation:** keep default. Touch support out of the box, ESM-clean, well-maintained — fits the word-bank renderer in Phase 2A and the desktop-mobile parity goal.

### Agent queue

| Phase | Agents | Parallelizable? | Blocks |
|---|---|---|---|
| 0 | none | — | Phase 1 (you must clear blockers + decide) |
| 1 | 1 | no | All later phases |
| 2A | 3 | yes (one per type) | Phase 4 (reactions need types to exist) |
| 2B | 1–3 | yes | none (optional) |
| 3 | 1 | yes (parallel to 2A/2B) | Phase 4 |
| 4 | 1 | no (sequential after 1+2A+3) | Phase 5 (path uses reactions) |
| 5 | 1–2 | partial (schema vs UI can split) | Phase 6 |
| 6 | 1 | no | Phase 7 |
| 7 | 1 | yes (sub-tasks parallel) | done |

Total: 5 sequential bottlenecks (Phase 1 → 4 → 5 → 6 → 7). The wide work is in 2A, 2B, 3 — those are where 3+ agents can run at once.

---

## Decision points (defaults assumed — call out if wrong)

1. Question payload model: single `QuizQuestion` table with `kind` discriminator + `payload Json`. Zod-validated server-side. (Alt: separate per-type tables.)
2. Path style: vertical alternating-position strip in v1, curved SVG path in Phase 7 polish. (Alt: flat list, or curved path immediately.)
3. Study plans: extend in place; legacy plans stay open-gated. (Alt: build a new "Learn" feature alongside, deprecate StudyPlan separately.)
4. Audio: opt-in, off by default for v1.
5. MC migration: ported in same table with `kind='mc'`. (Alt: separate `legacy_quiz_questions` table.)
6. Drag-drop lib: `@dnd-kit/core` (touch-friendly, well-maintained). (Alt: native HTML5 drag with custom touch shim.)
7. Path scope: ~~per-notebook~~ — **Decided 2026-05-12: cross-notebook, now.** See Phase 9 plan and Decision Point #6 above.

---

## Critical files to modify

| Concern | File |
|---|---|
| DB schema | `apps/web/prisma/schema.prisma` |
| Shared types | `packages/shared/src/quiz.ts` (new), `packages/shared/src/index.ts` |
| AI tool | `apps/web/src/lib/ai-tools.ts` (add `QUIZ_TOOL_V2`) |
| Quiz player dispatcher | `apps/web/src/components/notebook/QuizViewer.tsx` |
| Question renderers | `apps/web/src/components/quiz/questionRenderers/*.tsx` (new dir) |
| Grading | `apps/web/src/lib/quiz-grading.ts` (new), `app/api/notebooks/[id]/quiz-sets/[setId]/attempts/route.ts` |
| Reaction engine | `apps/web/src/lib/quiz-reactions.ts` (new) |
| Reaction overlay | `apps/web/src/components/quiz/QuizReactionLayer.tsx` (new) |
| Mascot extensions | `apps/web/src/components/mascot/Mascot.tsx`, `poses.ts`, `mascot.module.css` |
| Path route | `apps/web/app/(dashboard)/learn/page.tsx` (new) |
| Path UI | `apps/web/src/components/learn/PathView.tsx` (new) |
| Path API | `apps/web/app/api/study-plans/[planId]/phases/[phaseId]/unlock-status/route.ts` (new) |
| Sidebar | `apps/web/src/components/layout/Sidebar.tsx` |
| Dashboard hero | `apps/web/src/components/features/PathHeroCard.tsx` (new), wired into `app/(dashboard)/dashboard/page.tsx` |
| Achievements | `apps/web/src/lib/achievements.ts` |
| Reaction copy bank | `apps/web/src/lib/quiz-reactions-copy.ts` (new) |

Existing utilities to reuse:
- `apps/web/src/lib/streaks.ts` — `updateStreak()` and the milestone pattern; mirror in `quiz-reactions.ts` for in-quiz streaks.
- `apps/web/src/lib/achievement-checker.ts` — `checkAndUnlockAchievements()` is already called on `GET /api/user/achievements`; new badges integrate automatically.
- `apps/web/src/components/mascot/Mascot.tsx` — `oneShot` mechanic with `animationend` listener (lines 81–113) is exactly what reaction overlays need; extend, don't replace.
- `apps/web/src/lib/anthropic.ts` — Claude Haiku client config; reuse for Quiz V2 generation.

Design system rules to apply throughout:
- Inline `style={{}}` with CSS custom properties (`var(--primary)`, `var(--surface-container)`, etc.) — not Tailwind utilities.
- Material Symbols Outlined for all icons.
- No gradients.
- Spring easing `cubic-bezier(0.22, 1, 0.36, 1)` 0.35s; only animate `transform` + `opacity`.
- Surface hierarchy: lesson cards on `surface-container`, hovered nodes on `surface-container-high`.

---

## Verification plan

**Per-phase, before merging:**
- `pnpm -r typecheck` clean.
- Read changed files end-to-end (no helper-presence assumptions).
- For UI work: run `pnpm dev:web`, manually exercise the flow in Chrome at desktop + mobile widths. (Don't auto-`preview_start` — type-check + manual is the bar unless explicitly asked.)
- For schema changes: prisma migration dry-run + apply on dev DB.
- iOS WebView smoke test for any drag-drop or full-overlay reaction (Phase 2A, Phase 4).

**End-to-end at the close of each major slice:**
- After Phase 1: existing quiz flows unchanged. Old quizzes still grade. New quizzes generated by V2 tool render as MC. (Regression bar.)
- After Phase 4: take a quiz; verify all reactions fire on the right triggers; verify reduced-motion respect; verify wrong-streak hint reveal.
- After Phase 5: navigate to `/learn`; verify locked nodes can't be opened via direct URL (server `unlock-status` check). Pass a checkpoint; verify next phase unlocks.
- After Phase 7: all new achievements trigger on their conditions; cosmetic unlocks fire via `unlockCosmeticsForAchievement()`.

**iOS shell coverage** (run before each phase that touches user-facing surfaces):
- Drag-drop questions usable with touch only.
- Mascot overlays don't block essential controls in viewport.
- `/learn` route reachable from sidebar inside the WebView (no landing-page detour).

---

## Phase 0 starter checklist (what to do first, in order)

A clean ordered task list for you to work through right now:

1. **Clear pre-flight blockers** (do these before Phase 1 code starts):
   - Deploy current `main` to prod.
   - Run `npx tsx apps/web/scripts/backfill-cosmetics-from-levels.ts --dry-run`, then for real.
   - Confirm backfill succeeded in prod DB.
   - Drop `User.xp` and `User.level` columns via Prisma migration.
   - Delete `apps/web/scripts/backfill-cosmetics-from-levels.ts` and the empty `scripts/` dir.
2. **Confirm mascot pose strategy:** decide whether `celebrate-v2.png` and `sad-v2.png` are usable as-is for Phase 3. (Recommendation: yes, ship Phase 3 with them; re-commission later if they feel off in context.)
3. **Answer the six Decision points** above (path fidelity, sound, translation priority, legacy gating, MC migration, path scope). Drop answers in this doc when you have them.
4. **Start commissioning** (only if you decided to re-commission celebrate/sad, or want the optional fist-pump pose).
5. **Start copy bank.** Use Claude to draft, you edit for tone. Save to `apps/web/src/lib/quiz-reactions-copy.ts` (file doesn't exist yet — agent will pick it up wired in Phase 3).
6. **Source sounds** (if you opted in).
7. **Greenlight Phase 1** — tell me to start agents on the question-engine refactor.
