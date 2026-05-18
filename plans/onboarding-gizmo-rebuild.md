# Onboarding Rebuild — Gizmo-Style Flow + Reusable Multi-PDF Import

## Context

NoteMage's current onboarding is a 5-step numbered wizard (`OnboardingWizard.tsx`) at
`/auth/register`: Account → Plan → Avatar → Mage name → Goals. It works but feels like
a settings form — several inputs per step, a numbered `StepIndicator`, no narrative.

Gizmo AI's onboarding (reference screenshots at
`/Users/toprakdemirel/Entwicklung/marketing_Notemage/gizmo onboarding/`, 11 screens)
does it better: **one focused question per screen**, the mascot framing every question,
a **continuous progress bar**, a back chevron, and a high-value **"import your study
material" finale** that turns onboarding into an activation moment.

**Goal:** rebuild NoteMage's onboarding to that feel — adapting, not copying 1:1. Keep a
real sign-up form first, then split identity/personalization into focused one-question
screens, and end with a multi-PDF import that auto-detects subjects and organizes the
material into notebooks the user names and confirms. **That import flow is built as a
reusable feature** — the onboarding finale is one entry point; the `/notebooks` page
gets a second.

Reference screens are the **structural/interaction** model only — everything renders in
NoteMage's design system (mascot, `var(--…)` tokens, no gradients), not Gizmo's purple.

Decisions locked with the user:
- Full Gizmo-style rebuild (one question per screen), not a layer on the current wizard.
- **Sign-up form stays first** — email + password — but **drops the username field** and
  **adds a date-of-birth field**; the **13+ legal gate is checked in the form**, so an
  under-13 user is rejected *before any account is created*.
- **Username becomes its own onboarding step** — "What should we call you?" — placed
  right after the first/last name screens.
- First name and last name are **two separate screens**.
- Personalization screens: **Context** (uni/school/work) and **Field of study**.
- Import finale: upload material → a "preparing your personalized study environment"
  animation that **auto-detects subjects** → a screen where the user confirms/edits the
  notebook grouping (name + subject) → notebooks created. **No quiz/flashcard
  generation** — notebooks only.
- **The multi-PDF import flow is reusable** — also reachable from the `/notebooks` page,
  not just onboarding.
- Ships as **one combined deliverable**.
- Dropped from Gizmo (poor fit): language selection (no i18n), the
  university-picker-with-classmates and follow-friends screens.

## Current state (verified)

| Area | Fact |
|---|---|
| Onboarding entry | `/auth/register` → `<OnboardingWizard/>` inside `(auth)/layout.tsx` (black bg, dot pattern, grain, 560px centered) |
| Steps | `OnboardingWizard.tsx` — `step` `1..5`, branches OAuth (`UsernameStep`) vs credentials (`AccountStep`); `PaymentStep` is an embedded Stripe sub-screen |
| `AccountStep` | today collects username + email + name + password + confirm + terms |
| `UsernameStep` | already exists — OAuth users set their real handle here (placeholder `oauth_*`) |
| Progress | `StepIndicator.tsx` — numbered circles (to be replaced) |
| Completion | `PUT /api/user/onboarding` — replay-guarded, sets `onboardingComplete`, persists `scholarName` + goals, sends signup email |
| User model | `age Int?`, `lineOfWork`, `school` exist. **No `birthDate`, no field-of-study column.** |
| Notebook model | `name`, `subject`, `color`, `kind` (`"standard"`/`"inbox"`); created via `POST /api/notebooks` (`{name, description, subject, color, folderId}`) |
| Notebooks page | `app/(dashboard)/notebooks/page.tsx` — client component, imperative `fetchContents()` refresh; toolbar right-side buttons (≈ lines 679–774) hold "New Folder" + "Add Notebook" (`#ae89ff` pill); supports folders |
| Existing import | `ImportNotebookDialog` imports files **into one open notebook** (sidebar / learn-path setup) — a different purpose; not on the notebooks list page |
| Import infra | `ImportJob` table exists; PDF rebuild (`plans/pdf-import-rebuild.md`) ~P1 of 7 done — the pipeline (`runPdfImportJob`, engine, assembler) is **not built yet** |
| Tier limits | `tiers.ts` `pdf_import` — FREE 50 pages (lifetime), PRO 450 pages/month; metered in **pages**, not import count |

## New onboarding flow — screen by screen

Progress bar = current segment of **11**.

