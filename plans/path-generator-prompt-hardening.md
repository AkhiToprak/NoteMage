# Path-Generator Prompt Hardening & Caching

## Context

A review of the guided learning-path prompts surfaced three classes of issue in the
two-stage generator (`src/lib/path-prompts.ts` + `src/lib/path-generator.ts`):

1. **No caching of static prompt text.** Each path fires ~50 LLM calls. Only the
   source-materials corpus is sent as a cached block (`buildCachedSystem`,
   `path-prompts.ts:144`). The large per-stage rule catalogs (e.g. the 11-kind quiz
   payload spec) live in an *uncached* block and are re-billed on every call — and
   when a path has **no** source materials, `buildCachedSystem` returns a plain
   string so **nothing** is cached. This conflicts with the freemium COGS target.
2. **A dead model contract field.** Stage A asks the model for a per-slot `covers`
   array, but `enforceSpacedReviews` (`path-generator.ts:476`) recomputes it from
   scratch and never reads the model's value — wasted tokens + an extra failure surface.
3. **Prompt/schema inconsistencies** that can mislead the model (a contradiction, a
   dangling cross-reference, and minor enum/count drift).

**Goal:** cut token cost, remove the dead contract, and fix the contradictions —
**without changing the quality or shape of generated content.**

### Architecture facts the executor must know (do not re-derive)

- **Anthropic path forces the tool** (`tool_choice`, `path-generator-anthropic.ts:65`),
  so JSON-shape / "no markdown fences" prose is redundant there but is **load-bearing
  for Gemini**, which runs JSON-mode with **no** `responseSchema`
  (`path-generator-routing.ts:140-148`). ⇒ Do **not** delete shape/format prose.
- **Default model is Haiku** (`claude-haiku-4-5`) for every stage; **Sonnet** only on
  ultra quizzes (`path-generator-routing.ts:108-113`). Min cacheable prefix ≈ **2048
  tokens** on Haiku.
- The Gemini structure schema **auto-derives** from the Anthropic tool
  (`PATH_STRUCTURE_SCHEMA_GEMINI = toGeminiSchema(PATH_STRUCTURE_TOOL.input_schema)`),
  so editing the Anthropic tool schema is sufficient for both providers.
- Only **1** `cache_control` breakpoint is used today (the corpus); Anthropic allows 4.

---

## Phase 1 — Quick consistency fixes (low risk, copy-only)

**Files:** `src/lib/ai-tools.ts`, `src/lib/path-prompts.ts`

1. **Flashcard contradiction.** `FLASHCARDS_FOR_SLOT_TOOL` `question` field description
   says `"A direct question, prompt, or fill-in."` (`ai-tools.ts:839`), contradicting the
   prompt rule "Do NOT write blanks (`___`)" (`path-prompts.ts:284`). → Change the schema
   description to drop "fill-in", e.g. `"A direct question or recall prompt — no
   fill-in-the-blank."`
2. **Dangling cross-reference.** `QUIZ_FOR_SLOT_TOOL` description says
   `"See create_quiz_v2 for the exact payload shape per kind"` (`ai-tools.ts:863`), but
   `create_quiz_v2` is never sent on path calls (only `QUIZ_FOR_SLOT_TOOL` is). → Reword
   to point at the system prompt instead, e.g. `"Use the exact payload shapes given in
   the system prompt; the server rejects drift."`
3. **`code_output` enum drift.** The quiz prompt's `code_output` line
   (`path-prompts.ts:368`) omits `plaintext`, which the type/schema allow
   (`ai-tools.ts:103,383`). → Add `plaintext` to the prompt line for parity.
4. **(Optional) Count guidance.** Prompt says "3–6 sections / 3–6 slots each"
   (`path-prompts.ts:177`); schema bounds are phases 1–10, slots 2–8
   (`ai-tools.ts:743-744,749-750`). These are compatible (soft ⊂ hard), so this is
   cosmetic — only tighten `maxItems` if a stricter cap is wanted. Leave by default.

**Verify:** `tsc` only (pure string edits).

---

## Phase 2 — Remove the discarded `covers` from the model contract (low risk, verified safe)

