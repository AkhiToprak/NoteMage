# Notebook Restructure Plan: OneNote-Style Workspace

## Why This Change

Quizzard is currently an "upload files → AI chat" tool. Users upload PDFs/DOCX files, the app extracts text, and (in a future phase) an AI chats about the content. This is useful but limited — it treats notebooks as containers for uploaded files, not as living documents users actively write in.

The goal is to transform Quizzard into a **real notebook app** — like OneNote — where users can:

- Open a notebook and get a dedicated workspace with its own sidebar
- Create sections (folders) and subsections within notebooks
- Create, write, and edit rich text pages with formatting
- Draw on pages with a pen/cursor
- Embed images inline in pages
- Import files (PDF, DOCX, TXT) as editable pages
- Share notebooks with friends (future)

This requires changes to the data model, routing, layout, and component architecture.

---

## Current State (What Exists Today)

### Database Models
- **User**: auth credentials, timestamps
- **Notebook**: userId, name, description, subject, color
- **Document**: notebookId, fileName, filePath, fileSize, fileType, textContent
- **ChatMessage**: notebookId, userId, role, content

### Route Structure
```
app/(dashboard)/layout.tsx              → [AppSidebar 256px] + [Header 64px] + {children}
app/(dashboard)/dashboard/page.tsx      → welcome + stat cards
app/(dashboard)/notebooks/page.tsx      → notebook grid listing
app/(dashboard)/notebooks/[id]/page.tsx → detail: file upload + document list + AI chat stub
```

### Key Files
- `prisma/schema.prisma` — all models
- `src/components/layout/Sidebar.tsx` — app-level navigation (Dashboard, Notebooks, Settings)
- `src/components/layout/Header.tsx` — user avatar + logout
- `app/(dashboard)/layout.tsx` — main dashboard layout (sidebar + header + content)
- `src/components/features/` — NotebookCard, NotebookForm, FileUpload, DocumentList
- `src/lib/` — db.ts (Prisma), api-response.ts, storage.ts, fileProcessing.ts
- `src/auth/config.ts` — NextAuth JWT config

### Styling Conventions
- **All inline styles** — no CSS modules, no Tailwind classes in components
- Colors: `#8c52ff` (purple), `#5170ff` (blue), `#09081a` (bg), `#0d0c20` (card bg), `#ede9ff` (text)
- Fonts: `'Gliker', 'DM Sans', sans-serif` (body), `'Shrikhand', cursive` (display numbers)
- Icons: `lucide-react`
- Transitions: 0.12–0.25s ease, never `transition-all`

---

## A. Data Model Changes

### New Models

Add these to `prisma/schema.prisma`:

```prisma
model Section {
  id            String    @id @default(cuid())
  notebookId    String
  parentId      String?   // null = top-level; set = subsection
  title         String
  sortOrder     Int       @default(0)
  color         String?   // optional accent override
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  notebook      Notebook  @relation(fields: [notebookId], references: [id], onDelete: Cascade)
  parent        Section?  @relation("SectionTree", fields: [parentId], references: [id], onDelete: Cascade)
  children      Section[] @relation("SectionTree")
  pages         Page[]

  @@index([notebookId])
  @@index([parentId])
  @@map("sections")
}

model Page {
  id            String    @id @default(cuid())
  sectionId     String
  title         String    @default("Untitled")
  content       Json?     // TipTap JSON document format
  textContent   String?   // Plain text mirror for AI context + search
  drawingData   Json?     // Array of stroke objects [{points, color, width}]
  sortOrder     Int       @default(0)
  sourceDocId   String?   // set if this page was imported from a Document
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt

  section       Section   @relation(fields: [sectionId], references: [id], onDelete: Cascade)
  images        PageImage[]

  @@index([sectionId])
  @@map("pages")
}

model PageImage {
  id            String    @id @default(cuid())
  pageId        String
  fileName      String
  filePath      String
  fileSize      Int
  mimeType      String
  createdAt     DateTime  @default(now())

  page          Page      @relation(fields: [pageId], references: [id], onDelete: Cascade)

  @@index([pageId])
  @@map("page_images")
}
```

### Changes to Existing Models

**Notebook** — add `sections` relation:
```prisma
model Notebook {
  // ... all existing fields stay ...
  sections      Section[]   // ← ADD
}
```

**Document** — NO changes. Kept as-is for backward compatibility. Will be deprecated after migration.

### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| `Section.parentId` self-referential | Enables unlimited nesting (sections within sections) |
| `Page.content` as `Json` | TipTap's native JSON format — lossless, queryable, versionable |
| `Page.textContent` as plain text mirror | Auto-extracted on save; used for AI chat context and search |
| `Page.drawingData` as separate `Json` field | Drawing overlay is independent from text content; loaded/saved separately |
| `Page.sourceDocId` | Links imported pages back to original Documents for traceability |
| `PageImage` as separate model | Enables cleanup when pages are deleted; images served via authenticated API |
| Keep `Document` model | No breaking changes during development; migrate later |

