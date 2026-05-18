# PDF Import Rebuild — Implementation Plan

## Status — updated 2026-05-18

All seven phases (P1–P7) are implemented under `apps/web/src/lib/pdf-import/`.

**Engine decision — settled: single-engine Gemini 2.5 Flash-Lite for every
tier.** PDF import stays Gemini-only; the conditional Claude second engine
discussed throughout this plan was *not* adopted. The `PdfStructureEngine`
interface stays as a reversible swap point, but no `engine-claude.ts` is
planned. Passages below that weigh or describe adding Claude are kept as
historical rationale and are superseded by this note.

## Context

PDF import is workstream #7 of the launch roadmap and the user's declared **pillar
function** — "if it does not work seamlessly, it will be the sole reason of failure
of the entire app."

Today the app has **two** PDF importers, both inadequate:

1. **Sidebar "Import PDF" button** (`SidebarPdfImportButton.tsx`) — renders each PDF
   page to a flat PNG screenshot and inserts `resizableImage` nodes. **Zero editable
   text, no headings, no callouts.** Its own comment admits it gives up on structure.
2. **File-import dialog** → `import/route.ts` → `pdfTextToTipTapJSON` — heuristic text
   extraction. Headings guessed by all-caps/numbering only (no font signal),
   **callouts not detected at all**, **inline bold/italic discarded**, images dumped
   at the end of the doc.

**Goal:** rebuild PDF import into a high-fidelity, fully-editable pipeline — correct
heading levels, callouts, paragraphs with inline marks, lists, tables, code blocks,
and figures placed inline — wrapped in a polished async loading experience.

**Not changing:** the Tiptap editor. Its node set (`toggleHeading`, `callout`,
`table`, `resizableImage`, lists, `codeBlock`) already covers every target. The fix
is entirely in the extraction → conversion layer.

**Scope:** standard PDF import only. OneNote / Apple Notes / GoodNotes import is a
later step and explicitly out of scope here.

---

## Locked Decisions (confirmed with user)

| Decision | Choice |
|---|---|
| Engine | **Hybrid** — pdfjs extracts the exact text layer; a vision LLM reads page images for structure; a deterministic assembler builds Tiptap JSON using pdfjs text verbatim |
| Engine count | **Single-engine — Gemini Flash-Lite for all tiers** (settled 2026-05-18). Kept behind the swappable `PdfStructureEngine` interface as reversible insurance; the conditional Claude engine was dropped |
| Page mapping | **One notebook Page per PDF**, content truncated safely before the ~500KB page limit with a visible notice |
| Screenshot mode | **Replaced entirely** — the sidebar button now launches the structured pipeline |

### Engine & model picks

- **All tiers → Google Gemini 2.5 Flash-Lite, to start.** New `@google/genai`
  dependency + `GEMINI_API_KEY`. ~$0.001/page. Model id behind an env-overridable
  constant `GEMINI_PDF_MODEL` (default `gemini-2.5-flash-lite`) — **verify the exact
  id against current Google AI docs before P3 ships**; Google rotates ids.
- The hybrid design means the LLM only *classifies structure* (pdfjs supplies the
  exact text verbatim), so a cheap model is expected to be sufficient for digital PDFs.
- **Claude Sonnet 4.6 is a conditional second engine — NOT built in P3.** If the P7
  golden corpus shows Flash-Lite falling short on the hard fixtures (scanned, complex
  tables, dense callouts, multi-column), add `engine-claude.ts` for the paid tiers; it
  drops into the same interface. It would use the existing `@anthropic-ai/sdk` / the
  `anthropic` singleton (`AI_GENERATION_MODEL = 'claude-sonnet-4-6'`), ~$0.04/page,
  no new vendor.
- The `PdfStructureEngine` interface + shared prompt make the model a one-line config
  swap — the engine count is deliberately deferred to corpus evidence, not guessed.

### Caps (updated 2026-05-18 — page-budget model, implemented)

PDF import is metered in **pages**, not import operations. Pages are the real cost
driver (one LLM call each), and an "import count" is meaningless once a single user
action can import many PDFs (the onboarding / multi-PDF flow).

| Tier | `pdf_import` budget | Window |
|---|---|---|
| FREE | 50 pages  | **lifetime** — a one-time allowance; never resets |
| PRO  | 450 pages | monthly |
| PLUS | dormant value (450) | tier being retired; `tiers.ts` keeps a value only to typecheck |

