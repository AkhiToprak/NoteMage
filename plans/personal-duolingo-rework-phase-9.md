# NoteMage Phase 9 — Detach Learning Surfaces from Notebooks

## Context

NoteMage's learning surfaces (study paths, flashcard sets, quiz sets, mage chats) are all currently scoped to one notebook each. The notebook sidebar (`apps/web/src/components/notebook/UnifiedSidebar.tsx`) carries five concerns at once: file/section tree, chats, flashcards, quizzes, and the learn-setup entry. As the rework's Phase 5–8 has played out, two things have become clear:

1. Users want to **create quizzes, flashcards, and chats that draw from multiple notebooks** — a single-notebook scope means you can't, for example, build a quiz across "Physics 1" and "Physics 2" notebooks even though the content is one continuous topic in the user's head.
2. The notebook sidebar is overloaded — recent commits (`0280ec1`, `8c4c9d2`) have already started thinning it, and the `/learn` route (Phase 5) is the natural home for the surfaces that don't belong inside a single notebook.

This phase finishes that move. It pulls study paths, flashcards, quizzes, and mage chats out of the notebook sidebar and gives them a **top-level `/learn` hub** with four tabs. Items list grouped by their source notebook; cross-notebook items land in a dedicated group. The mage chat gets a list-and-detail surface here, with chat threads grouped under their source notebook in a left rail, plus the ability to create new chats with context spanning multiple notebooks or ad-hoc file uploads. Chat titles auto-generate (3–5 words) from the first user prompt.

This is **Phase 9 of `plans/personal-duolingo-rework.md`** and answers the rework's Decision Point #6 ("per-notebook vs cross-notebook path scope") with "cross-notebook, now."

---

## Decisions taken (2026-05-11)

1. **Paths also become cross-notebook in this phase.** `StudyPlan.notebookId` becomes nullable; a new `contextNotebookIds` array lets a single path draw from multiple notebooks.
2. **Ad-hoc chat uploads live in a visible, pinned "Inbox" notebook** (Mail icon, pinned at top of `/notebooks` list). Reuses the existing `Document` model. Users can browse what they've uploaded ad-hoc.
3. **"Ask the mage about this page" opens a pre-filled `CreateChatModal`** with the current page selected — gives the user a chance to add more context before sending the first message.

---

## Information architecture

### Routes

```
/learn                  → redirect to /learn/paths
/learn/paths            → existing /learn content, no logic change (today's PathView list)
/learn/paths/[planId]   → existing study-plan detail (moved from /notebooks/[id]/study-plan/[planId])
/learn/flashcards       → grouped flashcard sets
/learn/quizzes          → grouped quiz sets
/learn/chats            → list rail + detail pane (default deep-link target)
/learn/chats/[chatId]   → detail view, deep-linkable
```

A new `app/(dashboard)/learn/layout.tsx` renders a sticky tab strip across the 4 tabs (icons: `school`, `style`, `quiz`, `chat`). Tab labels: "Paths", "Flashcards", "Quizzes", "Chats". Active state from `usePathname()`.

The global sidebar (`Sidebar.tsx` line 29) keeps its single `/learn` entry — no expansion. Tabs handle the four sub-areas in-page.

### Notebook sidebar after Phase 9

`UnifiedSidebar.tsx` keeps: sections/pages tree, workspace search, import/export, mascot, timer widget, Co-Work bar. It loses: chat list and "New chat", flashcard manager, quiz creator, `LearnNotebookSetup`, first-path onboarding prompt.

In-notebook discoverability is replaced by a **header "Generate" dropdown** (extend `apps/web/src/components/notebook/GenerateDropdown.tsx`):

- "Generate flashcards from this page" → opens pre-filled flashcard-set creator
- "Generate quiz from this page" → opens pre-filled quiz creator
- "Ask the mage about this page" → opens `CreateChatModal` pre-filled with `defaultContextPageIds=[currentPageId]`
- "Generate study path from this notebook" → opens unified `LearnNotebookSetup` modal (no longer sidebar-tab)

