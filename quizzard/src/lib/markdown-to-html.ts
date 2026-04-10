/**
 * Markdown-paste support for the notebook editor.
 *
 * Context: TipTap's default clipboard pipeline handles `text/html` via each
 * extension's `parseHTML()` method, but it does nothing with raw markdown
 * syntax. When a user pastes plain-text markdown (e.g. copied from a study
 * guide, terminal, or "copy as markdown" in another app), the literal `#`,
 * `*`, `|`, and `-` characters end up stuck in the document because no
 * extension understands them.
 *
 * The fix is to run pasted plain text through `marked` to produce HTML, then
 * let the existing HTML-paste pipeline do its job. All of the extensions we
 * care about (`ToggleHeading`, StarterKit list/bold/italic/blockquote/hr,
 * `CodeBlockLowlight`, `Table`) already have `parseHTML` rules — we just
 * have to give them HTML to chew on.
 *
 * Two invariants this file relies on:
 *
 *   1. We only run on pure `text/plain` clipboard content. If the clipboard
 *      has `text/html`, a richer pipeline already produced proper markup
 *      and we must not touch it (doing so would strip formatting from a
 *      Google Docs / Notion / web-page paste).
 *
 *   2. The heuristic is deliberately biased toward false-positives. The
 *      failure mode of "converted a paragraph that happened to contain
 *      **bold**" is a minor cosmetic surprise; the failure mode of "raw `#`
 *      characters stuck in the doc forever" is the exact bug we're fixing.
 *      When in doubt, convert.
 *
 * `ToggleHeading.parseHTML` (src/lib/tiptap-toggle-heading.ts:87-99) only
 * matches `<h1>`, `<h2>`, and `<h3>`. Anything deeper that `marked` produces
 * would be silently dropped by TipTap — so we demote `<h4>`/`<h5>`/`<h6>`
 * down to `<h3>` before handing the HTML off. Users keep the hierarchy they
 * can, deeper levels collapse onto the deepest toggle-heading level.
 */

import { marked } from 'marked';

/**
 * Block-level markdown signals. Any single match is enough to treat the
 * pasted text as markdown — these patterns are unambiguous and don't
 * appear in natural prose.
 */
const BLOCK_PATTERNS: readonly RegExp[] = [
  /^#{1,6}\s/m, // ATX heading ("# ", "## ", ...)
  /^[-*+]\s/m, // unordered list item
  /^\d+\.\s/m, // ordered list item
  /^>\s/m, // blockquote
  /^```/m, // fenced code block (opening fence)
  /^([-*_]\s*){3,}\s*$/m, // horizontal rule ("---", "***", "___")
  /^\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)+\|?$/m, // GFM table separator row
];

/**
 * Inline markdown signals. These DO show up in normal prose (a parenthetical
 * URL, a `code` reference, a **bold** word), so we require at least TWO
 * distinct matches before treating the paste as markdown.
 */
const INLINE_PATTERNS: readonly RegExp[] = [
  /\*\*[^*\n]+\*\*/, // bold: **foo**
  /`[^`\n]+`/, // inline code: `foo`
  /\[[^\]]+\]\([^)]+\)/, // link: [text](url)
];

/**
 * Conservative markdown detection. Returns `true` if the text looks
 * structured enough to be worth parsing. Called only on `text/plain`
 * clipboard content.
 */
export function looksLikeMarkdown(text: string): boolean {
  if (!text) return false;

  // Any single block-level signal is enough.
  for (const pattern of BLOCK_PATTERNS) {
    if (pattern.test(text)) return true;
  }

  // Otherwise we need at least two distinct inline signals.
  let inlineHits = 0;
  for (const pattern of INLINE_PATTERNS) {
    if (pattern.test(text)) inlineHits++;
    if (inlineHits >= 2) return true;
  }

  return false;
}

/**
 * Convert markdown source to an HTML string suitable for TipTap's
 * HTML-paste pipeline. Uses `marked` with GFM enabled (tables, strike-
 * through). Demotes `<h4>`-`<h6>` → `<h3>` because `ToggleHeading` only
 * parses the top three levels (see src/lib/tiptap-toggle-heading.ts:91-98).
 */
export function markdownToHtml(text: string): string {
  const html = marked.parse(text, {
    gfm: true,
    breaks: false,
    async: false,
  }) as string;

  return html.replace(/<(\/?)h[456]([\s>])/g, '<$1h3$2');
}
