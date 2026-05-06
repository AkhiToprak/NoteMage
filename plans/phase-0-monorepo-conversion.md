# Phase 0 Execution Plan: Monorepo Conversion & Pre-Flight Cleanup

This document is the **detailed execution plan for Phase 0** of `react-native-mobile-shell.md`. It exists because a read-through of the actual repo state revealed that Phase 0 is not a simple `git mv quizzard apps/web` — the repo has significant cruft, uncommitted work, duplicate directories, and unrelated vendored projects that all need to be handled before the monorepo conversion can safely happen.

Read this before executing Phase 0. The main shell plan's Phase 0 section gives the high-level goal; this document gives the step-by-step that survives contact with reality.

---

## Why This Sub-Plan Exists

When I wrote Phase 0 in the main plan, I assumed:
- `Quizzard/quizzard/` was the Next.js app with clean surroundings
- Moving `quizzard/` → `apps/web/` was a mechanical `git mv`
- The outer `Quizzard/` dir just held a few shared items (`CLAUDE.md`, `brand_assets/`, `plans/`)

The actual state is messier:
- The outer `Quizzard/` **is the git root** and contains many more files than the plan accounted for
- There are **unrelated vendored directories** at the outer level (`academic-pptx-skill-main/`, `open-exam-skills-main/`, `stitch/`)
- There are **old planning documents** at the outer level that overlap with `quizzard/plans/`
- There's **uncommitted work in progress** that must be committed or stashed before any `git mv`
- There are **duplicate directories** (outer `docs/` vs inner `quizzard/docs/`, outer `bin/` vs inner `quizzard/bin/`)
- There's **dev cruft** that should be gitignored but may not be (outer `.next/`, `temporary screenshots/`, `screenshots/`, `.DS_Store`)
- Large redundant assets (`notemagelogo.png` is 6MB and is probably duplicated in `brand_assets/`)

Running the main plan's Phase 0 steps as-written without handling this first would leave an inconsistent, broken repo. This sub-plan handles it.

---

## Current Repo State Inventory

### Git topology

- **Git root:** `/Users/toprakdemirel/Entwicklung/Quizzard/`
- **Current branch:** `main`
- **Remote:** Vercel + Supabase deployment pipeline (per project memory)
- **Working tree dirty?** YES — see "Uncommitted work" below

### Outer level `/Users/toprakdemirel/Entwicklung/Quizzard/`

| Item | Type | Size/Count | Category |
|---|---|---|---|
| `.DS_Store` | file | 14KB | **DELETE** (macOS junk) |
| `.claude/` | dir | 5 items | KEEP (Claude Code project config) |
| `.dockerignore` | file | 37B | KEEP (update if paths change) |
| `.git/` | dir | — | KEEP (untouchable) |
| `.github/` | dir | 3 items | KEEP (update CI workflow paths) |
| `.gitignore` | file | 125B | KEEP (update with new patterns) |
| `.next/` | dir | — | **DELETE** (stale build artifact at outer level — should never have been here; gitignore check) |
| `CLAUDE.md` | file | 6.1KB | KEEP (will be updated in Stage 5 to reference `apps/web/` instead of `quizzard/`) |
| `Dockerfile` | file | 993B | KEEP (update `COPY` / `WORKDIR` paths in Stage 5) |
| `IMPLEMENTATION_PLAN.md` | file | 26KB | **ASK Q2** (archive to `plans/` or delete?) |
| `LICENSE` | file | 239B | KEEP |
| `README.md` | file | 2.3KB | KEEP (may need minor edits) |
| `academic-pptx-skill-main/` | dir | 7 items | **ASK Q1** (likely delete — third-party skill download) |
| `bin/` | dir | 2 items | **ASK Q3** (duplicate of `quizzard/bin/`?) |
| `brand_assets/` | dir | 7 items | KEEP (stays at root, used by all apps) |
| `docker-compose.yml` | file | 1.2KB | KEEP (update paths in Stage 5) |
| `docs/` | dir | 4 items | **ASK Q3** (duplicate of `quizzard/docs/`?) |
| `legacy-plan.md` | file | 42KB | **ASK Q2** (huge — archive or delete?) |
| `notemagelogo.png` | file | **6.25MB** | **ASK Q1** (redundant with `brand_assets/`? If yes, delete) |
| `notemagelogos/` | dir | 10 items | **ASK Q1** (redundant with `brand_assets/`?) |
| `open-exam-skills-main/` | dir | 14 items | **ASK Q1** (likely delete — third-party skill download) |
| `pgadmin-servers.json` | file | 231B | **ASK Q1** (dev tool config — delete or keep?) |
| `project_description.md` | file | 5.6KB | **ASK Q2** (archive or delete?) |
| `quizzard/` | dir | 42 items | **MOVE** to `apps/web/` (the main operation) |
| `screenshot.mjs` | file | 1KB | KEEP (dev utility, referenced by CLAUDE.md) |
| `screenshots/` | dir | 7 items | **DELETE + GITIGNORE** (dev-only) |
| `security.md` | file | 1.5KB | KEEP |
| `stitch/` | dir | 4 items | **ASK Q1** (unclear what this is — possibly Stitch MCP leftover) |
| `temporary screenshots/` | dir | 34 items | **DELETE + GITIGNORE** (dev-only, should never be committed) |
| `tierplan.md` | file | 6.7KB | **ASK Q2** (old planning doc — archive or delete?) |

### Inside `quizzard/` (will become `apps/web/`)

