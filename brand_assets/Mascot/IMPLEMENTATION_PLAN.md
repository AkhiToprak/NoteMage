# Mascot Implementation Plan

Plan for shipping the NoteMage spellbook mascot across the web app: tour, onboarding, empty states, loading, errors, and celebrations. Grounded in the existing codebase — no animation libraries, Tailwind + CSS keyframes only, Next.js 16 / React 19.

---

## 2026-05-08 update — current state of truth

The pose set and integration approach changed since this doc was first written. Treat the sections below as historical context; the canonical set now lives in `apps/web/src/components/mascot/poses.ts`.

**Dropped from scope:** `celebrate` and `sad`. References to them in §2.3, §5.9, §5.11, and §6 are stale.

**Added (12 new poses, all commissioned and processed into `apps/web/public/mascot/`):**

- **Contextual sidebar set (5)** — `writing`, `painting`, `holding-flashcards`, `quizzing`, `chatting`. Drive the topbar/sidebar mascot lockup, tied to route + active notebook tab.
- **Hover pool (6)** — `wink`, `peek`, `shrug`, `bow`, `head-tilt`, `hide-behind-hat`. Random pose held while the user hovers the sidebar mascot; snaps back to the route pose on mouse-leave (option a — "alive companion who freezes in pose for you").
- **Empty state (1)** — `sleeping` (re-commissioned, replaces the earlier draft).

**New runtime pieces:**

- `useMascotContextPose()` — derives `{ pose, idle }` from `usePathname()` + the optional `useNotebookWorkspaceOptional()` accessor. Per-tab inside the notebook (text → `writing`, canvas → `painting`, flashcards → `holding-flashcards`, quiz → `quizzing`, chat → `chatting`, study plan → `holding-scroll`).
- `ContextualMascot` — wraps `Mascot` with the hover state machine: random pick from `HOVER_POSES` excluding the last shown, releases on `mouseleave`/`blur`.
- First-time `wave` on `/dashboard` is gated by `localStorage['notemage:mascot:dashboard-waved']` and lasts 4 s.

**Wired into:** `components/layout/HomeHeader.tsx` and `components/notebook/UnifiedSidebar.tsx` (the two surfaces that previously rendered the `(logo)NoteMage` lockup). The wordmark remains; only the leading icon was swapped.

**Asset processing notes:** sources arrived at 1254×1254 with no alpha (solid black background). Stripped via `magick … -fuzz 6% -fill none -floodfill +0+0 black …` from each corner, resized to 720×720, palette-quantized to 192 colors. Outputs sit at 30–65 KB per pose with intact alpha.

---

## 1. Goals

- One reusable `<Mascot />` component used everywhere — never `<img src="...">` inline.
- Ambient life (subtle motion) on every pose so the mascot never feels like a static sticker.
- One-shot animations (wand cast, confetti) triggered by user actions.
- Pose-to-surface mapping that's predictable: same moment → same pose, every time.
- Zero new heavy dependencies. Add `canvas-confetti` (3 KB gzipped, no deps) only if/when celebration moments ship.

---

## 2. Asset preparation

### 2.1 Move + rename

Source folder: `brand_assets/Mascot/` (private, design-only).
Destination: `apps/web/public/mascot/` (served).

| Source                | Destination                            | Status        |
| --------------------- | -------------------------------------- | ------------- |
| `default.png`         | `public/mascot/default.png`            | ship          |
| `wave.png`            | `public/mascot/wave.png`               | ship          |
| `pointing_left.png`   | `public/mascot/pointing-left.png`      | ship          |
| `pointing_right.png`  | `public/mascot/pointing-right.png`     | ship          |
| `holding_wand.png`    | `public/mascot/holding-wand.png`       | ship          |
| `thinking.png`        | `public/mascot/thinking.png`           | regen first   |
| `holding_scroll.png`  | `public/mascot/holding-scroll.png`     | regen first   |
| `holding_pen.png`     | `public/mascot/holding-pen.png`        | regen first   |
| `graduation.png`      | `public/mascot/graduation.png`         | regen first   |