---

## B. Route Structure

### New Routes

```
app/(dashboard)/notebooks/page.tsx                         → notebook grid (UNCHANGED)
app/(dashboard)/notebooks/[id]/layout.tsx                  → NEW: notebook workspace with NotebookSidebar
app/(dashboard)/notebooks/[id]/page.tsx                    → REWRITE: landing that redirects to first page or shows empty state
app/(dashboard)/notebooks/[id]/pages/[pageId]/page.tsx     → NEW: page editor view
```

### Layout Nesting

When a user opens a notebook at `/notebooks/[id]`, the layout stacks like this:

```
┌─────────────────────────────────────────────────────────────────┐
│ App Sidebar (256px)  │  Notebook Sidebar (240px)  │  Page Editor │
│                      │                            │              │
│  • Dashboard         │  ▸ Section A               │  [Toolbar]   │
│  • Notebooks  ←      │    • Page 1  ←             │              │
│  • Settings          │    • Page 2                 │  [Content]   │
│                      │  ▸ Section B               │              │
│                      │    • Page 3                 │  [Drawing]   │
│                      │  + New Section              │              │
│                      │                            │              │
│  v0.1.0              │  📁 Import File             │              │
└─────────────────────────────────────────────────────────────────┘
```

**How it works:**

1. `app/(dashboard)/layout.tsx` provides AppSidebar (256px) + Header (64px) — **unchanged**
2. `app/(dashboard)/notebooks/[id]/layout.tsx` (**new**) adds NotebookSidebar (240px) to the left of `{children}`
3. `app/(dashboard)/notebooks/[id]/pages/[pageId]/page.tsx` (**new**) renders the PageEditor as the child

The notebook sidebar:
- Background `#0d0c20` with left border `rgba(140,82,255,0.12)` (matches app sidebar)
- Shows notebook name at top, section/page tree below
- "New Section" button, "Import File" button at bottom
- Collapsible via a toggle button

### URL Patterns

| URL | What it shows |
|-----|---------------|
| `/notebooks` | Notebook grid listing (unchanged) |
| `/notebooks/abc123` | Notebook landing — redirects to first page, or empty state |
| `/notebooks/abc123/pages/xyz789` | Editing page xyz789 in notebook abc123 |

---

## C. Component Architecture

### New Components

All new components go in `src/components/notebook/`:

```
src/components/notebook/
├── NotebookSidebar.tsx       → section/page tree sidebar for the notebook workspace
├── SectionTree.tsx           → recursive tree renderer for sections and pages
├── SectionItem.tsx           → single section node (expandable, with inline rename + context actions)
├── PageItem.tsx              → single page link in the tree (active state, rename, delete)
├── CreateSectionDialog.tsx   → inline form / small modal for creating a section
├── CreatePageButton.tsx      → button that creates a page inside a section
├── PageEditor.tsx            → TipTap editor wrapper (loads content, auto-saves, renders toolbar + canvas)
├── EditorToolbar.tsx         → formatting buttons (bold, italic, headings, lists, colors, image, draw toggle)
├── DrawingCanvas.tsx         → HTML5 Canvas overlay for freehand drawing
├── ImageUploadButton.tsx     → picks an image file, uploads it, inserts into editor
├── FileImportDialog.tsx      → modal for importing PDF/DOCX as a new page
├── ConfirmDeleteDialog.tsx   → reusable delete confirmation modal (section or page)
└── RenameInline.tsx          → inline rename input for sections/pages (click title → editable input)
```

### Component Specifications

#### NotebookSidebar
- **Props:** `{ notebookId: string }`
- **State:** sections tree (fetched from API), collapsed sections (Set), loading
- **Behavior:**
  - Fetches `GET /api/notebooks/[id]/sections` on mount
  - Renders notebook name at top (fetched from the same or separate call)
  - Renders `SectionTree` with the fetched data
  - "New Section" button at bottom — opens `CreateSectionDialog`
  - "Import File" button — opens `FileImportDialog`
  - Collapsible via a chevron toggle (stores collapsed state locally)
- **Width:** 240px fixed
- **Style:** `background: '#0d0c20'`, `borderRight: '1px solid rgba(140,82,255,0.12)'`

#### SectionTree
- **Props:** `{ sections: SectionNode[], depth: number, activePageId?: string, notebookId: string, onRefresh: () => void }`
- **Behavior:** Maps over sections, renders `SectionItem` for each. Handles nested children recursively.

#### SectionItem
- **Props:** `{ section: SectionNode, depth: number, activePageId?: string, notebookId: string, onRefresh: () => void }`
- **State:** isExpanded, isRenaming, showCreatePage
- **Behavior:**
  - Click chevron → toggle expand/collapse
  - Click title → navigate (no-op, just expand)
  - Double-click title → inline rename (RenameInline)
  - "+" button on hover → create a new page in this section
  - Trash icon on hover → delete confirmation → `DELETE /api/.../sections/[id]`
  - Shows child sections (recursive) and pages