There is **no separate per-PDF page cap** — the budget is the single limit. A PDF
longer than the remaining budget is not rejected: the worker imports up to the
remaining pages and appends an inline truncation notice (the assembler's 460KB size
guard still bounds one absurdly large PDF technically). A user with zero budget left
is hard-blocked with an upsell. Rate limiting (`rateLimit` from `src/lib/rate-limit.ts`)
guards the parallel-fire window. **Usage is charged by the worker on success only** —
a failed import costs the user nothing.

Lifetime scoping needs **no schema change**: `UsageRecord` rows are still written per
month; a lifetime-scoped feature is read by summing `count` across every month
(`LIFETIME_LIMITS` / `isLifetimeLimit` in `tiers.ts`; the sum branch in
`checkUsageLimit`). `incrementUsage` takes an `amount` so the worker charges the page
count, not 1.

---

## Architecture

```
SidebarPdfImportButton (client)
  ├─ renderPdfToPngs(file)                  page PNGs @ scale 2     [REUSE]
  ├─ useDirectUpload → Supabase temp-imports/  (raw PDF + page PNGs) [REUSE]
  └─ POST /api/notebooks/[id]/pdf-import     → create ImportJob, return { jobId }

server worker — runPdfImportJob(jobId)   (detached promise, never throws)
  ├─ extractGroundTruth(pdf)        verbatim text layer + per-page geometry  [P2]
  ├─ per page → PdfStructureEngine.describePage(pageImage, groundTruthText)  [P3]
  │     → DocModelBlock[]   (Gemini Flash-Lite via the swappable engine interface)
  │     → zod validate → 1 repair retry → heuristic fallback (never hard-fail)
  ├─ crop figures from page PNGs at vision bboxes → upload → PageImage rows  [P4]
  ├─ assembleTiptap(DocModel, imageSrcByRef)   size-truncated Tiptap doc     [P4]
  └─ create ONE Page; write content + textContent; ImportJob → 'ready'

GET /api/notebooks/[id]/pdf-import/[jobId]/progress   SSE (DB poll, 500ms)   [P5]
useImportJobStream → PdfImportProgressModal (Mascot 'holding-scroll')        [P6]
```

### Intermediate format — `DocModel`

The engine outputs a `DocModel` (ordered block array). One deterministic assembler
converts `DocModel` → Tiptap JSON. The `DocModel` seam means a second engine — if the
P7 corpus calls for one — is a new implementation behind the same interface, never a
second codebase.

### Image strategy — crop from rendered pages (refinement)

Verification showed `extractPdfImages` returns `pageNumber: 0` (no position) and the
page-aware path is disabled because it produced visual noise. Therefore: **do not
extract embedded bitmaps.** Instead, the vision model returns `image` blocks with a
normalized bounding box; the worker **crops that region out of the rendered page
PNG** with `@napi-rs/canvas` (already in `serverExternalPackages`), uploads the crop,
and the assembler references it. This gives reliable inline placement, captures
vector diagrams (not just raster), and removes the page-association problem. Trade:
figures are at render resolution (~144 DPI) — acceptable for study notes. A small
bbox padding + a min-size filter (drop icon-sized crops) keeps results clean.

`extractPdfImages` / `pdf-image-extractor.ts` is left **untouched** — still used by
the legacy DOCX/dialog route.

---

## Phases

Each phase compiles, lints, builds, and deploys without breaking production. The old
screenshot import keeps working until **P6**. Verify steps are the success criteria.

### P1 — Foundations

**Goal:** the `ImportJob` table, `DocModel` types + zod schema, a test runner, and
the entitlement key. No behavior change.

New files:
- `apps/web/prisma/migrations/<ts>_add_import_job/migration.sql`
- `apps/web/src/lib/pdf-import/doc-model.ts` — `DocModel` types + `docModelSchema` (zod)
- `apps/web/vitest.config.ts` — Node env, `include: ['src/**/*.test.ts']`
- `apps/web/src/lib/pdf-import/doc-model.test.ts`

Modified files:
- `apps/web/prisma/schema.prisma` — add `model ImportJob` (below); add `importJobs`
  back-relations on `Notebook` and `User`
- `apps/web/package.json` — devDeps `vitest`, `@vitest/coverage-v8`; scripts
  `"test": "vitest run"`, `"test:watch": "vitest"`