Rename underscore → hyphen to match existing public-folder convention (`wand-cursor.svg`, `wand-white.png`).

### 2.2 Optimization pass

Each PNG is ~1 MB. That's too heavy for a tour overlay. Before copying:

- Run through `pngquant` or `squoosh` → target 80–120 KB per pose.
- Generate a `@2x` and `@1x` variant. Native size on screen is typically 96–160 px; current 1024×1024 is wasteful.
- Optional: WebP siblings (`default.webp`, etc.) — `next/image` handles format negotiation but a manual `webp` variant is a fallback.

### 2.3 Missing poses to commission

Add to the set before launch:

- **`celebrate.png`** — arms up, hat askew, sparkle burst. For tour completion + streak hits.
- **`sleeping.png`** — eyes shut, "Z" floating, slight head tilt. For empty states.
- **`sad.png`** — hat tipped over eyes, frown. For 404 / error pages.

### 2.4 Eyes-closed variants (optional, blink animation)

Eyes are baked into each PNG, so blinking requires either an SVG rebuild or eyes-closed variants. Recommended:

- For **default only**, generate `default-blink.png` (same image, eyes as flat lines).
- Swap `default.png` ↔ `default-blink.png` every 4–6 s with a 120 ms transition.

If an SVG version is ever produced, blinking becomes free across all poses and this section is obsolete.

---

## 3. The `<Mascot />` component

**Location:** `apps/web/src/components/mascot/Mascot.tsx`

### 3.1 Props

- `pose` — `'default' | 'wave' | 'pointing-left' | 'pointing-right' | 'holding-wand' | 'thinking' | 'holding-scroll' | 'holding-pen' | 'graduation' | 'celebrate' | 'sleeping' | 'sad'`. Required.
- `size` — `'sm' | 'md' | 'lg' | 'xl'` (e.g., 48 / 96 / 160 / 240 px). Default `md`.
- `idle` — `'none' | 'bounce' | 'float' | 'sway'`. Default `bounce`.
- `oneShot` — `'cast' | 'celebrate' | 'sparkle' | null`. Triggers a one-shot CSS animation via class toggle. When non-null, mounts a sibling effect element.
- `onOneShotEnd` — callback fired on `animationend` of the one-shot. Used to chain effects (e.g., trigger confetti when cast finishes).
- `flip` — `boolean`. Mirrors horizontally for cases where you have only `pointing-right` and need it inverted.
- `priority` — `boolean`. Passed to `next/image` for above-the-fold uses (welcome modal, splash).

### 3.2 Internals

- Uses `next/image` with explicit `width`/`height` from the size token.
- Wraps the image in a `<span>` that owns the ambient animation class (`mascot-bounce`, `mascot-float`, `mascot-sway`, or none).
- Sibling absolute-positioned `<span class="mascot-fx">` for one-shot effects (sparkle burst at fingertip, confetti origin point, wand-tip glow).
- All animations go through CSS classes — no inline `style` for transforms. Keeps JS overhead at zero for ambient motion.

### 3.3 File layout

```
apps/web/src/components/mascot/
├── Mascot.tsx              the component
├── mascot.module.css       all keyframes + classes
├── poses.ts                pose → asset path + recommended size + default idle
└── index.ts                barrel export
```

`poses.ts` is the single source of truth for which file each pose maps to. Changing the asset name later means editing one place.

---

## 4. Animation strategy

No `framer-motion`, no `react-spring` (verified in `package.json`). Two layers:

### 4.1 Ambient (CSS keyframes only)

These run forever once the element mounts. Apply via class on the wrapper.

| Class            | What it does                                                            | Duration |
| ---------------- | ----------------------------------------------------------------------- | -------- |
| `mascot-bounce`  | `translateY(0 → -3px → 0)` ease-in-out                                  | 2.4 s    |
| `mascot-float`   | `translateY` + slight `rotate(±0.6deg)` — for floating welcome moments  | 4.0 s    |
| `mascot-sway`    | `rotate(±1.2deg)` — for "thinking" / "scroll-reading" poses             | 3.2 s    |
| `mascot-sparkle` | Three sibling sparkle dots fade-in/out at staggered delays (0, 0.6, 1.2 s) | 2.0 s |
| `mascot-blink`   | Background-image swap on `default` only (see §2.4); 120 ms each phase   | 5.0 s loop |

