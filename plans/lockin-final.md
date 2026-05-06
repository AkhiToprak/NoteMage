# Notemage Feature Expansion — lockin-final

## Context

Notemage is a Next.js 16 educational platform with notebooks, flashcards, quizzes, AI chat (Claude), rich text editing (TipTap), infinite canvas (Tldraw), real-time collaboration, and community features. This plan adds: enhanced flashcard management, content extraction from slides/PDFs/URLs, study planning, tables, export system, PPT generation, and external notebook imports.

---

## PHASE 1: Flashcard Foundation & Manual Creation

### 1A. Persist Card Creation API

**Problem:** `addCard()` in FlashcardViewer.tsx is client-side only (temp ID, never calls API).

- **Create** `app/api/notebooks/[id]/flashcard-sets/[setId]/flashcards/route.ts`
  - POST: Create a single flashcard (question, answer, sortOrder)
  - Follow auth pattern from existing `[cardId]/route.ts`
- **Modify** `src/components/notebook/FlashcardViewer.tsx`
  - Update `addCard()` to POST to API, replace temp ID with server response

### 1B. Make FlashcardSet Creatable Without AI

**Problem:** FlashcardSet requires `chatId` and `messageId` — only AI can create sets.

- **Modify** `prisma/schema.prisma`:
  - `chatId` → optional (`String?`)
  - `messageId` → optional (`String?`)
  - Add `source String @default("ai")` — values: `"ai"`, `"manual"`, `"import"`
- **Run** `npx prisma migrate dev --name make-flashcard-chat-optional`
- **Modify** existing flashcard set POST route to allow creation without chatId/messageId

### 1C. Manual Flashcard Set Creation UI

- **Create** `src/components/notebook/FlashcardSetCreator.tsx`
  - Modal with: title input, dynamic question/answer row list
  - Add/remove/reorder card rows
  - Optional section picker (reuse pattern from FlashcardViewer)
  - Submit → POST to flashcard-sets route
- **Integrate** "Create Flashcard Set" button into notebook sidebar or flashcard listing

### 1D. Duplicate Individual Cards

- **Modify** `src/components/notebook/FlashcardViewer.tsx`
  - Add "Duplicate" button next to Edit/Delete per card
  - On click → POST to `/flashcards` route with same question/answer, sortOrder = last+1

### 1E. Combine / Merge Flashcard Sets

- **Create** `app/api/notebooks/[id]/flashcard-sets/merge/route.ts`
  - POST body: `{ sourceSetIds: string[], targetTitle: string }`
  - Move all cards from source sets into new set, delete empty source sets

### 1F. Split Flashcard Set

- **Create** `app/api/notebooks/[id]/flashcard-sets/[setId]/split/route.ts`
  - POST body: `{ splits: [{ title: string, cardIds: string[] }] }`
  - Create new sets from selected card subsets

### 1G. Flashcard Set Manager UI

- **Create** `src/components/notebook/FlashcardSetManager.tsx`
  - Multi-select sets for merge
  - Card selection within a set for split
  - Preview before confirming

### 1H. Flashcard Images (Multi-image support)

- **Modify** `prisma/schema.prisma` — add model:

  ```prisma
  model FlashcardImage {
    id          String    @id @default(cuid())
    flashcardId String
    side        String    // "front" | "back"
    fileName    String
    filePath    String
    fileSize    Int
    mimeType    String
    sortOrder   Int       @default(0)
    createdAt   DateTime  @default(now())
    flashcard   Flashcard @relation(fields: [flashcardId], references: [id], onDelete: Cascade)
    @@index([flashcardId])
    @@map("flashcard_images")
  }
  ```

  - Add `images FlashcardImage[]` to Flashcard model

- **Run** migration
- **Create** `app/api/notebooks/[id]/flashcard-sets/[setId]/flashcards/[cardId]/images/route.ts`
  - POST: upload image (FormData) with `side` field
  - GET: list images for a card
  - DELETE: remove image
- **Modify** `FlashcardViewer.tsx` — display images on front/back, upload buttons in edit mode

### 1I. Import from CSV / Excel (.xlsx)

