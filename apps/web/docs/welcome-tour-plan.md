# Welcome Tour for First-Run Users

## Context

**Problem.** Users repeatedly say the app is "confusing at first." The existing pre-app `OnboardingWizard` (account → tier → avatar → scholar name → goals) collects data but doesn't *teach* the app — once registration completes, users land on `/dashboard` with no guidance for creating their first notebook or chat.

**Solution.** A skippable, spotlight-style guided tour that auto-fires on the first `/dashboard` load after registration and walks the user through:

1. Creating their first notebook
2. Opening it
3. Starting their first AI chat

On completion the user receives **50 XP** (placeholder — review against existing `XP_REWARDS` scale) and unlocks the **Apprentice Mage** achievement, hooking into the existing systems in `src/lib/xp.ts` and `src/lib/achievements.ts`.

**Decisions locked in from conversation:**

- Approach: spotlight guided tour with sequential tooltips
- Coverage: notebook → first chat (not full feature surface)
- Force level: always skippable; re-launchable from `/settings`
- Reward: XP + achievement
- Mascot: none — wordmark + Material icons only
- Native shells: yes (web + iOS WebView + Electron)
- Re-launch entry: row in `/settings` (account section)
- Trigger timing: assumed **on first `/dashboard` load** (recommended default — your prior answer landed on the wrong question; confirm before implementation)

**Decisions made on your behalf (easy to override during implementation):**

- XP amount: 50 (placeholder; verify against `XP_REWARDS` in `src/lib/xp.ts:5–18`)
- Achievement badge name: `apprentice_mage`
- Step-1 → step-2 mechanic: dashboard CTA appends `?tutorial=1` so `/notebooks` auto-opens the form modal (consistent with the existing `?new=1` pattern in `UnifiedSidebar`)

## Architecture

### Tour state machine

States: `'idle' | 'welcome' | 'step-1-dashboard' | 'step-2-notebook-form' | 'step-3-workspace' | 'step-4-chat-modal' | 'complete'`

Auto-advance rules:

- `welcome` → user clicks "Take the tour" → `step-1-dashboard`
- `step-1-dashboard` → user clicks the spotlighted "Create Notebook" CTA → navigates to `/notebooks?tutorial=1` → form auto-opens → `step-2-notebook-form`
- `step-2-notebook-form` → `POST /api/notebooks` succeeds → router pushes `/notebooks/[newId]` → `step-3-workspace`
- `step-3-workspace` → user clicks the spotlighted "+ chat" button in `UnifiedSidebar` → modal opens via existing `?new=1` → `step-4-chat-modal`
- `step-4-chat-modal` → chat creation submits successfully → `complete` (show celebration modal, fire XP/achievement API)

Skip available everywhere: `Esc`, visible Skip button, and clicking outside the spotlighted area shows a "Skip tour?" confirmation.

### State persistence

- New Prisma column on `User`: `tutorialState Json? @default("{}")` storing `{ step: string, completedAt?: ISO, dismissedAt?: ISO }`
- Mirror in `localStorage` (`notemage-tutorial`) for fast pre-session hydration (same pattern as theme via `ThemeContext`)
- API:
  - `PATCH /api/user/tutorial` — update step / dismissedAt
  - `POST /api/user/tutorial/complete` — mark complete, award XP, check achievements

### Cross-page persistence

`TutorialProvider` lives in `app/(dashboard)/layout.tsx`, above all dashboard routes. Tour state persists across navigation between `/dashboard`, `/notebooks`, and `/notebooks/[id]/...`. Each route's relevant components register DOM refs via `useTutorialTarget(stepKey)`; the overlay reads the active target ref and re-positions on scroll/resize.

### Spotlight rendering

Backdrop is a "frame" of four `position: fixed` divs (top/bottom/left/right of the cutout rect) with `background: rgba(0,0,0,0.65)` and `backdropFilter: blur(2px)`. This avoids `mask-image` / `clip-path` compatibility quirks and renders predictably in iOS WKWebView.