All ambient classes use only `transform` and `opacity` per CLAUDE.md anti-generic rules. No `transition-all`.

### 4.2 One-shot (class toggle + `animationend`)

These fire once when triggered, then clean up.

| Trigger                                  | Class added                | Effect                                                         | Duration |
| ---------------------------------------- | -------------------------- | -------------------------------------------------------------- | -------- |
| Wand cast (AI generation start)          | `mascot-cast`              | Wand-tip sparkle burst + slight forward tilt                    | 700 ms   |
| Tour complete / goal hit                 | `mascot-celebrate`         | Vertical hop + fires confetti via callback                      | 900 ms   |
| Tutorial step enter                      | `mascot-step-in`           | Slide up 12 px + fade 0 → 1                                     | 280 ms   |
| Tutorial step exit                       | `mascot-step-out`          | Slide down 8 px + fade 1 → 0                                    | 200 ms   |
| Pointer-target highlight pulse           | `mascot-pointer-pulse`     | Sibling pulse-dot scales 0 → 1 → 0 with low-opacity ring        | 1.6 s loop |

Implementation: `<Mascot oneShot="cast" onOneShotEnd={...} />` — internal `useEffect` adds the class on mount or on `oneShot` change, listens for `animationend`, removes class, fires callback.

### 4.3 Confetti

For `celebrate` only. Add `canvas-confetti` (3 KB gzipped, no deps).
- Fire from the mascot's bounding-box top-center on `mascot-celebrate` `animationend`.
- Use brand purple + the existing sparkle yellow as confetti colors. No gradients (per project memory).
- Single burst, not a loop. Particle count: 80. Spread: 70°.

### 4.4 What NOT to animate

- No frame-by-frame page-flip animation — it requires either Lottie or 8+ PNG frames per cycle. Skip; use `holding-wand` + sparkle pulse for "AI generating" loading instead.
- No skeletal rigging / Spine / Rive. Out of scope.
- No CSS `transition-all`. Per CLAUDE.md.

---

## 5. Pose catalog — when each appears, how it animates

### 5.1 default
- **Where:** any neutral surface — settings header, profile card, splash.
- **Idle:** `bounce`.
- **One-shot:** none.

### 5.2 wave
- **Where:** `WelcomeModal.tsx` (first frame, when user opens the tutorial).
- **Idle:** `float` (slightly more lift than bounce — entrance feel).
- **One-shot:** `step-in` on mount.

### 5.3 pointing-left / pointing-right
- **Where:** `TutorialTooltip.tsx` — the workhorse pose during tour spotlights.
- **Idle:** `bounce` + `pointer-pulse` on the fingertip overlay.
- **One-shot:** `step-in` on step change.
- **Logic:** if the spotlight target is to the right of the tooltip, use `pointing-right`; otherwise `pointing-left`. Compute from the tooltip's `placement` prop.

### 5.4 holding-wand
- **Where:**
  - AI generation in progress (quiz gen, summary, flashcard creation) — wherever there's currently a spinner attached to AI work.
  - The "magic happens here" tutorial step that introduces AI features.
- **Idle:** `bounce` + `sparkle` on the wand tip.
- **One-shot:** `cast` fires when the AI request resolves; `onOneShotEnd` triggers a brief sparkle burst before unmounting.

### 5.5 thinking
- **Where:**
  - `TierSelectionStep.tsx` (onboarding) — "take your time choosing".
  - Generic decision modals.
- **Idle:** `sway`.
- **One-shot:** none.
- **Note:** regenerate first (current expression reads as annoyed, not thoughtful).

### 5.6 holding-scroll
- **Where:**
  - `StudyGoalsStep.tsx` (onboarding) — daily minutes + 3 weekly targets.
  - "Goals" section of the dashboard.