- **Indentation:** `paddingLeft: ${12 + depth * 16}px`

#### PageItem
- **Props:** `{ page: PageSummary, notebookId: string, isActive: boolean, onRefresh: () => void }`
- **Behavior:**
  - Renders as `<Link href={/notebooks/[notebookId]/pages/[page.id]}>`
  - Active state: purple gradient background (same pattern as app sidebar active link)
  - Double-click → inline rename
  - Trash icon on hover → delete confirmation
- **Display:** Page title, last updated time (small, muted)

#### PageEditor
- **Props:** `{ pageId: string, notebookId: string }`
- **State:** editor instance, page data (title, content, drawingData), isSaving, showDrawing
- **Behavior:**
  - On mount/pageId change: `GET /api/notebooks/[id]/pages/[pageId]` → load content into TipTap
  - Title is an editable `<input>` at the top (large, Gliker font, 24px)
  - Content area is the TipTap editor (`<EditorContent>`)
  - Auto-save: debounce content changes by 1500ms → `PUT /api/notebooks/[id]/pages/[pageId]`
  - Auto-save also extracts plain text from TipTap JSON and sends as `textContent`
  - Toolbar rendered above content via `EditorToolbar`
  - Drawing toggle in toolbar activates `DrawingCanvas` overlay
  - **TipTap styling**: Inject a `<style>` tag for `.ProseMirror` rules (dark theme colors, font, link styles, placeholder, etc.)

#### EditorToolbar
- **Props:** `{ editor: Editor, onToggleDrawing: () => void, isDrawing: boolean, notebookId: string, pageId: string }`
- **Buttons (using Lucide icons):**

  | Button | Icon | TipTap command |
  |--------|------|----------------|
  | Bold | `Bold` | `toggleBold()` |
  | Italic | `Italic` | `toggleItalic()` |
  | Underline | `Underline` | `toggleUnderline()` |
  | Strikethrough | `Strikethrough` | `toggleStrike()` |
  | Separator | — | — |
  | H1 | `Heading1` | `toggleHeading({level:1})` |
  | H2 | `Heading2` | `toggleHeading({level:2})` |
  | H3 | `Heading3` | `toggleHeading({level:3})` |
  | Separator | — | — |
  | Bullet List | `List` | `toggleBulletList()` |
  | Ordered List | `ListOrdered` | `toggleOrderedList()` |
  | Blockquote | `Quote` | `toggleBlockquote()` |
  | Code Block | `Code` | `toggleCodeBlock()` |
  | Separator | — | — |
  | Text Color | `Palette` | custom color picker dropdown |
  | Highlight | `Highlighter` | custom highlight picker dropdown |
  | Separator | — | — |
  | Image | `ImagePlus` | `ImageUploadButton` |
  | Draw | `PenTool` | toggle DrawingCanvas |
  | Separator | — | — |
  | Undo | `Undo` | `undo()` |
  | Redo | `Redo` | `redo()` |

- **Active state:** button gets `background: rgba(140,82,255,0.2)` + `color: #8c52ff` when its format is active
- **Style:** Sticky bar, `background: '#0d0c20'`, `borderBottom: '1px solid rgba(140,82,255,0.12)'`, horizontal scroll on overflow

#### DrawingCanvas
- **Props:** `{ drawingData: StrokeData[], onSave: (data: StrokeData[]) => void, width: number, height: number }`
- **StrokeData type:** `{ points: {x: number, y: number}[], color: string, width: number }`
- **Behavior:**
  - Absolutely positioned over the page editor content area
  - Semi-transparent background `rgba(0,0,0,0.02)` so text is visible underneath
  - Mouse/touch down starts a new stroke, move adds points, up finishes the stroke
  - Toolbar at top of canvas: pen color swatches, pen width slider, eraser toggle, clear all, done (save + close)
  - On "Done": calls `onSave(strokes)` → parent saves via `PUT .../pages/[pageId]/drawing`
  - Replays existing strokes on mount from `drawingData` prop

#### ImageUploadButton
- **Props:** `{ editor: Editor, notebookId: string, pageId: string }`
- **Behavior:**
  - Click → opens file picker (accept: `.png,.jpg,.jpeg,.gif,.webp`)
  - Validate: max 5MB, image MIME types only
  - Upload to `POST /api/notebooks/[id]/pages/[pageId]/images`
  - On success, inserts image into TipTap: `editor.chain().focus().setImage({ src: returnedUrl }).run()`