| # | Screen | Persists to | Mascot | Notes |
|---|---|---|---|---|
| 1 | **Sign-up form** | account row | `wave` | Email, password, confirm, **date of birth**, terms. **No username, no name.** 13+ checked here — under-13 rejected before the account is created. "Log in instead" link. Creates the account with a placeholder username. |
| 2 | **First name** | → `User.name` | `holding-pen` | Single text field. |
| 3 | **Last name** | → `User.name` | `holding-pen` | `name` stored as `"First Last"` at completion. |
| 4 | **Username** — "What should we call you?" | `User.username` | `default` | Existing `UsernameStep`, now used by every path. |
| 5 | **Context** — "What brings you to NoteMage?" | `User.lineOfWork` | `thinking` | Single-select: University / School / Work / Other. |
| 6 | **Field of study** — "What are you studying?" | `User.fieldOfStudy` (new) | `thinking` | Free-text input. Skippable. |
| 7 | **Plan** | `User.tier` | — | Existing `TierSelectionStep` + `PaymentStep`. |
| 8 | **Avatar** | `User.avatarUrl` | — | Existing `AvatarStep`. Skippable. |
| 9 | **Mage name** | `User.scholarName` | `default` | Existing `ScholarNameStep`. Skippable. |
| 10 | **Goals** | goal columns | — | Existing `StudyGoalsStep`. Skippable. |
| 11 | **Import** | notebooks + import jobs | `holding-scroll` | The finale — runs the shared multi-PDF import flow (below). Skippable. |

**OAuth path:** screen 1 (the sign-up form) is replaced by a **date-of-birth + terms
screen** (OAuth users never see the credentials form, so the 13+ gate needs a home).
Screens 2–4 are pre-filled from the OAuth profile; avatar (8) from the OAuth picture.
Screens 5–11 are identical.

**Back navigation:** chevron enabled on every screen that only mutates local `formData`
(2–6, 8–10, 11a–11c). Disabled after irreversible steps — account creation, completed
payment.

## Shared multi-PDF import flow

A self-contained, container-agnostic flow with **four sub-steps**:

- **a · Add material** — Gizmo-style source menu. **PDF multi-file upload is the fully
  wired path**; "Paste notes" and "Link" appear as same-tray item types (reuse existing
  `contentConverter` / `url-import`) — lower priority, deferrable within Phase 3. Added
  items show in a tray (name, size, remove).
- **b · Preparing** — "Preparing your personalized study environment." Uploads files to
  `temp-imports/`, renders page PNGs, pulls a short text sample per PDF, runs
  `detectSubjects()`. Animated mascot (`holding-wand`, idle `sway`).
- **c · Organize** — shows the AI-proposed grouping as editable notebook cards (name,
  subject chip, color, assigned files; move a file between cards; add/remove a card).
- **d · Creating** — creates notebooks + a section each, one `ImportJob` per PDF, fires
  `runPdfImportJob` for each, shows aggregate progress.

**Two entry points (same flow, different container + completion):**

| Entry point | Container | On completion |
|---|---|---|
| Onboarding screen 11 | inside the `OnboardingScreen` shell | `PUT /api/user/onboarding` → redirect to the first new notebook |
| `/notebooks` page — new "Import PDFs" toolbar button | inside `MultiPdfImportModal` (fixed-overlay dialog) | close modal → `fetchContents()` refresh; new notebooks land in the current folder context |

## Design approach

- New shared shell so every onboarding screen is consistent and the step components
  shrink to just their input:
  - `OnboardingScreen` — back chevron + `OnboardingProgressBar` + mascot/wordmark header
    + bold question heading + content slot + footer CTA.
  - `OnboardingProgressBar` — continuous fill bar (solid `#ae89ff`, **not a gradient**),
    replaces `StepIndicator`.
- Reuse the existing `(auth)/layout.tsx` shell — no layout change.
- The import flow is split into a `useMultiImport` hook (state machine + classify/commit/
  status calls) plus four presentational step components, so the same logic powers both
  the onboarding screen and the modal. The modal follows the existing inline-styled
  fixed-overlay pattern (`ImportNotebookDialog`, `PdfImportProgressModal`).
- Conventions (`CLAUDE.md` + `.claude/rules/figma-design-system.md`): inline `style`
  with `var(--…)` tokens, Material Symbols Outlined, `Mascot`, spring easing, animate
  only `transform`/`opacity`. **No gradients.** No light text under `[data-theme='light']`.
