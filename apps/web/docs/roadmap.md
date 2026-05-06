# Roadmap: Make the landing-page promises real

Slash menu, inline AI, stylus verify, full co-working.

## Context

The landing page built previously claimed four features that were either partially true, untested, or outright invented:

- **Slash menu** in the text editor — **does not exist.** Users can't type `/` to get a block-type picker. There's no slash-command extension installed.
- **Inline AI actions** (Rewrite / Summarize / Expand) — **does not exist.** There's no floating toolbar on text selection, no `/api/notebooks/[id]/pages/[pageId]/ai-inline` endpoint.
- **Stylus + barrel-button eraser** — **actually already shipped on the web side.** `src/components/notebook/InfiniteCanvas.tsx` lines 245–272 listen for `pointerdown` with `pointerType === 'pen'`, read `e.buttons & 2` (barrel) and `e.buttons & 32` (eraser tip), and call `api.setActiveTool({ type: 'eraser' })`. The commit is `77bad8f`.
- **Live co-working** — **partially real.** REST endpoints under `app/api/notebooks/[id]/cowork/` work, `CoWorkBar.tsx` polls every 10s, `ws-server.ts` exists at the repo root and runs global friend presence on port 3002 via Socket.IO, but nothing cowork-specific flows through it yet. Chat is in-memory only. Cursors and live page locks are unimplemented.

This roadmap closes all four gaps.

**Decisions locked in:**

- Stylus → verification-only pass, no rebuild.
- Inline AI → **PRO-only** tier gate. FREE + PLUS click the inline AI button and get a yellow upsell toast pointing at `/pricing`.
- Co-working scope → **full** — presence + locks + chat + cursors.
- WS hosting → Railway recommended (undecided at time of planning).

---

## Feature A — Slash menu

**Goal:** Type `/` inside the editor → popup appears → arrow keys / click pick a block type → selected block inserts and closes the popup.

### Architecture

- New custom TipTap extension: `src/lib/tiptap-slash-command.ts`
- New React popup component: `src/components/notebook/SlashMenu.tsx`
- Wire into `src/components/notebook/PageEditor.tsx` alongside existing extensions

### Implementation notes

- **No new npm deps.** Reuse the manual absolute-positioned dropdown pattern already used 5 times in `EditorToolbar.tsx` (color picker, font-size, font-family, inline-scale, callout). Avoids adding `@tiptap/extension-suggestion` + `tippy.js` for a single popup.
- Extension uses `addProseMirrorPlugins()` to hook into the transaction stream and detect when the user types `/` at the start of an empty paragraph.
- Extension exposes its state via a React context + a simple `useSlashMenu()` hook so `SlashMenu.tsx` can read `{ isOpen, position, query }` without prop-drilling.
- Popup position computed from `editor.view.coordsAtPos(editor.state.selection.from)` inside an effect that runs on open.
- Menu items fire the same `editor.chain().focus().X().run()` commands already used by the toolbar — no new command plumbing.
- Keyboard: `ArrowUp`/`ArrowDown` to move, `Enter` to select, `Escape` to close, typing filters the list, `Backspace` on the `/` closes it.

### Menu items (matching the existing toolbar actions)

1. Text — `setParagraph()`
2. Heading 1–3 — `toggleHeading({ level })`
3. Bullet list — `toggleBulletList()`
4. Numbered list — `toggleOrderedList()`
5. Blockquote — `toggleBlockquote()`
6. Code block — `toggleCodeBlock()`
7. Callout (info/warning/success/tip submenu) — uses existing `toggleCallout` from `src/lib/tiptap-callout.ts`
8. Toggle heading — uses existing `tiptap-toggle-heading.ts`
9. Horizontal rule — `setHorizontalRule()`
10. Table — `insertTable({ rows: 3, cols: 3, withHeaderRow: true })`
11. Image — opens existing image upload dialog
12. Draw — existing canvas-insert action

### Files to create / modify