| Item | Type | Size/Count | Category |
|---|---|---|---|
| `.DS_Store` | file | 10KB | **DELETE** |
| `.claude/` | dir | 5 items | KEEP (inner Claude config stays with the app) |
| `.env`, `.env.example`, `.env.local` | files | — | KEEP (gitignored, move with the app) |
| `.gitignore` | file | 670B | KEEP (may consolidate with root `.gitignore`) |
| `.next/` | dir | — | **DELETE** (build output, gitignored) |
| `.prettierignore`, `.prettierrc.json` | files | — | KEEP |
| `EDITOR_CANVAS_IMPLEMENTATION_PLAN.md` | file | 8.3KB | **ASK Q4** (move to `plans/` or delete?) |
| `Procfile` | file | 52B | **ASK Q1** (Heroku config — still relevant?) |
| `README.md` | file | 1.5KB | KEEP (may merge with outer README) |
| `SIDEBAR_IMPLEMENTATION_PLAN.md` | file | 4.9KB | **ASK Q4** (move to `plans/` or delete?) |
| `app/` | dir | 20 items | KEEP (Next.js App Router pages) |
| `bin/` | dir | 3 items | KEEP (investigate Q3 conflict) |
| `content/` | dir | 3 items | KEEP (legal content, new from Phase A) |
| `design_rework_inspiration/` | dir | 12 items | KEEP (dev reference material) |
| `docs/` | dir | 4 items | KEEP (investigate Q3 conflict) |
| `eslint.config.mjs` | file | 465B | KEEP |
| `instrumentation.ts` | file | 485B | KEEP (Sentry instrumentation) |
| `next-env.d.ts` | file | 247B | KEEP |
| `next.config.ts` | file | 1.2KB | KEEP (may need path updates) |
| `node_modules/` | dir | 803 items | **DELETE** (pnpm will recreate) |
| `package-lock.json` | file | 674KB | **DELETE** (switching to pnpm) |
| `package.json` | file | 3.4KB | KEEP (rename field to `"web"`, update scripts) |
| `plans/` | dir | 7 items | **MOVE** to `plans/` at monorepo root |
| `postcss.config.mjs` | file | 94B | KEEP |
| `prisma/` | dir | 4 items | KEEP |
| `public/` | dir | 19 items | KEEP |
| `scripts/` | dir | 3 items | KEEP |
| `sentry.{client,edge,server}.config.ts` | files | — | KEEP |
| `src/` | dir | 12 items | KEEP |
| `tsconfig.json` | file | 670B | KEEP (may need path updates) |
| `tsconfig.tsbuildinfo` | file | 575KB | **DELETE** (build cache) |
| `uploads/` | dir | 7 items | **ASK Q5** (real data? dev data? gitignored?) |

### Uncommitted work (from `git status`)

**Modified:**
- `quizzard/src/components/landing/LandingFooter.tsx` (likely the legal pages link-wiring edit)

**Untracked (new files/dirs):**
- `quizzard/app/legal/`
- `quizzard/app/privacy/`
- `quizzard/app/terms/`
- `quizzard/plans/react-native-mobile-shell.md` (the main plan document!)
- `quizzard/plans/phase-0-monorepo-conversion.md` (this document!)
- `quizzard/src/components/legal/`
- `quizzard/src/content/`
- `quizzard/src/lib/legal-content.ts`

**These must be committed BEFORE any `git mv` operations.** Attempting `git mv` on a dirty tree risks conflicts, partial moves, and a broken state.

---

## Decision Points (Must Be Resolved Before Execution)

The following questions must be answered before executing Stage 2 onward. Defaults are provided in parentheses — if the user answers "use defaults for everything," the plan proceeds with those.

**Q1 — Outer-level cruft cleanup (default: DELETE ALL):**
- Can I `rm -rf` `academic-pptx-skill-main/`, `open-exam-skills-main/`, `stitch/`?
- Can I delete outer `.next/` (stale build)?
- Can I delete `notemagelogo.png` and `notemagelogos/` if they're redundant with `brand_assets/`? (User should verify they're redundant first.)
- Can I delete `temporary screenshots/` and `screenshots/`?
- Can I delete `pgadmin-servers.json`?
- What about `quizzard/Procfile`? (Still deploying to Heroku?)

**Q2 — Old planning docs at outer level (default: ARCHIVE to `plans/archive/`):**
- `IMPLEMENTATION_PLAN.md` (26KB)
- `legacy-plan.md` (42KB)
- `tierplan.md` (6.7KB)
- `project_description.md` (5.6KB)

Options:
- (a) Move to `plans/archive/<filename>` — preserved but out of the way
- (b) Delete outright — they're truly obsolete
- (c) Move to `plans/<filename>` — mixed in with active plans

**Recommendation:** Option (a). Preserves history without cluttering the active plans dir. Can be hard-deleted in a later cleanup if nobody references them.

**Q3 — Duplicate directories (default: MERGE outer into inner):**
- Outer `Quizzard/docs/` vs `quizzard/docs/`
- Outer `Quizzard/bin/` vs `quizzard/bin/`

Options:
- (a) Outer wins — delete inner, keep outer at root
- (b) Inner wins — outer gets merged into inner, then inner moves to `apps/web/` with the rest
- (c) They're different content — keep both, outer stays at root, inner moves with the app
- (d) Only one is used — delete the unused one

**Need to actually look inside both pairs to decide.** Action before execution: `ls outer/docs/ inner/docs/` and compare. Same for `bin/`. This is investigation, not a user decision.

**Q4 — Inner-level old plan docs (default: MOVE to `plans/archive/`):**
- `quizzard/EDITOR_CANVAS_IMPLEMENTATION_PLAN.md` — still relevant? Canvas is already implemented.
- `quizzard/SIDEBAR_IMPLEMENTATION_PLAN.md` — still relevant? Sidebar is already implemented.

Both look like completed implementation docs. Archive recommended.