- **Install** `npm i xlsx`
- **Create** `app/api/notebooks/[id]/flashcard-sets/import/route.ts`
  - POST FormData with file (.csv or .xlsx)
  - CSV: parse `question,answer` columns
  - XLSX: read first sheet, first two columns
  - Create FlashcardSet with `source: "import"`
- **Create** `src/components/notebook/FlashcardImportDialog.tsx`
  - File dropzone (reuse pattern from `FileImportDialog.tsx`)
  - Preview parsed cards, confirm import

### 1J. Import from Quizlet (paste export text)

- **Add tab** in FlashcardImportDialog for "Paste from Quizlet"
  - Textarea for pasted Quizlet export text
  - Parse tab-separated `term\tdefinition\n` format
  - Same POST to import route with parsed data

### 1K. Import from Anki (.apkg)

- **Install** `npm i better-sqlite3 jszip` + `npm i -D @types/better-sqlite3`
- **Create** `src/lib/ankiParser.ts`
  - Unzip .apkg with jszip
  - Read SQLite DB (`collection.anki2`) with better-sqlite3
  - Extract `notes` table, split fields by `\x1f` separator
  - Return `{question, answer}[]`
- **Add** .apkg support to FlashcardImportDialog and import route

### 1L. Link Flashcard Sets in Notebook Sections

**Already partially exists** — FlashcardSet has optional `sectionId`. Ensure:

- **Verify** section picker in FlashcardViewer works for assigning sets to sections
- **Add** flashcard set listing in the section view (show linked sets under a section in sidebar)

---

## PHASE 2: Content Extraction & Generation

### 2A. PowerPoint (.pptx) Text + Image Extraction

- **Install** `npm i jszip` (if not already from 1K)
- **Create** `src/lib/pptxParser.ts`
  - Unzip .pptx, parse `ppt/slides/slide{N}.xml` for text nodes
  - Extract images from `ppt/media/`
  - Return `{ slides: [{ slideNumber, text, images: Buffer[] }] }`
- **Modify** `src/lib/fileProcessing.ts`
  - Add `.pptx` to ALLOWED_MIME_TYPES
  - Add `extractTextFromPptx()` using pptxParser
- **Modify** `src/lib/contentConverter.ts`
  - Add `slidesToTipTapJSON()` — heading per slide + paragraph content
- **Modify** `FileImportDialog.tsx` — accept .pptx files
- **Modify** section import route to handle .pptx

### 2B. PDF Image Extraction (currently text-only)

- **Install** `npm i pdfjs-dist`
- **Create** `src/lib/pdfImageExtractor.ts`
  - Use pdfjs-dist to extract embedded images from PDF streams
  - Return `{ pages: [{ images: {buffer, mimeType}[] }] }`
- **Modify** section import route — optionally save extracted images as PageImage records

### 2C. Website URL Content Extraction

- **Install** `npm i cheerio`
- **Create** `src/lib/urlScraper.ts`
  - Fetch URL, parse HTML with cheerio
  - Extract main content (article/main/body), strip nav/footer/scripts
  - Return `{ title, text, images: string[] }`
- **Create** `app/api/notebooks/[id]/sections/[sectionId]/import-url/route.ts`
  - POST body: `{ url: string }`
  - Fetch, parse, convert to TipTap JSON, create page
- **Create** `src/components/notebook/UrlImportDialog.tsx`
  - URL input, preview extracted content, confirm import

### 2D. Direct "Generate Flashcards/Quiz from Page" (skip chat)

- **Refactor:** Extract AI tool definitions (FLASHCARD_TOOL, QUIZ_TOOL) from `app/api/notebooks/[id]/chats/[chatId]/messages/route.ts` into `src/lib/aiTools.ts`
- **Create** `app/api/notebooks/[id]/pages/[pageId]/generate-flashcards/route.ts`
  - Read page textContent, call Claude with flashcard tool, create FlashcardSet
- **Create** `app/api/notebooks/[id]/pages/[pageId]/generate-quiz/route.ts`
  - Same but with quiz tool
- **Add** "Generate Flashcards" / "Generate Quiz" buttons to page actions menu in PageEditor

### 2E. PowerPoint (.pptx) Generation

