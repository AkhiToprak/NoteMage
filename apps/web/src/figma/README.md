# Figma Design Build (`/figma`)

An **isolated, interactive, 1:1 reproduction** of the Figma file
`DDFpUOARLO01i5J2dMxsUT` · page _NoteMage Onboarding_. It exists to **evaluate the
design in code**, on the throwaway `design/figma-build` branch — it is **not**
the real app and is never auto-merged to `main`.

- **No backend.** Screens are genuinely interactive (type, answer quizzes, drag,
  switch tabs, walk between screens) but every byte is mock/local state. No API,
  AI, auth, DB, file parsing, or payments.
- **Switch at a breakpoint.** Each Figma frame is built faithful to its own size;
  the web build renders at ≥1024px, the mobile build below. No invented
  intermediate fluid layouts.
- **All 126 frames (73 screens), phased.** Onboarding ships first.

> Plan of record: [`apps/web/plans/figma-design-build.md`](../../plans/figma-design-build.md).

## Where things live

```
app/(figma)/
  layout.tsx                      # isolated dark layout (no app chrome, no auth)
  figma/page.tsx                  # gallery: all screens grouped by flow
  figma/[...slug]/page.tsx        # one dynamic route → the stage
src/figma/
  registry.ts                     # THE BACKBONE: ordered screens + node ids + lazy loaders
  README.md                       # this file
  kit/                            # shared chrome + primitives (built once, reused everywhere)
  mock/                           # shared fixtures + local-state hooks (added as screens need them)
  <flow>/<Screen>.{mobile,web}.tsx  # the screen components
public/figma/<flow>/              # raster assets downloaded from Figma per screen
```

## Phase 0 token/asset audit (done)

- The existing **Neon Scholar / NoteMage tokens fully cover the Figma palette** —
  reuse them, never hardcode hex:
  - Path palette `--nm-*` (primary/accent/lesson/quiz/review/boss/complete/streak,
    each with `-soft` / `-ink`), surfaces `--surface-*`, type `--fs-*` + `--lh-*`,
    spacing `--space-*`, ink levels `--ink-04..70`, radii `--radius-*`.
  - Fonts: `--font-display` (Epilogue / headlines), `--font-sans` (Plus Jakarta /
    body), `--font-brand` (Oswald / accents).
- `get_variable_defs` on a representative frame returns `{}` — **the Figma file
  uses raw hex, not bound variables.** So per screen, read colors from
  `get_design_context` and map them to tokens via
  [`.claude/rules/figma-design-system.md`](../../.claude/rules/figma-design-system.md).
- **Asset pipeline:** `get_design_context` returns localhost asset URLs → download
  rasters into `public/figma/<flow>/` and reference with `next/image`. Reuse
  existing mascot art (`/public/mascot/*-v2.png` via `<Mage>`) and the logo
  (`/public/logo_white.png`) — never re-import those.

## The kit (`src/figma/kit/`)

Reuse policy: **prefer the app's existing components** (`Button`, `NMCard`,
`ProgressBar`, `TopicChip`, `Mascot`) when they match a Figma frame; reach for the
F-primitives only where the new design diverges.

| Piece | Use |
| --- | --- |
| `ResponsiveScreen` | mounts the web build ≥1024px, mobile below (or `force`d for device frames) |
| `useIsDesktop` / `useMounted` | the breakpoint switch (wraps the app's `useBreakpoint`) + hydration gate |
| `PhoneFrame` / `StatusBar` / `HomeIndicator` | 393 device shell + the faux `9:41` status bar |
| `WebTopNav` / `MarketingHeader` / `MarketingFooter` | app desktop header / public-site chrome |
| `BottomNav` / `BackButton` / `StepDots` | app mobile tabs · back button · onboarding progress |
| `FButton` `FCard` `FChip` `FInput` `FToggle` `FProgress` | token-themed primitives, all interaction states |
| `Mage` | pose wrapper over `Mascot` (Figma `_assets` aliases) + the logo asset |

Interaction-state CSS (`:hover` / `:focus-visible` / `:active`, keyframes) lives in
`kit/kit.module.css`; per-instance token values come through inline styles. Only
`transform` / `opacity` are transitioned (project rule).

## Per-screen build loop

For each screen in `registry.ts` (work a phase's screens in parallel — one
screen-pair per subagent, on **Sonnet**):

1. `get_design_context(nodeId)` → reference code, screenshot, asset URLs (mobile +
   web nodes from the registry entry).
2. `get_screenshot(nodeId, maxDimension≈1500)` → high-res truth; screenshot child
   nodes for unclear details.
3. Download rasters → `public/figma/<flow>/`.
4. Build `<Screen>.mobile.tsx` / `<Screen>.web.tsx` from the kit + tokens; wire the
   mock interaction and Next/Back. Each file **default-exports a no-props
   component**.
5. **Register it** — add the loaders to the screen's `registry.ts` entry:
   ```ts
   // paths are relative to registry.ts (which lives in src/figma/)
   mobile: () => import('./onboarding/Welcome.mobile'),
   web: () => import('./onboarding/Welcome.web'),
   ```
6. **Compare vs the Figma screenshot** and fix spacing / type / color / radius /
   shadow / alignment / image sizing. **Repeat ≥2 rounds** until pixel-matched.
7. `tsc --noEmit` clean for the touched files.

### Screen component template

```tsx
'use client';

import { FButton, StepDots, Mage } from '@/figma/kit';

/** 01 Welcome — mobile (Figma 1:17). Self-contained, mock state only. */
export default function WelcomeMobile() {
  return (
    <div style={{ minHeight: '100%', padding: 'var(--space-6)', /* tokens, never hex */ }}>
      {/* …faithful to the Figma frame… */}
    </div>
  );
}
```

- Match the Figma frame exactly; **don't improve or add** sections/content.
- Material Symbols Outlined for all icons (`<span className="material-symbols-outlined">name</span>`).
- Mascot via `<Mage pose="…" />`; logo via `<Mage pose="logo" />`.
- Interactions mutate **local React state only**; forms never submit; loading
  screens animate then auto-advance via a timer; Next/Back use `next/link` to the
  adjacent registry slug.

## Interaction rules (from the plan)

- Forms are controlled but never submit.
- Quiz answers resolve to correct/incorrect + explanation from the fixture.
- Loading screens (`06 Generating`, exam `05 Analysis Loading`) animate, then
  auto-advance on a timer.
- Upload screens show a picked-file chip (fake file), no real upload.
- Next/Back/links route between registry screens with real client navigation.

## Verification

Visual verification is **in scope** here (overrides the usual no-dev-server
default) because the bar is pixel-perfect — run it as batched fidelity rounds, not
constant polling:

1. **Per screen:** render vs Figma `get_screenshot`, ≥2 compare-and-fix rounds.
2. **Per phase:** preview server, walk the flow at 393px and ≥1024px, confirm the
   breakpoint switch + interactions.
3. **Types:** `tsc --noEmit` clean for touched files each phase.
4. **Final:** full walk of all screens, both sizes. Phase 1 (onboarding) is
   reviewed before the rest proceeds.

## Isolation guarantees

- Sibling route group `(figma)` — inherits none of `(dashboard)`/`(auth)` chrome
  or auth.
- Not linked from anywhere in the real app; `robots: noindex`.
- Forces `data-theme="dark"` locally; doesn't touch the real onboarding
  (`onboarding-gizmo`) or any production route.