#### FileImportDialog
- **Props:** `{ notebookId: string, sectionId: string, onImported: () => void, onClose: () => void }`
- **Behavior:**
  - Modal with drag-drop zone (reuses FileUpload styling pattern)
  - Accepts PDF, DOCX, TXT, MD
  - Uploads to `POST /api/notebooks/[id]/sections/[sectionId]/import`
  - On success: calls `onImported()` to refresh sidebar, closes modal

---

## D. API Routes

### New Endpoints

All follow existing patterns: `getServerSession(authOptions)` for auth, `db` from `@/lib/db`, response helpers from `@/lib/api-response`.

#### Sections

**`app/api/notebooks/[id]/sections/route.ts`**

- **GET** — List all sections for notebook (with pages summaries)
  ```
  Response: { sections: [{ id, title, parentId, sortOrder, color, pages: [{ id, title, updatedAt, sortOrder }] }] }
  ```
  Client builds the tree from the flat parentId list.

- **POST** — Create section
  ```
  Body: { title: string, parentId?: string }
  Sets sortOrder = max existing + 1 among siblings
  Returns: created section
  ```

**`app/api/notebooks/[id]/sections/[sectionId]/route.ts`**

- **GET** — Single section with its pages
- **PUT** — Update section (title, sortOrder, color, parentId)
- **DELETE** — Delete section (cascades to subsections + pages via Prisma)

#### Pages

**`app/api/notebooks/[id]/sections/[sectionId]/pages/route.ts`**

- **POST** — Create page in section
  ```
  Body: { title?: string }  (defaults to "Untitled")
  Returns: created page (id, title)
  ```

**`app/api/notebooks/[id]/pages/[pageId]/route.ts`**

- **GET** — Load page with full content, drawingData, images
  ```
  Ownership check: page → section → notebook → userId
  Returns: { id, title, content, textContent, drawingData, images: [...], sectionId, updatedAt }
  ```

- **PUT** — Save page (auto-save target)
  ```
  Body: { title?: string, content?: object, textContent?: string, sortOrder?: number }
  On content save: also extracts plain text from TipTap JSON and stores in textContent
  ```

- **DELETE** — Delete page + associated images from storage

#### Images

**`app/api/notebooks/[id]/pages/[pageId]/images/route.ts`**

- **POST** — Upload inline image
  ```
  FormData: file (image, max 5MB)
  Saves to: uploads/images/[pageId]/[timestamp]-[filename]
  Creates PageImage record
  Returns: { id, url: '/api/uploads/images/[imageId]' }
  ```

**`app/api/uploads/images/[imageId]/route.ts`**

- **GET** — Serve image file
  ```
  Ownership check: image → page → section → notebook → userId
  Returns: image binary with correct Content-Type header
  ```

#### Drawing

**`app/api/notebooks/[id]/pages/[pageId]/drawing/route.ts`**

- **PUT** — Save drawing data
  ```
  Body: { drawingData: StrokeData[] }
  Updates page.drawingData
  ```

#### File Import

**`app/api/notebooks/[id]/sections/[sectionId]/import/route.ts`**

- **POST** — Import file as page
  ```
  FormData: file (PDF/DOCX/TXT/MD, max 10MB)
  1. Extract text via existing extractText() from fileProcessing.ts
  2. Convert text to TipTap JSON (paragraphs split on newlines)
  3. For DOCX: use mammoth.convertToHtml() → convert HTML to TipTap JSON for richer formatting
  4. Create Page with title = filename (without extension)
  5. Returns: created page
  ```

### API Route File Map

```
app/api/
├── notebooks/
│   ├── route.ts                                        (existing — unchanged)
│   └── [id]/
│       ├── route.ts                                    (existing — add sections count)
│       ├── documents/                                  (existing — keep for backward compat)
│       │   ├── route.ts
│       │   └── [docId]/route.ts
│       ├── sections/                                   ← NEW
│       │   ├── route.ts                                (GET list, POST create)
│       │   └── [sectionId]/
│       │       ├── route.ts                            (GET, PUT, DELETE)
│       │       ├── pages/
│       │       │   └── route.ts                        (POST create page)
│       │       └── import/
│       │           └── route.ts                        (POST import file as page)
│       └── pages/                                      ← NEW
│           └── [pageId]/
│               ├── route.ts                            (GET, PUT, DELETE)
│               ├── images/
│               │   └── route.ts                        (POST upload image)
│               └── drawing/
│                   └── route.ts                        (PUT save drawing)
└── uploads/                                            ← NEW
    └── images/
        └── [imageId]/
            └── route.ts                                (GET serve image)
```

---

## E. Implementation Phases

Each phase is independently testable. Complete one before starting the next.

---

### Phase 1: Schema + Migration
**Goal:** Add Section, Page, PageImage models to the database.

**Tasks:**
1. Add Section, Page, PageImage models to `prisma/schema.prisma` (exactly as shown in Section A)
2. Add `sections Section[]` relation to existing Notebook model
3. Run `npx prisma migrate dev --name add-sections-pages`
4. Verify migration succeeds, tables created

