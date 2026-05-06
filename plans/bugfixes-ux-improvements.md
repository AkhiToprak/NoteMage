# Notemage — Bug Fixes & UX Improvements Plan

## Context

Five issues need fixing: (1) AI quizzes have predictable answer positions and obvious correct answers, (2) text across the app is too thin/small, (3) AI chat headings are too small, (4) users can't stop AI generation mid-stream, (5) GoodNotes PDF import loses images. Additionally, existing plan files have been moved into `quizzard/plans/`.

---

## Phase 0: Organize Plan Files ✅

Moved existing plan `.md` files into `quizzard/plans/`:

- `NOTEBOOK_RESTRUCTURE_PLAN.md`
- `revolution.md`
- `lockin-final.md`

---

## Phase 1: Quiz Answer Randomization & Quality

### Phase 1A: Improve AI System Prompt

**File:** `app/api/notebooks/[id]/chats/[chatId]/messages/route.ts` (line 213)

Update the quiz instruction to explicitly tell the AI:

- Distribute correct answers **evenly** across positions 0-3 (A-D) — do not default to B or C
- Make all four options **similar in length and detail** — the correct answer must NOT be longer or more detailed than distractors
- Make distractors **plausible** — they should sound like real answers, not obviously wrong

### Phase 1B: Server-Side Shuffle (Safety Net)

**File:** `app/api/notebooks/[id]/chats/[chatId]/messages/route.ts` (lines 411-414)

After the AI returns quiz data but **before** writing to DB, shuffle each question's options using Fisher-Yates:

1. Save `correctAnswer = options[correctIndex]`
2. Fisher-Yates shuffle the `options` array
3. Set `correctIndex = options.indexOf(correctAnswer)`

Insert this between `quizToolUse.input` extraction and `tx.quizSet.create()`. No schema/UI changes needed — `QuizViewer.tsx` already renders by array index.

---

## Phase 2: Typography Improvements

### Phase 2A: Global Base Font Weight

**File:** `app/globals.css` (body rule, ~line 137)

- Set `font-weight: 500` on body (Plus Jakarta Sans supports 300-800, current default is 400)
- This propagates everywhere unless overridden

### Phase 2B: Increase Key Area Font Sizes

Audit and bump sizes in:

- **Dashboard pages** (`app/(dashboard)/` pages) — small labels, card text
- **Notebook sidebar** (`src/components/notebook/UnifiedSidebar.tsx`) — section/page titles
- **Quiz viewer** (`src/components/notebook/QuizViewer.tsx`) — question text (16px→18px), options (14px→16px)
- **Chat messages** — message body text

### Phase 2C: AI Chat Heading Sizes

**File:** `src/components/ui/MarkdownRenderer.tsx` (lines 32-76)

Current sizes are barely distinguishable from body text. Increase:
| Heading | Current | New |
|---------|---------|-----|
| h1 | `1.35em` | **`2em`** |
| h2 | `1.15em` | **`1.55em`** |
| h3 | `1em` | **`1.25em`** |
| h4 | `0.9em` | **`1.1em`** |

Also increase `margin-top` values for clearer section separation.

---

## Phase 3: Stop AI Generation

### Phase 3A: Switch to Streaming API

**File:** `app/api/notebooks/[id]/chats/[chatId]/messages/route.ts`

Currently uses `anthropic.messages.create()` (line 250) returning complete JSON.

Changes:

1. Return a `ReadableStream` (SSE) instead of `NextResponse.json()` for text-only responses
2. Use `anthropic.messages.stream()` with an `AbortController`
3. Listen for `request.signal.aborted` to abort the Anthropic call
4. Stream text deltas to client as SSE chunks
5. On completion or abort, run post-processing (tool extraction, DB save)