- **Idle:** `sway`.
- **One-shot:** when a goal target is filled in, fire `mascot-step-in` on a tiny checkmark overlay near the scroll. (The mascot itself doesn't change pose — just the scroll gains a check.)
- **Note:** regenerate first (same expression issue as `thinking`).

### 5.7 holding-pen
- **Where:**
  - First-time empty notebook ("write your first note").
  - Possibly in `PageEditor.tsx` as a docked helper.
- **Idle:** `bounce`.
- **One-shot:** none.
- **Note:** regenerate first (most off-model — hat brim is wrong, mouth color shifted, sparkles missing).

### 5.8 graduation
- **Where:** `CompletionModal.tsx` — tour complete.
- **Idle:** `float` (single frame, hangs on the modal).
- **One-shot:** `celebrate` fires on mount → triggers confetti.
- **Note:** regenerate first (body proportions don't match `default`).

### 5.9 celebrate (to add)
- **Where:**
  - Streak hits (`StreakDisplay.tsx`).
  - Daily goal completed (`StudyGoalsStep.tsx` / dashboard).
  - Achievement unlock (`AchievementToast.tsx`).
- **Idle:** `bounce` (more energetic — shorter duration, larger amplitude, e.g., 1.6 s, 6 px).
- **One-shot:** `celebrate` on mount → confetti.

### 5.10 sleeping (to add)
- **Where:** empty states — empty notebook list, empty quiz history, empty trophy shelf (`TrophyShelf.tsx`).
- **Idle:** `sway` very slow (5 s).
- **One-shot:** none.

### 5.11 sad (to add)
- **Where:**
  - 404 / `not-found.tsx`.
  - Error boundaries.
  - Streak break notification ("you missed a day").
- **Idle:** `none` or very subtle `sway`.
- **One-shot:** none.

---

## 6. Surface-by-surface integration map

Each row says: which file gets edited, which pose is dropped in, what props.

| File                                                                  | Pose             | Size | Notes                                                  |
| --------------------------------------------------------------------- | ---------------- | ---- | ------------------------------------------------------ |
| `tutorial/WelcomeModal.tsx`                                           | `wave`           | lg   | First impression; `priority`, `idle="float"`           |
| `tutorial/TutorialTooltip.tsx`                                        | `pointing-*`     | sm   | Direction derived from `placement` prop                |
| `tutorial/CompletionModal.tsx`                                        | `graduation`     | lg   | `oneShot="celebrate"` → confetti                       |
| `onboarding/AccountStep.tsx`                                          | `wave`           | md   | Header decoration                                      |
| `onboarding/UsernameStep.tsx`                                         | `holding-pen`    | md   | "Pick your name"                                       |
| `onboarding/AvatarStep.tsx`                                           | `default`        | md   | Neutral                                                |
| `onboarding/TierSelectionStep.tsx`                                    | `thinking`       | md   | "Take your time"                                       |
| `onboarding/PaymentStep.tsx`                                          | `holding-scroll` | md   | Receipt feel                                           |
| `onboarding/ScholarNameStep.tsx`                                      | `default`        | md   |                                                        |
| `onboarding/StudyGoalsStep.tsx`                                       | `holding-scroll` | md   | Goal-setting; primary fit                              |
| Final onboarding step / completion                                    | `graduation`     | lg   | Reuse `mascot-celebrate` flow                          |
| `features/StreakDisplay.tsx`                                          | `celebrate`      | sm   | Show only when streak ≥ 3 days                         |
| `features/AchievementToast.tsx`                                       | `celebrate`      | sm   | One-shot per toast                                     |
| `features/RecentTrophies.tsx` empty branch                            | `sleeping`       | md   |                                                        |
| `features/TrophyShelf.tsx` empty branch                               | `sleeping`       | md   |                                                        |
| `features/DocumentList.tsx` empty branch                              | `sleeping`       | md   |                                                        |
| `notebook/PageEditor.tsx` empty editor (first time)                   | `holding-pen`    | sm   | Tucked into corner                                     |
| AI generation loading wrappers (search for spinner usage near AI APIs)| `holding-wand`   | sm   | `idle="bounce"` + sparkle; `oneShot="cast"` on resolve |
| `app/not-found.tsx` (or equivalent)                                   | `sad`            | xl   |                                                        |
| Error boundary / `error.tsx`                                          | `sad`            | lg   |                                                        |

---

## 7. Implementation phases

Order matters — each phase is shippable on its own and unblocks the next.

### Phase 1 — Component scaffold
- Create `components/mascot/` with `Mascot.tsx`, `mascot.module.css`, `poses.ts`, `index.ts`.
- Implement props, ambient classes (`bounce`, `float`, `sway`), and `next/image` wrapper.
- Wire `pointer-pulse` overlay (sibling element).
- No one-shot logic yet.

### Phase 2 — Tutorial integration
- Drop `Mascot` into `WelcomeModal`, `TutorialTooltip`, `CompletionModal`.
- Compute pointer direction from `placement` in `TutorialTooltip`.
- Add `step-in` / `step-out` one-shot animations.

### Phase 3 — Onboarding integration
- Add `Mascot` headers to all 7 onboarding steps with the mapped poses.
- `StudyGoalsStep` gets the scroll-checkmark micro-interaction.

### Phase 4 — One-shots + confetti
- Implement `oneShot` prop logic (class toggle, `animationend` cleanup, callback).
- Add `canvas-confetti` to `package.json`. Wire into `mascot-celebrate` finale.
- Hook `holding-wand` into AI-generation surfaces (search for spinner-near-AI usages).

### Phase 5 — Empty + error states
- Wire `sleeping` into the four empty-state files.
- Wire `sad` into `not-found` and `error` boundaries.

### Phase 6 — Polish
- Add `default-blink.png` and `mascot-blink` cycle.
- Generate small (32 px) silhouette variant of `default` for future favicon / push notification use.
- Decide whether to commission seasonal hats (winter scarf, summer sunglasses) for next quarter — defer the decision, not the work.

---

## 8. Constraints + non-negotiables

- **No gradients anywhere** (project memory). Confetti colors must be solid; sparkle overlays use solid fills only.
- **Native shells skip the landing page** (project memory) — onboarding mascots will still render fine inside iOS / Electron WebView since they live in the authenticated app, but verify the mascot component doesn't depend on any landing-only context.
- **No dev-server screenshots for verification** (project memory) — rely on `pnpm typecheck` from the repo root and code review. Visual QA is on the user.
- **No `transition-all`. Only animate `transform` and `opacity`** (CLAUDE.md).
- **All assets via `next/image`** — never raw `<img>`. Required for automatic format negotiation and lazy loading.
- **Tutorial localStorage is per-user already** (recent commit `38303b7`) — mascot state is stateless, so this doesn't need new keys, but the `WelcomeModal` first-show check stays as-is.

---

## 9. Open questions

Before Phase 2, confirm:

1. **Tooltip placement direction** — does `TutorialTooltip` already expose `placement` (`top` / `right` / etc.) or is it inferred elsewhere? If inferred, mascot direction needs the same input.
2. **AI loading surfaces** — is there a single `useAIGeneration` hook, or is loading state scattered? If scattered, Phase 4 needs a small refactor first (one hook → one mascot).
3. **Streak threshold for `celebrate`** — at what streak length does the celebration fire? Every day? Every milestone (3, 7, 30)? Affects how often the confetti goes off.
4. **Native shell mascot sizing** — is the iOS WebView using the same Tailwind breakpoints as web? If so, `lg` size is fine. If the WebView is fixed-width small, may need a `responsiveSize` prop instead of fixed `size`.

---

## 10. Out of scope (don't do this yet)

- Lottie / Rive integration. Not needed — current PNGs + CSS keyframes cover everything in this plan.
- A mascot "personality" voice / chat assistant avatar. Separate product decision.
- Seasonal variants. List them, ship them later.
- Full SVG redraw of the mascot for free blinking + scalability. Worth doing eventually, but waits until volumes justify the cost.
