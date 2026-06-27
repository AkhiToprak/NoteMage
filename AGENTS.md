# AGENTS.md — Frontend Website Rules

## Project Structure

- This repo is a **pnpm workspace monorepo** rooted at `/Users/toprakdemirel/Entwicklung/Quizzard/`.
- **The Next.js app lives in `apps/web/`** — the working directory is `/Users/toprakdemirel/Entwicklung/Quizzard/apps/web/`.
- All source files, `app/`, `src/`, `package.json`, etc. are under `Quizzard/apps/web/`.
- Shared TypeScript code (native bridge protocol, entitlement shapes) lives in `packages/shared/`.
- The mobile (Expo) and desktop (Electron) shells will land in `apps/mobile/` and `apps/desktop/` in later phases.
- Brand assets are at `Quizzard/brand_assets/` (two levels up from the app).
- Run scripts from the repo root via pnpm filters: `pnpm dev:web`, `pnpm build:web`, `pnpm --filter web <script>`. You can also `cd apps/web && pnpm <script>` if you prefer.

## Always Do First

- **Invoke the `hallmark` skill** before writing any frontend code, every session, no exceptions.

## Reference Images

- If a reference image is provided: match layout, spacing, typography, and color exactly. Swap in placeholder content (images via `https://placehold.co/`, generic copy). Do not improve or add to the design.
- If no reference image: design from scratch with high craft (see guardrails below).
- Screenshot your output, compare against reference, fix mismatches, re-screenshot. Do at least 2 comparison rounds. Stop only when no visible differences remain or user says so.

## Local Server

- **Always serve on localhost** — never screenshot a `file:///` URL.
- Start the dev server: `node serve.mjs` (serves the project root at `http://localhost:3000`)
- `serve.mjs` lives in the project root. Start it in the background before taking any screenshots.
- If the server is already running, do not start a second instance.

## Screenshot Workflow

- Puppeteer is installed at `C:/Users/nateh/AppData/Local/Temp/puppeteer-test/`. Chrome cache is at `C:/Users/nateh/.cache/puppeteer/`.
- **Always screenshot from localhost:** `node screenshot.mjs http://localhost:3000`
- Screenshots are saved automatically to `./temporary screenshots/screenshot-N.png` (auto-incremented, never overwritten).
- Optional label suffix: `node screenshot.mjs http://localhost:3000 label` → saves as `screenshot-N-label.png`
- `screenshot.mjs` lives in the project root. Use it as-is.
- After screenshotting, read the PNG from `temporary screenshots/` with the Read tool — Codex can see and analyze the image directly.
- When comparing, be specific: "heading is 32px but reference shows ~24px", "card gap is 16px but should be 24px"
- Check: spacing/padding, font size/weight/line-height, colors (exact hex), alignment, border-radius, shadows, image sizing

## Output Defaults

- Single `index.html` file, all styles inline, unless user says otherwise
- Tailwind CSS via CDN: `<script src="https://cdn.tailwindcss.com"></script>`
- Placeholder images: `https://placehold.co/WIDTHxHEIGHT`
- Mobile-first responsive

## Brand Assets

- Always check the `brand_assets/` folder before designing. It may contain logos, color guides, style guides, or images.
- If assets exist there, use them. Do not use placeholders where real assets are available.
- If a logo is present, use it. If a color palette is defined, use those exact values — do not invent brand colors.

## Anti-Generic Guardrails

- **Colors:** Never use default Tailwind palette (indigo-500, blue-600, etc.). Pick a custom brand color and derive from it.
- **Shadows:** Never use flat `shadow-md`. Use layered, color-tinted shadows with low opacity.
- **Typography:** Never use the same font for headings and body. Pair a display/serif with a clean sans. Apply tight tracking (`-0.03em`) on large headings, generous line-height (`1.7`) on body.
- **Gradients:** Layer multiple radial gradients. Add grain/texture via SVG noise filter for depth.
- **Animations:** Only animate `transform` and `opacity`. Never `transition-all`. Use spring-style easing.
  use the 21stDev mcp server to get animation inspirations, don't let 21stdev generate new animations, JUST USE INSPIRATIONS, inspirations are in https://21st.dev/community/components
- **Interactive states:** Every clickable element needs hover, focus-visible, and active states. No exceptions.
- **Images:** Add a gradient overlay (`bg-gradient-to-t from-black/60`) and a color treatment layer with `mix-blend-multiply`.
- **Spacing:** Use intentional, consistent spacing tokens — not random Tailwind steps.
- **Depth:** Surfaces should have a layering system (base → elevated → floating), not all sit at the same z-plane.

## Implementation Approach

- **Break work into small phases** — implement one phase at a time, verify before moving on.
- **Use subagents** for complex or parallel tasks to keep the main context clean.
- **Ask questions** when things are uncertain or big decisions need to be made — don't assume.
- **Follow plans strictly** when a plan document is provided (e.g. `tierplan.md`).

## Figma Workflow

- When a Figma URL (`figma.com/design/...`) is provided, invoke the `figma-implement-design` skill to read and implement the design.
- Always adapt Figma MCP output to Neon Scholar conventions: inline style objects with CSS custom properties, Material Symbols Outlined icons, project font variables.
- For partial updates (e.g., "update just the header"), read the design context, diff against the existing component, and apply only the changed parts. Preserve all existing logic.
- On Education plan — conserve `get_design_context` calls. Use `get_screenshot` for minor visual tweaks and describe changes verbally when possible.
- See `apps/web/.Codex/rules/figma-design-system.md` for the full translation rules.

## Hard Rules

- Do not add sections, features, or content not in the reference
- Do not "improve" a reference design — match it
- Do not stop after one screenshot pass
- Do not use `transition-all`
- Do not use default Tailwind blue/indigo as primary color

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- The graph is scoped to `apps/web` only — node `src=` paths are relative to `apps/web/` (e.g. `src=src/lib/chat-stream.ts` means `apps/web/src/lib/chat-stream.ts`). When citing a graph result to the user, prefix `apps/web/`.
- After modifying code, refresh the graph scoped to the web app — never `graphify update .` from the repo root, which re-indexes `apps/mobile/ios/Pods` and bloats the graph from ~5MB to ~75MB. graphify writes under the scanned path, so sync the result back to the canonical root `graphify-out/`:
  `graphify update apps/web --force && cp apps/web/graphify-out/graph.json graphify-out/graph.json && cp apps/web/graphify-out/GRAPH_REPORT.md graphify-out/GRAPH_REPORT.md && rm -rf apps/web/graphify-out`
