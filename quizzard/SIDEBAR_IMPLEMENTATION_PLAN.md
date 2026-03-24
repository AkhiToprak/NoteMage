# Implementation Plan: Restructuring Notebook Sidebar for Files & Chats

The goal is to move Quizzard closer to a OneNote-style workspace where **Files (Pages/Documents)** and **Chats** are cleanly separated and organized hierarchically in the sidebar. This plan eliminates the "either/or" toggle of the Scholar view and presents a unified, highly organized sidebar where files can be created inside sections.

## 1. Architectural Changes

### Current State
* `SectionPanel`: Lists Sections. Contains a "Scholar" toggle button.
* `PagePanel`: Toggles between showing "Pages" (Files) for a Section or showing "Chats" globally.
* Users cannot seamlessly view their file hierarchy and chat list at the same time.

### Proposed State (OneNote-Style)
Replace the dual-panel system with a unified `UnifiedSidebar` that explicitly separates the two core pillars of Quizzard:
1. **Files (The Vault):** A hierarchical tree (Sections → Pages/Files) exactly like OneNote. Files are created and edited within their respective sections.
2. **Chats (The Scholar):** A dedicated section for all AI conversations linked to this notebook, kept entirely separate from the files.

---

## 2. Step-by-Step Implementation Steps

### Step 1: Data Fetching and Context Hook Updates
* **Action:** Modify `NotebookWorkspaceContext.tsx`.
* **Details:** 
  * Ensure `sections`, `pages`, and `chats` are all fetched and available simultaneously.
  * Remove the `isScholarView` boolean state, as both Files and Chats will now be permanently visible in their designated sections of the sidebar.

### Step 2: Combine `SectionPanel` and `PagePanel` into a `UnifiedSidebar`
* **Action:** Create `src/components/notebook/UnifiedSidebar.tsx`.
* **Layout Structure:**
  * **Header:** Notebook Name and back button.
  * **Upper Section (Files):** A collapsible tree showing `Sections`. Clicking a Section expands it inline to show its `Files` (Pages). This mirrors the OneNote UX.
  * **Lower Section (Chats):** A separate list area showing all `Chats`.

### Step 3: Implement the "Files" Section (OneNote Tree UI)
* **Action:** Build a recursive `FileTree` component.
* **Details:**
  * **Root level:** Sections (e.g., "Finance", "Household").
  * **Child level:** Files within that section.
  * **Actions:** Put a "New File" button directly under each section (visible on hover) or at the bottom of the section list. Clicking it triggers the creation of a new page/file linked specifically to that section.

### Step 4: Implement the "Chats" Section
* **Action:** Build a `ChatTree` component.
* **Details:**
  * Display a distinct header (e.g., "✨ Scholar Chats").
  * Render a flat (or grouped) list of chat rows.
  * Include a prominent "New Chat" button that triggers the `CreateChatModal`.

### Step 5: Update the Main Workspace Layout
* **Action:** Modify `app/(dashboard)/notebooks/[id]/layout.tsx`.
* **Details:** 
  * Replace the `<SectionPanel />` and `<PagePanel />` imports with the new `<UnifiedSidebar />`.
  * Ensure the main content area dynamically renders the `PageEditor` (when a File is clicked) or the `ChatInterface` (when a Chat is clicked).

---

## 3. Visual Examples (Retaining Quizzard Colors)

Here is how the distinct sections will look stylistically within your Neon Scholar brand framework:

### Example 1: The Files View (OneNote Style)
```text
▼ 📁 User Onboarding                 [ + New File ]
    📄 Research Findings
    📄 Design Ideation
    📄 Final Copy
▶ 📁 Database Schema                 [ + New File ]
```
* **Colors:** Background uses the deep space `#0d0c20`, text `#ede9ff`. 
* **Active State:** The active file (e.g., `Design Ideation`) features a neon purple left border `2px solid #8c52ff` and a subtle glassmorphic highlight `linear-gradient(135deg, rgba(140,82,255,0.18), rgba(81,112,255,0.1))`.
* **Interaction:** Hovering over a section reveals the neon `+ New File` button to quickly create a file in that specific section.

### Example 2: The Chats View
```text
  ──────────────────────────────────────

▼ ✨ Scholar Chats                   [ + New Chat ]
    💬 Discuss: Research Findings
    💬 Draft Email using Final Copy
```
* **Colors:** The Scholar header utilizes a golden/purple neon accent `#c4a9ff` and the `<Sparkles />` icon to differentiate it from standard files. 
* **Active State:** Active chats use a similar active state but with warmer accents to distinguish the AI interaction context from standard document editing.

---

## 4. Final Review and Cleanup
* **Action:** Remove obsolete files.
* **Details:** Delete `SectionPanel.tsx`, `PagePanel.tsx`, and `SectionListItem.tsx` once the `UnifiedSidebar` is tested. Validate that creating a file accurately maps `sectionId` to the newly created entity.