Tooltip is a single fixed-position card; placement (top/bottom/left/right of the cutout) is computed to fit viewport. Spring easing `cubic-bezier(0.22, 1, 0.36, 1)` over 0.35s on transform + opacity only (per project rules — no `transition-all`, no gradients).

### XP & achievement plumbing (reuse, do not recreate)

- `awardXP(userId, action)` — `src/lib/xp.ts:41–78` — already returns `{ newXP, newLevel, leveledUp }` and chains into achievements
- `checkAndUnlockAchievements(userId)` — `src/lib/achievement-checker.ts`
- Add `tutorial_complete: 50` to `XP_REWARDS` in `src/lib/xp.ts`
- Add `apprentice_mage` badge to `src/lib/achievements.ts`
- Add unlock condition in `src/lib/achievement-checker.ts`: when `User.tutorialState.completedAt` is set, unlock `apprentice_mage`
- `POST /api/user/tutorial/complete` calls both helpers in sequence

## Files

### Create

- `apps/web/src/components/tutorial/TutorialProvider.tsx` — context, state machine, persistence hooks, auto-fire logic
- `apps/web/src/components/tutorial/TutorialOverlay.tsx` — portal, four-frame backdrop, click-outside handler
- `apps/web/src/components/tutorial/TutorialTooltip.tsx` — positioned card with copy + Skip/Next buttons
- `apps/web/src/components/tutorial/useTutorialTarget.ts` — `(stepKey) => ref` hook for components to register as spotlight targets
- `apps/web/src/components/tutorial/WelcomeModal.tsx` — first-run greeting; wordmark hero + [Take the tour] / [Explore]
- `apps/web/src/components/tutorial/CompletionModal.tsx` — celebration; "+50 XP" + Apprentice Mage badge
- `apps/web/src/components/tutorial/steps.ts` — step config (keys, tooltip titles, copy)
- `apps/web/app/api/user/tutorial/route.ts` — `PATCH` state
- `apps/web/app/api/user/tutorial/complete/route.ts` — `POST` completion

### Modify

- `apps/web/prisma/schema.prisma` — add `User.tutorialState Json?` (Prisma migration required)
- `apps/web/src/lib/xp.ts` — add `tutorial_complete: 50` to `XP_REWARDS`
- `apps/web/src/lib/achievements.ts` — add `apprentice_mage` constant + display metadata
- `apps/web/src/lib/achievement-checker.ts` — add tutorial unlock condition
- `apps/web/app/(dashboard)/layout.tsx` — wrap children in `<TutorialProvider>`
- `apps/web/app/(dashboard)/dashboard/page.tsx` — register the "Create Notebook" CTA (lines 1320–1401) as `useTutorialTarget('dashboard-cta')`; append `?tutorial=1` to the link's `href` when tour is active at step 1
- `apps/web/app/(dashboard)/notebooks/page.tsx` — read `?tutorial=1` from search params; auto-open `NotebookForm` modal on mount when present; register the modal as `useTutorialTarget('notebook-form')`
- `apps/web/src/components/features/NotebookForm.tsx` — surface an `onSuccess(newNotebook)` prop so the tour can advance after creation
- `apps/web/src/components/notebook/UnifiedSidebar.tsx` (around line 2141) — register the "+ chat" `<Link>` as `useTutorialTarget('chat-create')`
- `apps/web/src/components/notebook/CreateChatModal.tsx` — register modal as `useTutorialTarget('chat-modal')`; surface `onSuccess` to advance to `complete`
- `apps/web/app/(dashboard)/settings/page.tsx` — add "Welcome tour" row in the `account` section with a [Re-take tour] button that calls a `restart()` method on `TutorialProvider`
- `apps/web/src/types/next-auth.d.ts` — extend `Session.user` with `tutorialState` for SSR hydration

### Reuse (do NOT recreate)

