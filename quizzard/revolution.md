# Quizzard — Social Features Implementation Plan

> **For Claude:** This document is the single source of truth for implementing the social layer of Quizzard. Each phase is independently deployable. Execute phases in order — later phases depend on earlier ones. All file paths are relative to `quizzard/`.

---

## Context

Quizzard has auth (email/password via NextAuth), a personal dashboard, and a notebook workspace (TipTap + drawing). There are **no social features, no proper onboarding, and no community**. This plan adds: multi-step onboarding, friends system, notebook sharing, community posts, a new home page, and turn-based co-work — broken into many small, independently deployable phases.

---

## Current State Summary

| Aspect | Current | Target |
|--------|---------|--------|
| User model | `id, email, name, password, dailyGoal` | + `username`, `avatarUrl`, `bio`, `onboardingComplete` |
| Registration | Single form: name, email, password | 3-step wizard: account → avatar → study goals |
| Post-login | Redirects to `/dashboard` | Redirects to `/home` (new feed-centered page) |
| Social | None | Friends, posts, notebook sharing, co-work |
| Navigation | Sidebar on all dashboard pages | Sidebar on dashboard/notebooks, burger menu on home |

---

## Architecture Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Onboarding | Multi-step wizard replacing `/auth/register` | Single guided flow, no separate route |
| Home layout | Feed-centered 3-column (notebooks \| feed \| friends) | Maximizes community engagement as primary post-login experience |
| Navigation | Burger on home, sidebar on dashboard/notebooks | Cleaner home layout, preserve existing dashboard/notebook UX |
| Friends | Request/accept + username search | Requires unique usernames (set during onboarding) |
| Sharing | Copy OR live view-only (user chooses) | Flexibility without CRDT complexity |
| Co-work | Turn-based (page locking) | No WebSocket infra needed; one editor per page at a time |
| Posts | Rich: text, images, polls, notebook links | Full social feature set |
| Goals | Custom categories (hours, pages, quizzes, notebooks) | Flexible, aligns with gamification plans |
| Visibility | User chooses: public / friends / specific | Maximum user control over content |

---

## PHASE 1: Schema & User Model Expansion

> **Goal:** Extend the database to support all new features. No UI changes.

### 1.1 — User Profile Fields

**File:** `prisma/schema.prisma` — modify `User` model

Add these fields to the existing User model:
```prisma
model User {
  // ... existing fields (id, email, name, password, dailyGoal, createdAt, updatedAt) ...
  username           String    @unique          // 3-20 chars, alphanumeric + underscores only
  avatarUrl          String?                    // URL to uploaded avatar image, null = default
  bio                String?   @db.VarChar(160) // Short bio, max 160 chars
  onboardingComplete Boolean   @default(false)  // false until wizard step 3 is done
}
```

**Why `username` is required (not optional):** The friend system depends on username search. Every user must have one. Since this is pre-launch, reset the dev DB if needed.

**Also update:**
- `src/types/next-auth.d.ts` — add `username: string` and `avatarUrl?: string` to Session user type and JWT type
- `src/auth/config.ts`:
  - In `authorize()`: return `{ id, email, name, username, avatarUrl }` (add fields to select query)
  - In `jwt()` callback: store `username`, `avatarUrl`, `onboardingComplete` on token
  - In `session()` callback: pass `username` and `avatarUrl` to `session.user`

**Exact changes to `src/auth/config.ts`:**
```ts
// In authorize():
const user = await db.user.findUnique({
  where: { email: credentials.email },
  select: { id: true, email: true, name: true, password: true, username: true, avatarUrl: true, onboardingComplete: true }
});
// ...after password check...
return { id: user.id, email: user.email, name: user.name, username: user.username, avatarUrl: user.avatarUrl };

// In jwt callback:
if (user) {
  token.id = user.id;
  token.username = (user as any).username;
  token.avatarUrl = (user as any).avatarUrl;
  token.onboardingComplete = (user as any).onboardingComplete;
}

// In session callback:
session.user.id = token.id as string;
session.user.username = token.username as string;
session.user.avatarUrl = token.avatarUrl as string | undefined;
```

---

### 1.2 — Study Goals Schema

**File:** `prisma/schema.prisma` — add new model

```prisma
model StudyGoal {
  id        String   @id @default(cuid())
  userId    String
  type      String   // "hours" | "pages" | "quizzes" | "notebooks"
  target    Int      // e.g., 10 hours, 20 pages per week
  current   Int      @default(0)
  weekStart DateTime // Monday 00:00 UTC of the goal week — resets weekly
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([userId, weekStart])
  @@map("study_goals")
}
```