- `apps/web/src/lib/tiers.ts` — add `'pdf_import'` to the `FeatureType` union **and**
  a `pdf_import` entry for every tier's `limits` (current values: see the Caps
  section). Omitting any tier makes `checkUsageLimit` read `undefined` — tripwire.

```prisma
model ImportJob {
  id             String   @id @default(cuid())
  notebookId     String
  sectionId      String
  userId         String
  fileName       String
  engine         String   // engine that ran, e.g. "gemini-flash-lite"
  pageCap        Int
  status         String   @default("queued") // queued|processing|ready|failed
  progress       Json?    // { phase, totalPages, processedPages, message }
  error          String?  @db.Text
  pdfPath        String
  pageImagePaths Json     // string[] temp-imports/ paths
  resultPageId   String?
  truncated      Boolean  @default(false)
  fallbackPages  Int      @default(0)
  startedAt      DateTime?
  finishedAt     DateTime?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt
  notebook       Notebook @relation(fields: [notebookId], references: [id], onDelete: Cascade)
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@index([notebookId])
  @@index([userId, status])
  @@map("import_jobs")
}
```

**Verify:** `prisma validate` + `prisma migrate dev` locally; `vitest run` green on
`doc-model.test.ts`; `tsc --noEmit`.

### P2 — Ground-truth extraction

**Goal:** a server function returning verbatim text geometry + scanned-detection. No LLM.

New files:
- `apps/web/src/lib/pdf-import/pdfjs-geometry.ts` — line/column/table geometry
  helpers **refactored out of** `pdfjs-node.ts` (`buildLines`, `detectCanonicalColumns`,
  `textLinesToParagraphText`, soft-hyphen joining). Both `pdfjs-node.ts` (untouched)
  and the new code import from here.
- `apps/web/src/lib/pdf-import/ground-truth.ts` — `extractGroundTruth(buffer): Promise<GroundTruth>`:
  `{ pageCount, encrypted, hasTextLayer, pages: [{ pageNumber, width, height, lines }] }`.
  `encrypted` ← catch pdfjs `PasswordException`; `hasTextLayer === false` when the
  average non-whitespace text-item count per page is below a threshold (scanned PDF).
- `apps/web/src/lib/pdf-import/ground-truth.test.ts` — runs against the P7 corpus.

Do **not** rewrite `extractPdfTipTapNodes` — it stays for DOCX/legacy.

**Verify:** `vitest run` green (page counts, `hasTextLayer` true for text PDFs /
false for the scanned fixture, `encrypted` true for the encrypted fixture); `tsc`.

### P3 — Structure engine

**Goal:** the engine interface + the Gemini implementation, one `DocModel` output;
strict validation with a repair retry and a heuristic fallback so import **never
hard-fails**. The Claude engine is intentionally NOT built here (see P7).

New files:
- `apps/web/src/lib/pdf-import/engine.ts` — `PdfStructureEngine` interface:
  `describePage({ pageImageBase64, mimeType, groundTruthText, isScanned }): Promise<DocModelBlock[]>`.
  Page-at-a-time bounds each LLM call and lets progress tick per page. The interface
  is the cheap insurance that makes a second engine a drop-in later.
- `apps/web/src/lib/pdf-import/prompt.ts` — the shared system prompt + JSON contract
  (below) — engine-agnostic.
- `apps/web/src/lib/pdf-import/engine-gemini.ts` — `@google/genai`, model from
  `process.env.GEMINI_PDF_MODEL ?? 'gemini-2.5-flash-lite'`, key `GEMINI_API_KEY`,
  client cached on `globalThis` (mirror `anthropic.ts`).
- `apps/web/src/lib/pdf-import/validate.ts` — `parseDocModelBlocks(raw)`: extract JSON,
  `docModelSchema.safeParse`.
- `apps/web/src/lib/pdf-import/heuristic-fallback.ts` — `groundTruthToBlocks(gtPage)`:
  deterministic, no LLM — font-size ranking → headings, bullet glyphs → lists,
  canonical columns → table, else paragraphs. The guarantee that import always
  produces *something*.
- Tests: `engine.test.ts`, `validate.test.ts`, `heuristic-fallback.test.ts`.

Modified files:
- `apps/web/package.json` — add `@google/genai`.

