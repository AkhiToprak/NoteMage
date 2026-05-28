# Token Cost Reduction — Implementation Plan

## Status — drafted 2026-05-28; P6 UI toggle shipped 2026-05-28

Six phases (P1–P6), zero new dependencies, zero quality regression on already-shipped surfaces. Phase 1–3 are pure wins (prompt caching). Phase 4–6 add a user-controlled fast PDF import path that trades figure/structure fidelity for ~$0.001/page saved.

**P6 status:** the fast/rich toggle is wired into both entry points — the multi-PDF flow (`ImportSourceStep`, surfaced by `MultiPdfImportModal` and onboarding) and the single-PDF `PdfTab` inside `ImportNotebookDialog`. `mode` is per-import scope, defaults to `'rich'`, and rides the POST bodies of `/api/import/commit` and `/api/notebooks/[id]/pdf-import`. The acceptance corpus (textbook / slides / paper / magazine / worksheet / scanned) is unrun — manual diff pending.

## Context

LLM cost grows with the user base. After tracing every call site, two workstreams capture the bulk of the available savings:

1. **Caching gap.** Path generation already wraps its corpus in Anthropic ephemeral cache blocks ([path-prompts.ts:155](apps/web/src/lib/path-prompts.ts:155), [path-generator-routing.ts:114](apps/web/src/lib/path-generator-routing.ts:114)). Chat, single-page generate, and exam plan **do not** — every chat turn re-bills up to 400KB of notebook context, every consecutive quiz/flashcard from one page re-bills the same source, and the exam-plan route re-bills the full notebook corpus on each call.
2. **PDF vision overhead.** Every imported PDF page calls Gemini 2.5 Flash-Lite vision ([engine-gemini.ts](apps/web/src/lib/pdf-import/engine-gemini.ts), [prompt.ts:15](apps/web/src/lib/pdf-import/prompt.ts:15)) at ~$0.001/page. For digital PDFs (text layer present) the vision call is only earning us structure-classification and figure-bbox detection — and figure cropping is **not reliably working in production today** (per user note 2026-05-28). A text-layer-only engine using the already-installed `pdfjs-dist` could skip vision entirely for digital pages.

**Microsoft MarkItDown was considered and rejected.** It is Python-only (would force a sidecar onto Coolify), its PDF path is text-layer extraction (identical capability to `pdfjs-dist` already in the repo), and its scanned-PDF OCR plugin uses GPT-4o vision — more expensive per page than the current Gemini Flash-Lite pipeline. Audio / YouTube / EPub ingestion is a separate roadmap question, not a cost lever.

**Goal:** cut steady-state input-token spend on chat and downstream generation by ≥60% via cache hits, and offer a free PDF-import mode for users who don't need figure preservation.

**Not changing:**
- Path-generation pipeline (already cached).
- Existing PDF rich mode — kept as the default; users opt into fast mode explicitly.
- Tiptap editor, DocModel schema, `assembleTiptap` — fast PDF engine emits the same DocModel shape.

---

## Locked Decisions

| Decision | Choice |
|---|---|
| MarkItDown | **Not used** — `pdfjs-dist` already installed gives equivalent text-layer extraction in-process; Python sidecar avoided |
| Caching scope (P1–P3) | Chat, single-page generate, exam plan — same `ephemeral` `cache_control` pattern as path gen |
| PDF fast mode | **Opt-in, off by default.** Per-import choice on the import modal; no user-pref persistence in this plan |
| Fast-mode fallback | Per-page — scanned pages (no text layer) silently fall back to the Gemini engine even when fast mode is selected |
| Fast-mode dropped capabilities | Figures, callouts, blockquotes, code blocks → flattened to paragraphs. Headings, lists, tables preserved |
| Free-tier defaulting | **Not in this plan.** Whether free users should default to fast mode is a separate pricing decision, gated by the freemium-unit-economics target |

---

## Expected Savings (order-of-magnitude)