**Q5 — `quizzard/uploads/` directory:**
- Is this real user-uploaded data? If yes, it should NOT be in the repo — it should be in Supabase Storage or similar
- Is this dev-only test data? If yes, gitignore and delete
- Is this already gitignored? If yes, we can leave it alone

Action before execution: check `quizzard/.gitignore` for `uploads/` entry, and run `git check-ignore quizzard/uploads/` to confirm. Also `ls quizzard/uploads/` to see what's actually in there.

**Q6 — Current Vercel "Root Directory" setting:**

I need to know exactly what Vercel thinks the project root is right now, so I can tell you exactly what to change it to after the move.

Check in the Vercel dashboard: Project Settings → Build & Development Settings → Root Directory.

Likely values:
- `quizzard` — most likely, meaning Vercel runs `npm install` inside `quizzard/` and builds from there
- `.` or blank — meaning Vercel runs from the outer dir and might have a custom build command like `cd quizzard && npm run build`

Post-move target: `apps/web` with install command `cd ../.. && pnpm install --frozen-lockfile` and build command `pnpm build`.

**Q7 — Commit strategy (default: INCREMENTAL, 7 commits):**

Incremental is the recommended default because each step is individually revertable. The 7 commits:
1. `feat(legal): wire up privacy/terms/legal pages and plan docs` (current pending work)
2. `chore: remove dev cruft from outer level` (Q1 deletions)
3. `chore: archive old plan docs` (Q2 archival)
4. `chore: scaffold monorepo skeleton` (apps/, packages/, root package.json, pnpm-workspace.yaml)
5. `chore: move Next.js app to apps/web` (the big git mv)
6. `chore: update cross-references after monorepo move` (CLAUDE.md, Dockerfile, docker-compose.yml, CI workflows, package.json name)
7. `chore: switch to pnpm workspaces` (delete package-lock.json, pnpm install)

Alternative: one big commit. Faster but all-or-nothing rollback.

**Q8 — pnpm vs npm workspaces (default: pnpm):**

pnpm is cleaner, disk-efficient, and is the modern recommended workspaces tool. The cost is a ~15-minute install migration and relearning a few command forms. Confirm before blowing away `package-lock.json`.

**Q9 — CLAUDE.md update (default: YES, part of Stage 5):**

The current `CLAUDE.md` has this line:
> **The Next.js app lives in `quizzard/`** (lowercase) — the working directory is `/Users/toprakdemirel/Entwicklung/Quizzard/quizzard/`.

After the move this becomes:
> **The Next.js app lives in `apps/web/`** — the working directory is `/Users/toprakdemirel/Entwicklung/Quizzard/apps/web/`.

This update happens in Stage 5 along with other cross-reference updates. Same file also mentions `Quizzard/quizzard/` paths in several other places that all need updating.

---

## Classification Summary Table

For quick reference, here's what happens to every non-trivial item:

| Item | Action | Destination | Stage |
|---|---|---|---|
| Uncommitted legal/plan work | Commit in place first | (existing paths) | Stage 1 |
| `.DS_Store` (outer + inner) | Delete + gitignore | — | Stage 2 |
| `.next/` (outer) | Delete | — | Stage 2 |
| `academic-pptx-skill-main/` | Delete (Q1) | — | Stage 2 |
| `open-exam-skills-main/` | Delete (Q1) | — | Stage 2 |
| `stitch/` | Delete (Q1) | — | Stage 2 |
| `notemagelogo.png` | Verify redundancy, delete (Q1) | — | Stage 2 |
| `notemagelogos/` | Verify redundancy, delete (Q1) | — | Stage 2 |
| `temporary screenshots/` | Delete + gitignore | — | Stage 2 |
| `screenshots/` | Delete + gitignore | — | Stage 2 |
| `pgadmin-servers.json` | Delete (Q1) | — | Stage 2 |
| `IMPLEMENTATION_PLAN.md` | Archive (Q2) | `plans/archive/` | Stage 3 |
| `legacy-plan.md` | Archive (Q2) | `plans/archive/` | Stage 3 |
| `tierplan.md` | Archive (Q2) | `plans/archive/` | Stage 3 |
| `project_description.md` | Archive (Q2) | `plans/archive/` | Stage 3 |
| `EDITOR_CANVAS_IMPLEMENTATION_PLAN.md` | Archive (Q4) | `plans/archive/` | Stage 3 |
| `SIDEBAR_IMPLEMENTATION_PLAN.md` | Archive (Q4) | `plans/archive/` | Stage 3 |
| `quizzard/Procfile` | Delete (Q1) | — | Stage 2 |
| `quizzard/` | Move | `apps/web/` | Stage 4 |
| `quizzard/plans/` | Move | `plans/` (root) | Stage 4 |
| `quizzard/node_modules/` | Delete | — | Stage 6 |
| `quizzard/package-lock.json` | Delete | — | Stage 6 |
| `quizzard/tsconfig.tsbuildinfo` | Delete | — | Stage 2 |
| `quizzard/uploads/` | TBD (Q5) | — | — |
| Outer `docs/` vs inner `docs/` | TBD (Q3) | — | Stage 4 |
| Outer `bin/` vs inner `bin/` | TBD (Q3) | — | Stage 4 |
| `CLAUDE.md` | Update content | (stays at root) | Stage 5 |
| `Dockerfile` | Update paths | (stays at root) | Stage 5 |
| `docker-compose.yml` | Update paths | (stays at root) | Stage 5 |
| `.github/workflows/*` | Update paths | (stays at root) | Stage 5 |
| `README.md` (outer) | Keep, maybe update | (stays at root) | Stage 5 |
| `brand_assets/` | Keep as-is | (stays at root) | — |
| `LICENSE`, `security.md` | Keep as-is | (stays at root) | — |
| `screenshot.mjs` | Keep as-is | (stays at root) | — |

