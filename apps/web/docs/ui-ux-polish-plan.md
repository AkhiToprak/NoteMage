# UI/UX Polish Pass — Implementation Plan

> Status: **PLAN ONLY — no code changed.** Investigation of the repo as it
> stands on branch `claude/clever-euler-EApcB`. All file paths are relative to
> `apps/web/` unless noted. Numbers in `()` are line references at time of writing.

---

## A. Findings — stack, architecture & styling source of truth

### A.1 Stack

| Layer | What's actually here |
|---|---|
| Framework | **Next.js 16.2.6** (App Router, route groups `app/(dashboard)`, `(auth)`, `(admin)`), **React 19.2.3**, **TypeScript 5** |
| Styling | **Tailwind v4** (`@tailwindcss/postcss`) is installed, but the app is styled almost entirely with **inline `style={{}}` objects referencing CSS custom properties** defined in `app/globals.css`. Tailwind utilities are used only for a handful of custom classes + the `cn()` merge helper. |
| Editor | **TipTap 3** (`PageEditor.tsx`), CodeMirror for code blocks, Excalidraw for canvas |
| Icons | **Material Symbols Outlined** (`<span className="material-symbols-outlined">`). `lucide-react` is in `package.json` but the design-system rule says not to use it for UI; spot checks show Material Symbols in practice. |
| Backend | Prisma (`prisma/schema.prisma`), next-auth, Supabase, socket.io |
| Export | `pptxgenjs` (`src/lib/pptx-generator.ts`) — relevant to item 16 |

> **Note on the CLAUDE.md path:** `CLAUDE.md` describes this as the "Quizzard"
> monorepo at a macOS path. It's the same project, cloned to `/home/user/NoteMage`.
> The `figma-design-system.md` rule file is **stale** in places (it lists
> `--primary: #ae89ff` and `--on-surface-variant: #c0bed8`; the real values are
> `#d1bcff` and `#dfdeeb`). Trust `globals.css`, not the rule doc.

### A.2 Styling source of truth — `app/globals.css`

There **is** a real token layer (CSS custom properties on `:root`, with a
`[data-theme='light']` override block and a Tailwind `@theme inline` bridge).
Current values:

**Accent / "violet→magenta" family** (there is **no magenta** and **no gradient
token** — the accent is a violet family, applied as flat fills):
- `--primary: #d1bcff`, `--primary-container: #a479f8`, `--primary-dim: #aa80fc`
- `--brand-purple: #ae89ff` (hardcoded literally as `#ae89ff` / `rgba(174,137,255,…)` in many components)
- `--accent-strong: #8c52ff` (+ `--accent-strong-rgb: 140 82 255`) — the saturated CTA/selection fill

**Page-background layers (dark theme)** — `globals.css` (105–115):
`--background/--surface #1a1a36` → `--surface-container-lowest #10102a` →
`--surface-container-low #21213e` → `--surface-container #272746` (default card) →
`--surface-container-high #2d2d52` → `--surface-container-highest #35355c` →
`--surface-bright #333358`.

**Secondary / muted text** (129–138): `--on-surface #ffffff`,
`--on-surface-variant #dfdeeb`, `--outline #a5a5be`, `--outline-variant #6a6a96`,
plus translucent ink tiers `--ink-04 … --ink-80` (160–169).

**Corner radii** (`@theme inline`, 424–428): `--radius-sm 8px`, `--radius-md 12px`,
`--radius-lg 16px`, `--radius-xl 24px`, `--radius-full 9999px`.

**Shadow / elevation helpers** (532–551): `.surface-elevated` = bg + radius
**(no shadow, no border)**; `.surface-floating` = bg + shadow **(no hairline
border, no top highlight)**; `.shadow-ambient`, `.neon-glow`. Plus
`--bento-rest-shadow` / `--bento-hover-shadow`. **None of these utilities are used
by the dashboard/feature cards** — those inline their own shadows.

**Spacing** (64–75): a 4-pt scale `--space-2 … --space-32` exists but is annotated
*"inline-style rhythm for marketing pages"* and is **not used** on app screens.