Each shortcut, on submit, redirects to the corresponding `/learn/*` surface with `?highlight=<id>` so the receiving page can scroll and pulse the new item.

---

## Data model changes

For **`NotebookChat`**, **`FlashcardSet`**, **`QuizSet`**, **`StudyPlan`** (all in `apps/web/prisma/schema.prisma`):

- Add `userId String` (NOT NULL after backfill, FK to `User`, indexed)
- Make `notebookId` nullable (`String?`), relation `onDelete: SetNull` (was `Cascade`)
- For `NotebookChat` and `StudyPlan`, add `contextNotebookIds String[] @default([])`

For **`Notebook`** (line 205):

- Add `kind String @default("standard")` (values: `"standard"` | `"inbox"`). One Inbox per user, lazily created on first ad-hoc upload via `getOrCreateInboxNotebook(userId)` in new `apps/web/src/lib/inbox.ts`.
- `/notebooks` list endpoints sort `kind = 'inbox'` first, then standard notebooks by `updatedAt DESC`.
- Inbox renders with a Material `mail` icon and "Inbox" label; the user cannot rename or delete it (server-side guard).

For **`ChatMessage`**: `notebookId` becomes nullable too (cleanup deferred to Phase 9.6 — no functional impact in earlier phases since every existing chat has a notebook).

---

## Auto-titled chats

- Hook fires in `apps/web/src/lib/chat-stream.ts` (new file, extracted from `app/api/notebooks/[id]/chats/[chatId]/messages/route.ts` lines 274–997) immediately after the first user message's transaction commits.
- Guard: `if (firstUserMessage && chat.title === 'New Chat')` — never clobbers user-renamed chats.
- New `apps/web/src/lib/chat-title.ts` — Haiku 4.5 single-shot call, `max_tokens: 30`, system prompt: "Return a 3–5 word title for this conversation in plain text. No quotes, no period. Use Title Case."
- Fire-and-forget: `void generateAndPersistTitle(chatId, userMessage).catch(log)` — never blocks the SSE response.
- Failure mode: title stays "New Chat", user can rename manually. No retry job in v1.
- Token cost: not metered against user budget (treated as system feature).

---

## The `/learn/chats` page

### Layout

`apps/web/app/(dashboard)/learn/chats/page.tsx` (new):

- **Left rail (280px):** sticky "New chat" button → opens generalized `CreateChatModal`. Search input (filters by title client-side). Groups, each collapsible:
  - One group per notebook the user has chats in (color-coded badge from `notebook.color`)
  - "Cross-notebook" group for chats with `notebookId=null` and `contextNotebookIds.length > 0`
  - "Inbox" group for chats whose only context is uploaded files
- **Main pane:** the chat thread itself, rendered by new `apps/web/src/components/learn/ChatThread.tsx` (extracted from `apps/web/app/(dashboard)/notebooks/[id]/chats/[chatId]/page.tsx`). Used by both the old per-notebook route and the new hub route during transition.

### CreateChatModal generalization

`apps/web/src/components/notebook/CreateChatModal.tsx` becomes `apps/web/src/components/learn/CreateChatModal.tsx`:

1. Drop `notebookId`/`notebookName` required props; accept optional `defaultNotebookId` and `defaultContextPageIds`/`defaultContextDocIds`.
2. The current `SectionPickerItem` (lines 698–829) becomes one entry inside a new `NotebookPickerSection` that lists every user-owned notebook collapsed; pages from multiple notebooks can coexist.
3. Add "Inbox / uploads" virtual section at the top of the picker.
4. Upload flow: with no `defaultNotebookId`, POST to new `/api/learn/uploads`; otherwise existing per-notebook upload endpoint.
5. Submit POSTs to `/api/learn/chats` with `{ title?, contextPageIds, contextDocIds, contextNotebookIds }`.
6. Title input is collapsed by default behind a "Custom title (optional)" disclosure (since titles auto-generate).

