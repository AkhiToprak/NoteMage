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
 * care about (StarterKit `Heading`/list/bold/italic/blockquote/hr,
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
 * StarterKit's `Heading.parseHTML` only matches `<h1>`, `<h2>`, and `<h3>`
 * (levels are clamped to 1-3). Anything deeper that `marked` produces would
 * be silently dropped by TipTap — so we demote `<h4>`/`<h5>`/`<h6>` down to
 * `<h3>` before handing the HTML off. Users keep the hierarchy they can,
 * deeper levels collapse onto the deepest heading level.
 */

import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

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
 * Lines that carry markdown structure — a single newline next to one of these
 * is significant and must be preserved (lists, tables, code, quotes, headings,
 * indented code, fence markers, blank lines).
 */
const STRUCTURAL_LINE: readonly RegExp[] = [
  /^\s*#{1,6}\s/, // heading
  /^\s*[-*+]\s/, // unordered list item
  /^\s*\d+[.)]\s/, // ordered list item
  /^\s*>/, // blockquote
  /^\s*$/, // blank line
  /^\s*(```|~~~)/, // code fence marker
  /^(\t| {4,})/, // indented code
  /^(\s*[-*_]){3,}\s*$/, // horizontal rule
  /\|/, // table-ish row (contains a pipe)
];

function isStructuralLine(line: string): boolean {
  return STRUCTURAL_LINE.some((re) => re.test(line));
}

/**
 * Promote soft-wrapped prose into separate paragraphs.
 *
 * Note-takers paste text where each line is its own thought, separated by a
 * single newline. Markdown treats a lone newline as a soft wrap, so `marked`
 * merges those lines into ONE paragraph — the "everything ends up as one
 * block" complaint. Here we insert a blank line between two adjacent *plain
 * prose* lines (turning the soft wrap into a real paragraph break), while
 * leaving structural markdown — lists, tables, fenced/indented code,
 * blockquotes, headings — untouched so it still parses correctly.
 */
function splitSoftProseLines(text: string): string {
  const lines = text.split(/\r\n?|\n/);
  let out = '';
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    out += line;
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    if (i === lines.length - 1) break;
    const next = lines[i + 1];
    const bothPlain =
      !inFence && line.trim() !== '' && !isStructuralLine(line) && !isStructuralLine(next);
    out += bothPlain ? '\n\n' : '\n';
  }
  return out;
}

/**
 * Maps GitHub-style admonition markers (`[!TIP]`, `[!WARNING]`, …) onto the
 * four Callout types the editor supports. Keep the value set in sync with
 * `CalloutType` in `src/lib/tiptap-callout.ts`. Unknown markers fall back to
 * `info` so a stray `[!FOO]` still renders as a callout rather than literal
 * text. The vocabulary is deliberately generous — models trained on GitHub
 * reach for NOTE / IMPORTANT / CAUTION, so we accept those aliases too.
 */
const CALLOUT_TYPE_BY_MARKER: Record<string, 'info' | 'warning' | 'success' | 'tip'> = {
  note: 'info',
  info: 'info',
  tip: 'tip',
  hint: 'tip',
  important: 'tip',
  warning: 'warning',
  caution: 'warning',
  danger: 'warning',
  attention: 'warning',
  success: 'success',
  check: 'success',
  done: 'success',
  ok: 'success',
};

/**
 * Rewrite `marked`'s blockquote HTML into Callout nodes when the blockquote
 * opens with a GitHub-style admonition marker.
 *
 * `marked` doesn't understand admonitions, so `> [!TIP]\n> body` comes out as
 * a plain `<blockquote><p>[!TIP]\nbody</p></blockquote>`. The Callout extension
 * (src/lib/tiptap-callout.ts) only parses `<div data-callout-type="…">`, so we
 * translate the marked output here. Two shapes occur in practice:
 *
 *   (a) marker shares the first paragraph with its body:
 *       `<blockquote><p>[!TIP]\nbody</p></blockquote>`
 *   (b) marker sits alone in its own paragraph:
 *       `<blockquote><p>[!NOTE]</p><p>body</p></blockquote>`
 *
 * Blockquotes without a leading marker are left untouched so ordinary quotes
 * keep rendering as blockquotes.
 */
function admonitionsToCallouts(html: string): string {
  return html.replace(/<blockquote>\s*([\s\S]*?)\s*<\/blockquote>/g, (match, inner: string) => {
    const marker = inner.match(/^<p>\s*\[!(\w+)\]/i);
    if (!marker) return match;
    const type = CALLOUT_TYPE_BY_MARKER[marker[1].toLowerCase()] ?? 'info';

    let body = inner
      // (a) drop the "[!TYPE]" marker plus the soft-wrap newline after it,
      // keeping the rest of the opening paragraph intact.
      .replace(/^<p>\s*\[!\w+\][^\S\n]*\n?/i, '<p>')
      // (b) if the marker was alone, that left an empty "<p></p>" — remove it.
      .replace(/^<p>\s*<\/p>\s*/i, '')
      .trim();

    // A callout requires `block+` content; never emit an empty one.
    if (!body) body = '<p></p>';
    return `<div data-callout-type="${type}">${body}</div>`;
  });
}

/**
 * Convert markdown source to an HTML string suitable for TipTap's
 * HTML-paste pipeline. Uses `marked` with GFM enabled (tables, strike-
 * through, etc.).
 *
 * Heading handling: StarterKit's standard `Heading` extension parses
 * raw `<h1>`/`<h2>`/`<h3>` tags directly (level read from the tag name,
 * inner inline markup kept as the heading's content), so we leave those
 * tags untouched. The only fix-up is depth: `marked` can emit
 * `<h4>`-`<h6>`, which `Heading` doesn't recognise and would silently
 * drop, so we demote each of those down to `<h3>` while preserving the
 * inner text. Users keep the hierarchy they can; deeper levels collapse
 * onto level 3.
 */
export function markdownToHtml(text: string): string {
  const raw = marked.parse(splitSoftProseLines(text), {
    gfm: true,
    breaks: false,
    async: false,
  }) as string;

  // Clamp <h4>-<h6> down to <h3>; keep the inner inline content intact so the
  // standard Heading extension picks it up as the heading's text. <h1>-<h3>
  // pass through unchanged.
  const headingFixed = raw.replace(
    /<h([4-6])>([\s\S]*?)<\/h\1>/g,
    (_match, _levelStr: string, inner: string) => `<h3>${inner}</h3>`
  );

  // Promote GitHub-style admonition blockquotes into real Callout nodes.
  const rewritten = admonitionsToCallouts(headingFixed);

  // Defense-in-depth: `marked` does NOT sanitize, so its output can carry raw
  // <script>/<img onerror> when the pasted plain text contained HTML. The
  // current consumer (a detached <div> → ProseMirror parseSlice) makes that
  // non-exploitable, but sanitizing keeps this helper safe for any future
  // caller. DOMPurify's defaults preserve the heading tags and GFM <table>
  // structure the paste pipeline relies on.
  return DOMPurify.sanitize(rewritten);
}