**Files to modify:**
- `prisma/schema.prisma`

**Verify:** `npx prisma studio` — see new tables with correct columns and relations.

---

### Phase 2: Section + Page CRUD API Routes
**Goal:** All backend endpoints for sections and pages work.

**Tasks:**
1. Create `app/api/notebooks/[id]/sections/route.ts` (GET list, POST create)
2. Create `app/api/notebooks/[id]/sections/[sectionId]/route.ts` (GET, PUT, DELETE)
3. Create `app/api/notebooks/[id]/sections/[sectionId]/pages/route.ts` (POST create page)
4. Create `app/api/notebooks/[id]/pages/[pageId]/route.ts` (GET, PUT, DELETE)

**Auth pattern (copy from existing routes):**
```ts
const session = await getServerSession(authOptions);
if (!session?.user?.id) return unauthorizedResponse();
// Verify notebook ownership:
const notebook = await db.notebook.findFirst({ where: { id: notebookId, userId: session.user.id } });
if (!notebook) return notFoundResponse('Notebook not found');
```

**Page ownership check (traverse the chain):**
```ts
const page = await db.page.findFirst({
  where: { id: pageId },
  include: { section: { include: { notebook: true } } },
});
if (!page || page.section.notebook.userId !== session.user.id) return notFoundResponse();
```

**Files to create:**
- `app/api/notebooks/[id]/sections/route.ts`
- `app/api/notebooks/[id]/sections/[sectionId]/route.ts`
- `app/api/notebooks/[id]/sections/[sectionId]/pages/route.ts`
- `app/api/notebooks/[id]/pages/[pageId]/route.ts`

**Verify:** Test each endpoint with `curl` or a REST client. Create a section, create a page in it, fetch it, update it, delete it.

---

### Phase 3: Notebook Workspace Layout + Sidebar
**Goal:** Opening a notebook shows a workspace with a section/page tree sidebar.

**Tasks:**
1. Create `app/(dashboard)/notebooks/[id]/layout.tsx` — nested layout that adds NotebookSidebar
2. Create `src/components/notebook/NotebookSidebar.tsx` — fetches sections, renders tree
3. Create `src/components/notebook/SectionTree.tsx` — recursive renderer
4. Create `src/components/notebook/SectionItem.tsx` — expandable section with pages
5. Create `src/components/notebook/PageItem.tsx` — page link with active state
6. Create `src/components/notebook/CreateSectionDialog.tsx` — inline form for new section
7. Create `src/components/notebook/CreatePageButton.tsx` — creates page in section
8. Rewrite `app/(dashboard)/notebooks/[id]/page.tsx` — landing: redirect to first page or empty state
9. Create `app/(dashboard)/notebooks/[id]/pages/[pageId]/page.tsx` — placeholder (shows page title, editor comes Phase 4)
10. Update `src/middleware.ts` — ensure `/notebooks/:path*` patterns still work

**Key layout code for `[id]/layout.tsx`:**
```tsx
'use client';
import { use } from 'react';
import NotebookSidebar from '@/components/notebook/NotebookSidebar';

export default function NotebookWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  return (
    <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
      <NotebookSidebar notebookId={id} />
      <div style={{ flex: 1, minWidth: 0, overflow: 'auto', padding: '0' }}>
        {children}
      </div>
    </div>
  );
}
```

**Important:** The parent `(dashboard)/layout.tsx` already provides AppSidebar + Header. This nested layout ONLY adds the notebook sidebar. The `main` padding from the parent layout (32px) should be overridden to 0 for notebook workspace pages — either by the nested layout or by the page itself.

**Files to create:**
- `app/(dashboard)/notebooks/[id]/layout.tsx`
- `app/(dashboard)/notebooks/[id]/pages/[pageId]/page.tsx`
- `src/components/notebook/NotebookSidebar.tsx`
- `src/components/notebook/SectionTree.tsx`
- `src/components/notebook/SectionItem.tsx`
- `src/components/notebook/PageItem.tsx`
- `src/components/notebook/CreateSectionDialog.tsx`
- `src/components/notebook/CreatePageButton.tsx`

**Files to modify:**
- `app/(dashboard)/notebooks/[id]/page.tsx` (rewrite to landing/redirect)
- `app/(dashboard)/layout.tsx` (may need to conditionally remove padding for notebook workspace)

**Verify:** Navigate to `/notebooks/[id]` → see the notebook sidebar with empty state. Create a section. Create a page. Click the page → navigates to `/notebooks/[id]/pages/[pageId]` and shows the page title.

---

### Phase 4: TipTap Rich Text Editor
**Goal:** Users can write and format text in pages with auto-save.

**Tasks:**
1. Install TipTap packages:
   ```bash
   npm install @tiptap/react @tiptap/pm @tiptap/starter-kit \
     @tiptap/extension-underline @tiptap/extension-text-style \
     @tiptap/extension-color @tiptap/extension-highlight \
     @tiptap/extension-image @tiptap/extension-placeholder \
     @tiptap/extension-typography
   ```