**Files:** `src/lib/ai-tools.ts`, `src/lib/path-prompts.ts`
**Do NOT touch:** `enforceSpacedReviews`, the persist route, the Gemini schema (auto-derived),
or `normalizePathStructure` (its `covers` coercion is harmless and makes us robust to
stray Gemini output).

Verified: the model's `covers` is never read before `enforceSpacedReviews` overwrites it
(writes at `path-generator.ts:522,534,543`); the persist route reads the recomputed value.

1. `ai-tools.ts` — delete the `covers` property from
   `PATH_STRUCTURE_TOOL.input_schema...slots.items.properties` (`ai-tools.ts:731-736`).
2. `ai-tools.ts` — remove the `covers` mentions from the `PATH_STRUCTURE_TOOL`
   description (`ai-tools.ts:672`, and the `(its "covers" lists …)` clauses at
   `:677-678`). Keep the kind/rhythm guidance.
3. `path-prompts.ts` — remove the `covers` bullet from `buildPathStructurePrompt`
   (`path-prompts.ts:188`). **Keep** all `learning/review/assessment` kind + rhythm
   guidance (lines 190-196): `enforceSpacedReviews` preserves model-authored review/
   assessment **titles**, so that guidance still improves output.
4. `ai-tools.ts` — **KEEP** the `covers?: number[]` field on the `PathStructureSlot`
   interface (`ai-tools.ts:204-222`); it is the internal channel `enforceSpacedReviews`
   writes and the persist route reads. Update its comment to: *"Computed by
   `enforceSpacedReviews`; NOT emitted by the model."*

**Verify:** `tsc`; generate one path; confirm sections still end with a graded
`assessment`, `review` slots still appear, and `coversSlotIds` still populate on
checkpoints.

---

## Phase 3 — Prompt-caching restructure (highest value)

**Goal:** make the per-path-constant static rule text a **cached** block so it is billed
~once per path instead of on each of ~50 calls. Content stays identical — only the block
layout changes.

**Approach (Option B — split `system` into cached-static + uncached-dynamic; keep the
trivial user turn; lowest churn).**

**Files:** `src/lib/path-prompts.ts`, `src/lib/path-generator-routing.ts`,
`src/lib/path-generator.ts`

### 3a. Split the four builders (`path-prompts.ts`)
Change `buildPathStructurePrompt` / `buildTheoryPrompt` / `buildFlashcardsPrompt` /
`buildQuizPrompt` to return `{ system: string; tail: string }` instead of one string.

- **`system`** = per-path-constant, cacheable: role intro, JSON-shape spec, kind/payload
  catalogs, voice/math rules, the source-materials instruction line, the **subject
  fragment** (`subjectGuidanceFragment` / `…ToneFragment` / `…QuizGuidanceFragment` — all
  per-path-constant), and the **`languageDirective`**.
  Static source ranges: structure `166-195`, theory `223-239`, flashcards `274-290`,
  quiz `329-375` (+ the subject fragment currently at `406`).
- **`tail`** = per-slot/per-phase dynamic: `pathTitle`/`pathDescription`,
  `phaseTitle`/`phaseDescription`, `slotTitle`, `slotTopicHint`, `slotObjective`,
  the learner-brief line, the `reviewOf` list, and (quiz only) the `slotKind` framing +
  question-range.
- **`buildQuizPrompt` reorder:** move the subject fragment (`path-prompts.ts:406`) up into
  `system`, ahead of the dynamic `reviewOf`/path/slot tail (`377-425`). Keep the tail's
  internal order otherwise unchanged. The other three builders already append dynamic
  content last, so their split is a clean cut at the ranges above.

### 3b. Rework `buildCachedSystem` (`path-prompts.ts:144`)
New signature: `buildCachedSystem(corpus, staticInstructions, dynamicTail)`. Always return
`TextBlockParam[]` (the Anthropic wrapper already accepts `string | TextBlockParam[]`),
in order:
```
[ corpus?      → cache_control: ephemeral ,
  static       → cache_control: ephemeral ,
  dynamicTail  → (no cache_control) ]
```
With no corpus, emit `[ static(cached), tail(uncached) ]` — that alone fixes the
"title-only paths cache nothing" gap.