### Continuing old chats

`/learn/chats/[chatId]` renders the same chat row that `/notebooks/[id]/chats/[chatId]` renders today — they read the same DB record. Old URLs **301-redirect** to the new path so embedded `[flashcard_set:<id>]` / `[quiz_set:<id>]` / `[mindmap_*]` links in stored `ChatMessage.content` keep resolving.

---

## API surface

New endpoints (under `apps/web/app/api/learn/`):

- `GET /api/learn/chats` — flat list, grouped client-side. Returns `{ id, title, primaryNotebookId, primaryNotebookName, contextNotebookIds, updatedAt, messageCount }`
- `GET /api/learn/chats/[chatId]` — single chat with messages
- `POST /api/learn/chats` — create chat. Validates each context page/doc ID belongs to a notebook the user owns. Derives `primaryNotebookId` = notebook with most selected pages/docs (tiebreak: most recently touched). `null` if only Inbox content.
- `POST /api/learn/chats/[chatId]/messages` — SSE streaming, delegates to `apps/web/src/lib/chat-stream.ts`. **This is where auto-title fires.**
- `PATCH /api/learn/chats/[chatId]` — title rename, context updates
- `POST /api/learn/uploads` — Inbox upload (lazily creates Inbox notebook)
- `GET /api/learn/paths` (or extend existing `GET /api/study-plans`) — returns flat list with `notebookId?` and `contextNotebookIds[]`
- `POST /api/learn/paths` — create path with multi-notebook context

Existing per-notebook routes stay for back-compat and the inline "Generate" affordances — they delegate to the same lib functions.

---

## Migration & backfill

**One migration PR (Phase 9.1):**

1. Add `user_id TEXT` (nullable initially) to `notebook_chats`, `flashcard_sets`, `quiz_sets`, `study_plans`.
2. Backfill: `UPDATE <table> SET user_id = n.user_id FROM notebooks n WHERE <table>.notebook_id = n.id;`
3. After verification, `ALTER COLUMN user_id SET NOT NULL` and add FK + index for each.
4. Drop existing `notebook_id` FK on each, recreate with `ON DELETE SET NULL` and `ALTER COLUMN notebook_id DROP NOT NULL`.
5. Add `context_notebook_ids TEXT[] DEFAULT '{}'` to `notebook_chats` and `study_plans`.
6. Add `kind TEXT DEFAULT 'standard'` to `notebooks`.

**Existing reads that assume non-null `notebookId`** — patch in Phase 9.1:

- `apps/web/app/api/study-plans/route.ts:22` — `where: { notebook: { userId } }` → `where: { userId }`
- `apps/web/app/api/flashcard-sets/route.ts:13` — same
- `apps/web/app/api/quiz-sets/route.ts:13` — same
- `apps/web/app/api/notebooks/[id]/chats/route.ts` lines 96–114 — same-notebook validation broadens to "id belongs to a notebook the user owns" (only for the new `/api/learn/chats` route; per-notebook route keeps tight check)
- `apps/web/app/api/notebooks/[id]/chats/[chatId]/messages/route.ts` lines 115–179 — context loader drops the `section.notebookId === notebookId` predicate, swaps to `notebook.userId === userId`
- `/notebooks` list endpoints — sort `kind = 'inbox'` first

---

## Phasing

Six PRs, each behind feature flag `NEXT_PUBLIC_LEARN_HUB_V2`:

### Phase 9.1 — Schema + backfill (no UX change)

**Single agent. Blocks every later phase.**

Migration as above. Update Prisma client. Patch the existing reads listed in §Migration. No new routes, no UI changes. Verify: `pnpm -r typecheck` clean, sample reads return identical results, existing chat/flashcard/quiz/plan flows work unchanged.

