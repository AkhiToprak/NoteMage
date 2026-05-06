# Figma MCP Integration Rules — Neon Scholar Design System

These rules define how to translate Figma MCP output into code for the Notemage project. Follow them for every Figma-driven change.

## Required Flow (do not skip)

1. Run `get_design_context` first to fetch the structured representation for the exact node(s)
2. If the response is too large or truncated, run `get_metadata` to get the high-level node map, then re-fetch only the required node(s)
3. Run `get_screenshot` for a visual reference of the node being implemented
4. Only after you have both `get_design_context` and `get_screenshot`, download any assets and start implementation
5. Translate the output (React + Tailwind) into this project's conventions below
6. Validate against Figma for 1:1 visual parity before marking complete

## Styling Convention

- IMPORTANT: This project uses **inline `style={{}}` objects** as the primary styling approach, NOT Tailwind utility classes
- Use CSS custom properties (`var(--token)`) for all colors, fonts, and radii — never hardcode hex values
- Tailwind utility classes are ONLY used for the custom utilities defined in `globals.css` (listed below) and for dynamic className patterns (like TierBadge)
- When Figma MCP returns Tailwind classes like `bg-blue-500` or `text-gray-300`, convert them to inline styles with the matching CSS variable

### Custom Utility Classes (use these when appropriate)

| Class                  | Purpose                                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------------------------- |
| `glass-panel`          | Frosted glass: `rgba(33,33,54,0.7)` + `blur(20px)` + `border-radius: var(--radius-xl)`                |
| `neon-glow`            | Purple glow: `box-shadow: 0 0 40px 12px rgba(174,137,255,0.15), 0 0 80px 24px rgba(174,137,255,0.08)` |
| `notebook-pattern`     | Dot grid background with primary-tinted dots                                                          |
| `surface-elevated`     | `background: var(--surface-container)` + `border-radius: var(--radius-lg)`                            |
| `surface-floating`     | `background: var(--surface-container-high)` + shadow + `border-radius: var(--radius-lg)`              |
| `btn-primary-gradient` | Gradient CTA button using primary colors                                                              |
| `ns-input`             | Standard input styling with focus ring                                                                |
| `transition-spring`    | Spring easing on transform + opacity (`cubic-bezier(0.22, 1, 0.36, 1)`)                               |
| `shadow-ambient`       | Large ambient shadow with primary tint                                                                |
| `custom-scrollbar`     | Thin 4px scrollbar with outline colors                                                                |
| `font-display`         | Epilogue font                                                                                         |
| `font-brand`           | Oswald font                                                                                           |

## Color Token Mapping

When Figma returns colors, map them to CSS variables:

| Hex / Figma Color | CSS Variable                              | Tailwind Token              |
| ----------------- | ----------------------------------------- | --------------------------- |
| `#ae89ff`         | `var(--primary)`                          | `primary`                   |
| `#8348f6`         | `var(--primary-container)`                | `primary-container`         |
| `#884efb`         | `var(--primary-dim)`                      | `primary-dim`               |
| `#b9c3ff`         | `var(--secondary)`                        | `secondary`                 |
| `#001971`         | `var(--secondary-container)`              | `secondary-container`       |
| `#ffde59`         | `var(--tertiary-container)`               | `tertiary-container`        |
| `#ffedb3`         | `var(--tertiary)`                         | `tertiary`                  |
| `#fd6f85`         | `var(--error)`                            | `error`                     |
| `#1a1a36`         | `var(--background)` / `var(--surface)`    | `background` / `surface`    |
| `#10102a`         | `var(--surface-container-lowest)`         | `surface-container-lowest`  |
| `#21213e`         | `var(--surface-container-low)`            | `surface-container-low`     |
| `#272746`         | `var(--surface-container)`                | `surface-container`         |
| `#2d2d52`         | `var(--surface-container-high)`           | `surface-container-high`    |
| `#35355c`         | `var(--surface-container-highest)`        | `surface-container-highest` |
| `#eeecff`         | `var(--on-surface)` / `var(--foreground)` | `on-surface` / `foreground` |
| `#c0bed8`         | `var(--on-surface-variant)`               | `on-surface-variant`        |
| `#8888a8`         | `var(--outline)`                          | `outline`                   |
| `#555578`         | `var(--outline-variant)`                  | `outline-variant`           |