---

## Target Post-Phase-0 Repo State

After Phase 0 completes, the repo should look like this:

```
Quizzard/                          # git root (unchanged path)
├── .claude/                       # Claude Code config (kept)
├── .github/                       # CI workflows (paths updated)
├── .gitignore                     # (consolidated, more patterns)
├── .dockerignore
├── CLAUDE.md                      # updated to reference apps/web/
├── Dockerfile                     # paths updated
├── LICENSE
├── README.md
├── docker-compose.yml             # paths updated
├── screenshot.mjs                 # dev utility
├── security.md
├── brand_assets/                  # (unchanged)
├── apps/
│   └── web/                       # the former quizzard/ contents
│       ├── .claude/
│       ├── .env.example
│       ├── app/
│       ├── content/
│       ├── design_rework_inspiration/
│       ├── docs/                  # (post-Q3 resolution)
│       ├── prisma/
│       ├── public/
│       ├── scripts/
│       ├── src/
│       ├── instrumentation.ts
│       ├── next.config.ts
│       ├── package.json           # name: "web"
│       ├── postcss.config.mjs
│       ├── sentry.*.config.ts
│       ├── tsconfig.json
│       └── eslint.config.mjs
├── packages/
│   └── shared/                    # empty scaffold for Phase 2+
│       ├── package.json
│       └── src/
│           └── index.ts
├── plans/                         # moved from quizzard/plans/
│   ├── react-native-mobile-shell.md
│   ├── phase-0-monorepo-conversion.md  # this file
│   ├── floating-greeting-kite.md       # (whatever else was in quizzard/plans/)
│   └── archive/
│       ├── IMPLEMENTATION_PLAN.md
│       ├── legacy-plan.md
│       ├── tierplan.md
│       ├── project_description.md
│       ├── EDITOR_CANVAS_IMPLEMENTATION_PLAN.md
│       └── SIDEBAR_IMPLEMENTATION_PLAN.md
├── package.json                   # monorepo root with workspace scripts
├── pnpm-workspace.yaml
└── pnpm-lock.yaml                 # replaces package-lock.json
```

**Items that are GONE post-Phase-0:**
- `academic-pptx-skill-main/`
- `open-exam-skills-main/`
- `stitch/`
- `.next/` (at outer level)
- `notemagelogo.png` + `notemagelogos/` (if confirmed redundant with `brand_assets/`)
- `pgadmin-servers.json`
- `screenshots/`, `temporary screenshots/`
- `quizzard/` directory (contents moved to `apps/web/`)
- `quizzard/node_modules/`, `quizzard/package-lock.json`, `quizzard/tsconfig.tsbuildinfo`

---

## Pre-Flight Checklist

Before running any commands, verify:

- [ ] Answers to Q1–Q9 are confirmed
- [ ] Working directory is `/Users/toprakdemirel/Entwicklung/Quizzard/`
- [ ] Current branch is `main`
- [ ] No other team members have open PRs that will conflict (solo dev: skip)
- [ ] Vercel deployment is currently stable (no in-progress deploys)
- [ ] Local disk has at least 2GB free (for re-installing `node_modules` via pnpm)
- [ ] Node 20+ and pnpm 9+ are installed: `node -v && pnpm -v`
- [ ] Optional but recommended: create a full repo backup: `cp -R Quizzard Quizzard.bak` in the parent dir
- [ ] Optional but recommended: create a backup branch: `git checkout -b pre-monorepo-backup && git checkout main`

---

## Execution Plan

### Stage 1 — Safety Baseline (Commit Pending Work)

**Goal:** Commit the in-progress legal pages and plan docs on the existing `quizzard/` structure so the working tree is clean before any structural changes.

**Steps:**

1. Review pending changes:
   ```
   git status
   git diff quizzard/src/components/landing/LandingFooter.tsx
   ```

2. Stage the pending work:
   ```
   git add quizzard/src/components/landing/LandingFooter.tsx
   git add quizzard/app/legal/ quizzard/app/privacy/ quizzard/app/terms/
   git add quizzard/src/components/legal/ quizzard/src/content/ quizzard/src/lib/legal-content.ts
   git add quizzard/plans/react-native-mobile-shell.md
   git add quizzard/plans/phase-0-monorepo-conversion.md
   ```

3. Commit:
   ```
   git commit -m "feat(legal): scaffold legal pages and shell plan"
   ```

4. Verify clean tree: `git status` → should show "nothing to commit, working tree clean"