2. Create `src/components/notebook/PageEditor.tsx`:
   - Initialize TipTap with StarterKit + extensions
   - Load content from `GET /api/notebooks/[id]/pages/[pageId]`
   - Editable title input at top
   - Auto-save on 1500ms debounce → `PUT /api/notebooks/[id]/pages/[pageId]`
   - Extract plain text: `editor.getText()` → send as `textContent`
   - Inject `<style>` for `.ProseMirror` rules:
     ```css
     .ProseMirror {
       outline: none;
       min-height: 400px;
       font-family: 'Gliker', 'DM Sans', sans-serif;
       font-size: 15px;
       color: #ede9ff;
       line-height: 1.7;
     }
     .ProseMirror h1 { font-size: 28px; font-weight: 700; letter-spacing: -0.03em; margin: 24px 0 8px; }
     .ProseMirror h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 20px 0 6px; }
     .ProseMirror h3 { font-size: 18px; font-weight: 600; margin: 16px 0 4px; }
     .ProseMirror p { margin: 0 0 8px; }
     .ProseMirror ul, .ProseMirror ol { padding-left: 24px; }
     .ProseMirror blockquote { border-left: 3px solid #8c52ff; padding-left: 16px; color: rgba(237,233,255,0.6); }
     .ProseMirror code { background: rgba(140,82,255,0.12); padding: 2px 6px; border-radius: 4px; font-size: 13px; }
     .ProseMirror pre { background: rgba(140,82,255,0.08); padding: 16px; border-radius: 10px; }
     .ProseMirror img { max-width: 100%; border-radius: 8px; margin: 12px 0; }
     .ProseMirror p.is-editor-empty:first-child::before {
       content: attr(data-placeholder);
       color: rgba(237,233,255,0.2);
       pointer-events: none;
       float: left;
       height: 0;
     }
     ```
3. Create `src/components/notebook/EditorToolbar.tsx`:
   - Formatting buttons with Lucide icons (see table in Section C)
   - Active state detection via `editor.isActive('bold')` etc.
   - Color picker: small dropdown with 8 color swatches (reuse NotebookForm pattern)
   - Highlight picker: same but for background highlight colors
4. Wire editor into `app/(dashboard)/notebooks/[id]/pages/[pageId]/page.tsx`

**Files to create:**
- `src/components/notebook/PageEditor.tsx`
- `src/components/notebook/EditorToolbar.tsx`

**Files to modify:**
- `app/(dashboard)/notebooks/[id]/pages/[pageId]/page.tsx` (render PageEditor)
- `package.json` (TipTap deps added by npm install)

**Verify:** Open a page → type text → apply bold, italic, headings → leave the page → come back → content is preserved. Check that `textContent` is populated in the database.

---

### Phase 5: Inline Images
**Goal:** Users can embed images in pages.

**Tasks:**
1. Create `app/api/notebooks/[id]/pages/[pageId]/images/route.ts` (POST upload)
2. Create `app/api/uploads/images/[imageId]/route.ts` (GET serve)
3. Add `saveImage()` function to `src/lib/storage.ts`:
   ```ts
   export async function saveImage(pageId: string, filename: string, buffer: Buffer): Promise<{ filePath: string }> {
     const dir = path.join(process.cwd(), 'uploads', 'images', pageId);
     await fs.mkdir(dir, { recursive: true });
     const safeName = `${Date.now()}-${sanitizeFilename(filename)}`;
     const filePath = path.join(dir, safeName);
     await fs.writeFile(filePath, buffer);
     return { filePath };
   }
   ```
4. Create `src/components/notebook/ImageUploadButton.tsx`:
   - Opens file picker (images only, max 5MB)
   - Uploads to image API
   - Inserts into editor: `editor.chain().focus().setImage({ src: url, alt: filename }).run()`
5. Add image button to `EditorToolbar`

**Files to create:**
- `app/api/notebooks/[id]/pages/[pageId]/images/route.ts`
- `app/api/uploads/images/[imageId]/route.ts`
- `src/components/notebook/ImageUploadButton.tsx`

**Files to modify:**
- `src/lib/storage.ts` (add saveImage)
- `src/components/notebook/EditorToolbar.tsx` (add image button)

**Verify:** Click image button → pick an image → image appears inline in the editor. Reload the page → image still there. Check `uploads/images/` directory has the file.

---

### Phase 6: Drawing Canvas
**Goal:** Users can draw on pages with pen/cursor.