- **Install** `npm i pptxgenjs`
- **Create** `src/lib/pptxGenerator.ts`
  - Accept `{ slides: [{ title, bullets, notes?, imageUrl? }] }`
  - Generate .pptx Buffer using pptxgenjs
- **Create** `app/api/notebooks/[id]/export/pptx/route.ts`
  - POST body: `{ pageIds: string[] }` or `{ sectionId }`
  - Read pages, convert TipTap content to slide structure
  - Return .pptx file download

### 2F. In-App PowerPoint Editor (before export)

- **Create** `src/components/notebook/PptxEditor.tsx`
  - Display slide previews from generated structure
  - Edit slide titles, bullet points, reorder slides
  - Add/remove slides
  - "Export as .pptx" button triggers download
- **Create** page or modal: `app/(dashboard)/notebooks/[id]/presentation/page.tsx`

### 2G. PDF Generation with Explanations

- **Install** `npm i pdfkit` (or `@react-pdf/renderer` for React-based approach)
- **Create** `src/lib/pdfGenerator.ts`
  - Convert TipTap JSON → PDF (headings, paragraphs, lists, images, tables)
  - Support "explanation mode" — AI-generated summaries per section
- **Create** `app/api/notebooks/[id]/export/pdf/route.ts`
  - POST body: `{ pageIds, includeExplanations?: boolean }`
  - If explanations requested, call Claude for each page to generate summary
  - Return .pdf file download

---

## PHASE 3: Table Support & Excel Integration

### 3A. TipTap Table Extension

- **Install** `npm i @tiptap/extension-table @tiptap/extension-table-row @tiptap/extension-table-cell @tiptap/extension-table-header`
- **Modify** `src/components/notebook/PageEditor.tsx`
  - Add all 4 table extensions to `useEditor()` config
- **Modify** editor toolbar (EditorToolbar or inline toolbar in PageEditor)
  - Add table buttons: insert table (with row/col picker), add row, add column, delete row, delete column, merge cells, split cells
- **Add** table CSS styles to `app/globals.css` (borders, padding, header styling)

### 3B. Import Excel Data as Tables

- Uses `xlsx` package (already installed in Phase 1I)
- **Modify** `src/lib/contentConverter.ts`
  - Add `xlsxToTipTapTableJSON()` — reads sheet, creates TipTap table node
- **Modify** `src/lib/fileProcessing.ts` — add .xlsx MIME type
- **Modify** FileImportDialog + section import route — .xlsx imports as page with table

---

## PHASE 4: Export System

### 4A. Export Single/Multiple Pages as PDF

- Uses pdfGenerator from Phase 2G
- **Add** "Export as PDF" to page context menu / PageEditor actions
- **Create** `src/components/notebook/ExportDialog.tsx`
  - Unified export UI: select pages, choose format (PDF / PPTX)
  - Single page or multi-page export
  - Download button

### 4B. Merge Multiple Files into One PDF

- **Install** `npm i pdf-lib`
- **Create** `app/api/notebooks/[id]/export/pdf/merge/route.ts`
  - POST body: `{ pageIds: string[] }`
  - Generate individual PDFs, merge with pdf-lib
  - Return single merged PDF

### 4C. Split PDF

- **Create** `app/api/notebooks/[id]/export/pdf/split/route.ts`
  - POST body: `{ documentId: string, splitPages: number[] }`
  - Use pdf-lib to split by page ranges
  - Return ZIP of split PDFs (or individual downloads)

---

## PHASE 5: Study Planning System

### 5A. Database Schema

- **Modify** `prisma/schema.prisma` — add models:

  ```prisma
  model StudyPlan {
    id          String       @id @default(cuid())
    notebookId  String
    title       String
    description String?
    startDate   DateTime
    endDate     DateTime
    createdAt   DateTime     @default(now())
    updatedAt   DateTime     @updatedAt
    notebook    Notebook     @relation(fields: [notebookId], references: [id], onDelete: Cascade)
    phases      StudyPhase[]
    @@index([notebookId])
    @@map("study_plans")
  }

  model StudyPhase {
    id          String          @id @default(cuid())
    planId      String
    title       String
    description String?
    sortOrder   Int             @default(0)
    startDate   DateTime
    endDate     DateTime
    status      String          @default("upcoming") // upcoming | active | completed
    createdAt   DateTime        @default(now())
    updatedAt   DateTime        @updatedAt
    plan        StudyPlan       @relation(fields: [planId], references: [id], onDelete: Cascade)
    materials   StudyMaterial[]
    @@index([planId])
    @@map("study_phases")
  }

  model StudyMaterial {
    id          String     @id @default(cuid())
    phaseId     String
    type        String     // page | flashcard_set | quiz_set | document
    referenceId String
    title       String
    completed   Boolean    @default(false)
    sortOrder   Int        @default(0)
    createdAt   DateTime   @default(now())
    phase       StudyPhase @relation(fields: [phaseId], references: [id], onDelete: Cascade)
    @@index([phaseId])
    @@map("study_materials")
  }
  ```