| Surface | Today | After plan | How |
|---|---|---|---|
| Chat — multi-turn convo, same context | 100% input tokens billed every turn | ≤10% billed after turn 1 | P1 — ephemeral cache on system block |
| Quiz/flashcard from same page (consecutive) | 100% / call | ≤10% / call after the first | P2 |
| Exam plan rerun within 5min TTL | 100% | ≤10% | P3 |
| PDF import — digital page, fast mode | ~$0.001 | $0 | P4–P6 (user-selected) |
| PDF import — scanned page, fast mode | ~$0.001 | ~$0.001 (Gemini fallback) | P5 fallback |

Cache TTL is 5 minutes (Anthropic ephemeral). Real-world hit rate depends on user session shape; multi-turn chat is the largest reliable win.

---

## Architecture

### Caching (P1–P3)

The existing pattern, to be reused:

```ts
// path-prompts.ts:155 / path-generator-routing.ts:114
system: [
  { type: 'text', text: instructionsPrefix },                                // uncached, small, varies rarely
  { type: 'text', text: corpus, cache_control: { type: 'ephemeral' } },      // cached, large, byte-stable across calls
]
```

For chat / single-page / exam-plan, the cached block is the source-material payload (notebook context, page text, or notebook corpus). The user message and conversation history continue to live in `messages`, not `system`, so per-turn variation never invalidates the cache.

### PDF fast-mode engine (P4–P6)

A second `PdfStructureEngine` implementation alongside the existing Gemini one, selected by an `ImportJob.mode` field. Both engines emit the **same DocModel shape**, so `assembleTiptap` and every downstream consumer are untouched.

```
SidebarPdfImportButton / MultiPdfImportModal (client)
  └─ POST /api/notebooks/[id]/pdf-import  body: { mode?: 'rich' | 'fast' }   [P5]
                                          ImportJob { mode: ... }            [P5]

runPdfImportJob(jobId)  — server worker
  ├─ extractGroundTruth(pdf)                                                 [unchanged — pdfjs already used here]
  ├─ for each page:
  │     pageHasTextLayer && job.mode === 'fast'
  │        → engine-text.describePage(groundTruth, geometry)                 [P4 — new, no LLM call]
  │     else
  │        → engine-gemini.describePage(pageImage, groundTruth)              [P5 — per-page scanned fallback]
  ├─ assembleTiptap(DocModel, ...)                                            [unchanged]
  └─ Page row + ImportJob → 'ready'
```

---

## P1 — Cache chat-stream system block

**Files:** [chat-stream.ts](apps/web/src/lib/chat-stream.ts) (around line 329)

**Change:**
- Split the assembled `systemParts` into two text blocks:
  - **Prefix block** (uncached): mage name + tool-use instructions. ~2 KB, stable across calls.
  - **Context block** (`cache_control: { type: 'ephemeral' }`): the joined `[Page: …]\n{text}` and `[Document: …]\n{text}` parts. Only added when `contextParts.length > 0`.
- Pass `system` as `TextBlockParam[]` instead of a flat string.
- Extend the existing breadcrumb at lines 151–164 to include `cache_read_input_tokens` and `cache_creation_input_tokens` from the Anthropic response.

**Risk:** None. Cache miss falls back to the same cost as today.

**Verification:** In dev (`notemage-dev` preview, account `4toprak25@gmail.com`), open a notebook with 5+ pages selected. Send three chat turns. Check Sentry breadcrumb usage: turn 1 reports `cache_creation_input_tokens` ≈ context size; turns 2–3 report `cache_read_input_tokens` ≈ context size and `input_tokens` (new) ≈ user message + history only.

## P2 — Cache single-page generate (quiz + flashcards)

**Files:** [pages/[pageId]/generate/route.ts](apps/web/app/api/notebooks/[id]/pages/[pageId]/generate/route.ts)

**Change:**
- Same split as P1: instructions prefix (uncached) + `page.textContent` corpus (cached).
- Hit rate is highest when the user generates a quiz and then a flashcard set from the same page within ~5 minutes (common flow on the page-detail toolbar).

**Risk:** None.

