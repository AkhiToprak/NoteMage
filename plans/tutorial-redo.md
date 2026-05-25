# Tutorial / Intro Tour Redo — Plan

Status: **Implemented — Phases A, B, C shipped** (2026-05-24)

## Expansion (2026-05-25) — full-app tour, device-aware

The tour was too short (only menu → tabs → paths → chats). It now walks the
whole surface. **Spotlight sequence:**

`welcome → dashboard → nav-menu → search → timer → profile* → notebooks** → learn-tabs → learn-paths → learn-community → learn-chats → cowork → complete`

Some steps **navigate to a dedicated page and spotlight its contents** rather
than just poking the header: `dashboard` (stats row), `profile` (routes to
`/profile`, spotlights the **whole** profile column — header, about, appearance,
socials, activity, trophies — with a corner-docked tooltip), `notebooks` (routes
to `/notebooks`), `cowork` (routes to `/groups` — the Co-Work hub, the social
capstone of the tour). The header tools (`nav-menu`, `search`, `timer`) stay on
`/dashboard`.

\* `profile` opens `/profile` so the user actually sees the page (bio, socials,
the cosmetics studio) — not just the avatar button.
\** `notebooks` is **desktop-only** — dropped on phones (authoring isn't the
phone job; `profile.next` branches to `learn-tabs` there). The sequence is built
by `getTourSteps(isPhone)` in `steps.ts`, and must stay in lockstep with the
`next` chain in `getStepConfig(step, isPro, isPhone)`. `isPhone` comes from
`useBreakpoint` in `TutorialProvider` and is exposed on `TutorialContext`.

New anchors (`data-tutorial`): `dashboard` (stats row on `/dashboard`), `search`,
`timer` (global header `HomeHeader.tsx`), `profile` (the whole `/profile` page
container — **not** the header avatar, **not** just one card), `notebooks` (Import-PDFs button on
`/notebooks`), `learn-community` (header block on `/learn/community`), `cowork`
(the "Co-Work" header on `/groups`). New step
ids added to `VALID_STEPS` (API), `ACTIVE_RESUMABLE_STEPS` + `start()`
(provider), and the `TutorialStep`/`TutorialTargetKey` unions. `TOUR_STEPS`
(const) → `getTourSteps` (fn). Completed users are still **not** re-triggered —
re-test via Settings → Welcome tour → Re-take.

## Implementation notes (deviations from the draft)

- **Nav anchor.** The app has no persistent sidebar (`Sidebar.tsx` is dead code); the real nav is a **burger drawer** opened from `HomeHeader`. So the two planned sidebar steps (`nav-notebooks`, `nav-learn`) were collapsed into a single **`nav-menu`** step that spotlights the always-visible burger button. `learn-tabs` targets `/learn/paths` (the tab strip is hidden on the `/learn` index).
- **Anchors** are plain `data-tutorial="<key>"` attributes (burger button, `/learn` tab nav, "New path", "New chat"); `getTarget` falls back to `document.querySelector`, and the overlay polls + floats the tooltip if an anchor never mounts (e.g. the collapsed chats rail on phone).
- **Final step set:** `welcome → nav-menu → learn-tabs → learn-paths → learn-chats → complete`, with progress dots and active `router.push` between steps.
- **Upgrade CTA** points at `/pricing` (matches `UpsellToast`), avoiding a web checkout fired inside the iOS shell.

## Why

The first-run tour is stale. It teaches the old notebook-centric flow (create a
notebook → ask the Mage a question), but the app restructured: paths, flashcards,
quizzes, and chats now live in the **`/learn` hub**, independent of notebooks.
Two of the current steps target anchors (`notebook-form`, `chat-modal`) that are
no longer reliably wired. And it's tier-blind — a FREE user is walked toward
features they can't use (AI path generation is PRO-only), with no framing of
what Pro unlocks.

## What we keep

The tour *infrastructure* is good — reuse it, don't rebuild it:

