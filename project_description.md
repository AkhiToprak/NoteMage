# Quizzard: Project Description

**Quizzard** is a collaborative, social knowledge platform and notes application designed to combine a robust notebook workspace with a thriving community layer.

---

## 1. Core Functions & Features

- **Authentication & User Profiles:** Managed via NextAuth. Includes a 3-step onboarding wizard (Account registration, Avatar upload, Study Goals generation) and custom profiles (username, bio).
- **Notebook Workspace:** A feature-rich note-taking environment featuring TipTap for rich-text editing coupled with a drawing canvas logic.
- **Social & Community Layer:** 
  - **Friends System:** Search users, send/accept/decline friend requests, and display friends lists.
  - **Community Posts:** Users can post rich text, upload images (up to 4), create interactive polls, and share notebook links to specific audiences (public, friends, specific users).
  - **Notifications:** In-app notification bell for tracking friend requests, post likes, comments, and invites.
- **Collaboration & Co-Working:**
  - **Notebook Sharing:** Flexibility to share notebooks for a live view or as a copy, selectively targeted to friends or the broader community.
  - **Turn-based Co-Work Sessions:** Users can lock a page when editing, preventing overlapping interference without heavy WebSocket synchronization. Includes a built-in session chat.
- **Study Tracking:** Setting personal study goals dynamically (e.g., hours, pages, quizzes, notebooks) to gamify the learning experience.

---

## 2. Pages & Routing Architecture

The application is structured into the following Next.js route groups:

### Authentication (`/auth`)
- **Login / Register Page:** Handling standard credential workflows. The register form is transformed into an animated 3-step onboarding wizard.

### Dashboard (`/dashboard`)
- **Dashboard Home:** An overview comprising the user's study goals progress, daily activities, and general metrics.
- **Notebooks Explorer (`/notebooks`):** The primary view for organizing and editing the user's notebooks, sections, and pages.
- **AI Chat (`/ai-chat`):** A dedicated interface for engaging with the integrated AI assistant.
- **Settings (`/settings`):** Panel for modifying preferences, password, avatar, and other app integrations.

### Home / Community (`/home`)
- **Feed Centric View:** A newly designed 3-column feed showing the user's community posts, trending notebooks, and friends activity. Provides a mobile-friendly burger menu for simplified navigation.

---

## 3. Component Architecture (Cards & UI)

The frontend uses reusable, domain-specific React components (`src/components/`):

### Cards
- **NotebookPreviewCard:** For community browsing, featuring color bars, subject badges, and author info.
- **NotebookCard:** Designed for the private dashboard workspace.
- **PostCard:** Shows community posts containing author info, timestamps, text, images, and polls.
- **FriendRequestCard:** Displays pending friend requests with Accept/Decline interactions.

### UI & Layout
- **Navigation:** `Sidebar.tsx` (dashboard), `BurgerMenu.tsx`, `Header.tsx`, `HomeHeader.tsx`.
- **Forms & Prompts:** `PostComposer.tsx`, `PollCreator.tsx`, `VisibilitySelector.tsx`, `NotebookForm.tsx`.
- **Interactive Widgets:** `StepIndicator.tsx` (Onboarding timeline), `NotificationBell.tsx`, `NotificationDropdown.tsx`.
- **Notebook & Co-Work Elements:** `DrawingCanvas.tsx`, `PageEditor.tsx`, `PageLockIndicator.tsx`, `CoWorkBar.tsx`, `SectionTree.tsx`.

---

## 4. Visual Design & Style Guidelines

Quizzard utilizes a custom styling framework known as the **Neon Scholar Design System**, built purely on Tailwind CSS properties (v4 inline tokens) and robust CSS variables.

### Colors
Refined to convey a rich, dark "neon scholar" look:
- **Backgrounds (Deep Space / Galaxy):** Extremely dark purples to black (`#0d0d1a`, `#18182a`, `#23233c`) form the core structure.
- **Primary (Neon Purple):** Used largely for branding, interactive UI, and buttons (`#ae89ff`, `#8348f6`, `#7232e4`).
- **Secondary (Soft Blue):** Supplemental elements (`#b9c3ff`, `#001971`, `#4767f6`).
- **Tertiary / Highlights (Golden):** Focus marks and badges (`#ffde59`, `#ffedb3`).
- **Foregrounds / Text:** Bright, readable shades (`#e5e3ff`, `#ffffff`).

### Typography
- **Display Headings (`--font-display`):** *Epilogue* (Serif / Display pairs, typically applied with tight tracking `-0.03em`).
- **Body / Sans (`--font-sans`):** *Plus Jakarta Sans* (Legible, clean geometric sans-serif, using generous line-height).
- **Brand / Logo (`--font-brand`):** *Shrikhand* (Extravagant, stylized bold serif).

### Key Design Pillars & Effects
- **"Anti-Generic" Ethos:** The default Tailwind color palettes (e.g., flat blue-600) are explicitly banned.
- **Glassmorphism:** Elements like modals and overlays use `.glass-panel` (`rgba(24, 24, 42, 0.7)` and a strong backdrop blur `blur(20px)`).
- **Depth & Dimensionality:**
  - Ambient un-flattened shadows (`.shadow-ambient`, `.neon-glow`).
  - Strict UI layering from base `.surface-container` to elevated `.surface-elevated` up to `.surface-floating`.
- **Micro-interactions:**
  - **Animations:** Strictly limiting transitions to `transform` and `opacity` properties using fluid, spring-like easing functions `.transition-spring` (cubic-bezier). Flat `transition-all` is prohibited.
  - Interactive states (hover, focus-visible, active) are required on every interactable target.
  - Dedicated "Magic Sparkles Cursor" for unique branding and fun engagement.
- **Notebook Motif:** Use of `.notebook-pattern` dot grids for backgrounds simulating notebook paper.

