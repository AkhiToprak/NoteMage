/**
 * Cosmetics catalog — the single source of truth for every unlockable.
 *
 * Design notes:
 * - Kept in code (not in the DB) so adding a new entry is typed, git-diffable
 *   and requires zero migrations. `UserCosmetic.cosmeticId` references these
 *   slugs by convention, not via a foreign key.
 * - Renderers treat unknown slugs as no-ops, so removing entries is safe.
 * - Every entry has a stable `id`, a `type`, and a human `label`. The five
 *   baseline entries (`title.newcomer`, `font.default`, `color.default`,
 *   `frame.default`, `bg.default`) carry `isDefault: true` — they're always
 *   considered owned, even without a `UserCosmetic` row. Type-specific
 *   rendering data lives on each union member.
 *
 * To add a new unlockable:
 *   1. Add a typed entry below.
 *   2. If it needs a new frame/background component, add it to
 *      src/components/cosmetics/ and wire its `component` id into the
 *      resolver in <ProfileFrame> / <ProfileBackground>.
 *   3. No migration needed. No API change needed.
 */

export type CosmeticType = 'title' | 'nameFont' | 'nameColor' | 'frame' | 'background';

interface BaseCosmetic {
  id: string;
  type: CosmeticType;
  label: string;
  description?: string;
  /**
   * Baseline "no cosmetic" entries — the five sentinels users always have
   * (the starter title plus each type's `*.default`). When `true`, ownership
   * checks pass without a `UserCosmetic` row and the showcase hides the
   * entry (it's the baseline, nothing to celebrate).
   */
  isDefault?: boolean;
  /**
   * Grant-only entries. When `true`, the cosmetic is NEVER auto-unlocked by
   * any achievement; it only ever enters `UserCosmetic` via the admin
   * grant endpoint.
   *
   * The profile PUT validator requires a matching `UserCosmetic` row before
   * allowing equip. Admins who want to equip adminOnly items first grant
   * the row to themselves via POST /api/admin/users/:id/cosmetics.
   */
  adminOnly?: boolean;
}

export interface TitleCosmetic extends BaseCosmetic {
  type: 'title';
}

export interface NameFontCosmetic extends BaseCosmetic {
  type: 'nameFont';
  /** CSS `font-family` value. Use CSS vars for project fonts. */
  css: string;
}

export interface NameColorCosmetic extends BaseCosmetic {
  type: 'nameColor';
  /** CSS value to apply as the name's color or as `background` for gradients. */
  css: string;
  /** If true, css is a background-image and should be clipped to text. */
  gradient: boolean;
  /** Adds a subtle animation to the gradient. */
  animated?: boolean;
}

export interface FrameCosmetic extends BaseCosmetic {
  type: 'frame';
  /** React component id, resolved by <ProfileFrame>. */
  component: string;
  /** Arbitrary params passed to the component. */
  params?: Record<string, unknown>;
}

export interface BackgroundCosmetic extends BaseCosmetic {
  type: 'background';
  /** React component id, resolved by <ProfileBackground>. */
  component: string;
  params?: Record<string, unknown>;
}

export type Cosmetic =
  | TitleCosmetic
  | NameFontCosmetic
  | NameColorCosmetic
  | FrameCosmetic
  | BackgroundCosmetic;

// ---------------------------------------------------------------------------
// The catalog. Keep entries grouped by type and sorted alphabetically by label.
// ---------------------------------------------------------------------------