- Add `studyPlans StudyPlan[]` to Notebook model
- **Run** migration

### 5B. API Routes

- **Create** `app/api/notebooks/[id]/study-plans/route.ts` — GET (list), POST (create)
- **Create** `app/api/notebooks/[id]/study-plans/[planId]/route.ts` — GET, PATCH, DELETE
- **Create** `app/api/notebooks/[id]/study-plans/[planId]/phases/route.ts` — GET, POST
- **Create** `app/api/notebooks/[id]/study-plans/[planId]/phases/[phaseId]/route.ts` — PATCH, DELETE
- **Create** `app/api/notebooks/[id]/study-plans/[planId]/phases/[phaseId]/materials/route.ts` — GET, POST
- **Create** `app/api/notebooks/[id]/study-plans/[planId]/phases/[phaseId]/materials/[materialId]/route.ts` — PATCH, DELETE

### 5C. AI-Generated Study Plans

- **Add** `CREATE_STUDY_PLAN_TOOL` to `src/lib/aiTools.ts`
  - Input: notebook content summary, duration, goals
  - Output: structured phases with material assignments and schedule
- **Create** `app/api/notebooks/[id]/study-plans/generate/route.ts`
  - Read notebook pages/sections, call Claude with study plan tool
  - Create StudyPlan + phases + materials from AI response

### 5D. UI Components

- **Create** `src/components/notebook/StudyPlanView.tsx` — timeline view with phases
- **Create** `src/components/notebook/StudyPhaseCard.tsx` — phase with material checklist, progress bar
- **Create** `src/components/notebook/StudyPlanCreator.tsx` — manual create/edit form or AI generate
- **Add** study plan navigation to notebook sidebar
- **Create** page: `app/(dashboard)/notebooks/[id]/study-plan/[planId]/page.tsx`

---

## PHASE 6: External Notebook Import

### 6A. OneNote Import (Microsoft Graph API)

- **Install** `npm i @microsoft/microsoft-graph-client @azure/msal-node`
- **Add env vars:** `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_TENANT_ID`
- **Create** `src/lib/onenoteImporter.ts`
  - OAuth flow helpers
  - Fetch notebooks → sections → pages via Graph API
  - Convert OneNote HTML content to TipTap JSON
- **Create** `app/api/import/onenote/auth/route.ts` — OAuth callback
- **Create** `app/api/import/onenote/notebooks/route.ts` — list user's OneNote notebooks
- **Create** `app/api/import/onenote/import/route.ts` — import selected notebook/sections
- **Create** `src/components/notebook/OneNoteImportDialog.tsx`
  - "Connect Microsoft Account" button
  - Notebook/section picker tree
  - Import progress bar

### 6B. GoodNotes Import

- **Approach:** GoodNotes uses a proprietary binary format — no public parser exists.
- **Solution:** Support GoodNotes → PDF export workflow. User exports from GoodNotes as PDF, then uses existing PDF import (Phase 2B enhanced with image extraction).
- **UI:** Add "Import from GoodNotes" option that shows instructions: "Export your GoodNotes notebook as PDF, then import the PDF here."

### 6C. Apple Notes Import

- **Approach:** Apple Notes has no public API for web apps.
- **Solution:** Support Apple Notes → PDF export workflow.
- **UI:** Add "Import from Apple Notes" option with instructions: "Select notes in Apple Notes → File → Export as PDF, then import here."
- **Alternative (macOS Electron only, future):** If Notemage ever ships as a desktop app, use `osascript` to read Apple Notes via AppleScript.

