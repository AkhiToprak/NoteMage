# Quizzard — Missing Features Implementation Plan

> Generated 2026-03-31 by auditing the Obsidian phase docs (Phase 0–14) against the live codebase.
> Each section is broken into the smallest possible subphases with exact files, tools, libraries, and SQL/Prisma changes.

---

## Table of Contents

1. [GAP A — Activity Heatmap (Phase 9)](#gap-a--activity-heatmap)
2. [GAP B — User Profile Page (Phase 9)](#gap-b--user-profile-page)
3. [GAP C — Spaced Repetition for Flashcards (Phase 11)](#gap-c--spaced-repetition-for-flashcards)
4. [GAP D — Quiz Score History (Phase 11)](#gap-d--quiz-score-history)
5. [GAP E — One-Click Document Summaries (Phase 12)](#gap-e--one-click-document-summaries)
6. [GAP F — Essay Spell Check & Grammar Feedback (Phase 12)](#gap-f--essay-spell-check--grammar-feedback)
7. [GAP G — YouTube Transcript Extraction (Phase 12)](#gap-g--youtube-transcript-extraction)
8. [GAP H — Study Groups (Phase 13)](#gap-h--study-groups)
9. [GAP I — Gamification: Streak Backend (Phase 14)](#gap-i--gamification-streak-backend)
10. [GAP J — Gamification: Achievements & Trophies (Phase 14)](#gap-j--gamification-achievements--trophies)
11. [GAP K — Gamification: XP & Levels (Phase 14)](#gap-k--gamification-xp--levels)
12. [GAP L — Gamification: Exam Countdown & Auto Study Planner (Phase 14)](#gap-l--gamification-exam-countdown--auto-study-planner)
13. [GAP M — Sentry Error Monitoring (Phase 10)](#gap-m--sentry-error-monitoring)
14. [GAP N — CI/CD Pipeline (Phase 10)](#gap-n--cicd-pipeline)

---

## GAP A — Activity Heatmap

**What:** GitHub-style contribution heatmap on the dashboard showing daily study activity (messages sent, pages edited, quizzes completed) over the past ~365 days.

### A.1 — Create ActivityEvent model in Prisma

**File:** `quizzard/prisma/schema.prisma`

Add a lightweight event log table that records one row per "study action" per day per user. This powers the heatmap without querying multiple tables.

```prisma
model ActivityEvent {
  id        String   @id @default(cuid())
  userId    String
  date      DateTime @db.Date              // calendar day (no time)
  type      String                         // "message" | "page_edit" | "quiz" | "flashcard_review" | "login"
  count     Int      @default(1)           // increment on duplicate day+type
  createdAt DateTime @default(now())

  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, date, type])
  @@index([userId, date])
  @@map("activity_events")
}
```

Add `activityEvents ActivityEvent[]` to the `User` model relations.

**Run:** `cd quizzard && npx prisma migrate dev --name add_activity_events`

### A.2 — Record activity events from existing actions

Instrument the following API routes to upsert into `activity_events` on each action:

| Existing route | Event type |
|---|---|
| `app/api/notebooks/[id]/chats/[chatId]/messages/route.ts` (POST) | `"message"` |
| `app/api/notebooks/[id]/pages/[pageId]/route.ts` (PUT) | `"page_edit"` |
| `app/api/notebooks/[id]/quiz-sets/[setId]/route.ts` (POST quiz attempt, if added) | `"quiz"` |
| `app/api/notebooks/[id]/flashcard-sets/[setId]/route.ts` (review action) | `"flashcard_review"` |

Use Prisma `upsert` with the compound unique `[userId, date, type]`:
```ts
await db.activityEvent.upsert({
  where: { userId_date_type: { userId, date: todayDate, type: 'message' } },
  update: { count: { increment: 1 } },
  create: { userId, date: todayDate, type: 'message', count: 1 },
});
```

**Helper file to create:** `quizzard/src/lib/activity.ts` — export a `recordActivity(userId: string, type: string)` function so all routes use the same logic.

### A.3 — Create heatmap API route

**File:** `quizzard/app/api/user/activity-heatmap/route.ts`

- `GET /api/user/activity-heatmap?days=365`
- Returns: `{ data: { date: string; count: number }[] }` — one entry per day with total actions
- Query: Group `activity_events` by `date`, sum `count`, for the authenticated user, last N days
- Use `getServerSession()` + `db.activityEvent.groupBy()`

### A.4 — Build ActivityHeatmap component

**File:** `quizzard/src/components/features/ActivityHeatmap.tsx`

- Pure client component (`'use client'`)
- Fetch `/api/user/activity-heatmap` on mount
- Render a CSS Grid: 53 columns (weeks) x 7 rows (days), just like GitHub
- Color scale: 0 = `#1a1a2e` (empty), 1-2 = light, 3-5 = medium, 6+ = bright (use brand purple/blue tones)
- Tooltip on hover showing date + count
- No external library needed — pure CSS grid + Tailwind

### A.5 — Wire into dashboard page

**File:** `quizzard/app/(dashboard)/dashboard/page.tsx`

- Import `ActivityHeatmap`
- Place it below the stat cards row, full width
- Add heading: "Study Activity"

---

## GAP B — User Profile Page

**What:** A dedicated `/profile` page (and `/profile/[username]` for public viewing) showing user info, stats, and achievements.

### B.1 — Create profile page route

**File:** `quizzard/app/(dashboard)/profile/page.tsx`

- Fetch current user via `getServerSession()` + `db.user.findUnique()`
- Display: avatar, username, name, bio, member since date, daily goal
- "Edit Profile" button that links to `/settings`
- Stats section: total notebooks, total flashcards, total messages, member since
- Reuse existing stat card styling from dashboard

### B.2 — Create public profile page

**File:** `quizzard/app/(dashboard)/profile/[username]/page.tsx`

- Fetch user by username from URL params
- Show: avatar, username, bio, member since
- Show public stats only (notebook count, etc.)
- If viewing own profile, show "Edit Profile" button
- If viewing friend's profile, show friend status / add friend button
- If user not found, show 404

### B.3 — Create profile API route

**File:** `quizzard/app/api/user/profile/route.ts`

- `GET /api/user/profile` — returns current user's profile + stats
- `PUT /api/user/profile` — update name, bio, daily goal

**File:** `quizzard/app/api/user/profile/[username]/route.ts`

- `GET /api/user/profile/:username` — returns public profile for any user

### B.4 — Add sidebar link

**File:** `quizzard/src/components/layout/Sidebar.tsx`

- Add "Profile" link with user icon between "Dashboard" and "Notebooks"

---

## GAP C — Spaced Repetition for Flashcards

**What:** SM-2 algorithm so flashcards the user gets wrong appear more frequently.

### C.1 — Add spaced repetition fields to Flashcard model

**File:** `quizzard/prisma/schema.prisma`

Add to the existing `Flashcard` model:

```prisma
// Spaced repetition fields (SM-2 algorithm)
easeFactor    Float     @default(2.5)    // EF starts at 2.5
interval      Int       @default(0)      // days until next review
repetitions   Int       @default(0)      // consecutive correct answers
nextReviewAt  DateTime?                  // null = never reviewed, due immediately
lastReviewAt  DateTime?
```

**Run:** `cd quizzard && npx prisma migrate dev --name add_spaced_repetition_fields`

### C.2 — Create SM-2 algorithm utility

**File:** `quizzard/src/lib/spaced-repetition.ts`

Implement the SM-2 algorithm:

```ts
export interface SM2Result {
  easeFactor: number;
  interval: number;
  repetitions: number;
  nextReviewAt: Date;
}

/**
 * @param quality 0-5 rating (0-2 = wrong, 3 = hard, 4 = good, 5 = easy)
 */
export function sm2(
  quality: number,
  previousEF: number,
  previousInterval: number,
  previousRepetitions: number
): SM2Result { ... }
```

Core logic:
- quality < 3 → reset repetitions to 0, interval to 1
- quality >= 3 → increment repetitions, compute new interval (1, 6, then prev * EF)
- Adjust EF: `EF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))`, min 1.3
- `nextReviewAt` = now + interval days

### C.3 — Create flashcard review API route

**File:** `quizzard/app/api/notebooks/[id]/flashcard-sets/[setId]/review/route.ts`

- `POST /api/notebooks/:id/flashcard-sets/:setId/review`
- Body: `{ flashcardId: string, quality: number }` (0-5)
- Fetch current flashcard, apply SM-2, update fields
- Record activity event (`"flashcard_review"`)
- Return updated flashcard with next review date

### C.4 — Create study session API route

**File:** `quizzard/app/api/notebooks/[id]/flashcard-sets/[setId]/study-session/route.ts`

- `GET /api/notebooks/:id/flashcard-sets/:setId/study-session`
- Returns flashcards due for review: `WHERE nextReviewAt IS NULL OR nextReviewAt <= NOW()`
- Order: NULL first (never reviewed), then by `nextReviewAt` ASC
- Limit to 20 cards per session

### C.5 — Update FlashcardViewer component

**File:** `quizzard/src/components/notebook/FlashcardViewer.tsx`

- Add "Study Mode" button alongside existing view
- In study mode:
  - Show one card at a time
  - After flipping, show rating buttons: Again (0), Hard (3), Good (4), Easy (5)
  - On rate, POST to `/review` endpoint
  - Show progress bar (cards reviewed / total due)
  - At end of session, show summary: cards reviewed, accuracy, next review dates
- Show badge on flashcard set: "5 cards due" based on `nextReviewAt`

---

## GAP D — Quiz Score History

**What:** Track quiz attempts so users can see their progress over time.

### D.1 — Create QuizAttempt and QuizAnswer models

**File:** `quizzard/prisma/schema.prisma`

```prisma
model QuizAttempt {
  id         String       @id @default(cuid())
  quizSetId  String
  userId     String
  score      Int          // number of correct answers
  total      Int          // total questions
  percentage Float        // score/total * 100
  timeSpent  Int?         // seconds
  createdAt  DateTime     @default(now())

  quizSet    QuizSet      @relation(fields: [quizSetId], references: [id], onDelete: Cascade)
  answers    QuizAnswer[]

  @@index([quizSetId])
  @@index([userId, createdAt])
  @@map("quiz_attempts")
}

model QuizAnswer {
  id          String       @id @default(cuid())
  attemptId   String
  questionId  String
  selectedIdx Int          // the index the user chose
  isCorrect   Boolean
  createdAt   DateTime     @default(now())

  attempt     QuizAttempt  @relation(fields: [attemptId], references: [id], onDelete: Cascade)
  question    QuizQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)

  @@index([attemptId])
  @@map("quiz_answers")
}
```

Add to `QuizSet`: `attempts QuizAttempt[]`
Add to `QuizQuestion`: `answers QuizAnswer[]`

**Run:** `cd quizzard && npx prisma migrate dev --name add_quiz_attempts`

### D.2 — Create quiz attempt API routes

**File:** `quizzard/app/api/notebooks/[id]/quiz-sets/[setId]/attempts/route.ts`

- `POST /api/notebooks/:id/quiz-sets/:setId/attempts` — submit a completed quiz
  - Body: `{ answers: { questionId: string, selectedIdx: number }[], timeSpent?: number }`
  - Calculate score, create QuizAttempt + QuizAnswer records
  - Record activity event (`"quiz"`)
  - Return attempt with score
- `GET /api/notebooks/:id/quiz-sets/:setId/attempts` — list all attempts for this quiz
  - Returns: attempt history with scores and dates
  - Used for progress chart

### D.3 — Create attempt detail route

**File:** `quizzard/app/api/notebooks/[id]/quiz-sets/[setId]/attempts/[attemptId]/route.ts`

- `GET` — returns full attempt with all answers + correct/incorrect status
- Used for "Review wrong answers" feature

### D.4 — Update QuizViewer component

**File:** `quizzard/src/components/notebook/QuizViewer.tsx`

- After completing a quiz, POST results to `/attempts`
- Show score screen with: score, percentage, time spent, comparison to previous attempts
- "Review Wrong Answers" button — shows only incorrectly answered questions with correct answers highlighted
- "History" tab showing a line chart of scores over time (simple SVG chart, no library needed — or use lightweight `recharts` if preferred)
- Badge on quiz set card: "Best: 85%" or "Not attempted"

---

## GAP E — One-Click Document Summaries

**What:** User clicks "Summarize" on any uploaded document, Claude generates a summary.

### E.1 — Create summary API route

**File:** `quizzard/app/api/notebooks/[id]/documents/[docId]/summarize/route.ts`

- `POST /api/notebooks/:id/documents/:docId/summarize`
- Body: `{ length: "brief" | "detailed" }` (optional, default `"brief"`)
- Fetch document's `textContent` from DB
- Build Claude prompt:
  - Brief: "Summarize the following document in 3-5 bullet points..."
  - Detailed: "Provide a comprehensive summary with key points, main arguments, and conclusions..."
- Use existing `@anthropic-ai/sdk` client from `src/lib/anthropic.ts`
- Stream response back using `ReadableStream`
- Model: `claude-haiku-4-5-20251001` for speed, `claude-sonnet-4-6` for quality (make configurable)

### E.2 — Add summary storage (optional)

**File:** `quizzard/prisma/schema.prisma`

```prisma
model DocumentSummary {
  id         String   @id @default(cuid())
  documentId String
  length     String   // "brief" | "detailed"
  content    String   @db.Text
  createdAt  DateTime @default(now())

  document   Document @relation(fields: [documentId], references: [id], onDelete: Cascade)

  @@unique([documentId, length])
  @@map("document_summaries")
}
```

Add to `Document`: `summaries DocumentSummary[]`

This caches summaries so they don't need to be regenerated every time.

**Run:** `cd quizzard && npx prisma migrate dev --name add_document_summaries`

### E.3 — Update summarize route to use cache

- Before calling Claude, check if a `DocumentSummary` exists for this doc + length
- If yes, return cached version
- If no, generate, save to DB, then return
- Add `?regenerate=true` query param to force re-generation

### E.4 — Add "Summarize" button to DocumentList component

**File:** `quizzard/src/components/features/DocumentList.tsx`

- Add a "Summarize" icon button next to each document
- On click, open a modal/drawer showing the summary
- Toggle between "Brief" and "Detailed"
- Show loading state while streaming
- Display summary as rendered Markdown (use existing `react-markdown`)

### E.5 — Add summary to notebook detail page

**File:** `quizzard/app/(dashboard)/notebooks/[id]/page.tsx`

- In the documents section, show a small "AI Summary" badge if a summary exists
- Click to expand/view the summary inline

---

## GAP F — Essay Spell Check & Grammar Feedback

**What:** User pastes an essay, Claude checks grammar, spelling, clarity, and suggests improvements.

### F.1 — Create essay check API route

**File:** `quizzard/app/api/notebooks/[id]/essay-check/route.ts`

- `POST /api/notebooks/:id/essay-check`
- Body: `{ text: string, mode: "grammar" | "full" }`
  - `grammar`: only spelling/grammar
  - `full`: grammar + clarity + structure + suggestions
- Claude prompt:
  ```
  You are an academic writing assistant. Analyze the following essay for:
  1. Spelling errors (list each with correction)
  2. Grammar issues (list each with explanation and fix)
  3. Clarity improvements (suggest rewording for unclear sentences)
  4. Structure feedback (paragraph organization, transitions)

  Format your response as JSON:
  {
    "issues": [{ "type": "spelling|grammar|clarity|structure", "original": "...", "suggestion": "...", "explanation": "..." }],
    "overallScore": 0-100,
    "summary": "Brief overall assessment"
  }
  ```
- Stream response back
- Model: `claude-sonnet-4-6` (needs higher quality for nuanced feedback)

### F.2 — Create EssayChecker component

**File:** `quizzard/src/components/notebook/EssayChecker.tsx`

- Textarea for pasting essay text (or pull from current page content)
- "Check Grammar" and "Full Review" buttons
- Results panel:
  - Overall score badge (color-coded: red < 60, yellow 60-80, green > 80)
  - Issue list grouped by type, each with original text highlighted and suggestion
  - "Apply Fix" button per issue that replaces the text
- If opened from within a page editor, offer "Apply All Fixes" to update the TipTap content

### F.3 — Add entry point in EditorToolbar

**File:** `quizzard/src/components/notebook/EditorToolbar.tsx`

- Add a "Grammar Check" button (spell-check icon from `lucide-react`: `SpellCheck` or `FileCheck`)
- Opens the EssayChecker as a slide-out panel or modal
- Pre-fills with the current page's text content

### F.4 — Add entry point in GenerateDropdown

**File:** `quizzard/src/components/notebook/GenerateDropdown.tsx`

- Add "Check Grammar & Spelling" option
- Sends current page content to the essay check API

---

## GAP G — YouTube Transcript Extraction

**What:** User pastes a YouTube URL, app extracts the transcript, adds it as a document, user can chat about it.

### G.1 — Install transcript extraction library

**Tool:** `youtube-transcript` npm package (lightweight, no API key needed)

```bash
cd quizzard && npm install youtube-transcript
```

This library fetches the auto-generated or manual captions from YouTube videos without needing a YouTube Data API key.

### G.2 — Create YouTube import utility

**File:** `quizzard/src/lib/youtube.ts`

```ts
import { YoutubeTranscript } from 'youtube-transcript';

export async function extractYouTubeTranscript(url: string): Promise<{
  title: string;
  videoId: string;
  transcript: string;
  segments: { text: string; offset: number; duration: number }[];
}> { ... }

export function extractVideoId(url: string): string | null { ... }
```

- Parse video ID from various YouTube URL formats (youtube.com/watch?v=, youtu.be/, youtube.com/embed/)
- Fetch transcript using the library
- Join segments into full text
- For title: fetch from YouTube oEmbed API (no key needed): `https://www.youtube.com/oembed?url=...&format=json`

### G.3 — Create YouTube import API route

**File:** `quizzard/app/api/notebooks/[id]/documents/youtube/route.ts`

- `POST /api/notebooks/:id/documents/youtube`
- Body: `{ url: string }`
- Validate URL is a YouTube link
- Extract transcript using the utility
- Create a `Document` record:
  - `fileName`: `"YouTube: {video title}"`
  - `filePath`: the YouTube URL (for reference)
  - `fileType`: `"text/youtube-transcript"`
  - `textContent`: the full transcript text
  - `fileSize`: byte length of transcript
- Return the created document

### G.4 — Update UrlImportDialog to detect YouTube URLs

**File:** `quizzard/src/components/notebook/UrlImportDialog.tsx`

- When user pastes a URL, detect if it's a YouTube link (regex: `youtube\.com|youtu\.be`)
- If YouTube: show "This is a YouTube video. We'll extract the transcript." message
- Route to the YouTube-specific API endpoint instead of the generic URL import
- Show video thumbnail preview (use `https://img.youtube.com/vi/{videoId}/hqdefault.jpg`)

### G.5 — Add YouTube option to import menu

**File:** `quizzard/src/components/notebook/FileImportDialog.tsx` (or wherever the import options are listed)

- Add a "YouTube Video" import option with a YouTube icon
- Opens a simple URL input dialog
- On submit, calls the YouTube import API

---

## GAP H — Study Groups

**What:** Persistent groups of users with shared notebooks and group chat.

### H.1 — Create StudyGroup models

**File:** `quizzard/prisma/schema.prisma`

```prisma
model StudyGroup {
  id          String             @id @default(cuid())
  name        String
  description String?
  ownerId     String
  avatarUrl   String?
  createdAt   DateTime           @default(now())
  updatedAt   DateTime           @updatedAt

  owner       User               @relation("OwnedGroups", fields: [ownerId], references: [id], onDelete: Cascade)
  members     StudyGroupMember[]
  notebooks   StudyGroupNotebook[]

  @@index([ownerId])
  @@map("study_groups")
}

model StudyGroupMember {
  id       String     @id @default(cuid())
  groupId  String
  userId   String
  role     String     @default("member") // "owner" | "admin" | "member"
  joinedAt DateTime   @default(now())

  group    StudyGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  user     User       @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([groupId, userId])
  @@map("study_group_members")
}

model StudyGroupNotebook {
  id         String     @id @default(cuid())
  groupId    String
  notebookId String
  addedById  String
  addedAt    DateTime   @default(now())

  group      StudyGroup @relation(fields: [groupId], references: [id], onDelete: Cascade)
  notebook   Notebook   @relation(fields: [notebookId], references: [id], onDelete: Cascade)

  @@unique([groupId, notebookId])
  @@map("study_group_notebooks")
}
```

Add to `User`:
```
ownedGroups     StudyGroup[]       @relation("OwnedGroups")
groupMemberships StudyGroupMember[]
```

Add to `Notebook`:
```
studyGroups     StudyGroupNotebook[]
```

**Run:** `cd quizzard && npx prisma migrate dev --name add_study_groups`

### H.2 — Create study group API routes

**File:** `quizzard/app/api/groups/route.ts`
- `GET /api/groups` — list user's groups
- `POST /api/groups` — create a new group

**File:** `quizzard/app/api/groups/[id]/route.ts`
- `GET /api/groups/:id` — group details + members + notebooks
- `PUT /api/groups/:id` — update group (owner/admin only)
- `DELETE /api/groups/:id` — delete group (owner only)

**File:** `quizzard/app/api/groups/[id]/members/route.ts`
- `POST /api/groups/:id/members` — invite a friend to the group
- `DELETE /api/groups/:id/members` — remove a member (or leave)

**File:** `quizzard/app/api/groups/[id]/notebooks/route.ts`
- `POST /api/groups/:id/notebooks` — share a notebook with the group
- `DELETE /api/groups/:id/notebooks` — unshare a notebook

### H.3 — Create study group page

**File:** `quizzard/app/(dashboard)/groups/page.tsx`
- List of user's study groups as cards
- "Create Group" button
- Each card shows: name, member count, notebook count

**File:** `quizzard/app/(dashboard)/groups/[id]/page.tsx`
- Group detail view: members list, shared notebooks grid
- "Invite Friend" button (reuse AddFriendModal pattern)
- "Share Notebook" button (notebook picker)
- Group settings (rename, delete) for owner

### H.4 — Create group components

**File:** `quizzard/src/components/social/StudyGroupCard.tsx`
- Card displaying group name, member avatars (stacked), notebook count

**File:** `quizzard/src/components/social/GroupMemberList.tsx`
- List of members with roles, remove button for admins

**File:** `quizzard/src/components/social/CreateGroupModal.tsx`
- Form: group name, description, invite friends (multi-select from friends list)

### H.5 — Add sidebar link

**File:** `quizzard/src/components/layout/Sidebar.tsx`
- Add "Study Groups" link with `Users` icon

---

## GAP I — Gamification: Streak Backend

**What:** Track consecutive days of study activity with freeze mechanic.

### I.1 — Create UserStreak model

**File:** `quizzard/prisma/schema.prisma`

```prisma
model UserStreak {
  id             String    @id @default(cuid())
  userId         String    @unique
  currentStreak  Int       @default(0)
  longestStreak  Int       @default(0)
  lastStudyDate  DateTime? @db.Date
  freezesLeft    Int       @default(2)
  freezesUsed    Int       @default(0)
  updatedAt      DateTime  @updatedAt

  user           User      @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("user_streaks")
}
```

Add to `User`: `streak UserStreak?`

**Run:** `cd quizzard && npx prisma migrate dev --name add_user_streaks`

### I.2 — Create streak logic utility

**File:** `quizzard/src/lib/streaks.ts`

```ts
export async function updateStreak(userId: string): Promise<UserStreak> {
  // 1. Get or create UserStreak for this user
  // 2. Get today's date (UTC, date only)
  // 3. If lastStudyDate === today → no change (already counted)
  // 4. If lastStudyDate === yesterday → increment currentStreak
  // 5. If lastStudyDate === 2 days ago AND freezesLeft > 0 → use freeze, keep streak
  // 6. Otherwise → reset currentStreak to 1
  // 7. Update longestStreak if currentStreak > longestStreak
  // 8. Set lastStudyDate = today
  // 9. Save and return
}

export async function getStreakInfo(userId: string): Promise<{
  currentStreak: number;
  longestStreak: number;
  freezesLeft: number;
  isActiveToday: boolean;
}> { ... }
```

### I.3 — Hook streak updates into activity recording

**File:** `quizzard/src/lib/activity.ts` (from GAP A)

- After recording an activity event, call `updateStreak(userId)`
- This means any study action (message, page edit, quiz, flashcard review) counts toward the streak

### I.4 — Create streak API route

**File:** `quizzard/app/api/user/streak/route.ts`

- `GET /api/user/streak` — returns current streak info
- `POST /api/user/streak/freeze` — manually use a freeze (for days the user knows they'll miss)

### I.5 — Update dashboard streak card

**File:** `quizzard/app/(dashboard)/dashboard/page.tsx`

- Replace the placeholder "—" streak value with real data from `/api/user/streak`
- Show fire emoji scaling with streak length
- Show "Freeze available" indicator if freezesLeft > 0
- Milestone badges: 7 days, 30 days, 100 days, 365 days

### I.6 — Create StreakDisplay component

**File:** `quizzard/src/components/features/StreakDisplay.tsx`

- Animated fire icon with streak count
- Tooltip showing: current streak, longest streak, freezes remaining
- Color intensity increases with streak length
- Pulsing animation when streak is at risk (studied yesterday but not today)

---

## GAP J — Gamification: Achievements & Trophies

**What:** Unlock badges for milestones — Duolingo-style trophy shelf.

### J.1 — Create Achievement model

**File:** `quizzard/prisma/schema.prisma`

```prisma
model Achievement {
  id         String   @id @default(cuid())
  userId     String
  badge      String                         // unique key: "first_upload", "100_messages", "30_day_streak", etc.
  unlockedAt DateTime @default(now())

  user       User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([userId, badge])
  @@index([userId])
  @@map("achievements")
}
```

Add to `User`: `achievements Achievement[]`

**Run:** `cd quizzard && npx prisma migrate dev --name add_achievements`

### J.2 — Define achievement catalog

**File:** `quizzard/src/lib/achievements.ts`

```ts
export interface AchievementDef {
  badge: string;
  name: string;
  description: string;
  icon: string;          // lucide icon name
  category: 'study' | 'social' | 'streak' | 'content';
  checkCondition: (stats: UserStats) => boolean;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  // Content
  { badge: 'first_notebook', name: 'Fresh Start', description: 'Create your first notebook', icon: 'BookOpen', category: 'content', ... },
  { badge: 'first_upload', name: 'Material Girl', description: 'Upload your first document', icon: 'Upload', category: 'content', ... },
  { badge: '10_notebooks', name: 'Bookworm', description: 'Create 10 notebooks', icon: 'Library', category: 'content', ... },
  { badge: '50_pages', name: 'Prolific Writer', description: 'Write 50 pages', icon: 'PenTool', category: 'content', ... },

  // Study
  { badge: '100_messages', name: 'Chatterbox', description: 'Send 100 chat messages', icon: 'MessageSquare', category: 'study', ... },
  { badge: '500_messages', name: 'Deep Thinker', description: 'Send 500 chat messages', icon: 'Brain', category: 'study', ... },
  { badge: 'first_quiz', name: 'Quiz Whiz', description: 'Complete your first quiz', icon: 'HelpCircle', category: 'study', ... },
  { badge: 'perfect_quiz', name: 'Perfectionist', description: 'Score 100% on a quiz', icon: 'Award', category: 'study', ... },
  { badge: 'first_flashcard_review', name: 'Card Shark', description: 'Complete your first flashcard review', icon: 'Layers', category: 'study', ... },

  // Streak
  { badge: '7_day_streak', name: 'Week Warrior', description: 'Maintain a 7-day streak', icon: 'Flame', category: 'streak', ... },
  { badge: '30_day_streak', name: 'Monthly Master', description: 'Maintain a 30-day streak', icon: 'Flame', category: 'streak', ... },
  { badge: '100_day_streak', name: 'Centurion', description: 'Maintain a 100-day streak', icon: 'Flame', category: 'streak', ... },
  { badge: '365_day_streak', name: 'Legend', description: 'Study every day for a year', icon: 'Crown', category: 'streak', ... },

  // Social
  { badge: 'first_friend', name: 'Study Buddy', description: 'Add your first friend', icon: 'UserPlus', category: 'social', ... },
  { badge: 'first_share', name: 'Generous Scholar', description: 'Publish a notebook to the community', icon: 'Share2', category: 'social', ... },
  { badge: '10_friends', name: 'Social Butterfly', description: 'Have 10 friends', icon: 'Users', category: 'social', ... },
  { badge: 'first_group', name: 'Team Player', description: 'Join or create a study group', icon: 'Users', category: 'social', ... },
];
```

### J.3 — Create achievement checker utility

**File:** `quizzard/src/lib/achievement-checker.ts`

```ts
export async function checkAndUnlockAchievements(userId: string): Promise<Achievement[]> {
  // 1. Fetch user stats (notebook count, message count, streak, friend count, etc.)
  // 2. Fetch already unlocked achievements
  // 3. For each achievement not yet unlocked, check condition
  // 4. If condition met, create Achievement record
  // 5. Create notification for each new unlock
  // 6. Return newly unlocked achievements
}
```

Call this function after key actions:
- After creating a notebook → check content achievements
- After sending a message → check study achievements
- After streak update → check streak achievements
- After accepting friend request → check social achievements
- After publishing notebook → check social achievements

### J.4 — Create achievement API routes

**File:** `quizzard/app/api/user/achievements/route.ts`

- `GET /api/user/achievements` — returns all unlocked achievements for current user
- Also returns locked achievements with progress indicators

### J.5 — Create TrophyShelf component

**File:** `quizzard/src/components/features/TrophyShelf.tsx`

- Grid of achievement badges
- Unlocked: full color with unlock date
- Locked: grayed out with progress bar (e.g., "47/100 messages")
- Click to see details in a modal
- Categorized tabs: Study, Social, Streak, Content

### J.6 — Add trophy shelf to profile page

**File:** `quizzard/app/(dashboard)/profile/page.tsx`

- Add TrophyShelf component below user info
- Show count: "12 / 16 achievements unlocked"

### J.7 — Create achievement notification toast

**File:** `quizzard/src/components/features/AchievementToast.tsx`

- When a new achievement is unlocked, show a celebratory toast notification
- Animate in from bottom with the badge icon, name, and description
- Auto-dismiss after 5 seconds

---

## GAP K — Gamification: XP & Levels

**What:** Earn XP for study activities, level up as XP accumulates.

### K.1 — Add XP fields to User model

**File:** `quizzard/prisma/schema.prisma`

Add to `User` model:
```prisma
xp            Int       @default(0)
level         Int       @default(1)
```

**Run:** `cd quizzard && npx prisma migrate dev --name add_xp_levels`

### K.2 — Create XP system utility

**File:** `quizzard/src/lib/xp.ts`

```ts
// XP rewards per action
export const XP_REWARDS = {
  message_sent: 5,
  page_created: 10,
  page_edited: 3,
  document_uploaded: 15,
  quiz_completed: 20,
  quiz_perfect_score: 50,
  flashcard_reviewed: 2,
  flashcard_set_completed: 25,
  notebook_published: 30,
  streak_milestone_7: 100,
  streak_milestone_30: 500,
  streak_milestone_100: 2000,
} as const;

// Level thresholds (exponential curve)
export function xpForLevel(level: number): number {
  return Math.floor(100 * Math.pow(1.5, level - 1));
}

export function getLevelFromXP(totalXP: number): { level: number; currentXP: number; nextLevelXP: number } {
  let level = 1;
  let remaining = totalXP;
  while (remaining >= xpForLevel(level)) {
    remaining -= xpForLevel(level);
    level++;
  }
  return { level, currentXP: remaining, nextLevelXP: xpForLevel(level) };
}

export async function awardXP(userId: string, amount: number): Promise<{ newXP: number; newLevel: number; leveledUp: boolean }> {
  // 1. Increment user.xp by amount
  // 2. Recalculate level
  // 3. If level changed, update user.level, trigger notification
  // 4. Return result
}
```

### K.3 — Hook XP rewards into existing actions

Instrument these locations to call `awardXP()`:
- Message route (POST) → `XP_REWARDS.message_sent`
- Page creation → `XP_REWARDS.page_created`
- Document upload → `XP_REWARDS.document_uploaded`
- Quiz attempt (from GAP D) → `XP_REWARDS.quiz_completed` (+ bonus for perfect)
- Flashcard review (from GAP C) → `XP_REWARDS.flashcard_reviewed`
- Notebook publish → `XP_REWARDS.notebook_published`
- Streak milestones (from GAP I) → milestone bonuses

### K.4 — Create XP API route

**File:** `quizzard/app/api/user/xp/route.ts`

- `GET /api/user/xp` — returns: `{ totalXP, level, currentLevelXP, nextLevelXP, rank }`

### K.5 — Create LevelBadge component

**File:** `quizzard/src/components/features/LevelBadge.tsx`

- Small circular badge showing current level number
- Color changes by tier: 1-10 bronze, 11-25 silver, 26-50 gold, 51+ diamond
- Used in: header, profile, sidebar, friend list

### K.6 — Create XPProgressBar component

**File:** `quizzard/src/components/features/XPProgressBar.tsx`

- Shows current XP / XP needed for next level
- Animated fill bar
- "+5 XP" floating text animation when XP is earned

### K.7 — Add XP display to dashboard

**File:** `quizzard/app/(dashboard)/dashboard/page.tsx`

- Add XP progress bar below stat cards
- Show level badge in header (next to username)

---

## GAP L — Gamification: Exam Countdown & Auto Study Planner

**What:** User adds exam dates, app shows countdown and Claude generates a fitted study plan.

### L.1 — Create Exam model

**File:** `quizzard/prisma/schema.prisma`

```prisma
model Exam {
  id         String    @id @default(cuid())
  userId     String
  notebookId String
  title      String                          // "Biology Final Exam"
  examDate   DateTime
  reminders  Boolean   @default(true)        // send reminder notifications
  createdAt  DateTime  @default(now())
  updatedAt  DateTime  @updatedAt

  user       User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  notebook   Notebook  @relation(fields: [notebookId], references: [id], onDelete: Cascade)
  studyPlan  StudyPlan? @relation                // optional linked auto-generated plan

  @@index([userId, examDate])
  @@map("exams")
}
```

Add to `User`: `exams Exam[]`
Add to `Notebook`: `exams Exam[]`
Add to `StudyPlan`: `exam Exam?` + `examId String? @unique`

**Run:** `cd quizzard && npx prisma migrate dev --name add_exams`

### L.2 — Create exam API routes

**File:** `quizzard/app/api/user/exams/route.ts`
- `GET /api/user/exams` — list all upcoming exams (sorted by date)
- `POST /api/user/exams` — create an exam

**File:** `quizzard/app/api/user/exams/[id]/route.ts`
- `GET /api/user/exams/:id` — exam detail
- `PUT /api/user/exams/:id` — update exam
- `DELETE /api/user/exams/:id` — delete exam

### L.3 — Create auto study plan generation route

**File:** `quizzard/app/api/user/exams/[id]/generate-plan/route.ts`

- `POST /api/user/exams/:id/generate-plan`
- Fetch the exam + notebook + all documents/pages in notebook
- Calculate days until exam
- Build Claude prompt:
  ```
  You are a study planning assistant. The student has an exam titled "{title}" in {daysLeft} days.
  Here are the topics covered in their notebook: {list of section titles + page titles}

  Create a structured study plan that:
  1. Distributes topics evenly across available days
  2. Prioritizes harder/larger topics earlier
  3. Includes review days before the exam
  4. Accounts for weekends (lighter load)

  Return as JSON: { phases: [{ title, description, startDate, endDate, materials: [{ type, title, referenceId }] }] }
  ```
- Create `StudyPlan` + `StudyPhase` + `StudyMaterial` records from Claude's response
- Link plan to exam via `examId`
- Return the created plan

### L.4 — Create ExamCountdown component

**File:** `quizzard/src/components/features/ExamCountdown.tsx`

- Card showing exam title, notebook name, days remaining
- Color-coded urgency: green (>14 days), yellow (7-14), orange (3-7), red (<3)
- "Generate Study Plan" button if no plan linked
- "View Study Plan" button if plan exists
- Mini progress ring showing study plan completion percentage

### L.5 — Create ExamForm component

**File:** `quizzard/src/components/features/ExamForm.tsx`

- Form: title, exam date (date picker), notebook selector (dropdown of user's notebooks)
- Date must be in the future
- On submit, POST to `/api/user/exams`

### L.6 — Add exam section to dashboard

**File:** `quizzard/app/(dashboard)/dashboard/page.tsx`

- "Upcoming Exams" section showing ExamCountdown cards for next 3 exams
- "Add Exam" button opening ExamForm modal
- If no exams, show encouraging empty state

### L.7 — Add exam to notebook detail

**File:** `quizzard/app/(dashboard)/notebooks/[id]/page.tsx`

- "Exams" section showing exams linked to this notebook
- "Add Exam Date" button
- Countdown display inline

### L.8 — Create exam reminder system

**File:** `quizzard/src/lib/exam-reminders.ts`

- Utility function `checkExamReminders(userId)` that:
  - Fetches upcoming exams where `reminders = true`
  - Creates `Notification` records at key intervals: 7 days, 3 days, 1 day before
  - Message: "Your {title} exam is in {days} days. You have {incomplete} topics left to review."
- Call this from a daily cron or on each login/dashboard load

---

## GAP M — Sentry Error Monitoring

**What:** Capture runtime errors in production with Sentry.

### M.1 — Install Sentry

```bash
cd quizzard && npx @sentry/wizard@latest -i nextjs
```

This wizard will:
- Install `@sentry/nextjs`
- Create `sentry.client.config.ts`
- Create `sentry.server.config.ts`
- Create `sentry.edge.config.ts`
- Update `next.config.ts` to wrap with `withSentryConfig`
- Create `app/global-error.tsx` for error boundary

### M.2 — Configure Sentry

**File:** `quizzard/sentry.client.config.ts`
```ts
import * as Sentry from '@sentry/nextjs';
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  tracesSampleRate: 0.1,       // 10% of transactions for performance
  replaysSessionSampleRate: 0,  // no replays on free tier
  environment: process.env.NODE_ENV,
});
```

### M.3 — Add environment variable

**File:** `.env.local` (and production env)
```
NEXT_PUBLIC_SENTRY_DSN=https://xxx@sentry.io/xxx
SENTRY_AUTH_TOKEN=xxx    # for source maps upload
```

### M.4 — Add global error boundary

**File:** `quizzard/app/global-error.tsx`
```tsx
'use client';
import * as Sentry from '@sentry/nextjs';
export default function GlobalError({ error, reset }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return (/* error UI with "Try again" button */);
}
```

### M.5 — Test integration

- Throw a test error in a component
- Verify it appears in Sentry dashboard
- Remove test error

---

## GAP N — CI/CD Pipeline

**What:** Automated linting, type checking, and deployment on push.

### N.1 — Create GitHub Actions workflow for CI

**File:** `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: ./quizzard
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: quizzard/package-lock.json
      - run: npm ci
      - run: npx prisma generate
      - run: npm run lint
      - run: npx tsc --noEmit
      - run: npm run format:check

  build:
    runs-on: ubuntu-latest
    needs: lint-and-typecheck
    defaults:
      run:
        working-directory: ./quizzard
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: 'npm'
          cache-dependency-path: quizzard/package-lock.json
      - run: npm ci
      - run: npx prisma generate
      - run: npm run build
        env:
          DATABASE_URL: "postgresql://fake:fake@localhost:5432/fake"
          NEXTAUTH_SECRET: "ci-secret"
          NEXTAUTH_URL: "http://localhost:3000"
```

### N.2 — Configure Vercel deployment

**File:** `quizzard/vercel.json` (if needed)

```json
{
  "buildCommand": "npx prisma generate && npm run build",
  "outputDirectory": ".next",
  "installCommand": "npm ci"
}
```

- Connect GitHub repo to Vercel
- Set environment variables in Vercel dashboard
- Enable automatic deploys on `main` branch
- Set up preview deploys for PRs

### N.3 — Add branch protection rules

On GitHub repo settings:
- Require CI to pass before merging to `main`
- Require at least 1 approval (optional for solo dev)
- Prevent force pushes to `main`

---

## Implementation Order (Recommended)

The gaps have dependencies. Here's the optimal order:

```
Phase 1 (Foundation — do first, everything depends on it):
  A.1-A.2  → ActivityEvent model + recording helper
  I.1-I.3  → Streak model + logic (uses activity recording)
  K.1-K.3  → XP model + awarding (uses activity recording)
  M.1-M.5  → Sentry (catch errors from the start)

Phase 2 (Core study features):
  C.1-C.5  → Spaced repetition
  D.1-D.4  → Quiz score history
  E.1-E.5  → Document summaries
  L.1-L.8  → Exam countdown + auto planner

Phase 3 (UI & gamification display):
  A.3-A.5  → Heatmap API + component + dashboard
  I.4-I.6  → Streak API + dashboard + component
  K.4-K.7  → XP API + components + dashboard
  J.1-J.7  → Achievements system (needs streak + XP data)
  B.1-B.4  → Profile page (shows achievements, XP, streak)

Phase 4 (Additional features):
  F.1-F.4  → Essay spell check
  G.1-G.5  → YouTube transcript
  H.1-H.5  → Study groups

Phase 5 (Ops):
  N.1-N.3  → CI/CD pipeline
```

**Total new Prisma models:** 9 (ActivityEvent, UserStreak, Achievement, QuizAttempt, QuizAnswer, DocumentSummary, Exam, StudyGroup, StudyGroupMember, StudyGroupNotebook)
**Total new API routes:** ~25
**Total new components:** ~15
**Total new lib files:** ~8
**New npm packages:** `youtube-transcript`, `@sentry/nextjs`