**Tasks:**
1. Create `app/api/notebooks/[id]/pages/[pageId]/drawing/route.ts` (PUT save)
2. Create `src/components/notebook/DrawingCanvas.tsx`:
   - HTML5 Canvas positioned absolutely over the editor content
   - Pointer events: `pointerdown` starts stroke, `pointermove` adds points, `pointerup` ends stroke
   - Stroke data: `{ points: [{x,y},...], color: string, width: number }`
   - Mini-toolbar at top of canvas: pen colors (6 swatches), pen width (3 presets: thin/medium/thick), eraser, clear all, done
   - Eraser mode: removes strokes that intersect with the pointer path
   - "Done" button: saves strokes via API, hides canvas
   - On mount: replays existing strokes from `drawingData`
   - Background: `rgba(0,0,0,0.02)` so text is visible underneath
3. Add drawing toggle to `EditorToolbar`
4. Integrate in `PageEditor`: toggle `showDrawing` state, render `DrawingCanvas` when active

**Files to create:**
- `app/api/notebooks/[id]/pages/[pageId]/drawing/route.ts`
- `src/components/notebook/DrawingCanvas.tsx`

**Files to modify:**
- `src/components/notebook/EditorToolbar.tsx` (add draw toggle)
- `src/components/notebook/PageEditor.tsx` (render DrawingCanvas overlay)

**Verify:** Click draw button → canvas overlay appears → draw with mouse → click Done → strokes saved. Reload → strokes reappear. Toggle drawing off → text editor is usable again.

---

### Phase 7: File Import as Pages
**Goal:** Users can import PDF/DOCX/TXT/MD files as editable pages.

**Tasks:**
1. Create `src/lib/contentConverter.ts`:
   ```ts
   // Convert plain text to TipTap JSON
   function textToTipTapJSON(text: string): object {
     const paragraphs = text.split(/\n\n+/).filter(Boolean);
     return {
       type: 'doc',
       content: paragraphs.map(p => ({
         type: 'paragraph',
         content: [{ type: 'text', text: p.trim() }],
       })),
     };
   }

   // Convert HTML (from mammoth) to TipTap JSON
   // Use @tiptap/html's generateJSON() for this
   function htmlToTipTapJSON(html: string, extensions: Extensions): object { ... }
   ```
2. Create `app/api/notebooks/[id]/sections/[sectionId]/import/route.ts`:
   - Accept file upload (same validation as existing document upload)
   - For DOCX: use `mammoth.convertToHtml()` for richer formatting, then convert to TipTap JSON
   - For PDF/TXT/MD: use `extractText()` → `textToTipTapJSON()`
   - Create Page with title = filename without extension
   - Return created page
3. Create `src/components/notebook/FileImportDialog.tsx`:
   - Modal with drag-drop (reuses FileUpload UI pattern)
   - Accepts PDF, DOCX, TXT, MD (max 10MB)
   - On upload success: calls `onImported()` → sidebar refreshes
4. Add "Import File" button to NotebookSidebar
5. Install `@tiptap/html` for HTML → JSON conversion:
   ```bash
   npm install @tiptap/html
   ```

**Files to create:**
- `src/lib/contentConverter.ts`
- `app/api/notebooks/[id]/sections/[sectionId]/import/route.ts`
- `src/components/notebook/FileImportDialog.tsx`

**Files to modify:**
- `src/components/notebook/NotebookSidebar.tsx` (add Import File button)
- `package.json` (@tiptap/html)

**Verify:** Import a PDF → new page appears in sidebar → open it → extracted text is editable. Import a DOCX with bold/headings → formatting is preserved. Import a TXT → plain paragraphs.

---

### Phase 8: Migration + Cleanup
**Goal:** Migrate existing Documents to Pages and update the notebook listing.

**Tasks:**
1. Create `scripts/migrate-documents-to-pages.ts`:
   ```ts
   // For each notebook with documents:
   //   1. Create an "Imported Documents" section in the notebook
   //   2. For each document:
   //      a. Convert textContent to TipTap JSON via textToTipTapJSON()
   //      b. Create a Page with title = fileName, content = JSON, sourceDocId = document.id
   //   3. Log progress and any failures
   // Run with: npx tsx scripts/migrate-documents-to-pages.ts
   ```
2. Update `app/api/notebooks/route.ts` — include `_count.sections` and total pages count in the response
3. Update `app/api/notebooks/[id]/route.ts` — include sections in the detail response
4. Update `NotebookCard` — show pages count (or sections count) instead of only documents count
5. Remove the file upload zone and document list from `app/(dashboard)/notebooks/[id]/page.tsx` (now the workspace landing — these are replaced by the sidebar + import)
6. Add deprecation comments to `FileUpload`, `DocumentList`, and the document API routes

**Files to create:**
- `scripts/migrate-documents-to-pages.ts`

**Files to modify:**
- `app/api/notebooks/route.ts` (add pages count)
- `app/api/notebooks/[id]/route.ts` (include sections)
- `src/components/features/NotebookCard.tsx` (show pages count)
- `app/(dashboard)/notebooks/[id]/page.tsx` (remove old document UI)