**Tool use handling:** Buffer tool_use blocks server-side (don't stream them). On abort, save partial text only, skip incomplete tool_use processing. Don't increment feature-specific usage counters if tools weren't completed.

### Phase 3B: Client Streaming Hook

**New file:** `src/hooks/useStreamingChat.ts`

Custom React hook:

- `fetch()` with `ReadableStream` reader
- Parses SSE chunks, updates message state incrementally
- Exposes `abort()` via `AbortController`
- State: `idle | streaming | done | aborted`

### Phase 3C: Stop Button in Chat UI

**File:** `app/(dashboard)/notebooks/[id]/chats/[chatId]/page.tsx`

- Replace current fetch logic with streaming hook
- Show **"Stop generating"** button (square stop icon) while streaming
- On click → `abort()` → mark partial message as final → re-enable input
- Messages update incrementally (typewriter effect)

### Phase 3D: Handle Partial Responses in DB

**File:** `app/api/notebooks/[id]/chats/[chatId]/messages/route.ts`

On abort:

- Save user message (already sent)
- Save partial assistant text with `[generation stopped]` suffix
- Record actual token usage
- Don't increment tool-feature usage counters

---

## Phase 4: GoodNotes PDF Import Fix

### Phase 4A: Root Cause

**File:** `app/api/notebooks/[id]/sections/[sectionId]/import/route.ts` (lines 101-123)

The bug: PDF images are extracted and saved as `PageImage` records, but **never inserted into the TipTap JSON content**. The editor only shows the text. This affects all PDF imports, especially GoodNotes exports (which are primarily images of handwriting).

### Phase 4B: Embed Images into TipTap Content

**File:** `app/api/notebooks/[id]/sections/[sectionId]/import/route.ts`

After extracting and saving images (line 107-118), update the page content:

1. Build TipTap image nodes for each saved image:
   ```json
   {
     "type": "image",
     "attrs": {
       "src": "/api/notebooks/{notebookId}/pages/{pageId}/images/{imageId}",
       "alt": "filename"
     }
   }
   ```
2. Append image nodes to the existing TipTap `content` array
3. `db.page.update()` with the enriched content

Need to verify the correct image URL pattern by checking the image serving route.

### Phase 4C: Verify TipTap Image Extension

Check that the TipTap editor config includes the `Image` extension (likely yes, given `ImageUploadButton.tsx` exists). If missing, add it.

### Phase 4D: Improve GoodNotes Tab UX

**File:** `src/components/notebook/ImportNotebookDialog.tsx` (lines 497-542)

Add a direct **"Import PDF"** button at the bottom of the GoodNotes instructions that triggers the file import dialog, so users don't have to navigate elsewhere after exporting from GoodNotes.

---

## Phase 5: Verification

### Phase 5A: Quiz Testing

- Generate 10+ quizzes, verify answer distribution across A/B/C/D
- Check answer lengths are similar
- Confirm `correctIndex` is correct after shuffle

### Phase 5B: Typography Check

- Review dashboard, notebook, chat, quiz screens
- Verify no layout breaks from size increases
- Check mobile responsiveness

### Phase 5C: Streaming Test

- Full response completion
- Mid-text abort (partial text saved)
- Abort during tool use (tool discarded)
- Rapid send-abort-send

### Phase 5D: PDF Import Test

- Import a PDF with embedded images
- Verify images appear in editor
- Test text-only PDFs still work

---

## Implementation Order

1. **Phase 0** — Move plan files (trivial) ✅
2. **Phase 1** — Quiz randomization (self-contained, high impact)
3. **Phase 2** — Typography (CSS changes, low risk)
4. **Phase 4** — PDF import fix (medium complexity, fixes broken feature)
5. **Phase 3** — Streaming + stop button (highest complexity)
6. **Phase 5** — Testing throughout and at end

## Critical Files

| File                                                          | Issues                            |
| ------------------------------------------------------------- | --------------------------------- |
| `app/api/notebooks/[id]/chats/[chatId]/messages/route.ts`     | 1, 4 (prompt, shuffle, streaming) |
| `src/components/ui/MarkdownRenderer.tsx`                      | 3 (heading sizes)                 |
| `app/globals.css`                                             | 2 (base typography)               |
| `app/api/notebooks/[id]/sections/[sectionId]/import/route.ts` | 5 (PDF image embedding)           |
| `app/(dashboard)/notebooks/[id]/chats/[chatId]/page.tsx`      | 4 (stop button UI)                |
| `src/components/notebook/ImportNotebookDialog.tsx`            | 5 (GoodNotes tab UX)              |