**Motion / z-index**: `--dur-fast 180ms`, `--dur-normal 240ms`,
`--ease-spring cubic-bezier(0.22,1,0.36,1)`; named `--z-*` scale (81–87).

**Not tokenized (key gaps):**
- **No type scale.** ~2,000+ `fontSize:` literals across components; sizes overlap
  (12/13/14/15/16/18/20/22…) with no `--text-*` tokens.
- **No tabular-figure usage** anywhere (`font-variant-numeric` absent).
- **No card-padding token**; paddings are eyeballed per component.
- **No elevation system** with hairline border + soft shadow + top highlight.

### A.3 Centralized vs. duplicated — the pivotal architectural fact

`src/components/ui/` contains only `AvatarEditor`, `MarkdownRenderer`, `Switch`,
`ThemeToggle`, `TierBadge`, `UpsellToast`. **There is no shared `Button`, `Card`,
`Dropdown`/`Menu`, `Badge`, `EmptyState`, or typography primitive.** Buttons,
cards, and menus are re-implemented inline on every screen (e.g. the card surface
is duplicated almost verbatim in `NotebookCard.tsx:106`, `FolderCard.tsx:90`,
`ActivityHeatmap.tsx:229`, `DashboardAchievements.tsx:55`). A `cn()` helper exists
(`src/lib/utils.ts:4`, clsx + tailwind-merge) but is barely used.

**Consequence for sequencing (read this before B/C):**
- Anything already **tokenized** (surface/text colors, radii) can be fixed in one
  place and propagates everywhere automatically.
- Anything **inlined as a literal** (type sizes, paddings, the `#ae89ff` accent,
  card shadows, the italic timestamp) must either be hunted down across many call
  sites **or** first promoted to a token and then migrated.
- Items 1 (elevation), 5 (buttons), 11 (empty states) have **no central home to
  change** today. Each is a fork: *(a) introduce a shared primitive now* (more
  up-front work, fixes many screens for good) *vs. (b) localized inline edits*
  (cheaper now, perpetuates duplication). This decision drives effort across the
  whole plan — see Open Questions.

### A.4 Three audit items that the current code contradicts

The code has clearly moved on since the audit was written. I verified these
directly:

- **Item 3c (AI dropdown rows collide on wrap):** `GenerateDropdown.tsx:268` and
  `InlineAIToolbar.tsx:378` already use `minHeight` + `alignItems:'center'`. The
  fixed `height` values nearby are icon chips/dividers (26/28/32/1px), not text
  rows. The described defect is largely already fixed in the AI menus.
- **Item 8 (T/F green check pre-answers):** the pre-answer icons are **grey**
  `check`/`close` (`rgba(237,233,255,0.7)`), not green/red. Green `check_circle` /
  red `cancel` appear **only** after answering, in the *same* badge (a swap, not a
  spatial collision). The concern is real but milder than stated.
- **Item 9 (wobbly squiggle connectors, indistinct states, colliding labels):**
  connectors are already clean **4px cubic-bézier S-curves** (`PathConnector.tsx:60`),
  the four node states **are** visually distinct (`SlotNode.tsx:59`), and labels sit
  **below** nodes (no overlap). Code comments say "Phase 10.5/10.8" — this screen
  was reworked after the audit. The real, smaller wins are different (see B-9).

These are flagged per-item below with a reduced scope and an open question.

---

## B. Per-change plan

Legend — **Type**: `Token` = change/add in `globals.css` (propagates) ·
`Component` = edit specific files · `New` = create a shared primitive.
**Effort**: S ≤ ~½ day · M ~1–2 days · L ~3+ days or many call sites.

### Group A — Visual / UI system

#### 1. Elevation scale (page bg → base card → raised/interactive card)
- **Files:** `app/globals.css:532–551` (add tokens/utilities); apply at
  `NotebookCard.tsx:106`, `FolderCard.tsx:90`, `ActivityHeatmap.tsx:229`,
  `DashboardAchievements.tsx:55`, `RecentTrophies.tsx`, `TrophyShelf.tsx`,
  dashboard stat cards `app/(dashboard)/dashboard/page.tsx:499`.
- **Type:** Token + Component. **Effort:** **M** (define is S; applying to primary
  cards across ~6–8 components is the cost).