- **Invoke the `frontend-design` skill before writing any UI in each phase.**

## Phase 1 — Gizmo-style shell + re-skin existing steps

No new questions, no import. Independently shippable.

- New: `OnboardingScreen.tsx`, `OnboardingProgressBar.tsx`, `OnboardingOptionCard.tsx`.
- Modify `OnboardingWizard.tsx` — render every step through `OnboardingScreen`; widen
  `step` state to a string-id union.
- Re-skin `TierSelectionStep`, `AvatarStep`, `ScholarNameStep`, `StudyGoalsStep` — strip
  per-step chrome (shell owns it); keep all logic.
- Remove `StepIndicator.tsx` after `grep` confirms no other consumers.

## Phase 2 — Sign-up form rework + identity/personalization screens

- **DB:** add `User.birthDate DateTime? @db.Date` and `User.fieldOfStudy String?
  @db.VarChar(100)`; generate the migration offline (`prisma migrate diff`) into
  `prisma/migrations/<ts>_add_birthdate_field_of_study/`.
- **Sign-up form** — rework `AccountStep.tsx`: email + password + confirm + **date of
  birth** + terms; drop username and name fields.
- **Register endpoint** — `app/api/auth/register/route.ts`: accept `birthDate`, reject
  age < 13 **before creating the user**; drop the username requirement, generate a
  placeholder handle (reuse `OAUTH_USERNAME_PREFIX`); persist `birthDate` (+ derive `age`).
- **Username step** — `UsernameStep.tsx` becomes universal (screen 4 on every path);
  remove the `isOauthPath` username branching in `OnboardingWizard`.
- **OAuth birth-date screen** — a small DOB + terms screen stands in for the form on the
  OAuth path; under-13 OAuth users are blocked, signed out, account row removed.
- New steps: `FirstNameStep.tsx`, `LastNameStep.tsx`, `ContextStep.tsx`,
  `FieldOfStudyStep.tsx`.
- **Completion endpoint** — extend `PUT /api/user/onboarding` to persist `name` (joined
  first + last), `lineOfWork`, `fieldOfStudy`.

## Phase 3 — Shared multi-PDF import flow + both entry points  ·  depends on PDF rebuild P2–P5

Reuses, does not re-build, the PDF pipeline. **Gated on `plans/pdf-import-rebuild.md`
P2 (`extractGroundTruth`), P3 (engine), P4 (assembler), P5 (`runPdfImportJob` +
`ImportJob` API).**

- New hook `src/hooks/useMultiImport.ts` — the source→preparing→organize→creating state
  machine; owns the classify/commit/status calls; container-agnostic.
- New components `src/components/import/`: `ImportSourceStep.tsx`,
  `ImportPreparingStep.tsx`, `ImportOrganizeStep.tsx`, `ImportCreatingStep.tsx`,
  `MultiPdfImportModal.tsx` (the `/notebooks` container).
- New lib `src/lib/onboarding/subject-detect.ts` — `detectSubjects(items) →
  ProposedGroup[]`; one classification call via the Gemini Flash-Lite client the PDF
  rebuild introduces; zod-validated; **never hard-fails** (fallback: one notebook per
  file, or a single "My Notes" notebook).
- New lib `src/lib/onboarding/import-orchestrator.ts` — creates `Notebook`s
  (`kind:"standard"`, `name`/`subject`/`color`, optional `folderId`) + a `Section` each,
  then one `ImportJob` per PDF, then fires `runPdfImportJob`.
- New API routes (generic namespace, not onboarding-scoped):
  - `POST /api/import/classify` — extract text samples, run `detectSubjects`.
  - `POST /api/import/commit` — orchestrator; **enforces the `pdf_import` page budget**
    via `checkUsageLimit` (FREE: lifetime, PRO: monthly). There is no per-PDF page cap;
    the worker charges pages with `incrementUsage(amount)` on success. Both contexts.
  - `GET /api/import/status` — aggregate progress across the caller's recent
    `ImportJob`s.
- **Entry point A — onboarding:** screen 11 renders the flow inside `OnboardingScreen`;
  on completion → `PUT /api/user/onboarding` → redirect to the first new notebook.
- **Entry point B — `/notebooks` page:** add an "Import PDFs" button to the toolbar
  right-side button group in `app/(dashboard)/notebooks/page.tsx` (≈ lines 679–774,
  beside "Add Notebook") that opens `MultiPdfImportModal`; created notebooks use the
  current `folderId`; on completion → close + `fetchContents()`.