### 3c. Dispatcher (`path-generator-routing.ts`)
- Replace `StructuredCallCtx.instructions: string` (`:63`) with
  `staticInstructions: string; dynamicInstructions: string`.
- Anthropic branch (`:114`): `buildCachedSystem(ctx.corpus, ctx.staticInstructions,
  ctx.dynamicInstructions)`.
- Gemini branch (`:136-138`): `systemInstruction = [maybe corpus block,
  staticInstructions, dynamicInstructions].join('\n\n')` — concat (Gemini has no cache
  split, but the stable prefix still helps its implicit cache).

### 3d. Call sites (`path-generator.ts`)
At each site — `generatePathStructure` (`:399`), `generateTheoryActivity` (`:763`),
`generateFlashcardsActivity` (`:862`), `callQuizDispatch`/`generateQuizActivity`
(`:995`, `:1073`) — destructure `const { system, tail } = buildXxxPrompt(ctx)`, then
**append every retry/corrective notice to `tail` only** (today they append to the whole
`instructions`, e.g. `:409-418`, `:772-781`, `:871-880`, `:1008-1017`, `:1073-1080`).
Pass `staticInstructions: system, dynamicInstructions: <tail + notices>`. This keeps the
cached prefix byte-identical across the 2–3 activity retries (a secondary win: retries no
longer re-bill the rules).

### Caveats (state, don't fix)
Haiku min cacheable prefix ≈2048 tokens. **With** corpus, corpus+static clears it on all
stages. **Without** corpus, quiz (~2.5–3k tok) and structure (~2–2.5k) static blocks
still cache; theory (~1.5–2k) and flashcards (~1.2–1.6k) may fall under the min and simply
won't cache — **no penalty**, identical to today. Net strictly non-negative. Adds 1 cache
breakpoint (2 of 4 used).

**Verify:** `tsc`; generate one path **with** materials and one **without**; read the
`path.generation.completed` telemetry (`path-generator.ts:1326`) and confirm
`usage.cacheReadTokens` rises across the with-corpus run vs. today. Diff a generated path
before/after to confirm content is unchanged.

---

## Phase 4 — (Optional) Single-source the rule catalogs (maintainability only)

After Phase 3 the duplicated prose is cached, so cost is no longer the driver — only
**drift** risk remains between `path-prompts.ts` and the `ai-tools.ts` tool descriptions
(e.g. the quiz payload catalog appears in both: `path-prompts.ts:359-370` and
`ai-tools.ts:374-385`). Optional: extract that catalog into one shared constant imported
by both. **Defer unless drift is actively biting** — it carries provider-specific risk and
no cost upside post-Phase 3.

---

## Files touched

| File | Phases |
| --- | --- |
| `src/lib/ai-tools.ts` | 1, 2 |
| `src/lib/path-prompts.ts` | 1, 2, 3 |
| `src/lib/path-generator-routing.ts` | 3 |
| `src/lib/path-generator.ts` | 3 (call sites only) |

**Not touched:** `enforceSpacedReviews` logic, the persist route
(`src/app/api/learn/paths/route.ts`), `normalizePathStructure`, both provider wrappers'
core logic, the Gemini schema (auto-derived).

## End-to-end verification

1. **Typecheck:** `corepack pnpm --filter web typecheck` (lint baseline is pre-red — scope
   to changed files).
2. **Generate paths** (admin acct `4toprak25@gmail.com` on the dev preview): one with
   source materials, one title-only. Confirm: sections end with `assessment`, `review`
   slots present, quizzes have ≥3 question kinds, theory + flashcards populate,
   `coversSlotIds` set.
3. **Caching:** compare `path.generation.completed` telemetry usage before/after —
   `cacheReadTokens` should climb on repeated same-path calls.
4. **No-regression:** diff a generated path's content before/after Phase 3 — should be
   materially identical (block reordering only).
5. Per project memory, **do not auto-spin a dev server for screenshots** — lean on `tsc` +
   the user's manual generation run. The path-generation portions of
   `plans/personal-duolingo-rework-manual-tests.md` cover the manual pass.
