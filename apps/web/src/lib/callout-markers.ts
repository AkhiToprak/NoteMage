/**
 * GitHub-style admonition markers (`> [!TIP]`, `> [!WARNING]`, …) — the
 * markdown syntax AI surfaces use to express callouts.
 *
 * Shared by:
 *   - src/lib/markdown-to-html.ts   (markdown → editor Callout nodes)
 *   - src/components/ui/MarkdownRenderer.tsx (chat bubbles + inline-AI preview)
 *
 * Deliberately dependency-free so chat surfaces don't pull @tiptap/* into
 * their bundle. The type union and the visual values below MUST stay in sync
 * with `CalloutType` / `CALLOUT_STYLES` in src/lib/tiptap-callout.ts (the
 * same sync rule CalloutView.tsx already follows for its icon names).
 */

export type CalloutMarkerType = 'info' | 'warning' | 'success' | 'tip' | 'danger' | 'note';

/**
 * Marker word → editor callout type. Name-identical markers map to their own
 * type; the rest are aliases models reach for because GitHub uses them
 * (NOTE / IMPORTANT / CAUTION). Unknown markers fall back to `info` at the
 * call sites so a stray `[!FOO]` still renders as a callout rather than
 * literal text.
 */
export const CALLOUT_TYPE_BY_MARKER: Record<string, CalloutMarkerType> = {
  info: 'info',
  note: 'note',
  tip: 'tip',
  hint: 'tip',
  important: 'note',
  warning: 'warning',
  caution: 'warning',
  attention: 'warning',
  danger: 'danger',
  error: 'danger',
  success: 'success',
  check: 'success',
  done: 'success',
  ok: 'success',
};

/**
 * Visual metadata for rendering admonitions OUTSIDE the editor (chat bubbles,
 * inline-AI preview). `icon` is a Material Symbols Outlined name; colors
 * mirror CALLOUT_STYLES so a previewed callout looks like its in-editor twin.
 */
export const CALLOUT_RENDER_META: Record<
  CalloutMarkerType,
  { icon: string; borderColor: string; bgColor: string; label: string }
> = {
  info: {
    icon: 'info',
    borderColor: 'rgba(81,112,255,0.6)',
    bgColor: 'rgba(81,112,255,0.08)',
    label: 'Info',
  },
  warning: {
    icon: 'warning',
    borderColor: 'rgba(249,115,22,0.6)',
    bgColor: 'rgba(249,115,22,0.08)',
    label: 'Warning',
  },
  success: {
    icon: 'check_circle',
    borderColor: 'rgba(34,197,94,0.6)',
    bgColor: 'rgba(34,197,94,0.08)',
    label: 'Success',
  },
  tip: {
    icon: 'lightbulb',
    borderColor: 'rgba(140,82,255,0.6)',
    bgColor: 'rgba(140,82,255,0.08)',
    label: 'Tip',
  },
  danger: {
    icon: 'dangerous',
    borderColor: 'rgba(253,111,133,0.6)',
    bgColor: 'rgba(253,111,133,0.08)',
    label: 'Danger',
  },
  note: {
    icon: 'sticky_note_2',
    borderColor: 'rgba(174,137,255,0.6)',
    bgColor: 'rgba(174,137,255,0.08)',
    label: 'Note',
  },
};

/** Matches a leading admonition marker: `[!TIP]`, `[!warning]`, … */
export const ADMONITION_MARKER_RE = /^\s*\[!(\w+)\]\s*/;