- `awardXP()` from `src/lib/xp.ts:41–78`
- `checkAndUnlockAchievements()` from `src/lib/achievement-checker.ts`
- Existing CSS vars (`--primary` `#ae89ff`, `--surface-container`, `--on-surface`) and the spring easing class `.transition-spring` in `globals.css:323–327`
- Existing modal pattern (custom inline `position: fixed` + backdrop) — no Radix/shadcn
- Existing `?new=1` pattern in `UnifiedSidebar` — the tour piggy-backs on it for step 3 → step 4
- Existing `isInsideNativeShell()` from `src/lib/native-bridge.ts:246–248` (no changes needed; tour just runs)

## Icons

All Material Symbols Outlined (already loaded in project) — no custom icons needed for v1:

- `arrow_forward` — Next button
- `close` — Skip / dismiss
- `check_circle` — completion modal
- `auto_awesome` — welcome modal hero, completion sparkle
- `school` — Apprentice Mage badge graphic
- `tour` — settings re-launch row icon

Wordmark from `brand_assets/`: shown in the welcome modal hero and the completion modal.

**If you want to upgrade the polish later:** custom illustrations for the welcome/completion hero areas (a wizard's hat, an open spellbook with sparkles, a mage celebrating) would warm up the tour. Optional — not blocking v1.

## Phasing

**Phase 1 — scaffold (localStorage only)**

- Provider, overlay, tooltip, `useTutorialTarget` hook
- Welcome + completion modals
- Wire dashboard step + notebook form step
- Verify the tour fires on `/dashboard` and completes when a notebook is created

**Phase 2 — extend to chat**

- Register sidebar "+ chat" button + `CreateChatModal` as targets
- Wire step 3 → step 4 → complete
- Verify full tour completes through chat creation

**Phase 3 — persistence + reward**

- Prisma migration for `User.tutorialState`
- `/api/user/tutorial` and `/api/user/tutorial/complete` routes
- Wire XP + achievement
- Add settings re-launch row
- Verify state persists across devices; +50 XP and Apprentice Mage unlock on completion

**Phase 4 — native shells + polish**

- Verify in iOS WebView (Expo dev build) and Electron
- Safe-area insets for iOS modals
- Final pass on copy tone, animation timing, mobile layouts

## Verification

After implementation, walk a fresh test user through:

1. Sign up; complete the existing 5-step `OnboardingWizard`
2. Land on `/dashboard` — confirm welcome modal appears with wordmark + [Take the tour] / [Explore]
3. Click [Take the tour] — confirm spotlight on the "Create Notebook" empty-state CTA at lines 1320–1401
4. Click the CTA — confirm route changes to `/notebooks?tutorial=1`, `NotebookForm` modal auto-opens spotlighted
5. Fill the form, submit — confirm route changes to `/notebooks/[newId]`, spotlight advances to the "+ chat" button in `UnifiedSidebar`
6. Click "+ chat" — confirm `CreateChatModal` opens spotlighted
7. Fill and submit — confirm completion modal shows "+50 XP" and "Apprentice Mage unlocked"
8. Hard refresh — confirm welcome modal does NOT re-fire (state persisted server-side)
9. Open `/settings` → account section → click "Re-take tour" — confirm welcome modal reopens
10. Test on iOS WebView (Expo dev build) and Electron — confirm spotlight rectangles align with targets; safe-area insets respected on iOS notch
11. `pnpm --filter web typecheck` and `pnpm --filter web lint` — clean

Tooling note: no dev server for screenshots per memory rule. Verification is functional + manual on real device shells.

## Open items to confirm before implementation

1. **Trigger timing** — confirm "on first `/dashboard` load" (your earlier answer landed on the wrong question)
2. **XP amount** — review 50 against existing `XP_REWARDS` scale in `src/lib/xp.ts:5–18`
3. **Badge name** — `apprentice_mage` is a placeholder; alternatives: `first_steps`, `welcome_mage`, `initiate`
4. **Step 1 → 2 mechanic** — auto-open form via `?tutorial=1` query param, vs. spotlight the Add Notebook button on `/notebooks` and let the user click it themselves (more user-driven; less seamless)