**Verification:** Generate quiz then flashcards from a single page within a minute; second call shows ≥90% `cache_read_input_tokens` on the corpus block.

## P3 — Route exam plan through `buildCachedSystem`

**Files:** [exams/[id]/generate-plan/route.ts](apps/web/app/api/user/exams/[id]/generate-plan/route.ts)

**Change:**
- This route already calls `loadMaterialCorpus()` + `renderMaterialCorpus()` (same primitives path gen uses). Replace its direct `system: string` pass with `buildCachedSystem(...)` from [path-generator-routing.ts:114](apps/web/src/lib/path-generator-routing.ts:114) — no new helper to write.

**Risk:** None — same shape as path gen, already proven.

**Verification:** Trigger two exam-plan generations on the same notebook within 5 minutes; second is mostly cache_read.

## P4 — Implement `engine-text.ts` — text-layer PDF engine

**New file:** `apps/web/src/lib/pdf-import/engine-text.ts`

**Implements:** the same `PdfStructureEngine` interface as `engine-gemini.ts`.

**Inputs:** the existing `extractGroundTruth(pdf)` output — verbatim text + per-line geometry (column x-positions, font sizes, baselines). Already produced in the current pipeline at [engine-gemini.ts](apps/web/src/lib/pdf-import/engine-gemini.ts); the call simply gets reused before the engine fork in P5.

**Heuristic classifier — produces `DocModel`:**

| Block | Detection rule |
|---|---|
| `heading` level 1 | line font size ≥ 1.4 × page-median body font size, single line |
| `heading` level 2 | size ≥ 1.2 × body median, single line |
| `heading` level 3 | size ≥ 1.05 × body median + ends with no period |
| `bulletList` | consecutive lines starting with `•`, `-`, `*`, `–`, `▪` |
| `orderedList` | consecutive lines matching `^\d+[.)]\s` |
| `table` | consecutive lines whose token x-positions cluster into ≥2 stable columns (column geometry already produced by `extractGroundTruth`) |
| `paragraph` | everything else; soft-wrapped lines collapsed |

**Dropped block types** (silently): `image` (figures), `callout`, `blockquote`, `codeBlock`. Inline marks (`bold`, `italic`, `underline`) are dropped — text-layer rarely carries them reliably without the visual signal.

**No LLM call.** No external dependency added.

**Test seed:** add a small fixture under `apps/web/src/lib/pdf-import/__fixtures__/` if not present — 2-3 page snippets covering headings, a bullet list, a table. Snapshot-test the DocModel output. Reuse existing `pdf-import` test scaffolding if any.

## P5 — `ImportJob.mode` schema + worker branch + scanned fallback

**Files:**
- `apps/web/prisma/schema.prisma` — add `mode String @default("rich")` to `ImportJob`. Migration via offline `migrate diff` per project dev tooling convention.
- [run-job.ts](apps/web/src/lib/pdf-import/run-job.ts) — branch per page:
  - If `job.mode === 'fast'` **and** the page has a text layer → call `engineText.describePage(...)`.
  - Otherwise (rich mode, or fast mode with a scanned page) → call `engineGemini.describePage(...)` as today.
- API route that creates the ImportJob — accept optional `mode` in the body, default to `'rich'`, validate enum, persist.
- [onboarding/import-orchestrator.ts](apps/web/src/lib/onboarding/import-orchestrator.ts) — accept + forward `mode` through to the ImportJob creation.

**Risk:** A digital PDF with a tiny corrupted text layer would currently route to fast-mode and produce empty paragraphs. Detection: in the fast engine, if the post-classification DocModel has zero `heading`/`paragraph`/`list` blocks for a page that pdfjs reported as having text, the engine throws a sentinel and the worker promotes that page to Gemini. Cheap insurance.

**Verification:** Import a mixed text/scanned PDF in fast mode — confirm DB shows the scanned pages billed against `pdf_import` budget while digital pages cost nothing. Confirm `ImportJob.mode` round-trips. Confirm the Prisma migration applies cleanly.

## P6 — UI mode toggle + acceptance corpus