**Verification:**
- [ ] `git status` is clean
- [ ] `git log -1` shows the new commit
- [ ] `apps/web/...` does NOT exist yet (this stage doesn't create it)

---

### Stage 2 — Cruft Cleanup

**Goal:** Remove dev junk, stale build artifacts, unrelated vendored projects, and duplicate assets per Q1 decisions.

**Steps (assuming Q1 defaults — DELETE ALL cruft):**

1. Verify redundancy of `notemagelogo.png` and `notemagelogos/`:
   ```
   diff <(shasum notemagelogo.png | awk '{print $1}') <(shasum brand_assets/<same-filename>.png | awk '{print $1}') 2>/dev/null
   ls brand_assets/
   ls notemagelogos/
   ```
   **HUMAN DECISION:** if they're duplicates of `brand_assets/`, proceed to delete. If they contain things NOT in `brand_assets/`, move those items into `brand_assets/` first.

2. Delete outer-level cruft:
   ```
   rm -rf academic-pptx-skill-main/
   rm -rf open-exam-skills-main/
   rm -rf stitch/
   rm -rf .next/
   rm -rf "temporary screenshots/"
   rm -rf screenshots/
   rm -f notemagelogo.png
   rm -rf notemagelogos/
   rm -f pgadmin-servers.json
   rm -f .DS_Store
   find . -name ".DS_Store" -delete
   ```

3. Delete inner-level cruft:
   ```
   rm -f quizzard/.DS_Store
   rm -f quizzard/tsconfig.tsbuildinfo
   rm -f quizzard/Procfile  # if Q1 confirmed not Heroku
   ```

4. Update `.gitignore` at the outer (monorepo) level:

   Add these patterns if not already present:
   ```
   # OS cruft
   .DS_Store
   Thumbs.db

   # Build artifacts
   .next/
   dist/
   out/
   *.tsbuildinfo

   # Dev screenshots
   screenshots/
   temporary screenshots/

   # Node modules (workspace-aware)
   node_modules/
   **/node_modules/

   # Env (keep .env.example tracked)
   .env
   .env.local
   .env.*.local
   ```

5. Stage and commit:
   ```
   git add -A
   git commit -m "chore: remove dev cruft and unused vendored projects from repo root"
   ```

**Verification:**
- [ ] `ls` at outer level shows no `academic-pptx-skill-main/`, `open-exam-skills-main/`, `stitch/`, `.next/`, `notemagelogo.png`, etc.
- [ ] `.gitignore` has the new patterns
- [ ] `git status` is clean
- [ ] Repo size noticeably smaller (check with `du -sh .` before/after)

---

### Stage 3 — Archive Old Plans

**Goal:** Move old planning documents out of the active workspace into `plans/archive/` where they're preserved but out of the way.

**Steps (assuming Q2 default — ARCHIVE):**

1. Create the archive destination. Since `plans/` doesn't exist at the outer level yet (it's still at `quizzard/plans/`), create it now at the target final location:
   ```
   mkdir -p plans/archive
   ```

2. Archive outer-level old plans:
   ```
   git mv IMPLEMENTATION_PLAN.md plans/archive/IMPLEMENTATION_PLAN.md
   git mv legacy-plan.md plans/archive/legacy-plan.md
   git mv tierplan.md plans/archive/tierplan.md
   git mv project_description.md plans/archive/project_description.md
   ```

3. Archive inner-level old plans (these live inside `quizzard/` right now):
   ```
   git mv quizzard/EDITOR_CANVAS_IMPLEMENTATION_PLAN.md plans/archive/EDITOR_CANVAS_IMPLEMENTATION_PLAN.md
   git mv quizzard/SIDEBAR_IMPLEMENTATION_PLAN.md plans/archive/SIDEBAR_IMPLEMENTATION_PLAN.md
   ```

4. Commit:
   ```
   git commit -m "chore: archive old planning documents to plans/archive"
   ```

**Verification:**
- [ ] `plans/archive/` exists and contains the 6 archived files
- [ ] No stray plan docs at outer level or in `quizzard/` root
- [ ] `git status` is clean

---

### Stage 4 — Scaffold Monorepo Skeleton

**Goal:** Create the monorepo directory structure and workspace configuration files, without touching `quizzard/` yet. This is all additive work.

**Steps:**

1. Create empty `apps/` and `packages/shared/` directories:
   ```
   mkdir -p apps packages/shared/src
   ```

2. Create `pnpm-workspace.yaml` at the outer level:
   ```
   packages:
     - 'apps/*'
     - 'packages/*'
   ```

3. Create root `package.json` at the outer level:
   ```
   {
     "name": "notemage",
     "private": true,
     "version": "0.0.0",
     "scripts": {
       "dev:web": "pnpm --filter web dev",
       "build:web": "pnpm --filter web build",
       "lint": "pnpm -r lint",
       "typecheck": "pnpm -r typecheck",
       "clean": "pnpm -r exec rm -rf node_modules .next dist"
     },
     "devDependencies": {
       "typescript": "^5.6.0"
     },
     "packageManager": "pnpm@9.12.0"
   }
   ```

4. Create `packages/shared/package.json`:
   ```
   {
     "name": "@notemage/shared",
     "version": "0.0.0",
     "private": true,
     "main": "./src/index.ts",
     "types": "./src/index.ts"
   }
   ```

5. Create `packages/shared/src/index.ts` as an empty placeholder:
   ```
   // Shared types and utilities for Notemage apps (web, mobile, desktop).
   // Populated in Phase 2 with the native bridge protocol and entitlement shapes.
   export {};
   ```

6. Stage and commit:
   ```
   git add apps/ packages/ package.json pnpm-workspace.yaml
   git commit -m "chore: scaffold monorepo skeleton (apps/, packages/shared/, pnpm-workspace)"
   ```

**Verification:**
- [ ] `apps/` exists and is empty
- [ ] `packages/shared/` exists with a package.json and empty src/index.ts
- [ ] Root `package.json` exists with workspace scripts
- [ ] `pnpm-workspace.yaml` exists
- [ ] `quizzard/` is still untouched at this point
- [ ] `git status` is clean

---

### Stage 5 — The Big Move

**Goal:** Move `quizzard/` contents into `apps/web/` and move `quizzard/plans/` into `plans/` at the root.

**Steps:**

1. Investigate Q3 (duplicate dirs) before moving:
   ```
   ls docs/ quizzard/docs/
   ls bin/ quizzard/bin/
   ```
   Compare file contents. Decide per-file which version wins. Document the decision here before executing.

2. Handle the outer `docs/` and `bin/` per Q3 decision:
   - **Option A (outer wins):** `rm -rf quizzard/docs/ quizzard/bin/` before the move
   - **Option B (inner wins):** `git rm -rf docs/ bin/` at outer level, then proceed with the move; inner `docs/`/`bin/` move with `quizzard/`
   - **Option C (both kept with rename):** rename to disambiguate, e.g., `mv docs root-docs` before the move