- `TutorialProvider.tsx` — state machine, per-user localStorage + server sync, auto-fire on `/dashboard`.
- `WelcomeModal.tsx`, `TutorialOverlay.tsx` (spotlight), `TutorialTooltip.tsx`, `CompletionModal.tsx`.
- Server tracking: `User.tutorialState` ({ step, completedAt, dismissedAt }), `PATCH /api/user/tutorial`, `POST /api/user/tutorial/complete`.

We replace the **step set**, make it **tier-aware**, and add **stable anchors** on the new surfaces.

## New step sequence (tier-aware)

Auto-fires on `/dashboard` after onboarding, as today. Skippable at every step.

| # | Step | Target | FREE copy | PRO copy |
|---|------|--------|-----------|----------|
| 1 | Welcome modal | — | "Your study setup in 60 seconds." | same |
| 2 | Notebooks | sidebar `nav-notebooks` | "Your imported PDFs live here as notebooks — your source material." | same |
| 3 | Learn hub | sidebar `nav-learn` | "This is where you study — everything's generated from your notebooks." | same |
| 4 | Learn tabs | `/learn` tab bar | "Flashcards, Quizzes, and Chats, all from your material." | "Paths, Flashcards, Quizzes, and Chats." |
| 5 | Paths (tier branch) | path CTA | **Upsell:** "Study Paths are a Pro feature. On Free you can explore Community paths here — upgrade to generate your own." | "Turn any notebook into a Duolingo-style path." |
| 6 | Chats | `learn-new-chat` | "Ask the Mage across your notebooks — 50 messages on Free." | "Ask the Mage anything, unlimited." |
| 7 | Completion | — | Recap card: **"What Pro unlocks"** (own paths, unlimited cards/quizzes/chat, inline AI edit) + Upgrade button. | Achievement celebration (as today). |

"What you're missing" is shown two ways for FREE: inline at step 5 (the path
upsell) and as the completion recap. Both reuse the existing `UpsellToast` /
`TierBadge` visual language — no new walls, just framing.

## Anchors to add (convention: `data-tutorial="<key>"`)

- `nav-notebooks`, `nav-learn` → `Sidebar.tsx` nav links
- `learn-tabs` → `/learn/layout.tsx` tab bar
- `learn-generate-path` → path-creation CTA on `/learn/paths`
- `learn-new-chat` → new-chat CTA on `/learn/chats`

## Tier detection

`session.user.tier === 'PRO'`. `TutorialProvider` selects the FREE or PRO step
config at start; the chosen tier is recorded so it doesn't flip mid-tour.

## Tracking / migration

- Extend `VALID_STEPS` in `PATCH /api/user/tutorial` + the `steps.ts` config with the new step ids.
- New step ids mean existing `tutorialState` rows with `completedAt` stay complete — they won't see the new tour. **No re-trigger for existing users** (locked decision 3), so no migration needed.

## Locked decisions

1. **Route-stepping: ACTIVE.** The tour navigates the user `/dashboard` → `/learn` as it advances. `TutorialProvider` drives `router.push` between steps; each step waits for its target anchor to mount before spotlighting.
2. **FREE upsell: SUBTLE.** Inline "Pro" tags during the tour (reusing `TierBadge` language) + one "What Pro unlocks" recap card at completion with an upgrade button. No dedicated comparison screen.
3. **Audience: NEW SIGNUPS ONLY.** Anyone with a completed/dismissed tutorial is left alone.

## Phasing (build order)

- **A — Core:** add anchors (`nav-notebooks`, `nav-learn`, `learn-tabs`, `learn-generate-path`, `learn-new-chat`); tier-aware step config in `steps.ts`; active route-stepping in `TutorialProvider`; new copy. Tour works end-to-end for both tiers.
- **B — Free upsell:** the path upsell step (tier branch) + completion "What Pro unlocks" recap wired to the upgrade flow.
- **C — Polish:** spotlight on the tab bar, `prefers-reduced-motion`, completion achievement parity with today's behavior.
