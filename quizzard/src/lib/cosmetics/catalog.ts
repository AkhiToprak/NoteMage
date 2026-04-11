/**
 * Cosmetics catalog — the single source of truth for every unlockable.
 *
 * Design notes:
 * - Kept in code (not in the DB) so adding a new entry is typed, git-diffable
 *   and requires zero migrations. `UserCosmetic.cosmeticId` references these
 *   slugs by convention, not via a foreign key.
 * - Renderers treat unknown slugs as no-ops, so removing entries is safe.
 * - Every entry has a stable `id`, a `type`, a human `label`, and a
 *   `requiredLevel`. Type-specific rendering data lives on each union member.
 *
 * To add a new unlockable:
 *   1. Add a typed entry below.
 *   2. If it needs a new frame/background component, add it to
 *      src/components/cosmetics/ and wire its `component` id into the
 *      resolver in <ProfileFrame> / <ProfileBackground>.
 *   3. No migration needed. No API change needed.
 */

export type CosmeticType =
  | 'title'
  | 'nameFont'
  | 'nameColor'
  | 'frame'
  | 'background';

interface BaseCosmetic {
  id: string;
  type: CosmeticType;
  label: string;
  description?: string;
  requiredLevel: number;
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
// The catalog. Keep entries grouped by type and sorted by requiredLevel.
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
    label: 'Initiate',
    requiredLevel: 1,
  },
  'title.apprentice': {
    id: 'title.apprentice',
    type: 'title',
    label: 'Rune-Reader',
    requiredLevel: 3,
  },
  'title.night-owl': {
    id: 'title.night-owl',
    type: 'title',
    label: 'Moonlit Scribe',
    requiredLevel: 5,
  },
  'title.flashcard-fiend': {
    id: 'title.flashcard-fiend',
    type: 'title',
    label: 'Ink Alchemist',
    requiredLevel: 10,
  },
  'title.scholar': {
    id: 'title.scholar',
    type: 'title',
    label: 'Loremaster',
    requiredLevel: 15,
  },
  'title.polymath': {
    id: 'title.polymath',
    type: 'title',
    label: 'Grand Sage',
    requiredLevel: 20,
  },
  'title.archmage': {
    id: 'title.archmage',
    type: 'title',
    label: 'Archmage',
    requiredLevel: 30,
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
    requiredLevel: 1,
  },
  'font.display': {
    id: 'font.display',
    type: 'nameFont',
    label: 'Epilogue',
    css: "var(--font-epilogue), 'Epilogue', serif",
    requiredLevel: 3,
  },
  'font.brand': {
    id: 'font.brand',
    type: 'nameFont',
    label: 'Oswald',
    css: "var(--font-oswald), 'Oswald', sans-serif",
    requiredLevel: 6,
  },
  'font.serif': {
    id: 'font.serif',
    type: 'nameFont',
    label: 'Playfair',
    css: "var(--font-playfair), 'Playfair Display', Georgia, serif",
    requiredLevel: 8,
  },
  'font.cinzel': {
    id: 'font.cinzel',
    type: 'nameFont',
    label: 'Cinzel',
    description: 'Roman inscriptions, reborn.',
    css: "var(--font-cinzel), 'Cinzel', serif",
    requiredLevel: 9,
  },
  'font.imfell': {
    id: 'font.imfell',
    type: 'nameFont',
    label: 'IM Fell',
    description: 'Weathered renaissance small-caps.',
    css: "var(--font-imfell), 'IM Fell English SC', serif",
    requiredLevel: 11,
  },
  'font.abril': {
    id: 'font.abril',
    type: 'nameFont',
    label: 'Abril',
    description: 'Editorial display slab.',
    css: "var(--font-abril), 'Abril Fatface', 'Playfair Display', serif",
    requiredLevel: 13,
  },
  'font.pacifico': {
    id: 'font.pacifico',
    type: 'nameFont',
    label: 'Pacifico',
    description: 'Retro handwritten script.',
    css: "var(--font-pacifico), 'Pacifico', cursive",
    requiredLevel: 14,
  },
  'font.marker': {
    id: 'font.marker',
    type: 'nameFont',
    label: 'Marker',
    description: 'Ink on whiteboard.',
    css: "var(--font-marker), 'Permanent Marker', cursive",
    requiredLevel: 15,
  },
  'font.medieval': {
    id: 'font.medieval',
    type: 'nameFont',
    label: 'Medieval',
    description: 'Illuminated-manuscript blackletter.',
    css: "var(--font-medieval), 'MedievalSharp', serif",
    requiredLevel: 16,
  },
  'font.mono': {
    id: 'font.mono',
    type: 'nameFont',
    label: 'JetBrains',
    css: "var(--font-jetbrains), 'JetBrains Mono', ui-monospace, monospace",
    requiredLevel: 18,
  },
  'font.orbitron': {
    id: 'font.orbitron',
    type: 'nameFont',
    label: 'Orbitron',
    description: 'Retro-futurist geometry.',
    css: "var(--font-orbitron), 'Orbitron', sans-serif",
    requiredLevel: 19,
  },
  'font.pressstart': {
    id: 'font.pressstart',
    type: 'nameFont',
    label: 'Press Start',
    description: 'Pixel arcade legend.',
    css: "var(--font-pressstart), 'Press Start 2P', 'Courier New', monospace",
    requiredLevel: 21,
  },
  'font.unifraktur': {
    id: 'font.unifraktur',
    type: 'nameFont',
    label: 'Fraktur',
    description: 'Forbidden grimoire gothic.',
    css: "var(--font-unifraktur), 'UnifrakturMaguntia', serif",
    requiredLevel: 23,
  },
  'font.bungee': {
    id: 'font.bungee',
    type: 'nameFont',
    label: 'Bungee',
    description: 'Dimensional marquee display.',
    css: "var(--font-bungee), 'Bungee Shade', Impact, sans-serif",
    requiredLevel: 26,
  },

  // --- Name colors --------------------------------------------------------
  'color.default': {
    id: 'color.default',
    type: 'nameColor',
    label: 'Default',
    css: 'inherit',
    gradient: false,
    requiredLevel: 1,
  },
  'color.primary': {
    id: 'color.primary',
    type: 'nameColor',
    label: 'Primary',
    css: 'var(--primary)',
    gradient: false,
    requiredLevel: 2,
  },
  'color.aurora': {
    id: 'color.aurora',
    type: 'nameColor',
    label: 'Aurora',
    css: 'linear-gradient(90deg, #ae89ff, #b9c3ff)',
    gradient: true,
    requiredLevel: 4,
  },
  'color.ember': {
    id: 'color.ember',
    type: 'nameColor',
    label: 'Ember',
    css: 'linear-gradient(90deg, #ffb86b, #ff6f85)',
    gradient: true,
    requiredLevel: 7,
  },
  'color.emerald': {
    id: 'color.emerald',
    type: 'nameColor',
    label: 'Emerald',
    css: 'linear-gradient(90deg, #5ff0a6, #6be7d8)',
    gradient: true,
    requiredLevel: 11,
  },
  'color.sunset': {
    id: 'color.sunset',
    type: 'nameColor',
    label: 'Sunset',
    css: 'linear-gradient(90deg, #ff9566, #ff5fa2, #c46bff)',
    gradient: true,
    requiredLevel: 16,
  },
  'color.rose-gold': {
    id: 'color.rose-gold',
    type: 'nameColor',
    label: 'Rose Gold',
    css: 'linear-gradient(90deg, #ffd7c2, #ffae8c, #f28aa0)',
    gradient: true,
    requiredLevel: 22,
  },
  'color.obsidian': {
    id: 'color.obsidian',
    type: 'nameColor',
    label: 'Obsidian',
    css: 'linear-gradient(90deg, #4a4a6b, #e5e3ff, #4a4a6b)',
    gradient: true,
    requiredLevel: 28,
  },

  // --- Frames -------------------------------------------------------------
  'frame.default': {
    id: 'frame.default',
    type: 'frame',
    label: 'Default',
    component: 'none',
    requiredLevel: 1,
  },
  'frame.glow-purple': {
    id: 'frame.glow-purple',
    type: 'frame',
    label: 'Purple Glow',
    component: 'FrameGlow',
    params: { hue: 270 },
    requiredLevel: 6,
  },
  'frame.glow-ember': {
    id: 'frame.glow-ember',
    type: 'frame',
    label: 'Ember Glow',
    component: 'FrameGlow',
    params: { hue: 20 },
    requiredLevel: 9,
  },
  'frame.glow-emerald': {
    id: 'frame.glow-emerald',
    type: 'frame',
    label: 'Emerald Glow',
    component: 'FrameGlow',
    params: { hue: 150 },
    requiredLevel: 14,
  },
  'frame.cosmic': {
    id: 'frame.cosmic',
    type: 'frame',
    label: 'Cosmic',
    component: 'FrameGlow',
    params: { hue: 210 },
    requiredLevel: 20,
  },
  'frame.pulse-rose': {
    id: 'frame.pulse-rose',
    type: 'frame',
    label: 'Rose Pulse',
    component: 'FramePulse',
    params: { hue: 330 },
    requiredLevel: 17,
  },
  'frame.pulse-aqua': {
    id: 'frame.pulse-aqua',
    type: 'frame',
    label: 'Aqua Pulse',
    component: 'FramePulse',
    params: { hue: 185 },
    requiredLevel: 22,
  },
  'frame.prism': {
    id: 'frame.prism',
    type: 'frame',
    label: 'Prism',
    component: 'FramePrism',
    requiredLevel: 25,
  },

  // --- Backgrounds --------------------------------------------------------
  'bg.default': {
    id: 'bg.default',
    type: 'background',
    label: 'Default',
    component: 'none',
    requiredLevel: 1,
  },
  'bg.aurora-purple': {
    id: 'bg.aurora-purple',
    type: 'background',
    label: 'Purple Aurora',
    component: 'BackgroundAurora',
    params: { hue: 270 },
    requiredLevel: 2,
  },
  'bg.aurora-emerald': {
    id: 'bg.aurora-emerald',
    type: 'background',
    label: 'Emerald Aurora',
    component: 'BackgroundAurora',
    params: { hue: 150 },
    requiredLevel: 5,
  },
  'bg.aurora-sunset': {
    id: 'bg.aurora-sunset',
    type: 'background',
    label: 'Sunset Aurora',
    component: 'BackgroundAurora',
    params: { hue: 20 },
    requiredLevel: 8,
  },
  'bg.mesh': {
    id: 'bg.mesh',
    type: 'background',
    label: 'Mesh Grid',
    component: 'BackgroundMesh',
    params: { hue: 270 },
    requiredLevel: 13,
  },
  'bg.geometric-violet': {
    id: 'bg.geometric-violet',
    type: 'background',
    label: 'Violet Weave',
    component: 'BackgroundGeometric',
    params: { hue: 260 },
    requiredLevel: 10,
  },
  'bg.geometric-ember': {
    id: 'bg.geometric-ember',
    type: 'background',
    label: 'Ember Weave',
    component: 'BackgroundGeometric',
    params: { hue: 15 },
    requiredLevel: 18,
  },
  'bg.constellation': {
    id: 'bg.constellation',
    type: 'background',
    label: 'Constellation',
    component: 'BackgroundConstellation',
    requiredLevel: 24,
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

/**
 * Returns every catalog entry the user is eligible for at the given level,
 * regardless of whether they've already unlocked it. Used by the unlock
 * checker to diff against existing UserCosmetic rows.
 */
export function eligibleCosmeticIds(level: number): string[] {
  return Object.values(COSMETICS)
    .filter((c) => c.requiredLevel <= level)
    .map((c) => c.id);
}