3. Move `quizzard/` → `apps/web/`:
   ```
   git mv quizzard apps/web
   ```

4. Move `apps/web/plans/` → `plans/` at the root:
   ```
   # Some of quizzard/plans/ content is already in plans/archive/ from Stage 3.
   # What's left is active plans that should move to plans/ (not archive/).
   git mv apps/web/plans/react-native-mobile-shell.md plans/react-native-mobile-shell.md
   git mv apps/web/plans/phase-0-monorepo-conversion.md plans/phase-0-monorepo-conversion.md
   # ...and any other active plans in apps/web/plans/ that weren't already archived
   ls apps/web/plans/  # verify what's left
   # If empty:
   rmdir apps/web/plans
   ```

5. Verify the structure:
   ```
   ls apps/web/         # should show app/, src/, public/, prisma/, package.json, etc.
   ls plans/            # should show active plans + archive/
   ls                   # outer level should have apps/, packages/, plans/, brand_assets/, CLAUDE.md, etc.
   ```

6. Commit the move:
   ```
   git commit -m "chore: move Next.js app from quizzard/ to apps/web/"
   ```

**Verification:**
- [ ] `apps/web/` contains the full former contents of `quizzard/`
- [ ] `apps/web/package.json` exists
- [ ] `apps/web/src/`, `apps/web/app/`, `apps/web/prisma/` all exist
- [ ] `plans/` at root has the active shell plan and this phase plan
- [ ] `plans/archive/` has the old archived plans
- [ ] No `quizzard/` directory exists anymore
- [ ] `git log --follow apps/web/app/page.tsx` shows history preserved
- [ ] `git status` is clean

---

### Stage 6 — Update Cross-References

**Goal:** Update all files that reference the old `quizzard/` path so they point at `apps/web/`.

**Files to update:**

1. **`CLAUDE.md`** (at outer level):
   - Change `The Next.js app lives in `quizzard/` (lowercase) — the working directory is /Users/toprakdemirel/Entwicklung/Quizzard/quizzard/` to reference `apps/web/`
   - Change root description: outer `Quizzard/` now contains `apps/`, `packages/`, `plans/`, `brand_assets/`, `CLAUDE.md`, etc.
   - Change "Brand assets are at `Quizzard/brand_assets/` (one level up from the app)" — brand assets are now TWO levels up from `apps/web/`
   - Change "When running commands, always `cd` into `Quizzard/quizzard/` first" — now `apps/web/` OR better, use pnpm filter commands from root
   - Update the `InfiniteCanvas.tsx` file path: `quizzard/src/components/notebook/InfiniteCanvas.tsx` → `apps/web/src/components/notebook/InfiniteCanvas.tsx`
   - Update the stylus support doc path similarly
   - Update the "Already shipped" section's file path

2. **`Dockerfile`**:
   - Update `COPY` statements that reference `quizzard/` to reference `apps/web/`
   - Update `WORKDIR` to `/app/apps/web` or wherever makes sense
   - Install flow changes from `npm install` to `pnpm install` from monorepo root
   - This may require switching to a pnpm-aware Dockerfile pattern (multi-stage build, copy workspace files first, install, then copy source)

3. **`docker-compose.yml`**:
   - Update `build.context` and `volumes` paths from `./quizzard` to `./apps/web`

4. **`.github/workflows/*.yml`** (if any exist):
   - Update any `working-directory: quizzard` to `working-directory: apps/web`
   - Update any path filters (`paths: quizzard/**`) to `apps/web/**`
   - If the workflows use `npm`, switch to `pnpm`

5. **`.dockerignore`**:
   - Update any `quizzard/` paths

6. **`apps/web/package.json`**:
   - Change `"name"` field from `"quizzard"` (or whatever it was) to `"web"`
   - Verify all scripts still work

7. **`apps/web/tsconfig.json`**:
   - If it has any `paths` aliases referencing files above `apps/web/`, update them
   - Likely no changes needed if all paths are relative inside `apps/web/`

8. **`apps/web/next.config.ts`**:
   - Check for any path references
   - If Next.js is configured to output or reference files outside its own directory, update

9. **Outer `README.md`** (if content references `quizzard/`):
   - Update install instructions
   - Update dev server start instructions

10. **Outer `.gitignore`**:
    - Consolidate with inner `apps/web/.gitignore` if appropriate
    - Ensure `node_modules/`, `.next/`, etc. are globbed correctly for the workspace structure

11. **Search the repo for any remaining `quizzard/` references:**
    ```
    grep -r "quizzard" \
      --include="*.json" --include="*.yml" --include="*.yaml" \
      --include="*.ts" --include="*.tsx" --include="*.js" --include="*.mjs" \
      --include="*.md" --include="Dockerfile*" --include="*.toml"
    ```
    Update each hit. Note: references inside `apps/web/` code that refer to `quizzard/` as a package name or alias don't need changing — only filesystem paths.

12. Commit:
    ```
    git commit -m "chore: update cross-references for monorepo structure"
    ```

**Verification:**
- [ ] `grep -r "quizzard" --include="*.md" --include="*.json" --include="*.yml" --include="Dockerfile*"` returns no filesystem-path hits
- [ ] `CLAUDE.md` references `apps/web/` consistently
- [ ] `Dockerfile` builds successfully (test in Stage 8)
- [ ] `git status` is clean

---

### Stage 7 — pnpm Migration

**Goal:** Remove npm's lockfile and `node_modules`, install fresh with pnpm workspaces.

**Steps:**

1. Delete npm artifacts:
   ```
   rm -rf apps/web/node_modules
   rm -f apps/web/package-lock.json
   ```