- Reuse: `useDirectUpload`, `renderPdfToPngs` (`src/lib/pdf-client-render.ts`),
  `storage.ts`, `rate-limit.ts`.

## Phase 4 — Copy, polish, QA

Final microcopy, mascot poses/idles, screen-transition animations, light/dark audit,
native-shell check (verify the file picker works in WebView), full manual walk-through
of both onboarding paths and the `/notebooks` import button.

## Files

**Create**
- `src/components/onboarding/`: `OnboardingScreen.tsx`, `OnboardingProgressBar.tsx`,
  `OnboardingOptionCard.tsx`, `FirstNameStep.tsx`, `LastNameStep.tsx`, `ContextStep.tsx`,
  `FieldOfStudyStep.tsx`.
- `src/components/import/`: `ImportSourceStep.tsx`, `ImportPreparingStep.tsx`,
  `ImportOrganizeStep.tsx`, `ImportCreatingStep.tsx`, `MultiPdfImportModal.tsx`.
- `src/hooks/useMultiImport.ts`.
- `src/lib/onboarding/subject-detect.ts`, `src/lib/onboarding/import-orchestrator.ts`.
- `app/api/import/{classify,commit,status}/route.ts`.
- `prisma/migrations/<ts>_add_birthdate_field_of_study/migration.sql`.

**Modify** — `src/components/onboarding/OnboardingWizard.tsx`; `AccountStep.tsx`
(→ sign-up form with DOB); `UsernameStep.tsx` (universal); `TierSelectionStep.tsx`,
`AvatarStep.tsx`, `ScholarNameStep.tsx`, `StudyGoalsStep.tsx` (re-skin);
`app/(dashboard)/notebooks/page.tsx` (Import PDFs button + modal + refresh);
`prisma/schema.prisma`; `app/api/auth/register/route.ts`;
`app/api/user/onboarding/route.ts`.

**Remove** — `src/components/onboarding/StepIndicator.tsx` (after grep).

**Reuse as-is** — `Mascot`; `useDirectUpload`; `renderPdfToPngs`; `storage.ts`;
`rate-limit.ts`; `usage-limits.ts`; PDF-rebuild `ImportJob` + `runPdfImportJob` +
`extractGroundTruth`; `(auth)/layout.tsx`.

## Dependency & sequencing

Phases 1–2 have no dependencies and can be built immediately. **Phase 3 cannot start
until the PDF import rebuild reaches P5.** Per the "one combined deliverable" decision,
nothing ships to users until all four phases are done — but Phases 1–2 can be built and
merged behind the unchanged completion flow while the PDF rebuild runs in parallel.

## Verification

- Per phase, from repo root: `pnpm --filter web exec tsc --noEmit`, `pnpm --filter web
  lint`, `pnpm build:web` (catches `useSearchParams`/Suspense prod-only breaks — keep new
  search-param reads inside the existing `<Suspense>`).
- Phase 2: `prisma validate` + apply the migration locally; verify an under-13 date of
  birth is rejected at the form with no account row created.
- Phase 3: `curl` the classify/commit routes with sample PDFs; confirm notebooks +
  sections + `ImportJob` rows are created and `pdf_import` usage increments; verify the
  flow works from both the onboarding finale and the `/notebooks` modal.
- Manual walk-through on staging (no auto-run dev server) — both onboarding paths and the
  `/notebooks` import: 13+ gate fires; back navigation behaves; skips work; import groups
  PDFs into notebooks; subject-detection failure falls back gracefully; the notebooks
  list refreshes; completing onboarding with 0 imported files lands on the dashboard.
- Compare each screen against the Gizmo reference screenshots for structure/spacing.

## Open considerations

- **OAuth + the age gate** — the user specified the DOB field "in the sign-up form,"
  which OAuth users never see. This plan gives OAuth a standalone DOB+terms screen as
  step 1 so the gate stays universal. Flag if a different handling is preferred.
- **`ImportNotebookDialog` is separate** — it imports files *into one existing notebook*.
  The new multi-PDF flow *creates multiple notebooks* — a distinct purpose; this plan
  does not merge or replace it.
- **Length** — 11 onboarding screens; all post-form screens are skippable single-field
  steps. The team may later want to trim.
- **Multi-source import** — Phase 3 fully specs **PDF**; paste-notes and link are
  same-tray extensions reusing existing pipelines. Confirm v1 scope.