**Per-page contract (used by the P5 worker):** `describePage` → `parseDocModelBlocks`.
On parse failure → **one** repair retry (re-prompt with the zod error appended). On
second failure / API error / timeout / rate-limit → `groundTruthToBlocks` for that
page; increment `ImportJob.fallbackPages`. Import continues.

**Verify:** `vitest run` green on `validate` + `fallback` (pure/deterministic); live
engine calls behind an env flag; `tsc`, `lint`.

### P4 — Assembler + figure crop + size guard

**Goal:** the pure `DocModel` → Tiptap function, the figure-crop utility, and the
byte-size truncation guard. Highest-value unit-test target.

New files:
- `apps/web/src/lib/pdf-import/figure-crop.ts` — `cropFigure(pagePng, bbox): Promise<Buffer>`
  via `@napi-rs/canvas`; applies small padding; rejects sub-min-size crops.
- `apps/web/src/lib/pdf-import/assemble.ts` —
  `assembleTiptap(model, imageSrcByRef): { doc: TipTapDoc; truncated: boolean }`:
  - `heading` → **`toggleHeading`** (`attrs { level, collapsed:false, summary }`,
    `content:[{type:'paragraph'}]`). **Never emit a `heading` node** — it is disabled
    in StarterKit. `summary` is a plain string (heading inline marks not representable).
  - `callout` → `callout` (`block+`, `calloutType`); `codeBlock` → `codeBlock`
    (`attrs.language`); `image` → `resizableImage` (`src` from `imageSrcByRef`; skip
    if ref missing); inline runs → `text` + `marks`; `table`/rows/cells (cell content
    wrapped in `paragraph`); `bulletList`/`orderedList`, `blockquote`, `horizontalRule`.
  - **Size guard:** append blocks one at a time; after each, measure
    `Buffer.byteLength(JSON.stringify(doc))`; stop before **460,000 bytes** (headroom
    under the route's hard 500,000 limit) and append a `warning` callout: "Import
    truncated — this PDF was too large to fit in a single page." Return `truncated:true`.
- `apps/web/src/lib/pdf-import/assemble.test.ts` — **core suite:** every block →
  correct node; **regression: assembler never emits a `heading` node**; inline marks
  preserved; truncation guard fires at the cap and appends the notice; unknown image
  refs dropped cleanly; empty `DocModel` → valid non-empty doc.

**Verify:** `vitest run` green; `tsc`, `lint`, `next build`.

### P5 — Job runner + API routes + hook

**Goal:** wire P2–P4 into a background worker behind `ImportJob`, mirroring the
learn-path generation pattern (`StudyPlan` + `path-generator.ts` + the SSE route +
`usePathGenerationStream`).

New files:
- `apps/web/src/lib/pdf-import/run-job.ts` — `runPdfImportJob(jobId): Promise<void>`,
  **never throws** (mirrors `generatePath`). Loads job → `status:'processing'` →
  download PDF + page PNGs → `extractGroundTruth` → per-page engine + validate +
  fallback (write `progress` after each page, best-effort) → crop figures → register
  `PageImage` rows (`/api/uploads/images/[id]` URLs) → `assembleTiptap` → create ONE
  `Page` (`sortOrder` after existing pages, `textContent` from ground truth) →
  `status:'ready'`, `resultPageId`, `truncated`, `fallbackPages` → delete temp files
  in `finally`. Any failure → `status:'failed'` + friendly `error`.
- `apps/web/app/api/notebooks/[id]/pdf-import/route.ts` — `POST`: auth, notebook
  ownership, **page-budget gate + rate limit**, validate body
  paths via `validateStoragePath(_, 'temp-imports/')`, create `ImportJob` (record the
  resolved engine + page cap on the row), fire `void runPdfImportJob(job.id).catch(...)`,
  return `201 { jobId, status }`. Engine selection reads a single helper
  (`engineForTier`) so a future paid/free split is one function, not scattered
  conditionals. `GET`: list the caller's recent jobs for this notebook
  (resume-after-redeploy UX).
- `apps/web/app/api/notebooks/[id]/pdf-import/[jobId]/progress/route.ts` — SSE,
  structural copy of `app/api/learn/paths/[planId]/generation/route.ts`: poll
  `ImportJob` every 500ms, emit `progress` / `done {pageId,truncated}` / `error`. If
  a `processing` job's `updatedAt` is stale (> ~10 min — killed by a redeploy), emit
  `error` "the server restarted — please retry".
- `apps/web/app/api/notebooks/[id]/pdf-import/[jobId]/retry/route.ts` — `POST`:
  re-fire `runPdfImportJob` for a `failed`/stale job; delete a stale `resultPageId`
  page first so retry is idempotent.
- `apps/web/src/hooks/useImportJobStream.ts` — `EventSource` wrapper, structural copy
  of `usePathGenerationStream`.

Modified files:
- `apps/web/src/lib/file-validation.ts` — add a `pdf-import` upload purpose.

**Verify:** `tsc`, `lint`, `next build`; manual `curl` POST of a small PDF, watch
SSE, confirm one Page is created. Not yet UI-reachable — safe to deploy.

### P6 — Progress UI + wire button + remove screenshot path

**Goal:** the user-facing experience; replace the screenshot import.

> Invoke the **`frontend-design`** skill before writing this phase's UI.

New files:
- `apps/web/src/components/notebook/PdfImportProgressModal.tsx` — full-screen modal,
  structural copy of `GenerationProgressModal.tsx`, with
  `<Mascot pose="holding-scroll" size="md" idle="sway" />`, a progress bar
  (`processedPages/totalPages`), **skeleton loaders** (solid-color pulsing rows — no
  shimmer) during the `extracting` phase before page counts arrive, and CTAs: "Run in
  background" / "Open page →" (on ready) / "Try again" (on failed → retry route) /
  "Close".
- `apps/web/src/components/notebook/PdfImportSkeleton.tsx` — the skeleton rows.

Modified files:
- `apps/web/src/components/notebook/SidebarPdfImportButton.tsx` — **rewrite the
  outcome:** keep the file `<input>` + `ensureSectionId`; new `handleFile` →
  `renderPdfToPngs(file)` → `useDirectUpload` pushes the raw PDF + page PNGs to
  `temp-imports/` → `POST /api/notebooks/[id]/pdf-import` → mount
  `<PdfImportProgressModal jobId=… />`. Delete the `resizableImage`-insertion block.
  Swap `lucide-react` icons → **Material Symbols Outlined** (`upload_file`).

`pdf-client-render.ts` (`renderPdfToPngs`) is **kept** — it is now the page-image
source for vision. The legacy `import/route.ts` PDF branch may stay for DOCX/TXT/MD.

**UI constraints:** no gradients; inline `style` objects with `var(--…)` tokens;
Material Symbols icons; wrap any `useSearchParams` in `<Suspense>`; no light-colored
text under `[data-theme='light']`.

**Verify:** `tsc`, `lint`, `next build`; **first user-visible change — deploy to
staging and walk the manual QA checklist deliberately.**

### P7 — Golden corpus, eval harness, final QA + the engine decision

New files:
- `apps/web/src/lib/pdf-import/__fixtures__/` — the corpus (see Test Strategy).
- `apps/web/scripts/pdf-import-eval.ts` — runs each fixture through
  ground-truth → Gemini engine (or heuristic fallback when no API key) → assembler;
  writes Tiptap JSON to `__eval_output__/` for human review; prints a summary table
  (blocks, pages, truncated?, fallback pages).
- `apps/web/src/lib/pdf-import/golden.test.ts` — snapshot assertions on the
  deterministic stages (ground-truth + assembler) per fixture.

Modified files:
- `apps/web/package.json` — script `"pdf-import:eval"` (add `tsx` devDep if absent).

**The engine decision — RESOLVED 2026-05-18: single-engine Gemini for all
tiers.** PDF import ships Gemini-only; the conditional Claude engine described
below is dropped and `engine-claude.ts` is not built. The eval harness stays
the Gemini *quality* check — run it against the hard fixtures (`scanned.pdf`,
`table-heavy.pdf`, `callout-heavy.pdf`, `multi-column.pdf`); if Gemini falls
short there, the lever is prompt or model tuning, not a second engine.

> Superseded direction (kept for rationale): if the corpus had shown
> Flash-Lite falling short, the plan was to add
> `apps/web/src/lib/pdf-import/engine-claude.ts` behind the same interface and
> point `engineForTier` at Claude for the paid tiers. Not adopted.

**Verify:** run the harness, eyeball every `__eval_output__` doc; walk the
manual QA checklist.

---

## DocModel & LLM Contract

`DocModel = { blocks: DocModelBlock[] }`. Block types (zod-validated in `doc-model.ts`):

| Block | Fields |
|---|---|
| `heading` | `level: 1\|2\|3`, `runs: InlineRun[]` |
| `paragraph` | `runs: InlineRun[]` |
| `callout` | `variant: info\|warning\|success\|tip`, `children: Block[]` (non-recursive: paragraph/list only) |
| `bulletList` / `orderedList` | `items: { runs: InlineRun[] }[]` |
| `table` | `rows: InlineRun[][][]`, `headerRow: boolean` |
| `codeBlock` | `lang: string\|null`, `code: string` |
| `blockquote` | `runs: InlineRun[]` |
| `image` | `ref: string`, `bbox: [x0,y0,x1,y1]` (normalized 0–1) |
| `horizontalRule` | — |

`InlineRun = { text: string, bold?, italic?, underline?, strike?, code?: boolean, link?: string }`.

**LLM instruction (engine-agnostic):** Given (1) a rendered image of ONE PDF page and
(2) the page's exact text-layer text, return ONLY a JSON object
`{ "blocks": [...] }`. **Use the supplied text verbatim** for all `text` — never
paraphrase, never invent, never correct spelling. Assign *structure* (heading vs
paragraph vs list vs table vs callout) and *inline emphasis* by reading the image;
infer heading level from visual size hierarchy. Emit an `image` block with a
normalized bbox wherever a figure/diagram/chart appears. If the page has no text
layer (scanned), transcribe the visible text into the correct blocks. JSON only — no
prose, no markdown fences.

---

## Test Strategy

**Golden corpus** (`__fixtures__/`, committed): `clean-text.pdf`, `multi-column.pdf`
(2-column academic), `callout-heavy.pdf`, `table-heavy.pdf`, `image-heavy.pdf`,
`scanned.pdf` (no text layer), `german.pdf` (umlauts/ß), `giant-200p.pdf`
(truncation guard), `encrypted.pdf`, `corrupt.pdf`.

**Unit (Vitest, deterministic):** `assemble.test.ts` (block→node mapping;
**no `heading` node ever emitted**; marks preserved; truncation guard fires;
unknown-ref images dropped); `doc-model`/`validate` (zod accepts valid, rejects
malformed — bad `type`/`level`, extra keys; JSON extraction handles fenced output);
`heuristic-fallback`; `ground-truth` (page counts, `hasTextLayer`, `encrypted`).

**Eval harness:** `pnpm --filter web pdf-import:eval` → Tiptap JSON per fixture for
human review; `golden.test.ts` snapshots the deterministic stages so geometry/
assembler regressions are caught in CI. The LLM stage is asserted for schema
validity only (output is non-deterministic). **This harness is also the P7 engine
decision gate.**

**Manual QA checklist** (per corpus PDF, on staging): import succeeds; exactly ONE
page; headings render as the right toggle-heading levels; bold/italic survive; tables
editable; callouts correctly colored; figures appear inline and resize; scanned PDF
yields readable text; 200-page PDF stops with the truncation callout and stays under
500KB; encrypted/corrupt PDF shows a friendly modal error (no crash); modal shows
skeletons → per-page progress → mascot holding a scroll; "Run in background" closes
the modal yet the job finishes; "Try again" works after a forced failure; FREE user
hitting the page cap sees an upsell; no gradients; light mode has no light-on-light
text; production `next build` succeeds.

---

## Code → Test → Deploy Loop

Per phase, from the repo root:

1. `pnpm --filter web exec tsc --noEmit`
2. `pnpm --filter web lint`
3. `pnpm --filter web test` (Vitest — from P1)
4. `pnpm --filter web exec prisma validate` + `prisma migrate dev` (schema phases — P1)
5. `pnpm build:web` (`next build` — catches the `useSearchParams`/Suspense prod-only break)
6. `pnpm --filter web pdf-import:eval` (P7; rerun after any P2–P4 change) — eyeball output
7. **Env vars before P3/P5 deploy:** add **`GEMINI_API_KEY`** + optional
   `GEMINI_PDF_MODEL` as Coolify runtime env vars (not `NEXT_PUBLIC_` — no Dockerfile
   `ARG` needed). `ANTHROPIC_API_KEY` is already set (the essay-check route proves it)
   and is only needed if the conditional Claude engine is added in P7.
8. **Deploy:** commit (including the new `prisma/migrations/<ts>_*/` folder), push to
   `main` → Coolify webhook rebuilds; the container `CMD` runs `prisma migrate deploy`
   then boots. Verify on staging with the manual QA checklist; tail logs for
   `[pdf-import]` errors.

---

## Failure Modes

| Failure | Handling |
|---|---|
| LLM returns malformed JSON | `parseDocModelBlocks` fails → one repair retry with the zod error fed back → still bad → heuristic fallback for that page; `fallbackPages++` |
| LLM/API down, rate-limited, timeout | Caught per page → heuristic fallback. Even if every page falls back, the Page is still created and the job is `ready` — import never hard-fails |
| Assembled page > 500KB | Assembler size guard stops at ~460KB and appends the truncation callout; `truncated:true`; the route's hard limit is never hit |
| Encrypted / corrupt / 0-page PDF | `extractGroundTruth` detects it → job `failed` with a specific friendly message; modal shows it; no crash |
| Huge PDF (200+ pages) | Page cap bounds pages processed; the assembler bounds output size; pages processed sequentially so memory stays flat |
| Scanned PDF, no text layer | `isScanned` path: engine transcribes from the page image (no verbatim anchor — lower fidelity but functional) |
| SSE drops mid-job | Worker keeps running; status is in the DB; re-opening the modal re-attaches the SSE to live state |
| Job killed by a Coolify redeploy | `ImportJob` stuck `processing`; the SSE route flags a stale `updatedAt` as `failed`; user clicks "Try again" → retry route re-fires the worker |

---

## Risks & Open Items

1. **Detached worker is not durable.** A redeploy mid-import kills the job. The DB
   status + retry flow makes it *recoverable*, not *resilient*. For a must-not-fail
   feature this is the weakest structural point — a real queue (the Upstash Redis
   already in the stack) is the first hardening follow-up. Out of scope here.
2. **Figure crops are render-resolution (~144 DPI).** Fine for study notes; not
   archival quality. A later enhancement could match crops back to byte-scan
   originals for a resolution upgrade.
3. **Vision bbox accuracy.** Figure cropping depends on the model's bounding boxes;
   mitigated with padding + a min-size filter. Gemini's bbox grounding is strong.
4. **Gemini model id drift** — the env-overridable constant mitigates a redeploy, but
   the id must be verified against live Google docs, and Gemini's JSON-schema
   adherence checked, before P3 ships. Malformed output is absorbed by the repair
   retry + heuristic fallback.
5. **Single-engine bet.** Starting Gemini-only is cheaper and simpler, but it rides
   on the P7 corpus genuinely covering the hard cases — corpus quality is therefore
   load-bearing. The `PdfStructureEngine` interface keeps the cost of being wrong low
   (adding Claude is one file), but the corpus must be honest about scanned and
   complex-layout PDFs or a real gap could ship.
6. **Per-page LLM cost.** The page cap and rate limit are load-bearing for cost
   control, not just UX. Confirm the proposed caps against a budget.
7. **`FeatureType` union edit** must touch all three tiers' `limits` or
   `checkUsageLimit` reads `undefined` — small change, easy to half-do.
8. **No test runner today** — adding Vitest in P1 is net-new infra but low-risk.

---

## Critical Files

**Modify:** `apps/web/prisma/schema.prisma` · `apps/web/src/lib/tiers.ts` ·
`apps/web/src/components/notebook/SidebarPdfImportButton.tsx` ·
`apps/web/src/lib/file-validation.ts` · `apps/web/package.json`

**Refactor from (do not rewrite):** `apps/web/src/lib/pdfjs-node.ts` (geometry
helpers → `pdf-import/pdfjs-geometry.ts`)

**Reuse as-is:** `apps/web/src/lib/pdf-client-render.ts` (`renderPdfToPngs`) ·
`apps/web/src/hooks/useDirectUpload.ts` · `apps/web/src/lib/storage.ts` ·
`apps/web/src/lib/rate-limit.ts` · `apps/web/src/lib/usage-limits.ts` ·
`POST /api/notebooks/[id]/pages/[pageId]/images`

**Copy the pattern from:** `app/api/learn/paths/[planId]/generation/route.ts` ·
`src/hooks/usePathGenerationStream.ts` ·
`src/components/learn/GenerationProgressModal.tsx` · `src/lib/path-generator.ts` ·
`app/api/notebooks/[id]/essay-check/route.ts` (Anthropic SDK usage — only if the
conditional Claude engine is added in P7)