### Phase 9.2 — Inbox notebook + cross-notebook API surface (3 agents parallel)

**Depends on 9.1.**

- **Agent A:** `apps/web/src/lib/inbox.ts` + `getOrCreateInboxNotebook(userId)`. `POST /api/learn/uploads`. `/notebooks` list endpoint sorts Inbox first. Server-side rename/delete guard on Inbox notebooks.
- **Agent B:** Extract `apps/web/src/lib/chat-stream.ts` from `messages/route.ts` lines 274–997. Both old and new chat-message endpoints delegate. New routes: `GET/POST /api/learn/chats`, `GET/POST/PATCH /api/learn/chats/[chatId]`, `POST /api/learn/chats/[chatId]/messages`. New routes: `GET/POST /api/learn/paths` (or extend `/api/study-plans`).
- **Agent C:** `apps/web/src/lib/chat-title.ts` + fire-and-forget hook in `chat-stream.ts`.

Verify: new endpoints work via curl. Existing notebook-scoped chat UI still functional (proves delegation). First-message titles update within ~3s.

### Phase 9.3 — `/learn/chats` hub (highest user-visible value) (3 agents parallel)

**Depends on 9.2.**

- **Agent A:** `app/(dashboard)/learn/layout.tsx` with 4-tab nav. `app/(dashboard)/learn/page.tsx` → redirect to `/learn/paths`. Move existing `/learn` content to `app/(dashboard)/learn/paths/page.tsx`. New `app/(dashboard)/learn/chats/page.tsx` and `app/(dashboard)/learn/chats/[chatId]/page.tsx`.
- **Agent B:** Extract chat thread render logic into `apps/web/src/components/learn/ChatThread.tsx`. Refactor `CreateChatModal` into `apps/web/src/components/learn/CreateChatModal.tsx` with multi-notebook picker + Inbox virtual section + `defaultContextPageIds` prop.
- **Agent C:** 301 redirects from `/notebooks/[id]/chats` and `/notebooks/[id]/chats/[chatId]` to `/learn/chats[/[chatId]]` (Next.js config or per-page server redirect).

Verify: create a chat with pages from 2 notebooks + 1 Inbox file → context loads correctly → auto-title generates within ~3s → old per-notebook URL redirects cleanly → in-message `[flashcard_set:<id>]` links still resolve.

### Phase 9.4 — `/learn/paths` cross-notebook upgrade + flashcards/quizzes hubs (3 agents parallel)

**Depends on 9.3 (layout) only.**

- **Agent A:** `/learn/paths/[planId]` cross-notebook support. `LearnNotebookSetup.tsx` becomes `LearnPathSetup.tsx` — accepts optional `defaultNotebookId`, otherwise lets user pick from multiple notebooks. `StudyMaterial.referenceId` validation broadens (must belong to user, not specific notebook). Path gating queries (`apps/web/src/lib/path-gating.ts`) switch from notebook-scoped to user-scoped.
- **Agent B:** `app/(dashboard)/learn/flashcards/page.tsx` — grouped grid using existing `/api/flashcard-sets`. Groups by notebook name with color badge; "Cross-notebook" + "Inbox" buckets.
- **Agent C:** `app/(dashboard)/learn/quizzes/page.tsx` — same pattern.

Both pages: empty state CTA pointing to notebook-header "Generate" affordance. Opening a set still routes to its notebook player view for v1.

Verify: existing per-notebook sets/quizzes appear correctly grouped. Cross-notebook paths can be generated and pass checkpoints.

### Phase 9.5 — Notebook sidebar cleanup + header affordances

**Depends on 9.3 + 9.4. Single agent.**

