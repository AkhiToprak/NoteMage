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
import { CALLOUT_TYPE_BY_MARKER } from './callout-markers';

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
  // Fenced code block. Backticks only and at most 3 spaces of indent (the
  // CommonMark fence maximum) — a deeper-indented run is indented-code
  // CONTENT, and tilde runs are too often decorative separators in pasted
  // notes to be a safe signal on their own (an unclosed ~~~ fence would
  // swallow all following prose into one code block).
  /^\s{0,3}```/m,
  /^\s{0,3}``(?!`)[A-Za-z][\w+#.-]*\s*$/m, // malformed two-backtick fence + language (repairable)
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
 * A malformed OPENING fence: exactly two backticks followed by a language
 * token, alone on a line (`` ``python ``). Exactly-two only — a single
 * backtick + word is far more likely an unclosed inline-code typo than a
 * fence, and mis-promoting prose into a fence is worse than leaving a
 * malformed fence alone. Indent capped at the CommonMark fence maximum
 * (3 spaces) so lines inside indented code blocks are never touched.
 */
const MALFORMED_OPENER = /^(\s{0,3})``(?!`)([A-Za-z][\w+#.-]*)\s*$/;
/** A malformed CLOSING fence: one or two backticks alone on a line. */
const MALFORMED_CLOSER = /^(\s{0,3})`{1,2}(?!`)\s*$/;

/**
 * Parse a well-formed CommonMark fence line: 3+ backticks or tildes at ≤3
 * spaces of indent. Returns the fence character, run length, and info string
 * (the language tag) so callers can apply real fence-MATCHING rules — a
 * closer must use the same character, be at least as long as the opener, and
 * carry no info string. A backtick fence whose info string contains a
 * backtick is not a fence at all (e.g. "```ls -la``` lists files" is an
 * inline code span, not a fence line).
 */
function parseFenceLine(line: string): { char: '`' | '~'; len: number; info: string } | null {
  const m = line.match(/^\s{0,3}(`{3,}|~{3,})(.*)$/);
  if (!m) return null;
  const char = m[1][0] as '`' | '~';
  const info = m[2].trim();
  if (char === '`' && info.includes('`')) return null;
  return { char, len: m[1].length, info };
}

/**
 * Repair malformed code fences before parsing.
 *
 * Small models occasionally flub fence syntax — emitting `` ``python `` for
 * the opening fence or a bare `` `` `` as the closer. `marked` doesn't
 * recognise those, so the intended code block degrades into mangled
 * paragraphs. Repairs are deliberately conservative and PAIRWISE: a
 * two-backtick opener is promoted based on the first fence-ish line that
 * follows it —
 *
 *   - a malformed closer → both ends are promoted together;
 *   - a bare proper fence (no language tag) → only the opener is promoted,
 *     that line already closes it;
 *   - a proper fence WITH a language tag is another block's opener → the
 *     malformed line is left alone rather than hijacking the valid block.
 *
 * Inside a properly opened fence, a short backtick closer is promoted only
 * when no matching proper closer exists later, so backtick runs that are
 * legitimate code CONTENT inside a closed block are never touched.
 * Four-plus-backtick fences are valid CommonMark (used to nest ``` inside a
 * block); the matching rules in parseFenceLine keep them intact.
 */
function repairCodeFences(text: string): string {
  if (!text.includes('`')) return text;
  const lines = text.split(/\r\n?|\n/);
  let open: { char: '`' | '~'; len: number } | null = null;
  let repaired = false;

  const closes = (line: string, fence: { char: string; len: number }): boolean => {
    const f = parseFenceLine(line);
    return f !== null && f.char === fence.char && f.len >= fence.len && f.info === '';
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fence = parseFenceLine(line);
    if (fence) {
      if (!open) {
        open = { char: fence.char, len: fence.len };
      } else if (closes(line, open)) {
        open = null;
      }
      // A non-matching fence-looking line inside an open fence is content.
      continue;
    }

    if (!open) {
      const o = line.match(MALFORMED_OPENER);
      if (!o) continue;
      for (let j = i + 1; j < lines.length; j++) {
        const f = parseFenceLine(lines[j]);
        if (f) {
          if (f.info === '') {
            lines[i] = `${o[1]}\`\`\`${o[2]}`;
            open = { char: '`', len: 3 };
            repaired = true;
          }
          break;
        }
        const c = lines[j].match(MALFORMED_CLOSER);
        if (c) {
          lines[i] = `${o[1]}\`\`\`${o[2]}`;
          lines[j] = `${c[1]}\`\`\``;
          i = j; // the pair is settled; continue after the closer
          repaired = true;
          break;
        }
        if (MALFORMED_OPENER.test(lines[j])) break; // ambiguous — leave both
      }
      continue;
    }

    // Inside an open backtick fence: promote a short closer only when the
    // fence is otherwise left unclosed.
    const c = line.match(MALFORMED_CLOSER);
    if (c && open.char === '`' && !lines.slice(i + 1).some((l) => closes(l, open!))) {
      lines[i] = `${c[1]}${'`'.repeat(Math.max(3, open.len))}`;
      open = null;
      repaired = true;
    }
  }
  return repaired ? lines.join('\n') : text;
}

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
  const raw = marked.parse(splitSoftProseLines(repairCodeFences(text)), {
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