---

## Dependency Graph

```
Phase 1A (card API) ──┬──> 1C (manual creation UI)
                      ├──> 1D (duplicate cards)
                      └──> 1H (card images)

Phase 1B (schema) ────┬──> 1C (manual creation)
                      ├──> 1E (merge sets)
                      ├──> 1F (split sets)
                      ├──> 1I (CSV/Excel import)
                      ├──> 1J (Quizlet import)
                      └──> 1K (Anki import)

Phase 1G (set manager UI) depends on 1E + 1F

Phase 2A (PPTX extract) ──> 2D (AI generate from content)
Phase 2B (PDF images) ────> 2D
Phase 2C (URL scrape) ────> 2D
Phase 2D ─────────────────> 2E (PPTX gen) + 2G (PDF gen)
Phase 2E ─────────────────> 2F (PPTX editor)

Phase 3A (TipTap tables) ──> 3B (Excel as tables)
Phase 1I (xlsx pkg) ───────> 3B

Phase 2G (PDF gen) ────────> 4A, 4B, 4C (export system)

Phase 5 (study planning) — independent
Phase 6 (external import) — independent
```

---

## NPM Packages to Install

| Package                                    | Phase  | Purpose                       |
| ------------------------------------------ | ------ | ----------------------------- |
| `xlsx`                                     | 1I, 3B | Excel parsing                 |
| `jszip`                                    | 1K, 2A | ZIP handling (Anki, PPTX)     |
| `better-sqlite3` + `@types/better-sqlite3` | 1K     | Anki SQLite reading           |
| `cheerio`                                  | 2C     | HTML parsing for URL scraping |
| `pptxgenjs`                                | 2E     | PowerPoint generation         |
| `pdfkit`                                   | 2G     | PDF generation                |
| `pdf-lib`                                  | 4B, 4C | PDF merge/split               |
| `pdfjs-dist`                               | 2B     | PDF image extraction          |
| `@tiptap/extension-table`                  | 3A     | Table editing                 |
| `@tiptap/extension-table-row`              | 3A     | Table rows                    |
| `@tiptap/extension-table-cell`             | 3A     | Table cells                   |
| `@tiptap/extension-table-header`           | 3A     | Table headers                 |
| `@microsoft/microsoft-graph-client`        | 6A     | OneNote API                   |
| `@azure/msal-node`                         | 6A     | Azure OAuth                   |

---

## Database Migrations Summary

| Migration                      | Models Changed                                                  |
| ------------------------------ | --------------------------------------------------------------- |
| `make-flashcard-chat-optional` | FlashcardSet (chatId?, messageId?, +source)                     |
| `add-flashcard-images`         | +FlashcardImage, Flashcard (+images relation)                   |
| `add-study-planning`           | +StudyPlan, +StudyPhase, +StudyMaterial, Notebook (+studyPlans) |

---

## Key Files to Modify

| File                                                      | Phases     | Changes                                        |
| --------------------------------------------------------- | ---------- | ---------------------------------------------- |
| `prisma/schema.prisma`                                    | 1B, 1H, 5A | Schema changes                                 |
| `src/lib/fileProcessing.ts`                               | 2A, 2B, 3B | Add PPTX, XLSX, PDF image extraction           |
| `src/lib/contentConverter.ts`                             | 2A, 3B     | Add slides-to-TipTap, xlsx-to-table conversion |
| `src/components/notebook/FlashcardViewer.tsx`             | 1A, 1D, 1H | Persist cards, duplicate, images               |
| `src/components/notebook/PageEditor.tsx`                  | 3A         | Add table extensions                           |
| `src/components/notebook/FileImportDialog.tsx`            | 2A, 3B     | Accept .pptx, .xlsx                            |
| `app/api/notebooks/[id]/chats/[chatId]/messages/route.ts` | 2D         | Extract AI tools to shared module              |

---

## Verification

- **After each phase:** Run `npx tsc --noEmit` to verify TypeScript compilation
- **After schema changes:** Run `npx prisma migrate dev` and `npx prisma generate`
- **After API routes:** Test with curl or the app's UI
- **After UI components:** User tests manually (per project feedback — no preview tools)