export const COSMETICS: Record<string, Cosmetic> = {
  // --- Titles -------------------------------------------------------------
  // Slugs are preserved (production data already references them by id) but
  // labels are rebranded to fit the Notemage arcane-scholar theme. Adding a
  // new title? Mint a new slug — do NOT rename an existing one or you'll
  // orphan every row in UserCosmetic that points at it.
  'title.newcomer': {
    id: 'title.newcomer',
    type: 'title',
    label: 'Noob',
    isDefault: true,
  },
  'title.apprentice': {
    id: 'title.apprentice',
    type: 'title',
    label: 'student',
  },
  'title.night-owl': {
    id: 'title.night-owl',
    type: 'title',
    label: 'scholar',
  },
  'title.flashcard-fiend': {
    id: 'title.flashcard-fiend',
    type: 'title',
    label: 'locked in',
  },
  'title.scholar': {
    id: 'title.scholar',
    type: 'title',
    label: 'mage',
  },
  'title.polymath': {
    id: 'title.polymath',
    type: 'title',
    label: 'Pro',
  },
  'title.archmage': {
    id: 'title.archmage',
    type: 'title',
    label: 'hacker',
  },
  // Phase 7 — personal learning-path rework achievement titles. Each is the
  // dedicated unlock for one of the six new achievements; keep slugs stable
  // even if labels are re-themed later.
  'title.perfectionist': {
    id: 'title.perfectionist',
    type: 'title',
    label: 'perfectionist',
  },
  'title.unstoppable': {
    id: 'title.unstoppable',
    type: 'title',
    label: 'unstoppable',
  },
  'title.pathfinder': {
    id: 'title.pathfinder',
    type: 'title',
    label: 'pathfinder',
  },
  'title.master': {
    id: 'title.master',
    type: 'title',
    label: 'master',
  },
  'title.ace': {
    id: 'title.ace',
    type: 'title',
    label: 'ace',
  },
  'title.comeback-kid': {
    id: 'title.comeback-kid',
    type: 'title',
    label: 'comeback kid',
  },
  // Admin-granted titles. The `adminOnly` flag blocks auto-unlocks.
  'title.og-noter': {
    id: 'title.og-noter',
    type: 'title',
    label: 'OG-Noter',
    description: 'Granted to early supporters by the team.',
    adminOnly: true,
  },
  'title.tester': {
    id: 'title.tester',
    type: 'title',
    label: 'Tester',
    description: 'Granted to pre-release beta testers.',
    adminOnly: true,
  },

  // --- Name fonts ---------------------------------------------------------
  // Each `css` value is the literal `font-family` string the browser will
  // see on the name span. Ordering matters: we want (next/font var, explicit
  // family name, generic fallback). The explicit family name is critical —
  // without it, any environment that strips the next/font var (SSR hiccup,
  // extension, pre-paint before the <link> lands) would collapse the font.
  'font.default': {
    id: 'font.default',
    type: 'nameFont',
    label: 'Default',
    css: 'inherit',
    isDefault: true,
  },
  'font.display': {
    id: 'font.display',
    type: 'nameFont',
    label: 'Epilogue',
    css: "var(--font-epilogue), 'Epilogue', serif",
  },
  'font.brand': {
    id: 'font.brand',
    type: 'nameFont',
    label: 'Oswald',
    css: "var(--font-oswald), 'Oswald', sans-serif",
  },
  'font.serif': {
    id: 'font.serif',
    type: 'nameFont',
    label: 'Playfair',
    css: "var(--font-playfair), 'Playfair Display', Georgia, serif",
  },
  'font.cinzel': {
    id: 'font.cinzel',
    type: 'nameFont',
    label: 'Cinzel',
    description: 'Roman inscriptions, reborn.',
    css: "var(--font-cinzel), 'Cinzel', serif",
  },
  'font.imfell': {
    id: 'font.imfell',
    type: 'nameFont',
    label: 'IM Fell',
    description: 'Weathered renaissance small-caps.',
    css: "var(--font-imfell), 'IM Fell English SC', serif",
  },
  'font.abril': {
    id: 'font.abril',
    type: 'nameFont',
    label: 'Abril',
    description: 'Editorial display slab.',
    css: "var(--font-abril), 'Abril Fatface', 'Playfair Display', serif",
  },
  'font.pacifico': {
    id: 'font.pacifico',
    type: 'nameFont',
    label: 'Pacifico',
    description: 'Retro handwritten script.',
    css: "var(--font-pacifico), 'Pacifico', cursive",
  },
  'font.marker': {
    id: 'font.marker',
    type: 'nameFont',
    label: 'Marker',
    description: 'Ink on whiteboard.',
    css: "var(--font-marker), 'Permanent Marker', cursive",
  },
  'font.medieval': {
    id: 'font.medieval',
    type: 'nameFont',
    label: 'Medieval',
    description: 'Illuminated-manuscript blackletter.',
    css: "var(--font-medieval), 'MedievalSharp', serif",
  },
  'font.mono': {
    id: 'font.mono',
    type: 'nameFont',
    label: 'JetBrains',
    css: "var(--font-jetbrains), 'JetBrains Mono', ui-monospace, monospace",
  },
  'font.orbitron': {
    id: 'font.orbitron',
    type: 'nameFont',
    label: 'Orbitron',
    description: 'Retro-futurist geometry.',
    css: "var(--font-orbitron), 'Orbitron', sans-serif",
  },
  'font.pressstart': {
    id: 'font.pressstart',
    type: 'nameFont',
    label: 'Press Start',
    description: 'Pixel arcade legend.',
    css: "var(--font-pressstart), 'Press Start 2P', 'Courier New', monospace",
  },
  'font.unifraktur': {
    id: 'font.unifraktur',
    type: 'nameFont',
    label: 'Fraktur',
    description: 'Forbidden grimoire gothic.',
    css: "var(--font-unifraktur), 'UnifrakturMaguntia', serif",
  },
  'font.bungee': {
    id: 'font.bungee',
    type: 'nameFont',
    label: 'Bungee',
    description: 'Dimensional marquee display.',
    css: "var(--font-bungee), 'Bungee Shade', Impact, sans-serif",
  },
  // Admin-only: chunky pixel block font reminiscent of a certain sandbox
  // game. Never auto-granted; only appears on accounts the admin has
  // specifically granted it to.
  'font.minecraft': {
    id: 'font.minecraft',
    type: 'nameFont',
    label: 'Minecraft',
    description: 'Chunky pixel block — admin-granted only.',
    css: "var(--font-minecraft), 'Silkscreen', 'Press Start 2P', monospace",
    adminOnly: true,
  },

  // --- Name colors --------------------------------------------------------
  'color.default': {
    id: 'color.default',
    type: 'nameColor',
    label: 'Default',
    css: 'inherit',
    gradient: false,
    isDefault: true,
  },
  'color.primary': {
    id: 'color.primary',
    type: 'nameColor',
    label: 'Primary',
    css: 'var(--primary)',
    gradient: false,
  },
  // --- Frames -------------------------------------------------------------
  'frame.default': {
    id: 'frame.default',
    type: 'frame',
    label: 'Default',
    component: 'none',
    isDefault: true,
  },
  'frame.glow-purple': {
    id: 'frame.glow-purple',
    type: 'frame',
    label: 'Purple Glow',
    component: 'FrameGlow',
    params: { hue: 270 },
  },
  'frame.glow-ember': {
    id: 'frame.glow-ember',
    type: 'frame',
    label: 'Ember Glow',
    component: 'FrameGlow',
    params: { hue: 20 },
  },
  'frame.glow-emerald': {
    id: 'frame.glow-emerald',
    type: 'frame',
    label: 'Emerald Glow',
    component: 'FrameGlow',
    params: { hue: 150 },
  },
  'frame.cosmic': {
    id: 'frame.cosmic',
    type: 'frame',
    label: 'Cosmic',
    component: 'FrameGlow',
    params: { hue: 210 },
  },
  'frame.pulse-rose': {
    id: 'frame.pulse-rose',
    type: 'frame',
    label: 'Rose Pulse',
    component: 'FramePulse',
    params: { hue: 330 },
  },
  'frame.pulse-aqua': {
    id: 'frame.pulse-aqua',
    type: 'frame',
    label: 'Aqua Pulse',
    component: 'FramePulse',
    params: { hue: 185 },
  },
  'frame.prism': {
    id: 'frame.prism',
    type: 'frame',
    label: 'Prism',
    component: 'FramePrism',
  },

  // --- Backgrounds --------------------------------------------------------
  'bg.default': {
    id: 'bg.default',
    type: 'background',
    label: 'Default',
    component: 'none',
    isDefault: true,
  },
  'bg.aurora-purple': {
    id: 'bg.aurora-purple',
    type: 'background',
    label: 'Purple Aurora',
    component: 'BackgroundAurora',
    params: { hue: 270 },
  },
  'bg.aurora-emerald': {
    id: 'bg.aurora-emerald',
    type: 'background',
    label: 'Emerald Aurora',
    component: 'BackgroundAurora',
    params: { hue: 150 },
  },
  'bg.aurora-sunset': {
    id: 'bg.aurora-sunset',
    type: 'background',
    label: 'Sunset Aurora',
    component: 'BackgroundAurora',
    params: { hue: 20 },
  },
  'bg.mesh': {
    id: 'bg.mesh',
    type: 'background',
    label: 'Mesh Grid',
    component: 'BackgroundMesh',
    params: { hue: 270 },
  },
  'bg.geometric-violet': {
    id: 'bg.geometric-violet',
    type: 'background',
    label: 'Violet Weave',
    component: 'BackgroundGeometric',
    params: { hue: 260 },
  },
  'bg.geometric-ember': {
    id: 'bg.geometric-ember',
    type: 'background',
    label: 'Ember Weave',
    component: 'BackgroundGeometric',
    params: { hue: 15 },
  },
  'bg.constellation': {
    id: 'bg.constellation',
    type: 'background',
    label: 'Constellation',
    component: 'BackgroundConstellation',
  },
};

// ---------------------------------------------------------------------------
// Helpers used across server + client. Pure functions, no DB access.
// ---------------------------------------------------------------------------

export type NameStyle = {
  fontId?: string;
  colorId?: string;
};

export function getCosmetic(id: string | null | undefined): Cosmetic | null {
  if (!id) return null;
  return COSMETICS[id] ?? null;
}

export function getCosmeticsByType<T extends CosmeticType>(
  type: T
): Extract<Cosmetic, { type: T }>[] {
  return Object.values(COSMETICS).filter(
    (c): c is Extract<Cosmetic, { type: T }> => c.type === type
  );
}

/** Shortcut used by admin UIs that want to list every grant-only entry. */
export function adminOnlyCosmetics(): Cosmetic[] {
  return Object.values(COSMETICS).filter((c) => c.adminOnly === true);
}