Add to User model: `studyGoals StudyGoal[]`

**Keep existing `dailyGoal` field** for backward compatibility with the dashboard. Deprecate later.

---

### 1.3 — Friendship Schema

**File:** `prisma/schema.prisma`

```prisma
model Friendship {
  id          String   @id @default(cuid())
  requesterId String
  addresseeId String
  status      String   @default("pending") // "pending" | "accepted" | "declined"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  requester   User     @relation("SentFriendRequests", fields: [requesterId], references: [id], onDelete: Cascade)
  addressee   User     @relation("ReceivedFriendRequests", fields: [addresseeId], references: [id], onDelete: Cascade)

  @@unique([requesterId, addresseeId])
  @@index([addresseeId])
  @@map("friendships")
}
```

Add to User model:
```prisma
sentFriendRequests     Friendship[] @relation("SentFriendRequests")
receivedFriendRequests Friendship[] @relation("ReceivedFriendRequests")
```

**Edge cases to handle in API:**
- Can't friend yourself
- Can't send duplicate request (unique constraint)
- If A sends to B and B sends to A: auto-accept both
- Declining doesn't block re-requesting

---

### 1.4 — Notification Schema

```prisma
model Notification {
  id        String   @id @default(cuid())
  userId    String                        // recipient
  type      String                        // see payload types below
  data      Json                          // flexible payload, varies by type
  read      Boolean  @default(false)
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, read])
  @@index([userId, createdAt])
  @@map("notifications")
}
```

**`data` payloads by type:**
| Type | Payload |
|------|---------|
| `friend_request` | `{ fromUserId, fromUsername, friendshipId }` |
| `friend_accepted` | `{ fromUserId, fromUsername }` |
| `notebook_shared` | `{ fromUserId, fromUsername, notebookId, notebookName, shareType }` |
| `notebook_sent` | `{ fromUserId, fromUsername, notebookId, notebookName }` |
| `co_work_invite` | `{ fromUserId, fromUsername, notebookId, notebookName, sessionId }` |
| `post_like` | `{ fromUserId, fromUsername, postId }` |
| `post_comment` | `{ fromUserId, fromUsername, postId, commentPreview }` |

Add to User model: `notifications Notification[]`

---

### 1.5 — Community Post Schema

```prisma
model Post {
  id          String    @id @default(cuid())
  authorId    String
  content     String    @db.Text              // max ~2000 chars (enforced in API)
  notebookRef String?                         // optional linked notebook ID
  visibility  String    @default("public")    // "public" | "friends" | "specific"
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  author      User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  images      PostImage[]
  poll        Poll?
  likes       PostLike[]
  comments    PostComment[]
  visibleTo   PostVisibility[]               // only used when visibility = "specific"

  @@index([authorId])
  @@index([createdAt])
  @@map("posts")
}

model PostImage {
  id        String @id @default(cuid())
  postId    String
  url       String
  sortOrder Int    @default(0)

  post      Post   @relation(fields: [postId], references: [id], onDelete: Cascade)

  @@index([postId])
  @@map("post_images")
}

model PostVisibility {
  id     String @id @default(cuid())
  postId String
  userId String

  post   Post   @relation(fields: [postId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([postId, userId])
  @@map("post_visibility")
}

model Poll {
  id       String       @id @default(cuid())
  postId   String       @unique
  question String

  post     Post         @relation(fields: [postId], references: [id], onDelete: Cascade)
  options  PollOption[]

  @@map("polls")
}

model PollOption {
  id        String     @id @default(cuid())
  pollId    String
  text      String
  sortOrder Int        @default(0)

  poll      Poll       @relation(fields: [pollId], references: [id], onDelete: Cascade)
  votes     PollVote[]

  @@index([pollId])
  @@map("poll_options")
}

model PollVote {
  id       String     @id @default(cuid())
  optionId String
  userId   String

  option   PollOption @relation(fields: [optionId], references: [id], onDelete: Cascade)
  user     User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([optionId, userId])
  @@map("poll_votes")
}

model PostLike {
  id     String @id @default(cuid())
  postId String
  userId String

  post   Post   @relation(fields: [postId], references: [id], onDelete: Cascade)
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([postId, userId])
  @@map("post_likes")
}

model PostComment {
  id        String   @id @default(cuid())
  postId    String
  authorId  String
  content   String   @db.VarChar(500)
  createdAt DateTime @default(now())

  post      Post     @relation(fields: [postId], references: [id], onDelete: Cascade)
  author    User     @relation(fields: [authorId], references: [id], onDelete: Cascade)

  @@index([postId, createdAt])
  @@map("post_comments")
}
```