**Verify:** Run migration script → existing documents become pages → open notebook → see pages in sidebar → content is editable. Check `sourceDocId` is set. Verify old Document records still exist in DB (no data loss).

---

## F. Migration Strategy

### Approach: Parallel Operation

1. **During development (Phases 1–7):** The old Document model and all its API routes (`/api/notebooks/[id]/documents/*`) remain fully functional. Nothing breaks for existing users.

2. **Phase 7 adds the new import path.** New file uploads go through the import flow and create Pages directly. The old `FileUpload` component is still available but becomes redundant.

3. **Phase 8 runs migration.** A script converts all existing Documents to Pages:
   - Creates an "Imported Documents" section per notebook
   - Converts `textContent` to TipTap JSON paragraphs
   - Sets `sourceDocId` for traceability
   - Does NOT delete original Documents

4. **Post-migration cleanup (future, not in this plan):**
   - Remove `FileUpload` and `DocumentList` components
   - Remove document API routes
   - Remove `Document` model from schema
   - Clean up raw files from `uploads/[notebookId]/`

### Rollback Safety

- `sourceDocId` on Page links back to the original Document
- Documents are never deleted during migration
- Reverting to old UI only requires restoring the old components — all data is intact

---

## G. Dependencies to Install

### Phase 4 (TipTap)
```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit \
  @tiptap/extension-underline @tiptap/extension-text-style \
  @tiptap/extension-color @tiptap/extension-highlight \
  @tiptap/extension-image @tiptap/extension-placeholder \
  @tiptap/extension-typography
```

### Phase 7 (HTML conversion)
```bash
npm install @tiptap/html
```

No other external dependencies needed. Drawing uses native HTML5 Canvas API.

---

## H. File Map (Complete)

| Phase | File | Action |
|-------|------|--------|
| 1 | `prisma/schema.prisma` | Modify — add Section, Page, PageImage models |
| 2 | `app/api/notebooks/[id]/sections/route.ts` | Create |
| 2 | `app/api/notebooks/[id]/sections/[sectionId]/route.ts` | Create |
| 2 | `app/api/notebooks/[id]/sections/[sectionId]/pages/route.ts` | Create |
| 2 | `app/api/notebooks/[id]/pages/[pageId]/route.ts` | Create |
| 3 | `app/(dashboard)/notebooks/[id]/layout.tsx` | Create |
| 3 | `app/(dashboard)/notebooks/[id]/page.tsx` | Rewrite |
| 3 | `app/(dashboard)/notebooks/[id]/pages/[pageId]/page.tsx` | Create |
| 3 | `src/components/notebook/NotebookSidebar.tsx` | Create |
| 3 | `src/components/notebook/SectionTree.tsx` | Create |
| 3 | `src/components/notebook/SectionItem.tsx` | Create |
| 3 | `src/components/notebook/PageItem.tsx` | Create |
| 3 | `src/components/notebook/CreateSectionDialog.tsx` | Create |
| 3 | `src/components/notebook/CreatePageButton.tsx` | Create |
| 3 | `app/(dashboard)/layout.tsx` | Modify — conditional padding |
| 4 | `src/components/notebook/PageEditor.tsx` | Create |
| 4 | `src/components/notebook/EditorToolbar.tsx` | Create |
| 4 | `app/(dashboard)/notebooks/[id]/pages/[pageId]/page.tsx` | Modify — render PageEditor |
| 5 | `app/api/notebooks/[id]/pages/[pageId]/images/route.ts` | Create |
| 5 | `app/api/uploads/images/[imageId]/route.ts` | Create |
| 5 | `src/components/notebook/ImageUploadButton.tsx` | Create |
| 5 | `src/lib/storage.ts` | Modify — add saveImage |
| 5 | `src/components/notebook/EditorToolbar.tsx` | Modify — add image button |
| 6 | `app/api/notebooks/[id]/pages/[pageId]/drawing/route.ts` | Create |
| 6 | `src/components/notebook/DrawingCanvas.tsx` | Create |
| 6 | `src/components/notebook/EditorToolbar.tsx` | Modify — add draw toggle |
| 6 | `src/components/notebook/PageEditor.tsx` | Modify — render DrawingCanvas |
| 7 | `src/lib/contentConverter.ts` | Create |
| 7 | `app/api/notebooks/[id]/sections/[sectionId]/import/route.ts` | Create |
| 7 | `src/components/notebook/FileImportDialog.tsx` | Create |
| 7 | `src/components/notebook/NotebookSidebar.tsx` | Modify — add import button |
| 8 | `scripts/migrate-documents-to-pages.ts` | Create |
| 8 | `app/api/notebooks/route.ts` | Modify — add pages count |
| 8 | `app/api/notebooks/[id]/route.ts` | Modify — include sections |
| 8 | `src/components/features/NotebookCard.tsx` | Modify — show pages count |

**Total: 22 new files, 11 modified files, across 8 phases.**