| File                                     | Action                                                     |
| ---------------------------------------- | ---------------------------------------------------------- |
| `src/lib/tiptap-slash-command.ts`        | create                                                     |
| `src/components/notebook/SlashMenu.tsx`  | create                                                     |
| `src/components/notebook/PageEditor.tsx` | register extension, render `<SlashMenu editor={editor} />` |

### Reuse verified

- `useSelectionGuard()` from `EditorToolbar.tsx` lines 159–198 — preserve selection when popup focus grabs
- Dropdown pattern from `EditorToolbar.tsx` (color picker line 271, callout line 794) — positioning + click-outside
- Existing extension pattern from `tiptap-callout.ts` for `addCommands()` shape

---

## Feature B — Inline AI actions (PRO-only)

**Goal:** Select text → floating toolbar appears → "Rewrite / Summarize / Expand" buttons → click → selected text is replaced with the streaming AI response. FREE + PLUS users see the button, click it, and get a yellow upsell toast linking to `/pricing`.

### Architecture

- New API route: `app/api/notebooks/[id]/pages/[pageId]/ai-inline/route.ts`
- New floating toolbar: `src/components/notebook/InlineAIToolbar.tsx`
- New toast component (reusable): `src/components/ui/UpsellToast.tsx`
- Tier system extension: add `ai_inline_edit` feature key to `src/lib/tiers.ts`
- Pricing UI: add feature row to `src/components/pricing/PricingCard.tsx`

### Tier gate

`src/lib/tiers.ts` already exports `FeatureType`. Add `'ai_inline_edit'` and set limits:

```
FREE:  ai_inline_edit: 0
PLUS:  ai_inline_edit: 0
PRO:   ai_inline_edit: -1    // unlimited
```

No Stripe changes needed — Stripe only knows about tiers, not feature keys.

### API route

`POST /api/notebooks/[id]/pages/[pageId]/ai-inline`

Body: `{ action: 'rewrite' | 'summarize' | 'expand', text: string }`

Handler reuses the pattern from `app/api/notebooks/[id]/study-plans/generate/route.ts` lines 47–52:

1. `getAuthUserId(request)` → 401 if missing
2. `rateLimit(rateLimitKey('ai-inline', request, userId), 20, 60_000)` → 429 if exceeded
3. `checkTokenBudget(userId)` → 429 if monthly token cap exceeded
4. `checkUsageLimit(userId, 'ai_inline_edit')` → 429 with body `{ error: 'Pro only', upgrade: true }` if limit is 0 (FREE / PLUS)
5. Build system prompt per action, call `anthropic.messages.stream()` from `src/lib/anthropic.ts`
6. Stream text back via SSE (same shape as `app/api/notebooks/[id]/chats/[chatId]/messages/route.ts` lines 333–342)
7. On stream `end`: `recordTokenUsage({ notebookId, userId, tokens: usage.input_tokens + usage.output_tokens, description: '[inline-ai] rewrite' })` and `incrementUsage(userId, 'ai_inline_edit')`

### Floating toolbar

- Listen to `editor.on('selectionUpdate', …)` inside `PageEditor.tsx`
- Show toolbar only when `!selection.empty` and `selection.to - selection.from > 5`
- Position: `editor.view.coordsAtPos(selection.from)` → absolute-position 8px above selection's top-left
- Buttons: Rewrite · Summarize · Expand · [spinner while streaming]
- On click:
  - Store the selection range in a ref (TipTap `ResolvedPos`)
  - Fetch `/api/notebooks/[id]/pages/[pageId]/ai-inline` with SSE parsing
  - If response is `429 { upgrade: true }`: render `<UpsellToast />` → dismiss toolbar
  - Otherwise: for each SSE `text` event, accumulate text; on `done`, replace selection with the full response via `editor.chain().setTextSelection(range).deleteSelection().insertContent(fullText).run()`
- Loading shimmer on the original text during streaming so the user sees something is happening
- Toolbar closes on: clicking elsewhere, pressing Escape, selection collapsing