- `UnifiedSidebar.tsx`: remove chat list, flashcard manager trigger, quiz creator, `LearnNotebookSetup` button, first-path prompt. Keep sections, search, import/export, mascot, timer, Co-Work bar.
- Extend `GenerateDropdown.tsx` with the four shortcuts in §Information architecture. "Ask the mage about this page" opens `CreateChatModal` with `defaultContextPageIds=[currentPageId]`. Other shortcuts use existing per-notebook POST endpoints + redirect with `?highlight=<id>`.
- Receiving pages (`/learn/flashcards`, `/learn/quizzes`, `/learn/chats`) read `?highlight` and scroll-pulse the matching item.

Verify: notebook page still feels useful (search + sections work). All "create" entry points reachable in ≤2 clicks from any notebook page. Light theme audit (no white text on light surfaces — see memory `feedback_light_mode_no_light_text`).

### Phase 9.6 — Polish, flag flip, telemetry

**Depends on 9.5.**

- Make `ChatMessage.notebookId` nullable (last schema cleanup).
- Flip `NEXT_PUBLIC_LEARN_HUB_V2` for all users.
- Telemetry: `learn.tab_view`, `chat.multi_notebook_created`, `chat.inbox_upload`, `chat.title_generated`, `chat.title_gen_failed`.
- Sentry breadcrumb on context-load failures in `chat-stream.ts`.
- Update `plans/personal-duolingo-rework.md` Decision Point #6 — mark resolved.
- Add Phase 9 cases to `plans/personal-duolingo-rework-manual-tests.md`.
- Remove dead per-notebook validation code paths now unreachable.

---

## Critical files to modify

| Concern | File |
|---|---|
| DB schema | `apps/web/prisma/schema.prisma` (lines 205, 271, 315, 380, 593) |
| Inbox lib | `apps/web/src/lib/inbox.ts` (new) |
| Chat streaming (extract) | `apps/web/src/lib/chat-stream.ts` (new, from `messages/route.ts` lines 274–997) |
| Chat title gen | `apps/web/src/lib/chat-title.ts` (new) |
| Learn layout | `apps/web/app/(dashboard)/learn/layout.tsx` (new) |
| Learn redirect | `apps/web/app/(dashboard)/learn/page.tsx` (becomes redirect) |
| Paths page | `apps/web/app/(dashboard)/learn/paths/page.tsx` (move from `/learn`) |
| Flashcards hub | `apps/web/app/(dashboard)/learn/flashcards/page.tsx` (new) |
| Quizzes hub | `apps/web/app/(dashboard)/learn/quizzes/page.tsx` (new) |
| Chats hub | `apps/web/app/(dashboard)/learn/chats/page.tsx` + `[chatId]/page.tsx` (new) |
| Chat thread (extract) | `apps/web/src/components/learn/ChatThread.tsx` (new, from `app/(dashboard)/notebooks/[id]/chats/[chatId]/page.tsx`) |
| Multi-notebook modal | `apps/web/src/components/learn/CreateChatModal.tsx` (refactored from `apps/web/src/components/notebook/CreateChatModal.tsx`) |
| New API | `apps/web/app/api/learn/chats/route.ts`, `apps/web/app/api/learn/chats/[chatId]/route.ts`, `apps/web/app/api/learn/chats/[chatId]/messages/route.ts`, `apps/web/app/api/learn/uploads/route.ts`, `apps/web/app/api/learn/paths/...` |
| Notebook sidebar slim | `apps/web/src/components/notebook/UnifiedSidebar.tsx` |
| Generate dropdown | `apps/web/src/components/notebook/GenerateDropdown.tsx` |
| Path gating | `apps/web/src/lib/path-gating.ts` (user-scoped queries) |
| Learn setup rename | `apps/web/src/components/notebook/LearnNotebookSetup.tsx` → `apps/web/src/components/learn/LearnPathSetup.tsx` |

### Existing utilities to reuse, not rebuild