- **Plan:** Add a 3-tier system as CSS vars/utilities: `--elev-0` (page bg, no
  shadow), `--elev-1` (base card: `--surface-container` + 1px border `--ink-08` ≈
  8% white), `--elev-2` (raised/interactive: `--surface-container-high` + 1px
  `--ink-12` hairline + soft shadow + a `inset 0 1px 0 var(--ink-06)` top highlight).
  The `--ink-*` tiers already exist and theme-flip — reuse them so the hairline and
  highlight stay correct on light mode. Note: `--ink-06` doesn't exist yet (tiers
  jump 04→08); add it or use `--ink-08` for the highlight.
- **Risks/ripple:** Inner top-highlight needs `overflow:hidden` on the card or it
  leaks past rounded corners. Light theme already injects an `outline` on tokenized
  surface `<div>`s (`globals.css:345`) — a new border could double up; reconcile.
  Cards currently inline bespoke hover shadows (`NotebookCard.tsx:112`) — decide
  whether the utility owns hover too.
- **Open Q:** ship as a utility class (`.elev-1/.elev-2`) or as a `<Card>` component
  (ties into item 5's primitive decision)?

#### 2. Secondary-text contrast + remove dim italic timestamps
- **Files (worst cases first):** `NotebookCard.tsx:269` & `FolderCard.tsx:232`
  (`fontSize:10px; color:var(--outline); fontStyle:'italic'` → "Updated …");
  `RecentTrophies.tsx` and `search/SearchDropdown.tsx` (italic 10px muted);
  `DashboardAchievements.tsx:242` (date `11px var(--outline)`); `GroupEmptyHint`
  in `UnifiedSidebar.tsx` (~1050, `12px var(--ink-40)`).
- **Type:** mostly Component; optionally Token. **Effort:** **M**.
- **Plan:** The offenders use `--outline` (#a5a5be) and `--ink-40` — *not*
  `--on-surface-variant` (#dfdeeb, which is fine). (a) Repoint timestamp/meta text
  from `--outline`/`--ink-40` to `--on-surface-variant` (or a new dedicated
  `--text-secondary` ≈ one step above `--outline`), (b) **remove `fontStyle:'italic'`**
  on all timestamps, (c) bump the 10px sizes to ≥11–12px (ties to item 4's min
  type size). Consider one new token `--text-secondary` so the "lift" is a single
  edit later.
- **Risks/ripple:** `--outline` is also a genuine *border* color in many places —
  don't bulk find/replace the token; change only the text usages. Verify AA on both
  themes (light `--outline` is `#4a4a66`).

#### 3. Consistent spacing grid + one card-padding value
- **Files:** `globals.css:64–75` (promote the existing `--space-*` scale for app
  use, or add a `--card-pad`); `NotebookCard.tsx:170` (`24 24 24 40`),
  `FolderCard.tsx:126` (`24 24 24 28` — inconsistent left), `ActivityHeatmap.tsx:231`,
  `DashboardAchievements.tsx:57,197,321`, dashboard `page.tsx:437` (top gap 18/20/32)
  and `:585` (stat value→label gap 4px).
- **Type:** Token + Component. **Effort:** **M–L** (many call sites).
- **Plan:** Adopt the existing 8px-based `--space-*` as the app spacing scale and
  add a single `--card-pad` (propose `24px`). Then the three specific fixes:
  (a) **dashboard top/H1**: increase the gap below the greeting and the H1's own top
  breathing room (`DashboardGreeting.tsx`, dashboard `page.tsx:437`); (b) **card
  padding**: make NotebookCard/FolderCard share `--card-pad` (the 40 vs 28 left
  padding is the accent-spine offset — keep an explicit spine offset, not ad-hoc);
  fix the stat-card "dead space" (cards are `height:100%` in a grid → short cards
  stretch; cap content or use `align-items:start`); (c) **AI dropdown rows** — see
  A.4: already `minHeight` + centered; verify only.
- **Risks/ripple:** `--card-pad` touches every card; roll out per-component, not
  global find/replace, to avoid breaking bespoke layouts.

#### 4. Wider type scale + readable editor measure + tabular numerals
- **Files:** `globals.css` (add `--text-*` tokens); editor measure on
  `.notemage-editor` (`PageEditor.tsx:1106`, currently **no max-width**); editor's
  own heading scale (`PageEditor.tsx:1116–1118` h1 30 / h2 22 / h3 18); UI headers
  e.g. `DashboardAchievements.tsx:130` (18/700), inverted-hierarchy case
  `TrophyShelf.tsx:119` (22/**400**); stat numerals dashboard `page.tsx` value
  (`30px` Oswald 400, no tabular).
- **Type:** Token + Component. **Effort:** **M** (key screens) / **L** (full migration).
- **Plan:** (a) Define a tokenized type scale (e.g. `--text-xs … --text-3xl`) with
  intended weights so **section headers clearly outrank item titles** (today an 18/700
  header barely beats a 13–18/700 title; `TrophyShelf` is even inverted). (b) Cap the
  editor reading measure: add `max-width: 720px; margin-inline:auto` to
  `.notemage-editor` (or a wrapper) — pick ~680–720px. (c) Add
  `font-variant-numeric: tabular-nums` to the dashboard stat numerals so values don't
  jitter width.
- **Risks/ripple:** A reading-measure cap will reflow full-bleed editor content
  (images `ResizableImage.tsx`, tables, the Excalidraw `DrawingOverlay`, code blocks)
  — those may need to "break out" of the measure. The editor uses `DM Sans`
  hardcoded (`PageEditor.tsx:1109`), separate from UI `--font-sans`; leave as-is
  unless unifying fonts is in scope. Full type-scale migration is large because
  sizes are inlined ~2,000×; recommend migrating high-traffic screens first.

#### 5. Button hierarchy / accent discipline (Notebooks toolbar)
- **Files:** `app/(dashboard)/notebooks/page.tsx` — New Folder (687–728), Import
  PDFs (731–770), Add Notebook (773–813). Accent overuse also: `Header.tsx:42`
  (title `#ae89ff`), `FolderBreadcrumbs.tsx:78` (active), progress bars/badges,
  `AvatarEditor.tsx:160`. Optional new `src/components/ui/Button.tsx`.
- **Type:** Component (+ optional New). **Effort:** **S** (just the toolbar) / **M**
  (introduce shared `<Button>` with `primary`/`secondary`/`ghost` variants).
- **Plan / nuance:** "Add Notebook" is *already* the filled primary; the real
  problem is that **all three are accent-colored** ("New Folder" and "Import PDFs"
  are byte-identical outline-accent pills, hardcoded `#ae89ff`/`rgba(174,137,255,…)`).
  Make the two secondaries **genuinely quiet** (neutral surface/ghost, `--on-surface-variant`
  text, no accent), leaving the accent to "Add Notebook" alone. Reserve accent for
  one primary action per view as the global rule. Strongly recommend extracting a
  shared `<Button>` so the discipline is enforceable rather than re-decided per screen.
- **Risks/ripple:** A shared Button is a cross-cutting refactor; if introduced, do it
  additively (new component, migrate screen-by-screen) — don't rewrite all buttons at
  once. Accent appears in 20+ files; full accent audit is its own task.

#### 6. Notebook card: spine color ↔ subject
- **Files:** `NotebookCard.tsx:44–61` (`getAccent()` from `notebook.color`),
  `:124` (spine), `:186` (subject badge); `src/lib/presets.ts:8–172`
  (subject→color map + **`getPresetForSubject()` already exists**);
  `NotebookForm.tsx:7–16` (color swatches); `prisma/schema.prisma:278–310`
  (`subject` and `color` are independent nullable fields).
- **Type:** Component (+ small lib reuse). **Effort:** **S–M**.
- **Plan:** Derive the displayed accent from the **subject** via
  `getPresetForSubject(notebook.subject)`, falling back to `notebook.color` (then the
  `#8c52ff` default) when there's no subject match. This ties spine + badge to subject
  meaning with no schema change. `presets.ts` already maps Biology #4ade80, Chemistry
  #ff7043, Physics #38bdf8, Math #ffde59, Language #5170ff, History #a78bfa,
  Literature #f472b6, CS #8c52ff.
- **Risks/ripple:** Decide precedence — does an explicit user-chosen `color` override
  the subject color, or does subject always win? (Open Q.) If subject wins, the
  `NotebookForm` color picker becomes partly cosmetic/legacy. Existing notebooks with
  a manual color may visibly change.

#### 7. Editor toolbar grouping + honest active state
- **Files:** `EditorToolbar.tsx` — `ToolbarButton` (196–250), active style
  `rgba(140,82,255,0.22)` + `--md-h4` (217–230); `Sep()` separators (1px `--ink-08`);
  mode toggles cursor/pen/text (1738/1744/1750); default `editorMode='cursor'`
  (`PageEditor.tsx:158`). Optionally `tiptap-slash-command.ts` / `SlashMenu.tsx` if
  demoting row-2 actions to the slash menu.
- **Type:** Component. **Effort:** **M**.
- **Plan:** (a) Add felt grouping — the `Sep()` exists but groups read flat; use
  larger inter-group gaps and/or subtle segment backgrounds for text-format / block /
  insert / AI clusters. (b) The **mode switcher** (cursor/pen/text) is a *persistent
  selection* and currently uses the *same* filled-active treatment as ephemeral format
  toggles; because one mode is always active, the default cursor button reads as
  "selected." Render the mode switch as a distinct **segmented control** (so a
  selection there reads as a mode, not a hot format), and use a quieter resting
  indication so the default doesn't look pressed. (c) Optionally move less-common
  row-2 actions into the slash menu (overlaps item 12).
- **Risks/ripple:** Toolbar is dense and central to editing; regression-test each
  format/mode/table action. Demoting actions changes muscle memory — confirm which.

#### 8. Quiz True/False decorative icons
- **Files:** `quiz/questionRenderers/TrueFalseRenderer.tsx` — options carry
  `icon:'check'`/`'close'` (23–26); pre-answer grey icon (134–136); post-answer
  `check_circle`/`cancel` swap in same badge (125–132); separate feedback panel
  (188–237). **Only `TrueFalseRenderer` has this pattern** (grep-confirmed; MCRenderer
  et al. don't).
- **Type:** Component. **Effort:** **S**.
- **Plan / nuance (see A.4):** Today's pre-answer icons are grey, not green/red, and
  they *swap* (no spatial overlap). Still worth doing the audit's intent: drop the
  decorative `check`/`close` glyphs before answering (use a neutral radio dot or no
  icon), and reserve `check_circle`/`cancel` + green/red strictly for the
  post-answer state. Keep `aria-hidden` on decorative marks.
- **Risks/ripple:** Tiny; isolated to one renderer. Re-verify the answered/review
  states still render the correctness mark.

#### 9. Learn-path tree polish — **scope reduced; verify first**
- **Files:** `learn/PathConnector.tsx` (4px bézier, `preserveAspectRatio="none"`,
  60–67), `learn/SlotNode.tsx` (states 59–81; **no lock glyph** — "lock" only in a
  comment + `aria-label` at 178; "available" border is neutral `--outline`, not
  accent; labels below node ~284), `learn/PathView.tsx`,
  `app/(dashboard)/learn/paths/[planId]/page.tsx`.
- **Type:** Component. **Effort:** **M** (after a screenshot QA pass).
- **Plan (reframed to match actual code):** The audit's premises (squiggles,
  colliding labels, indistinct states) don't hold against the current "Phase 10.x"
  rework. The genuine, smaller wins:
  - **Connector curve:** `preserveAspectRatio="none"` stretches a 100-unit viewBox to
    the container width → horizontal distortion that likely reads as "uneven/wobbly."
    Render with aspect-correct coordinates (real px width / `preserveAspectRatio`
    retained) so the S-curve keeps an intentional, consistent shape.
  - **`available` state → accent ring:** swap its neutral `--outline` border for an
    accent ring (the audit's explicit ask).
  - **`locked` state → add a lock glyph** (`lock` Material Symbol) on top of the
    desaturated fill (today it's only conveyed by color + aria-label).
  - **Labels:** optional background chip — low priority since they already sit below
    the node, not on the line.
- **Risks/ripple:** This is the signature screen — do a screenshot pass *before*
  investing, to confirm what the user is actually seeing (their build may differ).
- **Open Q:** Was the audit written against an older build? If the current tree
  already looks good to you, items here may be skippable.

#### 10. Top navigation bar
- **Files:** `layout/Header.tsx` (80px, `0 32px`, sticky; title `#ae89ff` Oswald
  24/400 at :42; right cluster gap 24, avatar 40, logout btn 72–101);
  `layout/TimerWidget.tsx` (36×36, icon 20px); `layout/NotificationBell.tsx` (38×38,
  icon 22px, idle `#8888a8`); search lives in `layout/HomeHeader.tsx` /
  `search/SearchDropdown.tsx` — **not** in the authenticated `Header`.
- **Type:** Component. **Effort:** **M**.
- **Plan:** (a) Put logo/title, search, and utility icons on a shared vertical
  baseline (single flex row, `align-items:center`, consistent control height). (b)
  Right-size the search so it isn't the widest element on content pages (cap its
  width; the oversized centered field appears to be the **marketing `HomeHeader`** —
  confirm which header the audit means). (c) Raise utility-icon contrast (idle
  `#8888a8` ≈ 2.5:1 → use `--on-surface-variant`) and size (icons 20–22px in 36–38px
  hit areas → add the existing `.tap-target` class for ≥44px on touch). Title is
  hardcoded `#ae89ff` → tie to accent-discipline (item 5).
- **Risks/ripple:** Two headers (`Header` for app, `HomeHeader` for marketing) — make
  sure you're editing the right one. Sticky/backdrop-blur layout is easy to break.

#### 11. Empty states
- **Files:** 22+ ad-hoc empty states; the only reusable piece is `GroupEmptyHint`
  (`UnifiedSidebar.tsx` ~1050, `12px var(--ink-40)`). Big ones: dashboard
  `page.tsx:1664–1746`, `DashboardAchievements.tsx:254`, `RecentTrophies.tsx:333`
  (already uses `<Mascot pose="sleeping" />`). Mascot primitive:
  `components/mascot/Mascot.tsx` (poses incl. sleeping/pointing/holding-wand). The
  specific strings "No chats yet" / "No flashcard sets yet" / "No quizzes yet" are in
  `UnifiedSidebar.tsx:1049/1101/1165`.
- **Type:** New + Component. **Effort:** **M** (create) + **M** (adopt across sites).
- **Plan:** Create a shared `src/components/ui/EmptyState.tsx` (icon **or** small
  Mascot + title + copy + optional CTA), then adopt it in the three named sidebar
  states and the larger ones. Keep existing copy; standardize the muted color
  (today inconsistent: `--ink-40`, `--outline`, `--on-surface-variant`).
- **Risks/ripple:** Sidebar empty states are tiny — a full mascot may be too heavy
  there; support a compact variant. Depends on item 2's secondary-text token.

### Group B — UX / interaction

#### 12. "Ask AI" in the slash menu
- **Files:** `notebook/SlashMenu.tsx` (ITEMS array 41–184: 14 commands across
  basic/lists/blocks/callouts — **no AI command**); plugin wiring
  `src/lib/tiptap-slash-command.ts`; AI handlers live in `GenerateDropdown.tsx` /
  `InlineAIToolbar.tsx`.
- **Type:** Component. **Effort:** **S–M.**
- **Plan:** Add an "Ask AI / Generate" item near the top of `ITEMS` (its own group
  or atop "Basic"), with a `run()` that opens the existing inline-AI / generate flow
  at the cursor. Reuse the existing item shape `{ id, label, description, icon, group,
  keywords, run }`.
- **Risks/ripple:** Coordinate with item 13 — ideally the slash "Ask AI" opens the
  same preview flow. Define behavior with no text selected (generate vs. ask).

#### 13. Inline-AI preview + accept/reject
- **Files:** `notebook/InlineAIToolbar.tsx` — replacement at **289–297**
  (`setTextSelection(range).deleteSelection().insertContent(fullText)`),
  `pendingRangeRef` (72). Actions: Rewrite/Summarize/Expand.
- **Type:** Component (new flow + state). **Effort:** **M–L.**
- **Plan:** Insert a preview step before mutation: stream the result into a
  **preview surface** (popover or inline diff) with **Accept / Discard**; only on
  Accept run the existing `deleteSelection().insertContent()`. Until then the document
  is untouched (no reliance on undo). Consider a TipTap decoration to show
  proposed text in place, or a side-by-side panel.
- **Risks/ripple:** Selection ranges drift if the doc changes during streaming —
  `pendingRangeRef` already guards iOS selection collapse; preview must re-resolve the
  range at Accept time. Largest UX item; prototype Rewrite first, then reuse for
  Summarize/Expand and the slash "Ask AI" (item 12).

#### 14. In-place generation result + toast (stop the Learn-hub teleport)
- **Files:** `notebook/GenerateDropdown.tsx` — `router.push('/learn/flashcards?…')`
  (135), `'/learn/quizzes?…'` (139), `'/learn/chats/{id}'` (491). In-notebook routes
  already exist: `/notebooks/{id}/flashcards/{setId}` & `/notebooks/{id}/quizzes/{setId}`
  (`UnifiedSidebar.tsx:1106/1170`). Toast: **no generic system** — only the
  cosmetic `UnlockToast`/`useUnlocks().enqueueBySlug()` and raw `alert()`
  (`GenerateDropdown.tsx:126/142/145`).
- **Type:** Component (+ small New: a generic toast). **Effort:** **M.**
- **Plan:** After generation, **don't navigate**. Surface a success **toast** that
  links to the new set (deep-link to the in-notebook route, not the global hub), and
  refresh the sidebar group so the set appears in place. This needs a small generic
  toast/notification provider (generalize `UnlockToast`, or add
  `src/components/ui/Toast.tsx` + a context) and replacing the `alert()` calls.
- **Risks/ripple:** Building the toast system is the bulk of the work and is reused by
  item 11-adjacent flows. Keep an optional "View in Learn hub" link for users who want
  the old destination.

#### 15. Locked-cosmetic label rendering (padlock over text)
- **Files:** `cosmetics/CosmeticsPanel.tsx` — lock overlay 228–256
  (`position:absolute; inset:0; align/justify center` → lock dead-center over the
  swatch's text); swatch dim `opacity:0.55; filter:saturate(0.55)` (221–222).
- **Type:** Component. **Effort:** **S.**
- **Plan:** Move the lock out of the centered overlay to a **corner badge** (e.g.
  top-right, small pill with the `lock` glyph), keeping the dim/desaturate treatment
  on the swatch so the label ("COMEBACK", "HACKER", …) stays legible.
- **Risks/ripple:** Tiny background swatches (96–128px) — ensure the corner badge
  doesn't clip on the smallest sizes; keep `pointerEvents:none`.

#### 16. PPTX export findability
- **Files:** generator `src/lib/pptx-generator.ts:221` (`generatePagesPptx`); backend
  `app/api/notebooks/[id]/export/pages/pptx/route.ts`; **only UI entry** = "Export"
  button buried in the sidebar footer (`UnifiedSidebar.tsx:650–694`) → `ExportDialog.tsx`
  (PDF/PPTX picker 304–327).
- **Type:** Component (placement only — **do not rebuild export**). **Effort:** **S–M.**
- **Plan:** Surface the existing Export action more prominently — add an entry in the
  page header / the page-actions `more_horiz` menu (`EditorToolbar.tsx:1766`) and/or
  near the "Generate" dropdown, opening the same `ExportDialog`. No new export logic.
- **Risks/ripple:** Minimal; just wire a new trigger to existing
  `setShowExportDialog(true)`. Avoid adding a *third* divergent style — reuse the
  toolbar's button conventions (item 5/7).

---

## C. Recommended sequencing

**Phase 0 — Decisions & QA (blockers).** Resolve the Open Questions (esp. shared
primitives yes/no). Take screenshots of the **Learn path (item 9)**, the
**top nav/search (item 10)**, and the **AI dropdown (item 3c)** to confirm which
audit premises still apply on the live build.

**Phase 1 — Token foundations (do first; everything below inherits).**
1. **Type-scale + spacing tokens + `--card-pad`** (items 3, 4) — add to `globals.css`.
2. **Secondary-text token + drop italics** (item 2).
3. **Elevation tokens/utilities** (item 1).
   - Dependency: items 1–4 are token edits that later component work consumes. Doing
     them first means component fixes reference tokens instead of re-inlining literals.

**Phase 2 — Shared primitives (only if "create primitives" is chosen in Phase 0).**
- `<Button>` (item 5), `<Card>` wrapping the elevation system (item 1), `<EmptyState>`
  (item 11), a generic `<Toast>` (needed by item 14). Build additively; migrate
  screen-by-screen.

**Phase 3 — Component polish (depends on Phases 1–2).**
- Item 5 (notebooks toolbar / accent discipline), item 6 (spine↔subject),
  item 10 (top nav), item 7 (toolbar grouping/active), item 8 (quiz T/F),
  item 11 (adopt EmptyState), item 9 (learn-tree wins), item 15 (cosmetic lock).
- Dependencies: 5 depends on the accent token discipline; 7 shares work with 12;
  10's title color depends on 5's accent rule; 11 depends on 2 + the EmptyState primitive.

**Phase 4 — UX / interaction.**
- Item 12 (slash "Ask AI") → item 13 (inline-AI preview) → item 14 (in-place +
  toast) → item 16 (PPTX placement).
- Dependencies: 12, 13, 14 all touch the AI/generation surfaces and should share the
  preview/toast plumbing; build the toast (14) before/with 13's accept flow so success
  states are consistent. 16 reuses the toolbar conventions from 7.

---

## D. Things not found / not yet existing — and recommendations

| Gap | Evidence | Recommendation |
|---|---|---|
| **No shared `Button`** | only inline buttons; toolbar buttons hardcode `#ae89ff` | Create `src/components/ui/Button.tsx` (`primary`/`secondary`/`ghost`) — prerequisite for real accent discipline (item 5). |
| **No shared `Card`** | card surface duplicated in ≥6 files | Pair with the elevation system (item 1) as `<Card elevation>`. |
| **No shared `Dropdown`/`Menu`** | menus inline (`NotebookCard.tsx:278`, `NotificationDropdown.tsx`, `GenerateDropdown.tsx`) | Optional; lower priority than Button/Card. |
| **No `EmptyState`** | 22+ ad-hoc states, only `GroupEmptyHint` | Create `src/components/ui/EmptyState.tsx` (item 11). |
| **No type-scale tokens** | ~2,000 inline `fontSize` literals | Add `--text-*` tokens (item 4); migrate hot screens first. |
| **No tabular figures** | `font-variant-numeric` absent | Add to stat numerals (item 4). |
| **No editor reading measure** | `.notemage-editor` has no `max-width` | Add ~720px cap (item 4). |
| **No generic toast** | only cosmetic `UnlockToast` + `alert()` | Add `src/components/ui/Toast.tsx` + provider (needed by item 14). |
| **No inline-AI preview/diff infra** | direct `deleteSelection().insertContent()` | Build preview/accept state (item 13). |
| **No magenta / accent gradient** | accent is a flat violet family | If the audit wants a violet→**magenta** accent, that's a *new* design decision, not a code gap — flag before implementing. |
| **No lock glyph on locked path nodes** | only `aria-label` + comment | Add `lock` icon (item 9). |

### Open questions for you
1. **Shared primitives — create them now, or keep localized inline fixes?** This is
   the single biggest fork (drives items 1, 5, 11, 14 and overall effort). I lean
   toward creating `Button`, `Card`, `EmptyState`, `Toast` additively.
2. **Item 6 precedence:** should subject *always* drive the notebook accent, or should
   a user-chosen `color` still override it (subject only as the default)?
3. **Item 9:** was the audit written against an older build? Current tree looks largely
   done — want me to do a screenshot QA pass before scoping?
4. **Item 10:** is the "oversized centered search" on the marketing `HomeHeader` or the
   app `Header`? They're different files.
5. **Type-scale migration scope (item 4):** tokenize + migrate everywhere (L), or
   define tokens + migrate only high-traffic screens now (M)?
6. **Accent gradient:** keep the flat violet accent, or introduce a violet→magenta
   treatment (new design direction)?