### Upsell toast

- Reusable `<UpsellToast>` component with yellow gradient (`#ffde59`) and "Upgrade to Pro" link to `/pricing`
- Triggered from any 429 response where `body.upgrade === true`
- Auto-dismiss after 6 seconds, with close button

### Files to create / modify

| File                                                       | Action                                                                      |
| ---------------------------------------------------------- | --------------------------------------------------------------------------- |
| `src/lib/tiers.ts`                                         | add `ai_inline_edit` key to `FeatureType` + all three tier `limits` objects |
| `src/components/pricing/PricingCard.tsx`                   | add `ai_inline_edit` to `featureLabels` + `featureIcons`                    |
| `src/components/pricing/FeatureComparison.tsx`             | add comparison row                                                          |
| `app/api/notebooks/[id]/pages/[pageId]/ai-inline/route.ts` | create                                                                      |
| `src/components/notebook/InlineAIToolbar.tsx`              | create                                                                      |
| `src/components/ui/UpsellToast.tsx`                        | create                                                                      |
| `src/components/notebook/PageEditor.tsx`                   | wire toolbar + selectionUpdate listener                                     |

### Reuse verified

- `anthropic` + `AI_MODEL` from `src/lib/anthropic.ts`
- `checkTokenBudget` + `recordTokenUsage` from `src/lib/token-budget.ts`
- `checkUsageLimit` + `incrementUsage` from `src/lib/usage-limits.ts`
- `rateLimit` + `rateLimitKey` + `getClientIp` from `src/lib/rate-limit.ts`
- `tooManyRequestsResponse` + `unauthorizedResponse` from `src/lib/api-response.ts`
- Streaming SSE shape from `app/api/notebooks/[id]/chats/[chatId]/messages/route.ts` lines 328–380

---

## Feature C — Stylus + barrel-button verification pass

**Goal:** Confirm the existing stylus barrel-button implementation actually works on real devices, document the result, fix anything broken — but do **not** rebuild.

### Why only verification

`InfiniteCanvas.tsx` lines 245–272 already handle pointer events correctly per the Excalidraw v0.18 API. Commit `77bad8f` added this. The most likely explanation for the feature being flagged as missing is a specific device mapping bug or a QA gap — rebuilding would almost certainly reintroduce the same code.

### Test matrix

1. **iPad + Apple Pencil 2** (Safari) — Apple Pencil has no barrel button; test will show "no effect on tap/press", which is a known browser limitation
2. **iPad + Apple Pencil 2** — verify keyboard shortcut `3` toggles eraser as a fallback
3. **Surface Pro + Surface Pen** (Edge) — barrel button should fire `e.buttons & 2`, expect eraser activation
4. **Wacom Intuos** (Chrome, macOS) — barrel button should fire `e.buttons & 2`, expect eraser activation
5. **Wacom Intuos** — eraser tip should fire `e.buttons & 32`, expect eraser activation
6. **Ordinary mouse** — should not trigger any switch (pointerType guard)

### What to do per device

- Add a dev-only debug log at the top of the pointerdown handler: `console.log('[stylus]', e.pointerType, e.buttons.toString(2))`
- Ship one test commit with the log on a temporary branch; QA the matrix; delete the log before merging
- Document the result in a new `docs/stylus-support.md` file so nobody wastes time re-testing later
- If a real bug is found (e.g. `e.buttons & 32` actually needs to be `32` without the bitwise and, or the Excalidraw API signature changed in v0.18), fix it in the existing handler — do not rewrite

### Files to touch

| File                                         | Action                                             |
| -------------------------------------------- | -------------------------------------------------- |
| `src/components/notebook/InfiniteCanvas.tsx` | temporary debug log (remove before merge)          |
| `docs/stylus-support.md`                     | create — document the device matrix + results      |
| `CLAUDE.md`                                  | add one-liner pointing at `docs/stylus-support.md` |

### Landing page copy