Add to User model:
```prisma
posts          Post[]
postLikes      PostLike[]
postComments   PostComment[]
pollVotes      PollVote[]
postVisibility PostVisibility[]
```

---

### 1.6 — Shared Notebook Schema

```prisma
model SharedNotebook {
  id           String   @id @default(cuid())
  notebookId   String
  sharedById   String
  sharedWithId String?                       // null = community upload
  type         String                        // "copy" | "live_view"
  visibility   String   @default("public")   // "public" | "friends" | "specific"
  createdAt    DateTime @default(now())

  notebook     Notebook @relation(fields: [notebookId], references: [id], onDelete: Cascade)
  sharedBy     User     @relation("SharedByMe", fields: [sharedById], references: [id], onDelete: Cascade)
  sharedWith   User?    @relation("SharedWithMe", fields: [sharedWithId], references: [id], onDelete: Cascade)

  @@index([notebookId])
  @@index([sharedById])
  @@index([sharedWithId])
  @@index([visibility, createdAt])
  @@map("shared_notebooks")
}
```

Add to User: `sharedByMe SharedNotebook[] @relation("SharedByMe")` and `sharedWithMe SharedNotebook[] @relation("SharedWithMe")`
Add to Notebook: `shares SharedNotebook[]`

---

### 1.7 — Co-Work Schema

```prisma
model CoWorkSession {
  id           String   @id @default(cuid())
  notebookId   String
  hostId       String
  isActive     Boolean  @default(true)
  createdAt    DateTime @default(now())
  endedAt      DateTime?

  notebook     Notebook           @relation(fields: [notebookId], references: [id], onDelete: Cascade)
  host         User               @relation("HostedSessions", fields: [hostId], references: [id], onDelete: Cascade)
  participants CoWorkParticipant[]
  pageLocks    PageLock[]

  @@index([notebookId, isActive])
  @@map("co_work_sessions")
}

model CoWorkParticipant {
  id        String   @id @default(cuid())
  sessionId String
  userId    String
  isActive  Boolean  @default(true)
  joinedAt  DateTime @default(now())
  leftAt    DateTime?

  session   CoWorkSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  user      User          @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([sessionId, userId])
  @@map("co_work_participants")
}

model PageLock {
  id         String   @id @default(cuid())
  sessionId  String
  pageId     String
  lockedById String
  lockedAt   DateTime @default(now())
  expiresAt  DateTime // lockedAt + 5 minutes — auto-expire stale locks

  session    CoWorkSession @relation(fields: [sessionId], references: [id], onDelete: Cascade)
  page       Page          @relation(fields: [pageId], references: [id], onDelete: Cascade)
  lockedBy   User          @relation(fields: [lockedById], references: [id], onDelete: Cascade)

  @@unique([sessionId, pageId])
  @@map("page_locks")
}
```

Add to User: `hostedSessions CoWorkSession[] @relation("HostedSessions")`, `coWorkJoined CoWorkParticipant[]`, `pageLocks PageLock[]`
Add to Notebook: `coWorkSessions CoWorkSession[]`
Add to Page: `locks PageLock[]`

---

### 1.8 — Run Migration

```bash
cd quizzard
npx prisma migrate dev --name add_social_features
npx prisma generate
```

**Verify:** `npx prisma studio` — all new tables exist with correct columns. Existing data intact.

---

## PHASE 2: Onboarding Wizard

> **Goal:** Replace `/auth/register` with a 3-step wizard. Login page stays unchanged.

### 2.1 — Step Indicator Component

**New file:** `src/components/onboarding/StepIndicator.tsx`

Props: `{ currentStep: number, totalSteps: number, labels: string[] }`