2. Also check for any stray `node_modules/` at the outer level (shouldn't be any, but verify):
   ```
   ls node_modules 2>/dev/null && rm -rf node_modules
   ```

3. Install with pnpm from monorepo root:
   ```
   pnpm install
   ```

4. Verify the install:
   ```
   ls apps/web/node_modules          # should exist as pnpm-managed
   ls apps/web/node_modules/.pnpm/   # should exist (pnpm's store layout)
   ls node_modules 2>/dev/null       # likely exists now with workspace-level deps
   ```

5. Commit:
   ```
   git add pnpm-lock.yaml
   git commit -m "chore: switch to pnpm workspaces"
   ```

**Verification:**
- [ ] `pnpm-lock.yaml` exists at the root
- [ ] `package-lock.json` does NOT exist anywhere
- [ ] `apps/web/node_modules` exists (as pnpm-managed symlinked structure)
- [ ] `pnpm --filter web exec next --version` works
- [ ] `git status` is clean

---

### Stage 8 — Local Smoke Test

**Goal:** Verify everything still works locally before touching production (Vercel).

**Steps:**

1. Start the dev server:
   ```
   pnpm dev:web
   ```

2. Wait for Next.js to report "Ready in Xms"

3. Open http://localhost:3000 in a browser

4. Smoke test checklist:
   - [ ] Landing page renders without errors
   - [ ] Navbar and footer render correctly
   - [ ] Click a legal page link (`/privacy`) — renders correctly
   - [ ] Click `/terms` — renders correctly
   - [ ] Click `/legal` — renders correctly
   - [ ] Click "Join the waitlist" — form loads
   - [ ] Submit a test email to the waitlist — success response
   - [ ] Log in (or sign up) — NextAuth flow works
   - [ ] Open a notebook — canvas renders
   - [ ] Draw something on the canvas — ink appears
   - [ ] Log out — session ends

5. Check Prisma:
   ```
   pnpm --filter web exec prisma generate
   pnpm --filter web exec prisma validate
   ```

6. Run typecheck:
   ```
   pnpm typecheck
   ```

7. Run lint:
   ```
   pnpm lint
   ```

8. Try a production build locally:
   ```
   pnpm build:web
   ```

9. If ANY of the above fail, stop. Debug and fix before proceeding to Stage 9. Common issues:
   - Missing env vars → check `apps/web/.env.local`
   - Prisma schema can't find database → check `DATABASE_URL`
   - TypeScript path aliases broken → check `apps/web/tsconfig.json`
   - Sentry config failing → check `apps/web/sentry.*.config.ts`

**Verification:**
- [ ] Dev server starts successfully
- [ ] All smoke-test checklist items pass
- [ ] Prisma commands succeed
- [ ] Typecheck passes
- [ ] Lint passes
- [ ] Production build succeeds

---

### Stage 9 — Vercel Coordination (User-Driven)

**Goal:** Update Vercel dashboard settings to match the new structure, BEFORE pushing the post-move commits.

**This stage requires the USER to act in the Vercel dashboard. I cannot do this.**

**User steps:**

1. Open the Vercel dashboard → Notemage project → Settings → General → Build & Development Settings

2. Change the following settings:

   | Setting | Old value | New value |
   |---|---|---|
   | Framework Preset | Next.js | Next.js (unchanged) |
   | Build Command | `npm run build` or auto | `pnpm build` |
   | Output Directory | `.next` | `.next` (unchanged) |
   | Install Command | `npm install` or auto | `pnpm install --frozen-lockfile` |
   | Development Command | `npm run dev` or auto | `pnpm dev` |
   | Root Directory | `quizzard` (per Q6) | `apps/web` |

3. Click Save.

4. Also verify/update:
   - Environment Variables (should carry over automatically since they're attached to the project, not the root directory)
   - Ignored Build Step (if configured)
   - Domains (unchanged — `notemage.app`)

5. Confirm with me: "Vercel is updated, ready to push."

---

### Stage 10 — Push and Verify Production

**Goal:** Push the monorepo conversion to `main` and verify the first post-move Vercel deploy succeeds.

**Steps:**

1. Review what's about to be pushed:
   ```
   git log origin/main..HEAD --oneline
   ```
   Should show the Phase 0 commits (Stages 1–7).

2. Push:
   ```
   git push origin main
   ```

3. Watch the Vercel deploy:
   - Open the Vercel dashboard → Deployments → latest
   - Watch the build logs
   - Expected time: similar to previous deploys (2–5 minutes)

4. If the deploy fails:
   - Read the build logs carefully
   - Most likely issues:
     - `pnpm install` fails → lockfile mismatch, run `pnpm install` locally, commit the lockfile, re-push
     - Prisma client missing → build script doesn't include `prisma generate`, add it to `apps/web/package.json` postinstall hook
     - Env vars missing → check Vercel env var configuration
     - Path resolution errors → some reference to `quizzard/` was missed in Stage 6
   - If irrecoverable → **execute the Rollback Plan below**

5. If the deploy succeeds:
   - Open `https://notemage.app` in a browser
   - Run through the smoke test checklist from Stage 8, but on production
   - Pay special attention to:
     - Legal pages loading
     - Waitlist signup
     - Login
     - Any AI-powered routes
   - Confirm production looks healthy

6. Announce completion: "Phase 0 complete. Repo is now a pnpm monorepo with `apps/web/`."

**Verification:**
- [ ] Vercel deploy succeeds
- [ ] `https://notemage.app` loads correctly
- [ ] All smoke-test checklist items pass in production
- [ ] No new errors in Sentry (if enabled)
- [ ] `git log` on main shows the Phase 0 commits

---

## Commit Strategy Summary

**Total commits in Phase 0: 6 (plus 1 for Stage 1 pending work = 7 commits total).**

| Stage | Commit message |
|---|---|
| 1 | `feat(legal): scaffold legal pages and shell plan` |
| 2 | `chore: remove dev cruft and unused vendored projects from repo root` |
| 3 | `chore: archive old planning documents to plans/archive` |
| 4 | `chore: scaffold monorepo skeleton (apps/, packages/shared/, pnpm-workspace)` |
| 5 | `chore: move Next.js app from quizzard/ to apps/web/` |
| 6 | `chore: update cross-references for monorepo structure` |
| 7 | `chore: switch to pnpm workspaces` |

Each commit is independently revertable. No commit depends on pushing to remote before the next one can happen locally.

---

## Rollback Plan

Rollback strategies by point of failure:

**If a commit is wrong before pushing (Stages 1–8 local):**
- `git reset --hard HEAD~1` (drop the bad commit)
- Or `git reset --mixed HEAD~1` (keep changes, uncommit them)
- Or `git revert <hash>` (add an inverse commit — cleanest)

**If the Vercel deploy fails at Stage 10:**

Option A — Rollback via Vercel:
1. In Vercel dashboard, find the previous successful deploy (the one before the push)
2. Click "Promote to Production" on that deploy — instant rollback with zero git changes
3. Fix the issue locally, test, try again with a new commit

Option B — Rollback via git:
1. In Vercel dashboard, change Root Directory back to the old value (`quizzard`, per Q6)
2. Locally: `git revert <move-commit-hash>` (the Stage 5 commit)
3. `git push origin main`
4. Vercel redeploys from the pre-move state
5. You're back to the pre-Phase-0 state except with cleaner cruft-free outer dir (Stages 2–3 commits can stay)

**If something is catastrophically wrong:**
- You made the backup branch `pre-monorepo-backup` in the pre-flight checklist
- `git checkout pre-monorepo-backup` → full pre-Phase-0 state
- `git branch -D main && git checkout -b main && git push -f origin main` — but this rewrites history, don't do it unless absolutely necessary
- Or: `cp -R ../Quizzard.bak/.* ./` from the filesystem backup — nuclear option

**Nobody else is using this repo, so you have full rollback latitude.** Even "nuclear" options are OK for a solo pre-launch project.

---

## Final Verification Checklist

After Stage 10 completes successfully:

### Repo structure
- [ ] `apps/web/` contains the Next.js app
- [ ] `packages/shared/` exists with empty placeholder
- [ ] `plans/` exists at root with `react-native-mobile-shell.md`, `phase-0-monorepo-conversion.md`, and `archive/`
- [ ] `brand_assets/` still at root
- [ ] Root `package.json` and `pnpm-workspace.yaml` exist
- [ ] No `quizzard/` directory
- [ ] No old cruft (`academic-pptx-skill-main/`, `stitch/`, etc.)

### Local dev
- [ ] `pnpm dev:web` starts dev server
- [ ] `pnpm build:web` builds successfully
- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] Prisma client generates
- [ ] All pages render locally

### Production
- [ ] Vercel deploy succeeded after the push
- [ ] `https://notemage.app` loads
- [ ] Login works
- [ ] Waitlist works
- [ ] Legal pages work
- [ ] Notebooks render
- [ ] No new Sentry errors

### Cross-references
- [ ] `CLAUDE.md` references `apps/web/` not `quizzard/`
- [ ] `Dockerfile` builds (if used)
- [ ] `.github/workflows/` run correctly (if any)

### Git hygiene
- [ ] All 7 commits on `main` branch
- [ ] `git log --follow apps/web/app/page.tsx` shows history preserved
- [ ] Working tree is clean
- [ ] No untracked files outside of gitignored paths

---

## Handoff Notes

Once Phase 0 is complete:

1. **The main shell plan's Phase 0 section becomes a brief reference to this detailed document.** Consider shortening the main plan's Phase 0 to: "See `plans/phase-0-monorepo-conversion.md` for the detailed execution plan. Summary: convert `quizzard/` → `apps/web/`, scaffold `apps/` and `packages/`, switch to pnpm workspaces."

2. **Next phases can proceed.** Phase 1 (iOS shell scaffolding) can begin as soon as Phase 0 is verified.

3. **Update memory.** Add a memory note that the Next.js app now lives in `apps/web/`, not `quizzard/`. The existing `project_structure.md` memory needs updating.

4. **Update scripts.** If there are any local dev scripts in the user's home directory (outside the repo) that reference `quizzard/`, update those. Check `~/.zshrc`, `~/.bashrc`, any aliases.

5. **Announce to self.** Mark this phase as done in wherever you track progress, and reference this file for future conversations. Future conversations that start fresh can read `plans/react-native-mobile-shell.md` + `plans/phase-0-monorepo-conversion.md` (this file) to understand the full current state.

---

## Appendix: Command Cheat Sheet (Post-Phase-0)

Once the monorepo is set up, common dev commands become:

| Action | Pre-Phase-0 command | Post-Phase-0 command |
|---|---|---|
| Start dev server | `cd quizzard && npm run dev` | `pnpm dev:web` |
| Build for production | `cd quizzard && npm run build` | `pnpm build:web` |
| Install a new package for web | `cd quizzard && npm install <pkg>` | `pnpm --filter web add <pkg>` |
| Run Prisma migrate | `cd quizzard && npx prisma migrate dev` | `pnpm --filter web exec prisma migrate dev` |
| Run typecheck | `cd quizzard && npm run typecheck` | `pnpm typecheck` (runs across workspaces) |
| Clean all build outputs | (manual) | `pnpm clean` |

---

**End of Phase 0 Detailed Execution Plan.**

When you're ready to execute, answer Q1–Q9, then I (or a fresh conversation) can walk through Stages 1–10 in order, pausing only at Stage 9 for you to update Vercel manually.