If verification finds any device where it doesn't work, update the `NotetakingCanvasSpotlight` bullet from:

> "Stylus + barrel-button eraser support"

to:

> "Stylus eraser on Surface, Wacom, and Windows Ink devices"

(softer claim that reflects the reality that Apple Pencil doesn't have a barrel button.)

---

## Feature D — Live co-working (full scope: presence + locks + chat + cursors)

**Goal:** Real-time session state over WebSockets for cowork sessions, replacing all 10s polling and in-memory chat with events emitted from the existing `ws-server.ts`.

### Current state (verified)

- `ws-server.ts` exists at the repo root, runs standalone Socket.IO on port 3002, handles global friend presence (`presence:init`, `presence:update`, heartbeat), and has an HMAC auth flow via `app/api/auth/presence-token/route.ts`.
- `package.json` exposes `npm run dev:ws` and `npm run start:ws`.
- REST routes in `app/api/notebooks/[id]/cowork/**` handle create / join / leave / lock / end. These stay — they're the source of truth for session state in Postgres. WS becomes the fanout layer.
- `CoWorkBar.tsx` polls every 10s and displays participants.
- `CoWorkChat.tsx` is in-memory only.
- No `CoWorkCursor` or `CoWorkMessage` DB models yet.

### Architecture

```
Client (Next.js)                          ws-server.ts (port 3002)               Postgres
──────────────                            ────────────────────                   ────────
CoWorkBar ──socket.emit("cowork:join",
              { sessionId, token })───►   validate token → io.join(`session:${sessionId}`)
                                          broadcast "cowork:participant_joined"
CoWorkBar ◄── on("cowork:participant_joined", …)
CoWorkChat ──POST to REST  ─────────────► write to CoWorkMessage → emit via ws
CoWorkChat ◄── on("cowork:message", …)
Editor ──socket.emit("cowork:cursor",
              { x, y, pageId }) (60ms)──► broadcast "cowork:cursor" to room (no DB)
Editor ◄── on("cowork:cursor", …)          ─── ephemeral, never persisted
PageLock route ───── HTTP POST ─────────► ws broadcast → Postgres PageLock
                                          emit "cowork:page_locked" to room
```

Cursors are **ephemeral** and never touch the DB — that avoids a write flood and a new Prisma migration. Chat is persisted. Presence and locks are pushed from REST → WS.

### Prisma migration

Add one model (chat persistence). Cursors are deliberately not persisted.

```prisma
model CoWorkMessage {
  id         String   @id @default(cuid())
  sessionId  String
  userId     String
  text       String   @db.Text
  createdAt  DateTime @default(now())

  session    CoWorkSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  user       User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([sessionId, createdAt])
}
```

Add the back-relation in `CoWorkSession` and `User` models.

### ws-server.ts changes

Add new event handlers on the existing Socket.IO instance:

- `socket.on('cowork:join', async ({ sessionId, token }) => { … })` — validate token, verify participant row in Postgres, `socket.join('session:' + sessionId)`, broadcast `cowork:participant_joined`
- `socket.on('cowork:leave', async ({ sessionId }) => { … })` — remove from room, broadcast `cowork:participant_left`
- `socket.on('cowork:cursor', throttle(({ sessionId, pageId, x, y }) => { … }, 60))` — broadcast `cowork:cursor` (no DB write)
- `socket.on('cowork:message', async ({ sessionId, text }) => { … })` — ws-server holds a Prisma client, writes to `CoWorkMessage`, then broadcasts. (Alternative: REST-route + webhook pattern. Prisma-in-ws is simpler.)
- `socket.on('disconnect', …)` — if the disconnecting socket is in any `session:*` rooms, emit `cowork:participant_left` for cleanup

### New REST routes

| Route                                                  | Purpose                                                   |
| ------------------------------------------------------ | --------------------------------------------------------- |
| `POST /api/notebooks/[id]/cowork/[sessionId]/messages` | persist chat message to `CoWorkMessage`, return saved row |
| `GET /api/notebooks/[id]/cowork/[sessionId]/messages`  | fetch recent messages (last 50) for session rejoin        |

Lock routes `/cowork/[sessionId]/lock/[pageId]/` already exist; add a tiny post-write emitter that calls the ws-server's broadcast (same mechanism as chat).

### Client wiring

`src/lib/cowork-socket.ts` — new file. A small singleton Socket.IO client bound to the cowork namespace with methods `joinSession()`, `leaveSession()`, `sendCursor()`, `onParticipantJoined()`, `onParticipantLeft()`, `onPageLocked()`, `onPageUnlocked()`, `onMessage()`, `onCursor()`. Handles token refresh from `/api/auth/presence-token`.

`src/components/notebook/CoWorkBar.tsx` changes:

- Remove `setInterval(fetchParticipants, 10000)` polling
- On mount: call `coworkSocket.joinSession(sessionId)` + subscribe to `onParticipantJoined / onParticipantLeft`
- On unmount: `coworkSocket.leaveSession(sessionId)`

`src/components/notebook/CoWorkChat.tsx` changes:

- Remove in-memory `msgCounter`
- On mount: fetch message history via new GET route, subscribe to `onMessage`
- On send: POST to new REST route (server persists + broadcasts), optimistically append with pending state
- Remove the "In-memory only" disclaimer at line 178

`src/components/notebook/PageEditor.tsx` and `InfiniteCanvas.tsx` changes:

- Throttle a `mousemove` listener to 60ms, send `{ x, y, pageId }` via `coworkSocket.sendCursor()` — only when a cowork session is active
- Subscribe to `onCursor` → render a `<RemoteCursor>` overlay per user with their display name and color

`src/components/notebook/RemoteCursor.tsx` — new component. Absolute-positioned SVG arrow + name pill. Fade in/out on connect/disconnect. Colors derived from user id hash.

### Files to create / modify

| File                                                               | Action                                                                 |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `prisma/schema.prisma`                                             | add `CoWorkMessage` model + back-relations                             |
| `ws-server.ts`                                                     | add cowork event handlers + room logic + Prisma client for chat writes |
| `src/lib/cowork-socket.ts`                                         | create — client singleton                                              |
| `app/api/notebooks/[id]/cowork/[sessionId]/messages/route.ts`      | create — GET list + POST send                                          |
| `app/api/notebooks/[id]/cowork/[sessionId]/lock/[pageId]/route.ts` | add ws broadcast call after DB write                                   |
| `src/components/notebook/CoWorkBar.tsx`                            | replace polling with socket events                                     |
| `src/components/notebook/CoWorkChat.tsx`                           | wire to REST + socket, remove in-memory code                           |
| `src/components/notebook/RemoteCursor.tsx`                         | create                                                                 |
| `src/components/notebook/PageEditor.tsx`                           | cursor emitter + remote cursor overlay                                 |
| `src/components/notebook/InfiniteCanvas.tsx`                       | cursor emitter + remote cursor overlay                                 |

### Reuse verified

- `ws-server.ts` presence namespace — add alongside, don't rewrite
- `GET /api/auth/presence-token` for WS auth — same token works, or add a `scope: 'cowork'` claim
- Existing Prisma models `CoWorkSession`, `CoWorkParticipant`, `PageLock` — don't touch
- Existing REST routes under `app/api/notebooks/[id]/cowork/` — keep as source of truth

---

## Deployment / hosting decision (ws-server)

Recommendation:

- **Deploy ws-server.ts to Railway.** Zero Docker needed, free tier covers dev, ~$5/mo for production.
- Commands: create a Railway project → point at the repo → set build command `npm ci && npx tsc ws-server.ts --outDir ws-dist` → start command `node ws-dist/ws-server.js` → env vars `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `DATABASE_URL` (Railway sets `PORT` automatically).
- On the Next.js side, add `NEXT_PUBLIC_WS_URL=https://your-ws.railway.app` to Vercel env vars so the client knows where to connect.
- Fallback options if Railway doesn't fit: Fly.io with a minimal Dockerfile, or a $4 DigitalOcean droplet running `pm2` + `ws-server.ts`.

This is a separate deploy decision — Features A, B, C are all Vercel-compatible and can ship first without any hosting changes.

---

## Implementation order

Phased so each feature ships independently:

0. **Persist this roadmap into the repo.** ✓ (this file)
1. **Feature C — Stylus verification pass** (smallest, least risky). 1–2h. Documents reality and fixes any real bug found. No migration, no infrastructure.
2. **Feature A — Slash menu.** ~6–8h. Fully client-side, no backend, no new deps. Ships on Vercel.
3. **Feature B — Inline AI actions.** ~10–12h. Reuses all existing tier/token/rate-limit infra. Ships on Vercel.
4. **Feature D — Live co-working.** ~30–35h. Blocked on ws-server hosting decision. Break into sub-phases:
   - D1: Prisma migration + new REST routes for messages
   - D2: ws-server.ts cowork handlers
   - D3: client socket singleton + CoWorkBar real-time participants
   - D4: CoWorkChat persistence + real-time
   - D5: Live page lock broadcast
   - D6: Remote cursors

---

## Verification

**Feature A — Slash menu:**

- Type `/` at the start of an empty line → popup appears
- Arrow keys navigate, Enter selects, Escape closes
- Type `/heading` → filters to heading options
- Each menu item inserts the correct block and closes the popup
- `/` in the middle of existing text → popup does NOT appear (only at paragraph start)

**Feature B — Inline AI:**

- As a FREE user: select text → toolbar appears → click Rewrite → yellow upsell toast appears pointing to `/pricing`
- As a PRO user: select text → click Rewrite → loading shimmer → streaming text replaces selection
- Check `UsageRecord` table → row for `ai_inline_edit` incremented by 1
- Check `ChatMessage.tokens` → row with `description: '[inline-ai] rewrite'` exists
- Spam-click 21 times in a minute → 429 rate limit kicks in
- Upgrade a user to PRO via Stripe test mode → inline AI starts working without a logout

**Feature C — Stylus:**

- Run through the 6-device test matrix above
- Write results into `docs/stylus-support.md`
- For any failing device, fix the handler and re-test
- Delete the temporary debug log before merging

**Feature D — Cowork:**

- Two browsers, two logged-in users, one cowork session
- User A starts a session → user B joins
- User B's avatar appears in user A's bar within <1s (no more 10s wait)
- User A sends a chat message → appears in user B's chat instantly
- User A locks page X → user B sees a lock banner on page X instantly
- User A moves their mouse on the canvas → user B sees user A's cursor with a name pill moving in real time
- Both users refresh → session reconnects, chat history reloads
- Load test: 5 users, 1 session, all sending cursor events → `ws-server` stays <50% CPU (cursor throttle must work)
- Confirm `/api/auth/presence-token` issues cowork-scoped tokens and ws-server rejects expired ones

---

## Open risks

- **Inline AI selection preservation** is notoriously finicky when the editor loses focus (toolbar click steals focus → selection collapses). Mitigation: store the `ResolvedPos` range in a ref before the button click (same trick `useSelectionGuard()` uses), then restore via `setTextSelection({ from, to })` before `insertContent()`.
- **ws-server Prisma client** will double memory usage and needs the same `DATABASE_URL`. Acceptable for now, but if it becomes a bottleneck, switch the chat-persist-and-broadcast flow to the REST-route + webhook pattern.
- **Cursor throttle on mobile** — 60ms is fine for desktop but will hammer cellular networks. Consider raising to 120ms on mobile breakpoints, or only emitting cursors when a stylus/mouse is actively down.
- **Stylus verification depends on physical devices.** If unavailable, verification becomes "trust the existing code + add log, ship, react to user reports". Still do the log + docs step even without devices.
