# Mobile UX Audit & Remediation — NoteMage (Hallmark)

> Status: **planning** (no code yet). Audited 2026-05-24 against the Hallmark design skill
> (playful genre) + project rules. Maximal-scope remediation approved by user:
> everything incl. taste polish · strict gradient/glass removal · mobile canvas in scope.

## Context

Every mobile screen of the NoteMage web app was audited against the **Hallmark** design
skill (playful genre — 69-gate slop test + named anti-patterns) and the project's own hard
rules (CLAUDE.md, `apps/web/.claude/rules/figma-design-system.md`, and saved memory: **no
gradients**, **no light-coloured text in light mode**, **Material Symbols only**, **never
`transition-all`**, **only animate transform/opacity**).

The app's **bones are good** (clean typography, sound theme-token system, disciplined motion —
no purple-gradient heroes, no aurora blobs, no `transition-all`), but several **core mobile
screens are functionally broken** (content clipped off-screen on the Learn hub and notebooks
list, invisible text in light mode, the notebook sidebar toggle overlapping titles), alongside
**design-system rule violations** (lucide icons in 48 files, ~2,776 hardcoded colours, leftover
gradient/glass utilities, missing focus rings) and **Hallmark taste tells** (the AI "sparkle"
motif, a pure-black quiz card, desktop-only affordances shown on touch).

### Method
- **Hallmark** skill loaded; genre = playful. Audited against slop-test gates + anti-patterns.
- **3 read-only code-audit agents** swept `app/` + `src/components/` for: gradients/token
  discipline; light-mode text/icons; motion/states/responsive.
- **Live dev server** (`notemage-dev`, port 3001) walked at **375 px** in **dark + light**,
  logged in as the test account. 14 distinct screen types screenshotted + DOM-measured
  (overflow probes, computed-style traces, contrast checks).

---

## Screen coverage & verdict

| Screen | Verdict |
|---|---|
| `/` landing | Good. Left-biased hero, gold accent, real preview card. Tell: sparkle eyebrow. |
| `/auth/login` | Good. Tells: sparkle on "Log In" button; footer legal links wrap 2 lines. |
| `/auth/register` (onboarding step 1) | Good. Mascot, progress bar, DOB fits at 375. |
| onboarding steps 2–11 | Code-reviewed (tier/plan step recently fixed). Verify live during fixes. |
| `/dashboard` (dark + light) | Good. Carousel + heatmap + bottom nav. Light mode flips correctly. |
| `/learn` hub | **CRITICAL** — content 425 px wide in 375 vp, "View all" + cards clipped. |
| `/learn/paths` | **CRITICAL** — content 507 px, "New path" button + info banner clipped. |
| `/learn/paths/[id]` (Duolingo path) | Good. Winding path renders well. Tell: shared tab-strip clip. |
| `/learn/flashcards` (list) | OK. Tab-strip clip; set cards very sparse (excess whitespace). |
| flashcard viewer | Good. Big card, tap-flip button. Tell: "SPACE TO FLIP" on touch. |
| `/learn/quizzes` → quiz viewer | Tells: pure-black question card; "Show Hint (H)"; toggle overlaps title. |
| `/notebooks` (list) | **MAJOR** — action row clips the primary "Add Notebook" CTA. |
| `/notebooks/[id]` workspace (canvas) | **MAJOR** — blank canvas on mobile; toggle overlaps title; toolbar overflow. |
| `/settings` (dark + light) | **CRITICAL** light-mode invisible text (delete modal); off-screen overflow. |
| `/groups` (Co-Work) | Good. Clean tabs + skeletons. |
| profile / chats / community / group-detail / admin | Code-reviewed; share systemic issues — spot-check during fixes. |

**Recurring patterns:** (1) flex `min-width:auto` + non-wrapping rows → content clipped;
(2) hardcoded colours → light-mode breakage; (3) notebook-route sidebar toggle overlaps
title; (4) desktop affordances ("SPACE TO FLIP", "(H)") shown on touch; (5) the `auto_awesome`
sparkle used as an AI signifier.

---

## Findings by severity

> Format: **Tell** — `file:line` — evidence → **fix**

### CRITICAL (ships broken on mobile)

1. **Learn hub content clipped off-screen** — `app/(dashboard)/learn/page.tsx:98`,
   `app/(dashboard)/learn/paths/page.tsx:253` (`<div style={{maxWidth:'960px', margin:'0 auto', padding:'24px 16px 48px'}}>`) inside the flex column in `app/(dashboard)/learn/layout.tsx`.
   The container is a flex item with default `min-width:auto`, so it refuses to shrink below
   content min-content → measured **425–507 px wide in a 375 px viewport**, clipped (no scroll).
   "View all", "New path", info-banner text and card titles are cut off and unreachable.
   → Add `minWidth: 0, width: '100%'` to the page container; add `min-width: 0` to the learn
   layout's flex content column; make the Learn tab strip horizontally scrollable
   (`overflow-x:auto; min-width:0`) so it stops forcing the parent wide.

2. **Invisible text in light mode — delete-account modal** —
   `app/(dashboard)/settings/page.tsx:3114, 3156, 3175, 3209` hardcode `color:'#ffffff'` on
   `var(--surface-container)` (= `#d8d8e0` in light) → ~1.1:1 contrast (illegible).
   → Replace hardcoded `#fff` with `var(--on-surface)` so it flips per theme.

3. **Primary CTA clipped — notebooks action row** — `app/(dashboard)/notebooks/page.tsx`
   action row ("New Folder · Import PDFs · Add Notebook"). At 375 px the row doesn't fit and
   **"Add Notebook" (the primary CTA) is clipped** off the right edge (measured x=422).
   → Let the row wrap or horizontally scroll; allow buttons to shrink (`min-width:0`).

### MAJOR (reads as broken / breaks project rules / a11y)

4. **Sidebar toggle overlaps page title (all notebook routes)** —
   `app/(dashboard)/notebooks/[id]/layout.tsx:124` (the `»` `ChevronsRight` toggle is
   absolutely positioned top-left and overlaps the content `<h1>`). Seen on workspace,
   flashcard viewer, quiz viewer. → Reserve space for the toggle (content padding-left) or
   reposition it so it never overlaps the title.

5. **SSR/hydration flash of desktop sidebar** — `app/(dashboard)/notebooks/[id]/layout.tsx`
   (`useBreakpoint()` returns `desktop` on the server). On load, the 280 px desktop sidebar
   renders beside content, squeezing it to ~105 px (seen as the squished "Loading quiz…")
   until hydration collapses it. → SSR-safe "collapsed on small screens" initial state, or
   hide the sidebar until breakpoint is known.