## Typography

| Role                  | Font Family       | CSS Variable                             |
| --------------------- | ----------------- | ---------------------------------------- |
| Headlines / Display   | Epilogue          | `var(--font-display)`                    |
| Body / UI             | Plus Jakarta Sans | `var(--font-sans)` (inherited from body) |
| Brand / Accent / Chat | Oswald            | `var(--font-brand)`                      |

- Body font is inherited — no need to set it explicitly
- Use `fontFamily: 'var(--font-display)'` for headlines in inline styles
- Use `fontFamily: 'var(--font-brand)'` for brand/accent text

## Icon System

- IMPORTANT: Use **Material Symbols Outlined** for all icons: `<span className="material-symbols-outlined">icon_name</span>`
- For filled icons: `<span className="material-symbols-outlined filled">icon_name</span>`
- Do NOT import lucide-react, heroicons, or any other icon package for UI icons
- Do NOT use or create SVG icon components unless the icon is a custom brand asset

## Border Radius

| Token                | Value  | Usage                          |
| -------------------- | ------ | ------------------------------ |
| `var(--radius-sm)`   | 8px    | Small elements, badges         |
| `var(--radius-md)`   | 12px   | Buttons, inputs, cards         |
| `var(--radius-lg)`   | 16px   | Panels, elevated surfaces      |
| `var(--radius-xl)`   | 24px   | Glass panels, large containers |
| `var(--radius-full)` | 9999px | Circles, pills                 |

## Shadow Patterns

- Ambient: `0 32px 64px rgba(174,137,255,0.06), 0 8px 24px rgba(0,0,0,0.4)`
- Floating: `0 8px 32px rgba(174,137,255,0.06), 0 2px 8px rgba(0,0,0,0.3)`
- Neon glow: `0 0 40px 12px rgba(174,137,255,0.15), 0 0 80px 24px rgba(174,137,255,0.08)`
- Never use flat `box-shadow` without primary color tint

## Transitions & Animation

- IMPORTANT: Never use `transition-all` or `transition: all`
- Only animate `transform` and `opacity`
- Use spring easing: `cubic-bezier(0.22, 1, 0.36, 1)` with 0.35s duration
- Use the `transition-spring` utility class when appropriate

## Component Organization

- UI components: `src/components/ui/` (TierBadge, MarkdownRenderer, etc.)
- Layout components: `src/components/layout/` (Header, Sidebar, HomeHeader)
- Feature components: `src/components/features/` (NotebookCard, XPProgressBar, etc.)
- Domain-specific: `src/components/{community,social,notebook,pricing,search,publish,onboarding,forms,home}/`
- Use `@/components/` path alias for imports
- IMPORTANT: Always check for existing components before creating new ones

## Surface Hierarchy

The design system uses a layered surface approach (darkest to lightest):

1. **Base** (`--surface` / `--background`): `#111126` — page background
2. **Container Low** (`--surface-container-low`): `#161630` — recessed areas
3. **Container** (`--surface-container`): `#1c1c38` — default card/panel background
4. **Container High** (`--surface-container-high`): `#232342` — inputs, elevated cards
5. **Container Highest** (`--surface-container-highest`): `#2a2a4c` — tooltips, dropdowns
6. **Bright** (`--surface-bright`): `#333358` — hover states on dark surfaces

## Asset Handling

- IMPORTANT: If the Figma MCP server returns a localhost source for an image or SVG, use that source directly
- IMPORTANT: DO NOT import/add new icon packages — all assets should come from the Figma payload or Material Symbols
- IMPORTANT: DO NOT use or create placeholders if a localhost source is provided
- Store downloaded image assets in `public/` directory

## Partial Updates

When updating an existing page or component from Figma:

- Read the existing code file first
- Identify what changed visually (spacing, colors, layout)
- Apply ONLY the delta — preserve all existing logic, event handlers, state, and API calls
- Do NOT overwrite the entire file for a visual tweak