**Behavior:**
- Horizontal bar: 3 circles connected by lines
- Completed steps: filled purple (#ae89ff) circle with checkmark icon
- Current step: outlined purple circle, subtle pulsing glow
- Future steps: grey (#464560) circle
- Labels below: "Account", "Avatar", "Goals"
- Animated transitions (circle fills, line draws)

**Styling:** Dark background (#18182a), purple accent (#ae89ff), matching existing auth card aesthetic.

---

### 2.2 — Onboarding Wizard Shell

**Modify:** `app/(auth)/auth/register/page.tsx` — replace existing form with wizard shell

**New file:** `src/components/onboarding/OnboardingWizard.tsx`

```tsx
// State management
const [step, setStep] = useState(1); // 1 = Account, 2 = Avatar, 3 = Goals
const [formData, setFormData] = useState({
  username: '', email: '', name: '', password: '', confirmPassword: '',
  avatarUrl: null as string | null,
  studyGoals: [] as { type: string; target: number }[],
});
```

**Flow:**
1. Step 1 → validate & register (POST /api/auth/register) → auto-login → step 2
2. Step 2 → upload avatar or skip → step 3
3. Step 3 → pick goals → PUT /api/user/onboarding → redirect to /dashboard (later /home)

**UX details:**
- Back button on steps 2 and 3 (step 1 is irreversible after registration)
- "Skip" button on steps 2 and 3
- Keyboard: Enter advances, Escape goes back
- Loading states on submit buttons
- Error messages inline (same style as current register page)
- Wizard card: ~520px wide (wider than current ~440px register card)

---

### 2.3 — Account Step (Step 1)

**New file:** `src/components/onboarding/AccountStep.tsx`

**Fields:**
1. **Username** — icon `alternate_email`
   - Validation: 3-20 chars, `/^[a-zA-Z0-9_]+$/`, no spaces
   - Real-time uniqueness check: debounced 500ms → `GET /api/user/check-username?username=xxx`
   - Visual: green checkmark if available, red X if taken, spinner while checking
   - Placeholder: "coolscholar42"
2. **Full Name** — icon `person`, optional
3. **Email** — icon `mail`, valid email format
4. **Password** — icon `lock`, min 8 chars
   - Strength indicator bar: weak / medium / strong (based on length, uppercase, number, special char)
5. **Confirm Password** — icon `lock`, must match password
6. **Terms checkbox** (same as current)

**On submit:**
1. Client-side validation
2. `POST /api/auth/register` with `{ username, email, name, password }`
3. On success: `signIn('credentials', { email, password, redirect: false })`
4. On auto-login success: advance to step 2
5. On error: inline error message

**Styling:** Reuse existing `inputStyle` / `iconWrapStyle` from current register page. Same purple gradient button.

---

### 2.4 — Avatar Step (Step 2)

**New file:** `src/components/onboarding/AvatarStep.tsx`

**Layout:**
- Large circular preview (120px) centered — default: first letter of username in purple circle
- Two option cards side by side below:

**Option 1: Upload Photo** — icon `photo_camera`
- File picker: accept image/png, image/jpeg, image/webp, max 5MB
- Preview in circle with `object-fit: cover`
- Uploads to `POST /api/user/avatar` (multipart)
- Server saves to `public/uploads/avatars/{userId}.{ext}`

**Option 2: Create Avatar** — icon `face`
- **Greyed out**: `pointer-events: none; opacity: 0.4`
- "Coming Soon" badge overlay (small purple pill)

**Buttons:** "Skip" (grey, secondary) | "Continue" (purple, primary)

---

### 2.5 — Study Goals Step (Step 3)

**New file:** `src/components/onboarding/StudyGoalsStep.tsx`

**Layout:** 4 selectable cards in 2x2 grid

| Type | Icon | Label | Presets |
|------|------|-------|---------|
| `hours` | `schedule` | "Study Hours / Week" | 5h, 10h, 15h, 20h+ |
| `pages` | `description` | "Pages Written / Week" | 5, 10, 20, 50 |
| `quizzes` | `psychology` | "Quizzes Completed / Week" | 3, 5, 10, 20 |
| `notebooks` | `auto_stories` | "Notebooks Finished / Week" | 1, 2, 3, 5 |

**Interaction:**
1. Tap card to toggle selection (multi-select)
2. Selected card expands, shows preset buttons
3. Tap preset OR type custom number
4. Selected: purple border glow. Unselected: grey
5. At least 1 goal to proceed (or "Skip")

**On submit:**
- `PUT /api/user/onboarding` with `{ avatarUrl, studyGoals: [{ type, target }] }`
- Server: sets `onboardingComplete: true`, creates `StudyGoal` records
- Redirect to `/dashboard` (changed to `/home` in Phase 6)

---

### 2.6 — Onboarding API Routes

**New file:** `app/api/user/check-username/route.ts`
```
GET /api/user/check-username?username=xxx
→ { available: boolean }
No auth required. Validate format server-side.
```

**Modify:** `app/api/auth/register/route.ts`
```
POST /api/auth/register
Body: { username, email, name, password }
- Validate username format (3-20 chars, alphanumeric + underscores)
- Check username uniqueness + email uniqueness
- Hash password (bcrypt, 12 rounds)
- Create user with onboardingComplete: false
→ { id, email, name, username }
```

**New file:** `app/api/user/avatar/route.ts`
```
POST /api/user/avatar (multipart/form-data)
Auth required. Accept png/jpeg/webp, max 5MB.
Save to public/uploads/avatars/{userId}.{ext}, update user.avatarUrl.
→ { avatarUrl: string }
```

**New file:** `app/api/user/onboarding/route.ts`
```
PUT /api/user/onboarding
Auth required.
Body: { avatarUrl?: string, studyGoals: { type: string, target: number }[] }
- Validate types are valid, targets are positive integers
- Create StudyGoal records (weekStart = current Monday 00:00 UTC)
- Set user.onboardingComplete = true
→ { success: true }
```

---

### 2.7 — Onboarding Redirect Middleware

**Modify:** `src/middleware.ts` — replace default NextAuth export with custom logic:

```ts
import { getToken } from 'next-auth/jwt';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });
  const { pathname } = request.nextUrl;

  // Not logged in → redirect to login (except auth pages)
  if (!token) {
    if (pathname.startsWith('/auth/')) return NextResponse.next();
    return NextResponse.redirect(new URL('/auth/login', request.url));
  }

  // Logged in but onboarding incomplete → force to register (step 2/3)
  if (!token.onboardingComplete && !pathname.startsWith('/auth/register')) {
    return NextResponse.redirect(new URL('/auth/register', request.url));
  }

  // Logged in + complete → block register page
  if (token.onboardingComplete && pathname.startsWith('/auth/register')) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/dashboard/:path*', '/notebooks/:path*', '/settings/:path*', '/ai-chat/:path*', '/home/:path*', '/auth/register'],
};
```

**Requires:** `onboardingComplete` on JWT token (from 1.1 auth config changes).

---

## PHASE 3: Friends System

> **Goal:** Users can find, add, and manage friends.

### 3.1 — Friend Request API

**New file:** `app/api/friends/request/route.ts`
```
POST /api/friends/request
Auth required
Body: { username: string } OR { userId: string }
- Look up addressee by username or userId
- Validate: not self, not already friends, no pending request
- Edge case: if reverse request exists (B→A), auto-accept both
- Create Friendship (status: "pending")
- Create Notification for addressee (type: "friend_request")
→ { friendship: { id, status, addressee: { id, username, avatarUrl } } }

Errors: 400 self-friend, 400 duplicate, 400 already friends, 404 not found
```

**New file:** `app/api/friends/request/[id]/route.ts`
```
PUT — accept/decline (Body: { action: "accept" | "decline" })
  Validate: user is addressee, status is "pending"
  If accepted: Notification for requester (type: "friend_accepted")

DELETE — cancel request (requester only, pending only)
```

---

### 3.2 — Friends List & Unfriend API

**New file:** `app/api/friends/route.ts`
```
GET /api/friends?status=accepted|pending&direction=incoming|outgoing
- accepted (default): all friends (requester OR addressee, status=accepted)
- pending incoming: user is addressee, status=pending
- pending outgoing: user is requester, status=pending
- Each friend: { id, username, name, avatarUrl }
```

**New file:** `app/api/friends/[id]/route.ts`
```
DELETE — unfriend (id = friendship ID, user must be requester or addressee)
```

---

### 3.3 — User Search API

**New file:** `app/api/users/search/route.ts`
```
GET /api/users/search?q=xxx
Auth required. Search by username (case-insensitive contains). Exclude self. Limit 20.
Each result includes friendshipStatus: "none" | "pending_sent" | "pending_received" | "accepted"
→ { users: [{ id, username, name, avatarUrl, friendshipStatus }] }
```

---

### 3.4 — Friends List UI Component

**New file:** `src/components/social/FriendsList.tsx`

Props: `{ compact?: boolean }`

**Full mode:** Header with count + "Find Friends" button, pending requests section (collapsible), scrollable friends list (avatar 32px + username + name + "..." menu), empty state.

**Compact mode (sidebar):** Top 5 friends (avatar + username), "See all (N)" link, pending badge.

---

### 3.5 — Add Friend Modal

**New file:** `src/components/social/AddFriendModal.tsx`

- Search input (debounced 300ms) → `GET /api/users/search?q=xxx`
- Results: avatar + username + name + action button per status
- Loading spinner, empty state

---

### 3.6 — Friend Request Card

**New file:** `src/components/social/FriendRequestCard.tsx`

Avatar + username + name + timestamp + Accept (green) / Decline (red) buttons.

---

### 3.7 — Friends in Dashboard Sidebar

**Modify:** `src/components/layout/Sidebar.tsx`

Add "Friends" section below nav links: header with badge, compact FriendsList (top 5), pending request count.

---

## PHASE 4: Notebook Sharing

> **Goal:** Users can share notebooks with the community or send directly to friends.

### 4.1 — Share Notebook API

**New file:** `app/api/notebooks/[id]/share/route.ts`
```
POST /api/notebooks/[id]/share
Auth required (must own notebook)
Body: { type: "copy"|"live_view", visibility: "public"|"friends"|"specific", sharedWithIds?: string[] }
- Create SharedNotebook record
- If sharedWithIds: Notification for each recipient
- If type="copy" + specific recipients: clone notebook (see 4.2)
```

**New file:** `app/api/community/notebooks/route.ts`
```
GET /api/community/notebooks?filter=all|friends|mine&search=xxx&subject=xxx&page=1&limit=20
Paginated. Each result: notebookName, subject, color, authorUsername, authorAvatar, pageCount, shareType, createdAt.
```

---

### 4.2 — Notebook Copy Logic

**New file:** `app/api/notebooks/[id]/share/copy/route.ts`

Deep-clone in a Prisma transaction: notebook → sections → pages (content + drawingData). Do NOT clone documents, chats, page images. Set new userId, append "(Copy)" to name. Recursively map parentIds for nested sections.

---

### 4.3 — Share Notebook Modal UI

**New file:** `src/components/notebook/ShareNotebookModal.tsx`

**3 tabs:**
1. **Community:** visibility toggle + share type + "Share" button + unshare if already shared
2. **Send to Friend:** friend picker (checkboxes) + share type toggle + "Send" button
3. **Link:** copyable link if publicly shared

---

### 4.4 — Community Notebook Browser

**New file:** `src/components/community/NotebookBrowser.tsx`
Filter bar (All/Friends/Mine tabs + search + subject filter), grid of preview cards, pagination.

**New file:** `src/components/community/NotebookPreviewCard.tsx`
Color bar + name + subject badge + author (avatar + username) + page count + action button.

---

## PHASE 5: Community Posts

> **Goal:** Users can create and interact with social posts (text, images, polls, notebook links).

### 5.1 — Post CRUD API

**New file:** `app/api/posts/route.ts`
```
POST /api/posts (multipart/form-data)
Auth required. Fields: content (1-2000 chars), visibility, notebookRef?, images[] (max 4), poll? (JSON).
Creates Post + PostImages + Poll/PollOptions as needed.

GET /api/posts?feed=foryou|friends|trending&cursor=xxx&limit=20
Cursor-based pagination. Includes: author, images, poll (with user vote), like/comment counts, isLiked.
```

**Visibility logic:**
```
User can see post if:
1. visibility = "public"
2. visibility = "friends" AND author is user's friend
3. visibility = "specific" AND user is in visibleTo
4. authorId = current user
```

**New file:** `app/api/posts/[id]/route.ts` — GET (single), PUT (edit text only), DELETE (cascade)

---

### 5.2 — Post Interactions API

**New file:** `app/api/posts/[id]/like/route.ts` — POST toggles like, returns `{ liked, likeCount }`

**New file:** `app/api/posts/[id]/comments/route.ts` — GET (paginated) + POST (create, 1-500 chars, notifies author)

**New file:** `app/api/posts/[id]/poll/vote/route.ts` — POST (vote/change vote), returns updated poll with counts

---

### 5.3 — Post Composer UI

**New file:** `src/components/community/PostComposer.tsx`
- Avatar (32px) + auto-expand textarea + char count (shows at >1800)
- Toolbar: image upload (max 4), poll creator toggle, notebook link picker, visibility selector
- "Post" button (purple, disabled when empty)

**New file:** `src/components/community/PollCreator.tsx` — question + 2-4 options, inline below textarea

**New file:** `src/components/community/NotebookLinkPicker.tsx` — modal listing user's notebooks, selected shows as chip

**New file:** `src/components/community/VisibilitySelector.tsx` — dropdown: Public / Friends / Specific People

---

### 5.4 — Post Card UI

**New file:** `src/components/community/PostCard.tsx`
1. Header: avatar (40px) + username + timestamp + "..." menu
2. Content: text, whitespace preserved, URLs auto-linked
3. Images: 1=full-width, 2=side-by-side, 3-4=2x2 grid
4. Notebook embed: mini card if notebookRef
5. Poll: PollDisplay component
6. Action bar: like (heart + count) + comment (chat + count)
7. Comments: 2 recent + "View all"

**New file:** `src/components/community/PollDisplay.tsx` — question + horizontal bars, clickable if not voted, results with percentages if voted

**New file:** `src/components/community/PostFeed.tsx` — infinite scroll (IntersectionObserver), loading skeleton, empty state

**New file:** `src/components/community/CommentSection.tsx` — expandable, 2 default + "View all", comment input with optimistic UI

**New file:** `src/components/community/NotebookEmbed.tsx` — mini card with notebook color, name, subject, page count

---

## PHASE 6: New Home Page

> **Goal:** Post-login landing page with feed-centered 3-column layout.

### 6.1 — Home Route & Layout

**New file:** `app/(home)/layout.tsx`
- No sidebar. HomeHeader at top. Max-width ~1400px centered.
- 3 columns: 280px | flex-1 | 300px
- Mobile (<768px): single column, stacked

**New file:** `app/(home)/home/page.tsx`
- Left: `<RecentNotebooksPanel />`
- Center: `<HomeFeed />`
- Right: `<SocialPanel />`

---

### 6.2 — Home Header

**New file:** `src/components/layout/HomeHeader.tsx`
- Burger menu button → slide-out menu
- Logo (36px, from `public/logo_trimmed.png`)
- Search bar (centered, max-width 500px) — searches posts, notebooks, users
- Notification bell (with unread count badge)
- User avatar (32px, click → dropdown: Profile, Settings, Logout)

**New file:** `src/components/layout/BurgerMenu.tsx`
- Slide-out from left: 280px, background #121222
- User info (avatar 64px + name + @username)
- Nav: Home, Dashboard, Notebooks, AI Chat, Settings
- "Log Out" at bottom
- Animated slide + backdrop fade

---

### 6.3 — Left Column: Recent Notebooks Panel

**New file:** `src/components/home/RecentNotebooksPanel.tsx`

Position: sticky (top: 80px)
1. "Go to Dashboard" card — purple gradient, icon `dashboard`, click → `/dashboard`
2. "Recent Notebooks" header + "View All" → `/notebooks`
3. Last 5 notebooks: color dot + name (truncate) + "updated 2h ago"
4. "New Notebook" button (full-width, secondary)

---

### 6.4 — Center Column: Home Feed

**New file:** `src/components/home/HomeFeed.tsx`
1. PostComposer (from Phase 5)
2. Tab bar: "For You" | "Friends Only" | "Trending" (animated underline)
3. PostFeed (from Phase 5)

---

### 6.5 — Right Column: Social Panel

**New file:** `src/components/home/SocialPanel.tsx`

Position: sticky (top: 80px)
1. "Friend Requests" (if pending > 0): up to 3 with Accept/Decline + "See all"
2. "Friends": "Find Friends" button + compact FriendsList
3. "Shared With Me": last 3 notebooks shared by friends

---

### 6.6 — Notifications Bell & Dropdown

**New file:** `src/components/layout/NotificationBell.tsx`
- Bell icon with unread badge. Polls every 30s: `GET /api/notifications?unreadCount=true`

**New file:** `src/components/layout/NotificationDropdown.tsx`
- Max-height 400px, scrollable. "Mark all read" button.
- Items: icon + text + timestamp + read indicator. Click → navigate + mark read.

**New file:** `app/api/notifications/route.ts`
```
GET /api/notifications?cursor=xxx&limit=20 | ?unreadCount=true → { count }
PUT /api/notifications/read-all
```

**New file:** `app/api/notifications/[id]/route.ts` — PUT to mark read

---

### 6.7 — Post-Login Redirect

**Modify:** `src/middleware.ts` — authenticated users on `/` → redirect to `/home`
**Modify:** `app/(auth)/auth/login/page.tsx` — `router.push('/home')` after login

---

## PHASE 7: Co-Work (Turn-Based)

> **Goal:** Users invite friends to work on a notebook together. One editor per page at a time.

### 7.1 — Co-Work Session API

**New file:** `app/api/notebooks/[id]/cowork/route.ts`
```
POST — create session (host = current user, added as first participant)
GET — get active session for this notebook (or null)
```

**New file:** `app/api/notebooks/[id]/cowork/[sessionId]/route.ts`
```
GET — full state (participants, locks)
DELETE — end session (host only, cleans up all locks)
```

**New file:** `app/api/notebooks/[id]/cowork/[sessionId]/join/route.ts` — POST to join

**New file:** `app/api/notebooks/[id]/cowork/[sessionId]/leave/route.ts` — POST to leave (releases locks, ends session if last)

---

### 7.2 — Page Lock API

**New file:** `app/api/notebooks/[id]/cowork/[sessionId]/lock/[pageId]/route.ts`
```
POST — lock page (expiresAt = now + 5min). 409 if locked by someone else. Refresh if locked by self.
DELETE — release lock (must be lock holder)
```

**Lock heartbeat:** Client calls POST every 2 minutes to refresh `expiresAt`.
**Auto-expire:** If user closes tab, lock expires in 5 minutes.
**Cleanup:** Every lock API call also deletes expired locks:
```ts
await db.pageLock.deleteMany({ where: { sessionId, expiresAt: { lt: new Date() } } });
```

---

### 7.3 — Co-Work Invite Flow

**New file:** `src/components/notebook/CoWorkButton.tsx`
- No session: "Start Co-Work" button
- Host: "Co-Working (N)" badge + "End Session"
- Participant: "Co-Working (N)" badge + "Leave"
- Not in session: "Join Co-Work" button

**New file:** `src/components/notebook/CoWorkInviteModal.tsx`
- Friends picker + "Send Invite" (creates Notification type: "co_work_invite")

---

### 7.4 — Co-Work Session UI

**Modify:** `src/components/notebook/NotebookSidebar.tsx`
- Lock indicators on page items: blue pencil (self), orange lock (other + tooltip)

**New file:** `src/components/notebook/CoWorkBar.tsx`
- Horizontal bar below header: participant avatars (overlapping) + count + "Invite" + session timer

**Modify:** `src/components/notebook/PageEditor.tsx`
- On page open (if co-work): auto-lock (`POST .../lock/[pageId]`)
- Heartbeat interval (2 min)
- On navigate away / beforeunload: release lock
- If locked by other: read-only view + banner

**New file:** `src/components/notebook/PageLockIndicator.tsx`
- Banner: avatar + "@username is editing this page"
- Polls lock status every 10s, auto-removes when expired

**New file:** `src/components/notebook/CoWorkChat.tsx`
- Collapsible chat panel (right side). In-memory messages (not persisted).

---

## Verification Plan

### Per-Phase Testing

| Phase | Key Tests |
|-------|-----------|
| 1 | `prisma migrate dev` succeeds, `prisma studio` shows all tables, existing data intact |
| 2 | Register → 3 steps → onboardingComplete=true → redirect. Existing login works. |
| 3 | Search user → request → accept → friends list → unfriend |
| 4 | Share as copy → community browser → download → original unaffected. Live view works. |
| 5 | Text post → feed. Image post → gallery. Poll → vote → results. Visibility enforced. |
| 6 | Login → /home. 3 columns. Feed works. Burger menu navigates. Notifications show. |
| 7 | Start session → invite → join → lock page → edit → release → other user edits. Session end cleans up. |

### Regression Checks (after every phase)
- Login/logout works
- Existing notebooks accessible and editable
- Dashboard loads with correct data
- Notebook workspace (sections, pages, editor, drawing) works
- AI chat works

---

## File Impact Summary

### Modified Files
| File | Phase | Changes |
|------|-------|---------|
| `prisma/schema.prisma` | 1 | 14+ new models, expand User/Notebook/Page |
| `src/auth/config.ts` | 1, 2 | username/avatar/onboardingComplete on JWT/session |
| `src/types/next-auth.d.ts` | 1 | Add username, avatarUrl to types |
| `src/middleware.ts` | 2, 6 | Custom middleware: onboarding + home redirect |
| `app/(auth)/auth/register/page.tsx` | 2 | Replace with OnboardingWizard |
| `app/api/auth/register/route.ts` | 2 | Accept username, set onboardingComplete |
| `src/components/layout/Sidebar.tsx` | 3 | Add friends section |
| `src/components/notebook/NotebookSidebar.tsx` | 7 | Page lock indicators |
| `src/components/notebook/PageEditor.tsx` | 7 | Auto-lock/unlock, read-only mode |
| `app/(auth)/auth/login/page.tsx` | 6 | Redirect to /home |

### New Directories
| Directory | Phase | Purpose |
|-----------|-------|---------|
| `src/components/onboarding/` | 2 | Wizard steps & components |
| `src/components/social/` | 3 | Friends list, search, modals |
| `src/components/community/` | 4, 5 | Posts, feed, sharing, browser |
| `src/components/home/` | 6 | Home page panels |
| `app/(home)/` | 6 | Home route group |
| `app/api/friends/` | 3 | Friend system APIs |
| `app/api/posts/` | 5 | Post CRUD + interactions |
| `app/api/community/` | 4 | Community notebook browser |
| `app/api/notebooks/[id]/share/` | 4 | Notebook sharing APIs |
| `app/api/notebooks/[id]/cowork/` | 7 | Co-work session APIs |
| `app/api/notifications/` | 4, 6 | Notification CRUD |
| `app/api/user/` | 2 | Avatar, onboarding, username check |
| `app/api/users/` | 3 | User search |