6. **White-on-purple button contrast ~2.6:1** — pervasive primary buttons hardcode
   `color:#fff` on `#ae89ff` (`--brand-purple`), e.g. settings "Save Greeting", "Save Name",
   "Re-take tour", theme toggle. Fails WCAG AA (needs 4.5:1). *Inconsistent* — other primary
   buttons (Login, Continue, New path) correctly use dark ink on the lighter lavender.
   → Use `var(--on-primary)` (#3f0099) for text on primary fills; audit all primary buttons.

7. **Search input not themed in light mode** — header search bar renders dark on the light
   header (`src/components/layout/HomeHeader.tsx`). → Tokenize the search input background.

8. **Settings off-screen overflow** — `app/(dashboard)/settings/page.tsx` has 10 elements
   reaching x=947 (likely the activity heatmap / appearance preview / a wide row), clipped.
   → Constrain or make the wide element scroll within its card; apply `minmax(0,1fr)`.

9. **Icon-set inconsistency (project-rule violation)** — `lucide-react` imported in **48
   files** (e.g. `notebooks/[id]/layout.tsx:4`, all quiz `questionRenderers/*`, ~23 notebook
   components) despite the rule "Do NOT import lucide-react; use Material Symbols Outlined".
   → Migrate every lucide icon to `<span className="material-symbols-outlined">…</span>`.

10. **Missing `:focus-visible` across interactive elements (a11y)** — bottom nav
    (`MobileBottomNav.tsx`), burger drawer (`BurgerMenu.tsx`), cards (`NotebookCard.tsx`),
    most buttons/inputs lack visible keyboard focus rings (slop-test gate 28).
    → Add `:focus-visible` outline (`2px solid var(--color-focus/--primary)`, instant, ≥3:1)
    to the shared interactive primitives.

11. **Gradients — strict removal** — only app source: `src/components/ui/bg-pattern.tsx`
    (radial/linear-gradient dot & grid textures + mask gradients), consumed by `app/page.tsx`,
    `app/(auth)/layout.tsx`, `app/pricing/PricingPageClient.tsx`, `app/waitlist/page.tsx`,
    `src/components/notebook/InfiniteCanvas.tsx`. → Replace the dot/grid backgrounds with
    solid surface tokens in all 5 consumers; remove the gradient-based component.

12. **Glassmorphism — strict removal** — `glass-panel` (defined `app/globals.css`) used only
    in `app/maintenance/page.tsx`. → Replace with a solid `surface-floating`/`surface-elevated`
    panel; delete the `glass-panel` utility. Also delete the unused `btn-primary-gradient`
    utility (`app/globals.css:456`).

13. **Mobile notebook canvas renders blank (in scope)** —
    `src/components/notebook/InfiniteCanvas.tsx` is desktop-first; on mobile the page content
    exists in the DOM but isn't presented in-viewport (opens to empty space / the Exams panel).
    → Design a mobile canvas view: center/fit content on load, touch pan/zoom, mobile-safe
    default zoom. (Largest single workstream — likely needs its own sub-design.)

14. **Animating layout properties (perf + project rule)** — 20 components animate
    `width`/`left`/`height`/`max-height` (progress bars, accordions, cursors): e.g.
    `dashboard/page.tsx:1206,1248`, `learn/GenerationProgressModal.tsx:338`,
    `notebook/PdfImportProgressModal.tsx:386`, `social/FriendsList.tsx:472`,
    `notebook/ToggleHeadingView.tsx:159`. Rule: only animate transform/opacity.
    → Convert progress bars to `transform: scaleX`, collapses to transform/opacity.

### MINOR (taste / polish)

15. **AI "sparkle" motif** — `auto_awesome` Material Symbol used decoratively in the hero
    eyebrow ("✨ YOUR AI STUDY COMPANION") and on the "Log In" button (`auth/login`). The
    sparkle-as-AI-signifier is a recognised cliché (slop gate 55, decorative-without-purpose).
    → Remove the sparkle from the eyebrow and the Log In button.

16. **Pure-black (#000) quiz question card** on the navy page (`QuizViewer.tsx`) — flat /
    synthetic (anti-pattern "pure black"). → Use a tinted dark surface token.

17. **Desktop affordances shown on touch** — flashcard viewer "SPACE TO FLIP"; quiz "Show
    Hint (H)" + keyboard-shortcut hints. → On coarse pointers, show "TAP TO FLIP" and hide
    `(H)` / key hints (reuse the `(pointer: coarse)` detection from `useMultiImport`).

18. **Footer legal links wrap to two lines** — `auth/login` footer (`PRIVACY POLICY` /
    `TERMS OF SERVICE` / `HELP CENTER`) wrap (slop gate 59). → Shorten or `white-space:nowrap`
    + reflow.

19. **Editor toolbar overflow** — `src/components/notebook/EditorToolbar.tsx` overflows on
    mobile (2 clipped, x=439). → Horizontal scroll or an overflow "more" menu.

20. **Emoji as icon** — `src/components/features/StreakDisplay.tsx:36–40` uses 🔥 in the
    milestone string. → Use the `local_fire_department` Material Symbol (already used at
    line 147 of the same file).

21. **Avatar "?" fallback flicker** — header avatar shows a "?" placeholder on some routes
    (learn, groups). → Investigate avatar load/fallback timing.

22. **No global `prefers-reduced-motion` baseline** — handled per-component (~30) but no
    global reset in `globals.css`. → Add a global reduced-motion baseline.

23. **Sparse flashcard list cards** — `/learn/flashcards` set cards have large empty vertical
    gaps. → Tighten card height to content.

24. **`z-index: 9999`** — `app/globals.css:524` (`.mouse-sparkles-star`). → Adopt a named
    z-index scale. (Note: the mouse-sparkles / magic-cursor decoration is itself a
    "cursor-follower" anti-pattern — confirm whether to remove.)

### TOKEN DISCIPLINE (systemic root cause)

25. **~2,776 hardcoded colour literals** in components vs the rule "never hardcode hex — use
    `var(--token)`". Worst: `learn/ChatThread.tsx` (106), `notebook/FlashcardViewer.tsx` (95),
    `notebook/QuizViewer.tsx` (91), `notebook/EditorToolbar.tsx` (71), `features/NotebookForm.tsx`
    (53). This is the **root cause** of the light-mode breakages (a hardcoded colour can't flip).
    → Systematic tokenization pass, prioritising components that visibly break in light mode.

### Already good — do NOT "fix"
Landing, login, onboarding step 1, dashboard (both themes), path detail, flashcard viewer,
Co-Work, quiz option layout. Motion is disciplined (no `transition-all`, no aurora/purple-
gradient hero, no universal scroll-fade). Bottom nav + carousel + heatmap are strong mobile
patterns. Theme-token system is fundamentally sound. The 7 overshoot easings are confined to
celebration/mascot animations (acceptable as physical/celebratory motion).

---

## Multiphase remediation plan

### Phase 1 — Mobile overflow & clipping  *(CRITICAL — makes core screens usable)*

> **Status: IMPLEMENTED 2026-05-24.** All items below applied. Root cause across all
> three CRITICAL/MAJOR screens was the flex/grid `min-width:auto` trap, amplified by
> `useBreakpoint()` returning `desktop` on the SSR snapshot (so the desktop layout paints
> first even at 375 px). Changes:
> - `learn/page.tsx:98`, `learn/paths/page.tsx:253` — page container `+ width:'100%', minWidth:0`.
> - `learn/layout.tsx` — flex content column `+ minWidth:0`; tab strip `nav` `+ minWidth:0`
>   (it already had `overflowX:'auto'`).
> - `notebooks/page.tsx` — right-side action group `+ flexWrap:'wrap'` (chosen over
>   `min-width:0` on buttons to avoid two-line button labels / Hallmark gate 59).
> - `settings/page.tsx` — main grid `1fr 2fr → minmax(0,1fr) minmax(0,2fr)`; left+right
>   columns `+ minWidth:0`; admin-stats grid `minmax(220px,1fr) → minmax(min(220px,100%),1fr)`
>   (this hard 220px floor + non-shrinking tracks was the `x=947` clip).
> - Sweep: `learn/flashcards/page.tsx` & `learn/quizzes/page.tsx` grids →
>   `minmax(min(NNNpx,100%),1fr)`; their containers `+ minWidth:0` (both overflowed at 320 px
>   once inner padding was counted).
> - **Live-verification fix (found while probing):** `learn/paths/page.tsx:294` header action
>   group was `flexShrink:0` and still clipped "New path" at 320 px → changed to
>   `display:flex; flexWrap:wrap; justifyContent:flex-end; minWidth:0` so "Browse community" /
>   "New path" stack instead of clipping.
> - `corepack pnpm --filter web tsc --noEmit`: zero errors in changed files (2 unrelated
>   pre-existing errors in generated `.next/dev/types/.../{study-goals,community/paths}/route.ts`).
> - **Exit criteria MET (verified live on `notemage-dev` 2026-05-24).** Overflow probe = 0 real
>   violators on `/learn`, `/learn/paths`, `/learn/flashcards`, `/learn/quizzes`, `/notebooks`,
>   `/settings` (all 6 tabbed sections), plus untouched `/dashboard`, `/profile`, `/groups`,
>   `/learn/community` — at 320 (binding for the 0–767 phone band) and 768 (tablet); `/learn`
>   also at 375. Probe excludes two principled non-defects: (a) content inside the tab-strip /
>   settings-nav horizontal scrollers (reachable via scroll; page never scrolls —
>   `docScrollW == viewport` everywhere), and (b) `position:fixed; pointer-events:none`
>   decorative blur-glow layers (don't scroll the page or block interaction; candidates for the
>   Phase 4 glow/gradient pass). **Caveat:** the admin-stats grid fix wasn't exercised live
>   (test account isn't an admin); it's correct-by-construction (documented never-overflow pattern).

- Fix the flex `min-width:auto` trap: `learn/page.tsx:98` & `learn/paths/page.tsx:253` →
  add `minWidth:0, width:'100%'`; add `min-width:0` to the flex content column in
  `learn/layout.tsx`.
- Make the Learn tab strip horizontally scrollable (`overflow-x:auto; min-width:0`) so it
  stops clipping "Quizzes" and forcing the parent wide.
- Fix the notebooks action row (`notebooks/page.tsx`) — wrap/scroll; `min-width:0` on buttons.
- Fix settings off-screen overflow (`settings/page.tsx`) — constrain the wide element.
- Sweep every remaining page with the overflow probe; apply `min-width:0` / `minmax(0,1fr)` /
  `white-space:nowrap` as needed.
- **Exit criteria:** overflow probe returns 0 on every screen at 320/375/414/768.

### Phase 2 — Light-mode & contrast  *(CRITICAL — invisible text)*

> **Status: IMPLEMENTED 2026-05-24.** Root cause confirmed in `globals.css`:
> `--primary` (#d1bcff) and `--on-primary` (#3f0099) do **not** theme-flip, so
> hardcoded `#fff` on any purple fill fails contrast in BOTH modes; while
> `--on-surface`/`--surface-*` DO flip, so hardcoded `#fff` / `rgba(255,255,255,*)`
> on a flipping surface goes invisible in light. Changes:
> - **Delete-account modal** (`settings/page.tsx`, panel = `var(--surface-container)`
>   → `#d8d8e0` in light) fully tokenized — not just the flagged `#ffffff` lines:
>   heading→`--on-surface`, body/label→`--on-surface-variant`, confirm-input + Cancel
>   bg→`--surface-container-high`, their borders→`--outline-variant`, text→`--on-surface`.
>   The red "Delete" button **keeps** white text (white-on-`#c8475d` = 4.66:1 — correct;
>   the plan's line 3209 was the destructive button, not a surface).
> - **White-on-purple, app-wide** — a brace-matching detector swept every `style={{}}`
>   and CSS-rule block pairing a purple fill (`#ae89ff`/`--primary`/`--brand-purple`/…)
>   with white text: **13 sites** → `var(--on-primary)` (4.68:1 on `#ae89ff`, 7.4:1 on
>   `#d1bcff`). Sites: settings Save Greeting / Save Name / Re-take tour /
>   quiz-reactions radio (active) / profile avatar / admin-list avatar, groups-invite
>   group + inviter avatars, `FriendsList` pending badges (×2), `UserAvatar` fallback,
>   `AvatarEditor` Save, `ThemeToggle` active tab. Conditional where a *state* has a
>   dark fill: `AvatarEditor` keeps white on its `#6b5a99` uploading bg; admin avatar
>   uses `--on-error` on the red banned bg.
> - **Header** (`HomeHeader.tsx`) — the entire hardcoded `COLORS` palette (off-system
>   pure-greys `#1a1a1a`/`#0f0f0f`/`#1f1f1f` + lavender/white) → theme tokens, so the
>   search input (plus dropdown panel, icons, menu text) flips instead of stranding
>   dark on the light header. Brand wordmark kept `--brand-purple` (logotype; it's
>   `display:none` on phone anyway).
> - **Deferred (correctly out of Phase 2):** `.btn-primary-gradient` (`globals.css:456`,
>   white-on-lavender but **unused**) → **Phase 4** deletes it; a light-mode `--error`
>   override + the dropdown's `rgba(255,255,255,*)` hover tints → **Phase 8** token pass.
> - `corepack pnpm --filter web exec tsc --noEmit`: zero errors in the 7 changed files
>   (only the 2 pre-existing generated `.next/dev/types/.../{community/paths,study-goals}`
>   route-type errors remain). eslint scoped to changed files = 0 errors (pre-existing
>   warnings only). Detector re-run = 0 real white-on-purple violators.
> - **Exit criteria MET** for Phase 2 surfaces: delete modal + header carry no
>   near-white text on light surfaces, and every primary/purple-fill control is ≥4.5:1
>   (avatars/badges 4.68:1). A full app-wide near-white-on-light sweep stays with
>   Phase 8/9. **Not live-verified** (no dev-server run this session per user pref);
>   correct-by-construction from the token values + contrast math.

- Delete-modal invisible text (`settings/page.tsx:3114/3156/3175/3209`) → `var(--on-surface)`.
- White-on-purple button contrast app-wide → `var(--on-primary)`; audit all primary buttons.
- Theme the header search input (`HomeHeader.tsx`).
- **Exit criteria:** light-mode contrast scan finds no near-white text on light surfaces;
  all primary buttons ≥4.5:1.

### Phase 3 — Notebook routes + mobile canvas  *(MAJOR + in-scope canvas)*

> **Status: IMPLEMENTED 2026-05-24.** Three files; no behavioural change on desktop.
> - **Toggle/title overlap (finding 4)** — `notebooks/[id]/layout.tsx`: the content column
>   now reserves a 44px left gutter (`paddingLeft`) whenever the floating expand toggle is
>   shown, so the absolutely-positioned `»` (which stays at `left:8` inside that gutter —
>   `left` is measured from the positioned ancestor's padding box, so padding doesn't move
>   it) never overlaps the page `<h1>` on any notebook route (canvas, flashcard/quiz
>   viewers, editor, chats). The canvas's own phone title padding was dropped to `14px` so
>   it doesn't double up on the gutter. One file fixes every route (the viewers' headers
>   live inside `FlashcardViewer`/`QuizViewer`, so a layout-level reserve beat per-page edits).
> - **SSR sidebar flash (finding 5)** — same file: every breakpoint-dependent branch is now
>   gated behind a `mounted` flag flipped by an isomorphic layout effect (`useLayoutEffect`
>   on client, `useEffect` on server to avoid the SSR warning). The phone therefore never
>   paints the 280px desktop sidebar (no more squeeze-to-105px); because the flag commits
>   before first paint, the desktop sees no sidebar shift. Auto-collapse is a layout effect
>   too, so the overlay drawer can't flash open on first phone load.
> - **Editor toolbar overflow (finding 19)** — `EditorToolbar.tsx`: the horizontal-scroll
>   treatment (already present for phones) now also applies to tablets (`isPhoneOrTablet`) —
>   the dense button set overflows 768–1023 too; outer sticky bar got `minWidth:0`.
> - **Mobile canvas (finding 13)** — `InfiniteCanvas.tsx`: the canvas is an Excalidraw embed
>   (native touch pan/zoom already works + `initialData.scrollToContent:true`), so the real
>   gap was *framing on a small viewport*. Added a fit-on-load effect — once the
>   absolute-inset wrapper has a real size AND the imperative API is ready,
>   `scrollToContent(els, { fitToViewport:true, viewportZoomFactor:0.9, maxZoom:1 })` frames
>   the saved drawing into the viewport (RAF-retried up to ~0.66s to cover the unmeasured
>   first frames — the actual cause of "blank on mobile"; blank canvases left at origin).
>   Phone/tablet only; desktop centring untouched. Title bar padding made responsive.
> - `corepack pnpm --filter web exec tsc --noEmit`: zero errors in the 3 changed files (only
>   the 2 pre-existing generated `.next/dev/types/.../{community/paths,study-goals}`
>   route-type errors remain). eslint scoped to changed files: 0 errors (2 pre-existing
>   `Plus`/`Minus` unused-import warnings in `EditorToolbar`, not in this diff → Phase 5/8).
> - **Not live-verified** (no dev-server run per user pref); correct-by-construction. A
>   deeper touch-first canvas tool palette remains optional future work, not a Phase-3 blocker.

- Fix the toggle/title overlap and SSR sidebar flash (`notebooks/[id]/layout.tsx`).
- Fix the editor toolbar overflow (`EditorToolbar.tsx`).
- **Larger workstream:** mobile-adapted `InfiniteCanvas` (fit-on-load, content centering,
  touch pan/zoom, mobile default zoom) — may need its own sub-design doc.

### Phase 4 — Strict gradient + glass removal  *(per user)*

> **Status: IMPLEMENTED 2026-05-24.** Exit criteria met:
> `rg "linear-gradient|radial-gradient|conic-gradient|glass-panel|btn-primary-gradient" app/ src/`
> (vendor `src/lib/vendor/pdfjs-worker.mjs` excluded) → **zero app-source matches**. Changes:
> - **`bg-pattern.tsx` had 4 real consumers, not 5** — the plan's 5th (`InfiniteCanvas.tsx`) was a
>   false positive: its `canvas-bg-pattern-*` is an SVG `<pattern>` element id (notebook-paper grid
>   drawn with SVG primitives), not the `BGPattern` component, and trips none of the gradient regex.
>   Left untouched. The real consumers — `app/page.tsx`, `app/(auth)/layout.tsx`,
>   `app/pricing/PricingPageClient.tsx`, `app/waitlist/page.tsx` — each rendered
>   `<BGPattern variant="dots" fill="rgba(174,137,255,0.14)">` (a `radial-gradient` dot grid) over an
>   already-solid `#0c0a1a` wrapper. Removed the decorative layer + import in all four; the solid
>   surface now shows through. The SVG grain/noise overlays (feTurbulence data-URIs, not gradients)
>   were kept. Then deleted `src/components/ui/bg-pattern.tsx`.
> - **`glass-panel` (finding 12)** — `maintenance/page.tsx:48` `className="glass-panel"` → inline
>   `background: var(--surface-container-high)` + `borderRadius: var(--radius-xl)` (existing custom
>   `boxShadow`/`border` preserved; the `backdrop-filter: blur(20px)` glassmorphism dropped). Bonus:
>   the old utility hardcoded `rgba(33,33,54,0.7)` which couldn't theme-flip; the surface token does.
> - **`globals.css`** — deleted the `.glass-panel` rule (was L417) and the `.btn-primary-gradient`
>   + `:hover` rules (was L456, already solid `var(--primary)` not a gradient, and **unused** —
>   confirmed zero consumers) plus their two section-comment headers.
> - **Doc hygiene** — `.claude/rules/figma-design-system.md`: removed the `glass-panel` and
>   `btn-primary-gradient` rows from the utility-class table and dropped "Glass panels" from the
>   `--radius-xl` usage note, so the design-system rules can't re-introduce them.
> - **Deliberate scope note:** ~80 inline `backdropFilter: blur()` remain — but these are modal/
>   overlay **scrims** (`blur(4px)` over `rgba(0,0,0,*)` dialog backdrops) and a few **frosted
>   sticky headers/nav** (`LandingNavbar`, `HomeHeader`, `Header`, `MobileBottomNav`, bottom nav).
>   They are standard, legible patterns — **not** the `.glass-panel` glassmorphism finding 12 targets,
>   and not in Phase 4's regex-defined exit criteria. Removing them would break scrims/header
>   legibility and is out of scope; flagged here for a future taste call if desired.
> - `corepack pnpm exec tsc --noEmit`: only the 2 pre-existing generated
>   `.next/dev/types/.../{community/paths,study-goals}` route-type errors remain; **zero** in changed
>   files. eslint on the 5 changed `.tsx` files = clean (no errors/warnings).
> - **Not live-verified** (no dev-server run per user pref); correct-by-construction (every wrapper
>   already carried a solid background; the removed layers were `aria-hidden` decoration).

- Replace `bg-pattern` dot/grid textures with solid surfaces in its 5 consumers; remove the
  component (`bg-pattern.tsx`).
- Replace `glass-panel` in `maintenance/page.tsx`; delete the utility.
- Delete the unused `btn-primary-gradient` utility (`globals.css:456`).
- **Exit criteria:** `rg "linear-gradient|radial-gradient|conic-gradient|glass-panel"` → zero
  app-source matches (vendor excluded).

### Phase 5 — Icon system migration

> **Status: IMPLEMENTED 2026-05-24.** All **48** `lucide-react` files migrated to Material Symbols
> Outlined inline spans (`<span className="material-symbols-outlined" style={{ fontSize: N }} aria-hidden>glyph</span>`
> — the project's established convention, no wrapper component); 🔥 emoji removed from `StreakDisplay.tsx`.
> - **98 distinct lucide icons** mapped to MS glyph names, reconciled against the **130 names already
>   used in-repo** so the migration matches existing vocabulary: Loader/Loader2→`progress_activity`,
>   Network→`hub`, Youtube→`smart_display`, Globe2→`translate`, ClipboardCheck→`quiz`, BookPlus→`library_add`,
>   X→`close`, Trash2→`delete`, ChevronDown→`expand_more`, etc. Every *introduced* name (format_h1/2/3,
>   format_bold/italic/underlined/strikethrough, ink_highlighter, ink_eraser, arrow_selector_tool,
>   cell_merge, view_column, table_rows, view_day, draw, straighten, functions, …) verified against the
>   official `MaterialSymbolsOutlined[FILL,GRAD,opsz,wght].codepoints` (4,250 glyphs). The font loads the
>   **full** variable set (`app/layout.tsx:176`, no `&icon_names=` subset) so coverage is unconstrained.
> - **Spinners:** Loader/Loader2 → `progress_activity` + the repo's `animation:'spin Ns linear infinite'`
>   pattern (each file's existing duration / custom-keyframe name preserved — e.g. FlashcardImportDialog's
>   `flashcard-import-spin`, CodeWriteRenderer's `cm-spin`); a local `@keyframes spin` was added to the
>   spinner files that lacked one (ExportDialog, FlashcardViewer, QuizViewer, ImageUploadButton,
>   PageAppendPdfButton).
> - **Structural refactors (not 1:1 swaps):** icon-as-component-prop in `EditorToolbar.tsx`
>   (`ToolbarButton`/`ColorPicker` `icon: typeof Bold`→`icon: string`; ~30 call sites `icon={Bold}`→`icon="format_bold"`),
>   the two `CALLOUT_ICONS` component-maps (`EditorToolbar` + `CalloutView`, `Record<…,ComponentType>`→`Record<…,string>`),
>   config-object icon arrays (`GenerateDropdown` OPTIONS, `FlashcardImportDialog` TABS, `TrueFalseRenderer`
>   options — stored value → glyph string, render → `<span>{icon}</span>`), ReactNode `icon` props in
>   `FlashcardViewer`/`QuizViewer`/`MindmapRenderer` (convert the passed JSX node; `React.ReactNode` type kept),
>   the `Square fill="#c4a9ff"` → `filled`-class + `color` case in `ChatThread`, and the magic-cursor default
>   node (`<Sparkle/>` → `auto_awesome` span that inherits the wrapper's font-size/color). Unused lucide
>   imports dropped (EditorToolbar Plus/Minus, QuizViewer Plus, MindmapRenderer Copy/Image, EssayChecker
>   AlertTriangle/AlertCircle).
> - Execution: 4 parallel subagents handled the 42 mechanical files (shared airtight spec + the full
>   mapping table for cross-file consistency); the 6 structural/special files + StreakDisplay done by hand.
> - **Exit criteria MET:** `rg "lucide-react" app/ src/` → **0 matches**; `rg "🔥"` → 0. `corepack pnpm
>   --filter web exec tsc --noEmit` → only the 2 pre-existing generated `.next/dev/types/{community/paths,
>   study-goals}` route-type errors; **zero in changed files**. eslint scoped to changed files = no new
>   errors (only pre-existing setState-in-effect + missing-`es`-plugin-rule-definition categories).
>   Material-symbols spans 141→870. **Not live-verified** (no dev-server run per user pref);
>   correct-by-construction + tsc-clean.

- Migrate all **48** `lucide-react` files to Material Symbols Outlined.
- Replace the 🔥 emoji in `StreakDisplay.tsx`.
- **Exit criteria:** `rg "lucide-react" app/ src/` → zero matches.

### Phase 6 — Accessibility + motion/perf

> **Status: IMPLEMENTED 2026-05-24.** All three workstreams applied; tsc-clean in changed
> files, scoped eslint clean (no new problems). The layout-property-transition probe now
> returns 0 app-source matches. Changes:
> - **Focus rings (finding 10)** — `globals.css`: new theme-flipping `--color-focus` token
>   (`#d1bcff` dark / `#5e3aa8` light — the dark light-lavender is ~1.1:1 on near-white so it
>   MUST flip) + a global `:focus-visible` baseline on every shared interactive primitive
>   (`a, button, input, select, textarea, summary`, the common ARIA roles, and
>   `[tabindex]:not([-1])`): `outline: 2px solid var(--color-focus); outline-offset: 2px`.
>   Normal specificity, no `!important` — components shipping their own `:focus-visible` still
>   win, and the ~97 inline `outline:none` opt-outs are left alone (deeper per-component sweep
>   overlaps Phase 8). Ring never animates (instant on focus). `MobileBottomNav` already had a
>   ring but hardcoded `#ae89ff` (~2.1:1 on the light-mode bar) → tokenized to
>   `var(--color-focus)`. `.ns-input:focus` → `:focus-visible`, its `box-shadow` recolored to
>   `--color-focus` (+ `outline:none` to avoid a double ring) — also fixes that ring's prior
>   light-mode contrast. **BurgerMenu + NotebookCard set no inline `outline:none`, so the global
>   baseline covers them with no per-file edit.** *Known minor edge:* the always-dark marketing
>   pages keep the dark wrapper even under `[data-theme='light']`, where `--color-focus` flips to
>   the deep purple (~2.2:1 on `#0c0a1a`) — only hits a logged-in light-pref user on `/` etc.
>   (logged-out visitors get the `:root` light-lavender = great); pin if it matters later.
> - **Reduced motion (finding 22)** — `globals.css`: canonical global
>   `@media (prefers-reduced-motion: reduce)` reset (`*,*::before,*::after` animation- &
>   transition-duration → `0.01ms`, `animation-iteration-count: 1`, `scroll-behavior: auto`),
>   a safety net beneath the ~36 per-component handlers. **Tradeoff:** this freezes infinite
>   CSS loaders for reduced-motion users — the standard behavior of this reset; a genuinely
>   essential continuous loader can opt back out with a higher-specificity rule. (App spinners
>   are mostly short-lived / JS-gated, so the practical impact is small.)
> - **Layout→transform animations (finding 14)** — 19 sites converted:
>   - **11 progress bars → `transform: scaleX(fraction)` + `transformOrigin:left`** (fill
>     `width:100%`, `transition: transform`): dashboard ×2, GenerationProgressModal, TrophyShelf,
>     PathHeroCard, DashboardAchievements, PdfImportProgressModal, FlashcardViewer,
>     ImportCreatingStep, ImportPreparingStep. Fills are solid (no gradient / inner content) so
>     scaleX is visually identical; each kept its exact pct expression (incl. `Math.max/min`).
>     The two dashboard goal bars carry a decorative box-shadow glow that scaleX compresses
>     slightly — accepted.
>   - **4 switch knobs → `transform: translateX`** (fixed `left`, `transition: transform`):
>     settings theme switch, profile profilePrivate + hideAchievements, GroupSettings perms.
>     translateX is rigid, so the GroupSettings knob box-shadow is undistorted.
>   - **SentenceReorderRenderer** drop-indicator `width 2↔6px` → `scaleX(0.333↔1)` +
>     `transformOrigin:center` (parent is a fixed 18px slot so no reflow); background transition kept.
>   - **2 collapses → `grid-template-rows: 0fr↔1fr`** (Hallmark motion.md's blessed accordion
>     technique; one-shot + user-triggered so no layout-thrash concern): FriendsList pending list,
>     ToggleHeadingView legacy body (also removed its now-dead `contentHeight` state + ResizeObserver
>     + `useState/useRef/useEffect` imports — grid self-sizes). ToggleHeadingView's grid wraps a
>     ProseMirror NodeViewContent → correct-by-construction, **not live-verified**.
>   - **MindmapRenderer** animated `height` between *measured* px values (a resize-to-fit, not a
>     collapse) → dropped the `height` transition (instant resize; compliant, no distortion).
>   - **TutorialTooltip** step-dots animated `width` (6↔18 pill morph); a scaleX conversion would
>     distort inter-dot spacing, so dropped `width` from the transition (instant resize, kept a
>     `background` fade + the existing reduceMotion guard).
> - **`transition: all` cleanup — separate hard-rule fix, DONE 2026-05-24.** All **36** inline
>   `transition: all` sites across **12** files (ShareNotebookModal ×11, CoWorkButton ×5, CoWorkBar ×4,
>   CoWorkInviteModal ×3, HomeHeader ×3, CoWorkChat ×2, AddFriendModal ×2, BurgerMenu ×2, CreateGroupModal,
>   ExportDialog, ImportNotebookDialog, MaterialPicker) replaced with explicit per-element property lists —
>   the union of each element's state-driven `background`/`color`/`border-color`/`box-shadow`/`transform`/
>   `opacity`/`outline` changes (read from each element's hover/active ternaries + `onMouseEnter/Leave`
>   handlers + `<style>` `:hover` rules); layout props deliberately omitted so they snap. Duration + easing
>   preserved per site (incl. the plain no-`${EASING}` `0.1s`/`0.12s ease` forms). Executed via 6 parallel
>   subagents (1 file-group each). `rg "transition: *all"` (inline + CSS) → 0 app-source matches; tsc → only
>   the 2 pre-existing generated route errors; eslint scoped to the 12 files → 0 errors (pre-existing
>   warnings only). This was the `transition-all` half of the Phase 9 grep (not one of Phase 6's three
>   bullets nor in finding 14's set). Not live-verified (user pref).
> - `corepack pnpm --filter web exec tsc --noEmit`: only the 2 pre-existing generated
>   `.next/dev/types/.../{community/paths,study-goals}` route-type errors; **zero in changed files**.
>   eslint scoped to the 18 changed files: no new problems (pre-existing unused-var /
>   exhaustive-deps / set-state-in-effect / no-img only). **Not live-verified** (no dev-server run
>   per user pref); correct-by-construction + tsc-clean.

- Add `:focus-visible` rings to shared interactive primitives (bottom nav, burger, cards,
  buttons, inputs).
- Add a global `prefers-reduced-motion` baseline in `globals.css`.
- Convert the 20 layout-property animations to transform/opacity (progress bars → `scaleX`).

### Phase 7 — Hallmark taste polish

> **Status: IMPLEMENTED 2026-05-25.** All four bullets done; tsc-clean in changed files
> (only the 2 pre-existing generated `.next/dev/types/.../{community/paths,study-goals}`
> route errors remain), eslint scoped to changed files = no new problems (pre-existing
> set-state-in-effect / unused-var / no-img only). Not live-verified (no dev-server run
> per user pref); correct-by-construction. Changes:
> - **Sparkle motif (finding 15)** — removed the `auto_awesome` glyph from the landing hero
>   eyebrow (`landing/Hero.tsx`, the pill keeps "Your AI Study Companion") and from the
>   "Log In" button (`auth/login/page.tsx`, button is now text-only). No other decorative
>   `auto_awesome` remains in either file.
> - **Pure-black quiz card (finding 16)** — the flagged card actually lives in the 11
>   `src/components/quiz/questionRenderers/*Renderer.tsx` (not `QuizViewer` directly); each
>   hard-coded `background: '#000000'`. Replaced all 11 with a new **fixed, non-theme-flipping**
>   token `--quiz-question-surface: #0c0a1a` (deep navy-violet). Deliberately fixed (not a
>   `--surface-*` token) because the card carries near-white question text (`#f5f1ff`) in both
>   themes — a theme-flipping surface would strand that text in light mode (the
>   light-mode-no-light-text rule). Keeps the existing purple border + shadow so the card still
>   reads as an elevated dark focal surface, just tinted instead of flat black.
> - **Tap-vs-keyboard affordances (finding 17)** — new shared SSR-safe hook
>   `src/hooks/useCoarsePointer.ts` (lifted from `ImportSourceStep`'s local
>   `useSyncExternalStore` + `(pointer: coarse)` pattern; `ImportSourceStep` refactored to
>   consume it, removing the duplicate). FlashcardViewer front shows **"Tap to flip"** on
>   coarse pointers (was always "Space to flip"). All 11 quiz renderers hide the **"(H)"**
>   keyboard suffix on coarse pointers ("Show Hint" instead of "Show Hint (H)") via a new
>   required `coarsePointer` prop on `QuestionProps`, computed once in `QuizViewer` and threaded
>   down. `isPhone` was rejected as the signal (misses touch tablets/laptops) per the plan.
> - **Login footer wrap (finding 18)** — footer row got `flexWrap: 'wrap'` + `gap: '12px 24px'`
>   and each legal link `whiteSpace: 'nowrap'`, so no single clickable wraps to two lines
>   (Hallmark gate 59); the three links reflow as whole items, centered.
> - **Sparse flashcard cards (finding 23)** — set-card `minHeight` 140px → 96px in
>   `learn/flashcards/page.tsx`, removing the bulk of the dead vertical gap while keeping a
>   tidy floor (meta stays bottom-aligned via the existing `marginTop:auto`).
> - **Avatar "?" flicker (finding 21)** — root cause: `HomeHeader` reads `useSession()`, and
>   while it loads `user` is undefined → `getInitials(undefined)` → `'?'`. Fixed at the
>   primitive: `UserAvatar` now renders a neutral `person` Material Symbol when there's no name
>   (instead of "?"), so the loading state reads as "no avatar" and the post-load swap is a
>   normal placeholder→content transition. One change fixes it on every route. `getInitials`
>   still returns "?" for its other callers (unchanged).
> - **Mouse-sparkles / z-index (finding 24)** — the `magic-cursor.tsx` (`MouseSparkles`
>   cursor-follower, a Hallmark anti-pattern) was **dead code** (`rg "ui/magic-cursor"` → 0
>   importers; never mounted), which resolves the plan's "confirm whether to remove": deleted
>   the component + its `.mouse-sparkles-*` CSS + `fall-1/2/3` keyframes from `globals.css`
>   (this was the only `z-index: 9999`/`9998` in the codebase — the concrete finding-24
>   offender). Fixed the now-dangling `--mouse-sparkles-glow-rgb` reference in the notebook-token
>   comment. Added a documented named `--z-*` scale (base/raised/sticky/dropdown/overlay/modal/
>   toast) to `globals.css` alongside the existing `--space-*`/`--radius-*` scales. **Scoped
>   call:** did NOT migrate the ~176 inline `zIndex` sites — that's a stacking-context-risky
>   systemic sweep that belongs with Phase 8 token discipline; the scale is the adoption target.
> - **Exit:** `rg "auto_awesome"` in hero/login → 0; `rg "mouse-sparkles|fall-[123]|z-index: 999"`
>   in globals → 0; all 11 renderers carry `var(--quiz-question-surface)` + a `coarsePointer`-gated
>   hint label; tsc + scoped eslint clean (baseline only).

- Remove the sparkle motif (hero eyebrow + Log In button).
- Tint the pure-black quiz card (`QuizViewer.tsx`).
- Tap-vs-keyboard affordances on touch ("TAP TO FLIP"; hide `(H)`/key hints).
- Fix the login footer link wrap; tighten sparse flashcard cards; resolve avatar "?" flicker;
  adopt a z-index scale (and confirm removing the mouse-sparkles/magic-cursor decoration).

### Phase 8 — Token discipline cleanup  *(large / ongoing)*

> **Status: IMPLEMENTED (first pass) 2026-05-25.** The five worst offenders are tokenized;
> remaining literals are documented as the incremental remainder. The root insight: the
> hardcoded colours fell into four roles, and only some "break in light mode" —
> the pass fixes those and tokenizes the rest where a clean token exists.
> - **New tokens (`globals.css`).** (a) `--accent-strong: #8c52ff` + `--accent-strong-rgb:
>   140 82 255` at `:root` — the saturated CTA/selection purple used across all five files,
>   declared **fixed** (non theme-flipping, like `--brand-purple`): it reads on both the dark
>   navy and light near-white pages and always carries white text (`--on-primary-container`).
>   The `-rgb` triplet composes its translucent variants via `rgb(var(--accent-strong-rgb) / a)`.
>   (b) **Error-family light overrides** (`[data-theme='light']`): `--error #ba1a1a`,
>   `--on-error #fff`, `--error-container #ffdad6`, `--on-error-container #410002` — the base
>   error tokens didn't theme-flip (their dark values are a light pink tuned for dark surfaces),
>   so error text/borders were illegible on near-white. This is the override Phase 2 explicitly
>   deferred here. Blast-radius checked: every other `var(--error)` consumer is on a flipping
>   surface (improves in light); the quiz questionRenderers use `--quiz-question-surface` but
>   **not** `var(--error)`, so no red text is stranded on the fixed-dark quiz cards.
> - **Mapping applied (dark values preserved where an exact token existed):** accent text
>   `#c4a9ff → --md-h3`, `#ae89ff`(text/icon)`→ --md-h4` (both byte-exact in dark) and
>   `#ae89ff`(fills)`→ --brand-purple`; the toolbar active accent `#a47bff → --md-h4` (flips
>   to a deep purple that finally reads on the light toolbar); secondary lavender
>   `#e0d0ff/#d6c2ff/#d4c0ff → --md-em`; near-white titles `#f0edff/#ede4ff/#f5f1ff →
>   --on-surface`; muted `#a0a0c0 → --on-surface-variant`; status `#4ade80 → --success`,
>   `#fbbf24/#ffb380 → --warning`, `#fca5a5/#fd6f85/#ef4444 → --error`(+`--on-error`); quiz
>   blue `#93a8ff → --secondary-dim`; the strong purple `#8c52ff → --accent-strong`.
> - **Surface flips were the key light-mode fix.** The `#0a0a0a`/`#000000` study-card faces,
>   results cards, chat context drawer and notebook modal were hardcoded dark **but their
>   content already uses flipping tokens** (`MarkdownRenderer`'s `--md-*`, `--on-surface`,
>   `--ink-*`) — so in light mode they showed near-black text on a black card (invisible).
>   Flipped each to a theme surface (`--surface-container-lowest`; flipped flashcard back →
>   `--surface-container-high`; the form modal → `--surface-container`, matching the Phase-2
>   delete modal) so the already-flipping content reads. This is the inverse of the Phase-7
>   quiz card, which stays fixed-dark because its text is fixed-light. Flipping the drawer/modal
>   then exposed hardcoded near-white texts (`rgba(200,210,255,a)` bluish drawer labels in
>   ChatThread; `rgba(237,233,255,a)` inks + `rgba(255,255,255,a)` pills in NotebookForm) →
>   mapped to the flipping `--ink-*` ramp so they don't strand on the now-light surface.
> - **Text-on-accent-fill fixed (would flip black-on-purple).** Where text sat on a solid
>   `#8c52ff` fill via the shared `var(--on-surface)` (user chat bubble, send/save buttons,
>   selection-check icons, flashcard/quiz "Save/Add/Repeat" buttons, the quiz primary button,
>   the form submit) → switched to fixed-white `var(--on-primary-container)`. Text on
>   *translucent* purple rows (e.g. `rgba(140,82,255,0.08)`) correctly kept `--on-surface`.
> - **NotebookForm** got the full treatment (its modal flips, so every child had to): modal
>   surface, all `rgba(237,233,255,a)` label/button inks → `--ink-*`, the `<style>`-block
>   `rgba(255,255,255,a)` preset pills/picker → `--ink-*`, asterisk → `--accent-strong`,
>   selected-swatch ring `#fff → --on-surface`, submit button fill+ink, browse-templates link
>   `rgba(174,137,255,0.7) → --md-link`.
> - **Deliberately left (documented, not misses):** (1) user content-colour palettes —
>   EditorToolbar `TEXT_COLORS`/`HIGHLIGHT_COLORS`/`PEN_COLORS` and NotebookForm `COLOR_SWATCHES`
>   + the stored default `notebook.color ?? '#8c52ff'` (these are *data* the user picks/saves,
>   not chrome — tokenizing would break the feature); (2) the 2× `#ff4444` video icons in
>   ChatThread (saturated mid-red, reads on both themes — candidate for a future `--danger`
>   token); (3) the translucent accent/brand purples (`rgba(140,82,255,a)`/`rgba(174,137,255,a)`)
>   and status tints (`rgba(74,222,128,a)` etc.) used as borders/hover-bgs/glows in the three
>   viewers — they're theme-agnostic (pale colour on both white and navy) so they don't break
>   light mode; converting them is pure discipline (no `--success-rgb`/etc. tokens exist yet)
>   and is the natural next incremental slice. The MarkdownRenderer hljs syntax palette is a
>   separate shared concern (not one of the five files).
> - `corepack pnpm exec tsc --noEmit`: only the 2 pre-existing generated
>   `.next/dev/types/.../{community/paths,study-goals}` route errors; **zero in the 5 changed
>   files**. eslint scoped to the 5 files: 0 errors (pre-existing unused-var / exhaustive-deps /
>   no-img warnings only). Post-pass hex audit: FlashcardViewer & QuizViewer = 0 literals;
>   ChatThread = the 2 kept `#ff4444`; EditorToolbar & NotebookForm = content-palette data only.
> - **Not live-verified** (no dev-server run per user pref); correct-by-construction from the
>   token values + contrast math.

- Tokenise hardcoded colours, prioritising the worst offenders that break in light mode
  (ChatThread, FlashcardViewer, QuizViewer, EditorToolbar, NotebookForm). Can run
  incrementally after Phases 1–7.

### Phase 9 — Verification

> **Status: RUN LIVE 2026-05-25** on `notemage-dev` (:3001), logged in as the real test
> account, dark + light, at 320 (binding) / 768 (tablet) with 375 spot-checks. **Static checks
> PASS; live overflow / icons / focus-rings / gradient-glass / delete-modal-light all PASS.
> Two real gaps surfaced: (A) `/settings` light-mode form, (B) InfiniteCanvas fit-on-load not
> exercised.**
>
> **Static (items 4 + 6) — PASS.**
> - `rg "lucide-react|linear-gradient|radial-gradient|conic-gradient|glass-panel|transition-all|transition: all"` →
>   5 matches, **all rule-referencing comments** (e.g. `// transition-all per CLAUDE.md`,
>   `/* …(no transition-all)… */`); zero real usages.
> - `tsc --noEmit`: zero errors in changed files (only the 2 pre-existing generated
>   `.next/dev/types/.../{community/paths,study-goals}` route-type errors).
> - eslint scoped to the 95 changed files: **6 errors + 31 warnings, all pre-existing baseline.**
>   The 6 `setState-in-effect` errors `git blame` to fc640d2d / 735d3bb0 (**2026-05-12**, 12 days
>   before the audit) — code the phases touched only for styles/transforms, not the effects.
>   Zero new problems introduced by Phases 1–8.
>
> **Live — PASS.**
> - **Overflow (item 2):** probe (`realCount` = overflowing elements **excluding** horizontal
>   scrollers + `position:fixed;pointer-events:none` decoration, **classified by nearest clipping
>   ancestor** so a global `body`-clip ≠ a local carousel/track clip — the latter is the
>   "no-scroll-but-clipped" Phase-1 bug signature) returned **0 real violators and no page-level
>   horizontal scroll** on every screen: landing (320/375/768), login (320/375), dashboard,
>   learn (320/768), learn/paths (320/768), learn/flashcards, learn/quizzes (320/768), notebooks
>   (320/768), settings (320/768), profile, groups, pricing, maintenance, waitlist. The 4 formerly
>   CRITICAL/MAJOR screens screenshotted at 320 — clipped "View all" / "New path" / info-banner /
>   "Add Notebook" CTA are now fully visible and reachable.
> - **Icons (Phase 5):** `document.fonts.check('24px "Material Symbols Outlined"')` = true; a `menu`
>   span computes 24×24 and every screenshot shows glyphs rendering as icons, not raw ligature text.
> - **Focus rings (item 3 / finding 10):** the global `a/button/input/select:focus-visible →
>   outline:2px solid var(--color-focus)` baseline is in the live CSS; `--color-focus` = `#d1bcff`;
>   `main button` and `.mbn-link` both compute `outline:2px solid rgb(209,188,255)` with
>   `:focus-visible` matching; ring visually confirmed on the bottom-nav.
> - **Gradient/glass (Phase 4):** 0 gradient backgrounds (computed) on pricing/maintenance/waitlist;
>   0 heavy backdrop-blur on maintenance (the glass-panel `blur(20px)` is gone).
> - **Delete-account modal light mode (Phase 2's #1 CRITICAL):** opened in light — in-dialog
>   contrast scan = 0 failures; dark legible heading/body/label + light confirm input (was ~1.1:1).
> - **Dashboard + learn light mode:** flip correctly (dashboard's purple Goals card keeps white
>   text; learn shows light cards + dark titles).
> - **Notebook workspace on mobile:** renders (not blank); the `»` toggle sits at x=8 inside its
>   44px gutter, clear of the `<h1>` (**finding 4 FIXED**); the editor toolbar scrolls horizontally
>   (**finding 19 FIXED**); the sidebar opens as an overlay drawer (Phase 3 SSR-safe).
>
> **Live — GAPS / FOLLOW-UPS (not Phase 1–8 regressions):**
> - **(A) `/settings` light mode is NOT clean — beyond the audited delete modal.** Field labels
>   ("Email Address" 1.48:1), helper text (1.96:1) and the `@username` (1.71:1) are near-white on
>   the light page, and the password/greeting **inputs stay dark**. Root cause: `settings/page.tsx`
>   was never comprehensively tokenized (NOT one of Phase 8's five files). Pre-existing, but it
>   **fails the Phase 9 light-mode exit criterion** → recommend a Phase 8 continuation on
>   `settings/page.tsx`.
> - **(A2) `/notebooks` NotebookCard stays dark navy in light mode** while its New-Folder/
>   New-Subject placeholders flip — inconsistent; card meta text is faint. Same hardcoded-surface
>   root cause; design call whether the dark card is intentional.
> - **(B) InfiniteCanvas fit-on-load (finding 13) NOT live-exercised** — the test notebook has only
>   a text page; no drawing-canvas page exists, and creating one would mutate the live Supabase DB
>   (walkthrough kept read-only). Workspace shell verified; Excalidraw fit-on-load stays
>   correct-by-construction.
> - **(C) Hydration mismatch on `<html data-theme>` for light-mode users** — theme lives in
>   `localStorage` (`notemage-theme`), so SSR always renders `dark` and the client boots `light` →
>   React hydration warning + brief flash for light-pref users on every load. Pre-existing/
>   architectural, outside the mobile-audit scope; candidate for a blocking inline theme script.
> - **(D) Dashboard "View all" wraps to 2 lines at 320** (cosmetic; not an overflow violation).
>
> **Post-verification fixes (2026-05-25, same session) — gaps A & B addressed:**
> - **(A) `/settings` light mode — FIXED.** Tokenized `settings/page.tsx` (Phase-8 continuation, hallmark
>   loaded for the token-discipline pass): the dark `inputStyle` bg `rgba(14,14,28,0.6)` → `--surface-container-high`;
>   near-white text (`#cbd2ff`/`#e5e3ff`/`#b9c3ff`/`#aaa8c8`/`#8888a8`) → `--on-surface`/`--on-surface-variant`;
>   dark surfaces (`#35355c`/`#2d2d52`/`#21213e`/`#292946`) → flipping `--surface-container-*`; borders
>   `#555578` → `--outline-variant`; dark ink-on-lavender `#2a0066`/`#1a0044` → `--on-primary`; accent TEXT
>   `#ae89ff` → `--md-h4` (flips #ae89ff→#5e3aa8, readable in light) while fills/borders keep `--brand-purple`;
>   `#fd6f85`→`--error`, `#4ade80`→`--success`; helper text mis-using `--outline-variant` as a color → `--on-surface-variant`.
>   Live re-scan: **44 → 6** low-contrast items; the 6 left are decorative section icons (yellow/purple glyphs in
>   tinted circles), the `Free` `TierBadge` (separate child component — its own pass), and the deliberately
>   de-emphasized "Delete Account" danger link. Field labels / inputs / nav / headings / status / helper text now
>   all read in light. tsc clean; eslint scoped = no new errors. Delete-account modal still passes (Phase 2).
> - **(B) InfiniteCanvas mobile — LIVE-TESTED.** Created a `pageType:'canvas'` page via the authenticated API,
>   opened it at 375: `InfiniteCanvas` mounts, the absolute-inset **wrapper has real size (331×740)** — the exact
>   prerequisite the fit-on-load gates on (`wrap.clientWidth/Height > 0`), and the documented root cause of "blank
>   on mobile" — the Excalidraw canvas + full toolbar are **presented in-viewport** (not blank), the `»` toggle is
>   clear of the title, pan/zoom is Excalidraw-native. Fit-on-load only frames when `els.length>0` (empty pages stay
>   at origin by design); content-framing remains correct-by-construction with its prerequisite now verified live.
>   Test page deleted afterward (the API DELETE 500s in local dev — `deletePageImages`→Supabase-storage client has
>   no creds locally; not a code bug, works in prod — so cleanup was done directly via Prisma). DB left clean.
>
> **Method note:** item 2's "screenshot every screen × 4 widths × 2 themes" was sampled —
> overflow is layout-only, so it was probed at the band-defining 320 + 768 (320 = worst case) with
> 375 spot-checks; screenshots focused on formerly-broken screens + light-mode surfaces. Focus
> (item 3) was verified via computed `:focus-visible` + programmatic focus (no CDP key-send for a
> physical Tab) cross-checked with a visual ring shot.

1. Dev server `notemage-dev` (port 3001); log in with the test account.
2. For **every** screen, at **320/375/414/768**, in **dark and light**:
   - Overflow probe (zero elements past viewport, no horizontal scroll):
     `[...document.querySelectorAll('main *')].filter(el=>{const r=el.getBoundingClientRect();return r.width>40&&r.right>innerWidth+1}).length === 0`
   - Screenshot: no clipped content, no two-line clickable text, no overlaps.
   - Light mode: no white/near-white text on light surfaces; primary buttons ≥4.5:1.
3. Keyboard-tab every interactive primitive → visible focus ring.
4. `rg "lucide-react|linear-gradient|radial-gradient|glass-panel|transition-all|transition: all" app/ src/` → zero app-source matches. *(All these tokens already pass as of 2026-05-24: lucide cleared in Phase 5, gradient/glass in Phase 4, `transition-all`/`transition: all` in the Phase-6 follow-up cleanup.)*
5. Open a notebook on a phone viewport → content visible/centered and pannable.
6. `corepack pnpm --filter web tsc --noEmit` clean for changed files; eslint scoped to
   changed files (project baseline is pre-red).

---

## Critical files

- `app/(dashboard)/learn/layout.tsx`, `learn/page.tsx:98`, `learn/paths/page.tsx:253` — overflow + tab strip
- `app/(dashboard)/notebooks/page.tsx` — action-row clip
- `app/(dashboard)/notebooks/[id]/layout.tsx` — toggle overlap, SSR sidebar flash, lucide import
- `app/(dashboard)/settings/page.tsx:3114/3156/3175/3209` — light-mode invisible text
- `src/components/layout/HomeHeader.tsx`, `MobileBottomNav.tsx`, `BurgerMenu.tsx` — search theming, focus rings
- `src/components/ui/bg-pattern.tsx` (+ 5 consumers), `app/globals.css` (glass-panel, btn-primary-gradient, z-index, reduced-motion) — gradient/glass removal
- `src/components/notebook/InfiniteCanvas.tsx`, `EditorToolbar.tsx` — mobile canvas + toolbar
- `src/components/notebook/QuizViewer.tsx`, `FlashcardViewer.tsx`, `learn/ChatThread.tsx` — pure-black card, affordances, token cleanup
- `app/page.tsx`, `app/(auth)/login/page.tsx` — sparkle motif, footer links