- `apps/web/src/lib/anthropic.ts` — Haiku client config for `chat-title.ts`
- Streaming logic, SSE framing, tool-dispatch — currently embedded in `messages/route.ts`; extract into `chat-stream.ts` so both old and new routes share it
- `apps/web/src/components/notebook/CreateChatModal.tsx` — generalize, don't fork
- `apps/web/app/api/study-plans/route.ts` — already returns cross-notebook flat list (just patch the where clause)
- `getAuthUserId(request)` pattern — every new endpoint uses it
- Path-gating logic in `apps/web/src/lib/path-gating.ts` — `annotatePhases()` stays; only the query that fetches the plan + its phases switches from `notebook.userId` to `userId`

---

## Design system conventions (apply throughout)

Per `apps/web/.claude/rules/figma-design-system.md` and project memory:

- Inline `style={{}}` with CSS custom properties (`var(--primary)`, `var(--surface-container)`, etc.) — not Tailwind utilities (except `glass-panel`, `surface-elevated`, `custom-scrollbar`, etc.)
- Material Symbols Outlined for all icons (`<span className="material-symbols-outlined">school</span>`)
- **No gradients** anywhere — solid colors only
- Spring easing `cubic-bezier(0.22, 1, 0.36, 1)` 0.35s; animate `transform` and `opacity` only — never `transition-all`
- Light theme: no white/light text on light surfaces — audit every new tab and grouped list
- Surface hierarchy: tab strip on `surface-container-low`, active tab on `surface-container-high`, content cards on `surface-container`

---

## Verification plan

**Per-phase:**

- `pnpm -r typecheck` clean
- Read changed files end-to-end (no helper-presence assumptions — see memory `feedback_verify_render_tree`)
- Prisma migration dry-run + apply on dev DB
- Manual exercise of the changed flow in Chrome at desktop + mobile widths (don't auto-start dev server per memory; verify by reading + tsc unless explicitly asked)

**End-to-end at the close of each major phase:**

- **After 9.1:** existing chat/flashcard/quiz/path flows unchanged. Cross-notebook queries return identical results to the per-notebook queries.
- **After 9.2:** curl tests for every new endpoint. Auto-title fires within ~3s of a first user message; second user message in the same chat does **not** trigger another rename. Inbox notebook auto-creates on first ad-hoc upload.
- **After 9.3:** create a chat with pages from 2 different notebooks + 1 Inbox file → all three context sources reach the AI on the first turn → auto-title generates and updates the row → old per-notebook URL 301-redirects → embedded `[flashcard_set:<id>]` links in chat history still resolve.
- **After 9.4:** generate a study path that draws materials from 2 notebooks → checkpoints pass correctly → flashcards/quizzes lists group by notebook with the color badge → "Cross-notebook" group surfaces correctly when a cross-notebook set exists.
- **After 9.5:** every "Generate" entry point reachable from the notebook header in ≤2 clicks → "Ask the mage about this page" opens the pre-filled modal → light-mode visual audit of new tabs.
- **After 9.6:** full end-to-end pass of `plans/personal-duolingo-rework-manual-tests.md` (which now has Phase 9 additions).

**iOS shell smoke test** (Phase 9.3 + 9.5):

- New `/learn/chats` reachable inside WebView (no landing redirect — authed surface)
- Inbox upload from iOS works
- Multi-notebook picker scrolls correctly at iPhone viewport
- Header "Generate" dropdown works inside the notebook tab on iOS

---

## Open items deferred to later phases

- **Detaching the flashcard/quiz player views from `/notebooks/[id]/...` URLs.** Phase 9 keeps players at their existing routes — only the LIST and CREATE surfaces move. A future phase can move the players under `/learn/flashcards/[setId]` and `/learn/quizzes/[setId]` with redirects.
- **A search box in the global `/learn/chats` rail that searches inside chat content** (not just titles). v1 ships title-search only.
- **Promoting Inbox files into a real notebook.** v1 lets users see Inbox content but not "convert" it. Add later if usage shows demand.
- **Auto-title retry job** for chats stuck at "New Chat" after a failed gen.
