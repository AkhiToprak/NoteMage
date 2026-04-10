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
 * through, etc.).
 *
 * Headings need special handling on two fronts:
 *
 *  1. `ToggleHeading` defines per-attribute `parseHTML` functions on
 *     `level`/`summary`/`collapsed` that only know how to read the
 *     `data-toggle-*` attributes on its own round-trip `div` form.
 *     They run AFTER the tag-level `getAttrs` in `parseHTML()` and
 *     silently override its return value with defaults when the
 *     pasted element is a raw `<h1>`-`<h3>` — every heading ends up
 *     as level 1 with an empty summary.
 *
 *  2. Marked's output is a flat sequence of block elements at the
 *     document root. If we just rename each heading to a toggle-
 *     heading div, the paragraphs/lists/tables beneath stay as
 *     siblings — the user sees empty toggles with all their content
 *     sitting loose outside them. Notion-style toggle headings need
 *     an outline TREE where each heading's section (all content up
 *     to the next heading of the same or shallower level) lives
 *     inside its toggle.
 *
 * So we walk marked's flat output, open a toggle-heading div for
 * every `<h1>`-`<h6>`, and attach subsequent non-heading blocks to
 * the deepest open toggle. A new heading of level N closes any open
 * toggles at level ≥ N (standard outline rules). `h4`-`h6` collapse
 * onto level 3 because ToggleHeading only defines three levels. Any
 * toggle left empty at the end gets a blank `<p></p>` to satisfy its
 * `block+` content spec.
 *
 * Browser-only: uses `document`. The only caller is the notebook
 * editor's `handlePaste`, which runs client-side.
 */
export function markdownToHtml(text: string): string {
  const raw = marked.parse(text, {
    gfm: true,
    breaks: false,
    async: false,
  }) as string;

  // Parse marked's output into a detachable container so we can walk
  // it as a DOM tree. We'll MOVE nodes out of this source into the
  // outline tree — snapshotting `.children` up front is important
  // because `.appendChild` on a new parent removes the node from here
  // and would shrink a live HTMLCollection mid-iteration.
  const source = document.createElement('div');
  source.innerHTML = raw;
  const topLevel = Array.from(source.children);

  const root = document.createElement('div');
  const stack: { level: number; el: HTMLElement }[] = [];

  for (const child of topLevel) {
    const headingMatch = /^H([1-6])$/.exec(child.tagName);

    if (headingMatch) {
      const rawLevel = Number(headingMatch[1]);
      // ToggleHeading only supports levels 1-3. Collapse deeper
      // markdown headings onto the deepest toggle level.
      const level = rawLevel > 3 ? 3 : rawLevel;
      const summary = (child.textContent || '').trim();

      // A new heading of level N ends every section at level ≥ N.
      while (stack.length > 0 && stack[stack.length - 1].level >= level) {
        stack.pop();
      }

      const toggle = document.createElement('div');
      toggle.setAttribute('data-toggle-level', String(level));
      toggle.setAttribute('data-toggle-summary', summary);
      toggle.setAttribute('data-collapsed', 'false');

      const parent = stack.length > 0 ? stack[stack.length - 1].el : root;
      parent.appendChild(toggle);
      stack.push({ level, el: toggle });
    } else {
      // Non-heading block — attach to the deepest open toggle, or
      // leave it at root if no toggle is open yet (e.g. an intro
      // paragraph pasted before the first heading).
      const parent = stack.length > 0 ? stack[stack.length - 1].el : root;
      parent.appendChild(child as HTMLElement);
    }
  }

  // Every toggle must have at least one block child (content spec is
  // `block+`). Any toggle still empty — typically a trailing heading
  // with no following content — gets a blank paragraph appended.
  const toggles = root.querySelectorAll<HTMLDivElement>(
    '[data-toggle-level]'
  );
  toggles.forEach((toggle) => {
    if (toggle.children.length === 0) {
      toggle.appendChild(document.createElement('p'));
    }
  });

  return root.innerHTML;
}