**Files:**
- `MultiPdfImportModal` (referenced in the onboarding-gizmo-rebuild plan). Add one toggle on the "Add material" step: **"Fast mode — text only, no images or diagrams (free)"**, default off. Per-import scope, no user-pref persistence yet.
- Single-PDF sidebar import path (`SidebarPdfImportButton`): same toggle, surfaced in whatever pre-import affordance currently exists. If none exists, add a small dropdown variant of the button: "Import PDF" / "Import PDF (fast)".

**Tier-aware copy:** none for now. Free-tier defaulting is explicitly out of scope (see Locked Decisions).

**Acceptance corpus:** import each of these in both modes and visually diff the resulting Page in the notebook:
1. Textbook page with figures + body + sidebar callout
2. Slides export from Keynote/PowerPoint
3. Academic paper (multi-column)
4. Magazine spread (rich layout)
5. Worksheet (form fields, mixed text + boxes)
6. A scanned PDF (no text layer) — must produce identical output in both modes because of the per-page fallback

Pass criteria: fast-mode output has correct heading levels and reading order on ≥4 of 5 digital PDFs. Tables present on the textbook page and the worksheet. Figures absent in fast mode (expected); callouts collapsed to paragraphs (expected). Scanned PDF imports succeed in fast mode via fallback.

---

## Rollout

- **P1–P3** ship together as one PR. No flag — caching is pure upside.
- **P4** ships as an internal-only addition; engine exists but no UI path reaches it. Verifies the schema and worker plumbing in isolation.
- **P5** ships behind a `pdf_fast_mode` env flag if we want to gate the schema migration. Migration is additive (default `'rich'`) so it's reversible.
- **P6** removes the flag and surfaces the toggle to users.

---

## Backout

- **Caching (P1–P3):** revert to single-string `system`. Anthropic ignores the cache_control field if absent; no migration to undo.
- **Fast PDF (P4–P6):** drop the toggle, set `mode = 'rich'` on any pending ImportJob rows. The `mode` column can stay (additive) or be dropped via a follow-up migration. The fast engine file can be left in place dormant.

---

## Critical files

| File | Phase | Action |
|---|---|---|
| [chat-stream.ts](apps/web/src/lib/chat-stream.ts) | P1 | Modify — system as TextBlockParam[] with ephemeral cache_control |
| [pages/[pageId]/generate/route.ts](apps/web/app/api/notebooks/[id]/pages/[pageId]/generate/route.ts) | P2 | Modify — same caching pattern |
| [exams/[id]/generate-plan/route.ts](apps/web/app/api/user/exams/[id]/generate-plan/route.ts) | P3 | Modify — route through `buildCachedSystem` |
| [path-generator-routing.ts](apps/web/src/lib/path-generator-routing.ts) | P1–P3 | Reference — `buildCachedSystem` pattern, no change |
| `apps/web/src/lib/pdf-import/engine-text.ts` | P4 | **New** — heuristic text-layer engine emitting DocModel |
| [run-job.ts](apps/web/src/lib/pdf-import/run-job.ts) | P5 | Modify — branch per page on `job.mode` + scanned fallback |
| [engine-gemini.ts](apps/web/src/lib/pdf-import/engine-gemini.ts) | P5 | Reference — no change |
| [onboarding/import-orchestrator.ts](apps/web/src/lib/onboarding/import-orchestrator.ts) | P5 | Modify — forward `mode` |
| `apps/web/prisma/schema.prisma` | P5 | Modify — `ImportJob.mode` |
| `MultiPdfImportModal` | P6 | Modify — mode toggle |
| `SidebarPdfImportButton` | P6 | Modify — mode option |

---

## Open questions (deferred, not blocking)

- Should free-tier users default to fast mode? Tied to the freemium unit-economics target; revisit after P6 ships and we have real per-import cost data.
- Audio / YouTube / EPub ingestion via MarkItDown sidecar — feature roadmap, separate plan, not a cost lever.
- Embedding-based chat-context retrieval (top-K passages instead of full pages) — defer; caching alone likely covers most heavy-chat cost.
