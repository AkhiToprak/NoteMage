/**
 * Converts plain text and HTML to TipTap JSON document format.
 * Used when importing files (PDF, DOCX, TXT, MD) as notebook pages.
 */

export interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface TipTapTextNode {
  type: 'text';
  text: string;
  marks?: TipTapMark[];
}

export interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: (TipTapNode | TipTapTextNode)[];
  marks?: TipTapMark[];
  text?: string;
}

export interface TipTapDoc {
  type: 'doc';
  content: TipTapNode[];
}

/**
 * Extract plain text from a TipTap JSON document.
 * Recursively walks the node tree and collects all text content.
 * Returns null if the document is empty or invalid.
 */
export function tiptapJsonToPlainText(doc: unknown): string | null {
  if (!doc || typeof doc !== 'object') return null;
  const d = doc as Record<string, unknown>;
  if (d.type !== 'doc' || !Array.isArray(d.content)) return null;

  const parts: string[] = [];

  function walk(nodes: unknown[]): void {
    for (const node of nodes) {
      if (!node || typeof node !== 'object') continue;
      const n = node as Record<string, unknown>;

      // Text node
      if (n.type === 'text' && typeof n.text === 'string') {
        parts.push(n.text);
        continue;
      }

      // toggleHeading stores visible text in attrs.summary
      if (
        n.type === 'toggleHeading' &&
        n.attrs &&
        typeof (n.attrs as Record<string, unknown>).summary === 'string'
      ) {
        parts.push((n.attrs as Record<string, unknown>).summary as string);
        parts.push('\n');
      }

      // Recurse into children
      if (Array.isArray(n.content)) {
        walk(n.content);
      }

      // Add newline after block-level nodes
      const blockTypes = [
        'paragraph',
        'heading',
        'toggleHeading',
        'blockquote',
        'listItem',
        'codeBlock',
        'callout',
        'tableRow',
      ];
      if (typeof n.type === 'string' && blockTypes.includes(n.type)) {
        parts.push('\n');
      }
    }
  }

  walk(d.content as unknown[]);

  const result = parts
    .join('')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return result || null;
}

/**
 * Convert plain text to TipTap JSON document format.
 * Splits on double newlines to create paragraphs.
 */
export function textToTipTapJSON(text: string): TipTapDoc {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);

  if (paragraphs.length === 0) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    };
  }

  return {
    type: 'doc',
    content: paragraphs.map((p) => ({
      type: 'paragraph' as const,
      content: [{ type: 'text' as const, text: p.trim() }],
    })),
  };
}

/**
 * Heuristically detect whether a single line looks like a heading.
 * Used by the PDF converter — PDFs don't carry semantic structure so we
 * rely on short, visually distinct lines (all-caps, chapter-style numbering,
 * title-case-only) to reconstruct a basic outline.
 */
function isLikelyHeading(line: string): { isHeading: boolean; level: 1 | 2 | 3 } {
  const trimmed = line.trim();
  if (trimmed.length === 0 || trimmed.length > 100) return { isHeading: false, level: 1 };
  // Too much punctuation looks like prose, not a heading
  if (/[.!?;:]{1}.{3,}[.!?;:]/.test(trimmed)) return { isHeading: false, level: 1 };
  // Ends with a sentence-ending period followed by nothing → usually a sentence
  if (/[a-z]\.$/.test(trimmed)) return { isHeading: false, level: 1 };

  // Chapter / Section patterns
  if (/^(chapter|kapitel|section|part|teil)\s+[ivxlcdm\d]+/i.test(trimmed)) {
    return { isHeading: true, level: 1 };
  }
  // Numbered headings: "1.", "1.1", "1.1.1"
  const numMatch = trimmed.match(/^(\d+)(\.\d+){0,2}\.?\s+\S/);
  if (numMatch && trimmed.length <= 80) {
    const dots = (numMatch[0].match(/\./g) || []).length;
    const level = Math.min(3, Math.max(1, dots)) as 1 | 2 | 3;
    return { isHeading: true, level };
  }
  // All caps, short
  const letters = trimmed.replace(/[^A-Za-zÄÖÜäöüß]/g, '');
  if (letters.length >= 3 && letters === letters.toUpperCase() && trimmed.length <= 80) {
    return { isHeading: true, level: 2 };
  }
  return { isHeading: false, level: 1 };
}

/**
 * Strip obvious page-chrome artefacts from a block of PDF text:
 * footer page-number patterns ("Seite 1/2", "Page 3 of 8") and bare
 * integer page numbers that sit alone on a line.
 */
function stripPageChrome(text: string): string {
  return text
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      if (!t) return true;
      if (/^seite\s+\d+\s*\/\s*\d+$/i.test(t)) return false;
      if (/^page\s+\d+(\s*(of|\/)\s*\d+)?$/i.test(t)) return false;
      if (/^\d{1,3}$/.test(t)) return false;
      return true;
    })
    .join('\n');
}

/**
 * Detect the bullet glyphs that pdfjs emits for list items. PDF bullet
 * lists usually render as "•", "●", "◦", "▪", "-", or "*".
 */
const BULLET_RE = /^\s*([•●◦▪○■□◆▸▶►-])\s+/;

function splitInlineBullets(paragraph: string): string[] {
  // When lines are merged, bullets end up inline: "• item1 • item2 • item3".
  // Split on a bullet glyph that has at least one space on each side so we
  // don't eat hyphens or mid-word punctuation.
  if (!/\s[•●◦▪○■□◆▸▶►]\s/.test(paragraph) && !BULLET_RE.test(paragraph)) {
    return [paragraph];
  }
  const parts = paragraph.split(/\s+[•●◦▪○■□◆▸▶►]\s+/);
  return parts.map((p) => p.trim()).filter(Boolean);
}

function makeBulletList(items: string[]): TipTapNode {
  return {
    type: 'bulletList',
    content: items.map((text) => ({
      type: 'listItem',
      content: [
        {
          type: 'paragraph',
          content: [{ type: 'text', text }],
        },
      ],
    })),
  };
}

/**
 * Convert plain text extracted from a PDF into TipTap JSON with basic
 * heading, bullet-list, and page-chrome handling. PDFs don't preserve
 * structure, so we reconstruct paragraphs from line groupings, promote
 * visually distinct lines (all-caps, numbered, chapter-style) to toggle
 * headings, and turn runs of "•"-separated fragments into real lists.
 */
export function pdfTextToTipTapJSON(text: string): TipTapDoc {
  const normalized = stripPageChrome(text.replace(/\r\n?/g, '\n'));
  const blocks = normalized.split(/\n\n+/);
  const content: TipTapNode[] = [];

  const pushParagraphOrList = (raw: string) => {
    const trimmed = raw.trim();
    if (!trimmed) return;

    // If the block looks like a bullet run (starts with a bullet OR has
    // multiple inline bullets), break it into a bulletList.
    const leadsWithBullet = BULLET_RE.test(trimmed);
    const hasInlineBullets = /\s+[•●◦▪○■□◆▸▶►]\s+/.test(trimmed);

    if (leadsWithBullet || hasInlineBullets) {
      // Strip any leading bullet marker then split on inline bullets.
      const withoutLead = trimmed.replace(BULLET_RE, '');
      const items = splitInlineBullets(withoutLead);
      if (items.length >= 2) {
        content.push(makeBulletList(items));
        return;
      }
      if (items.length === 1) {
        content.push(makeBulletList(items));
        return;
      }
    }

    content.push({
      type: 'paragraph',
      content: [{ type: 'text', text: trimmed }],
    });
  };

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    const lines = trimmed.split('\n');

    // Single-line block: check if it's a heading, otherwise paragraph/list.
    if (lines.length === 1) {
      const { isHeading, level } = isLikelyHeading(lines[0]);
      if (isHeading) {
        content.push({
          type: 'toggleHeading',
          attrs: { level, collapsed: false, summary: lines[0].trim() },
          content: [{ type: 'paragraph' }],
        });
        continue;
      }
      pushParagraphOrList(lines[0]);
      continue;
    }

    // Multi-line block: first line may be a heading; rest becomes the body.
    const firstCheck = isLikelyHeading(lines[0]);
    let startIndex = 0;
    if (firstCheck.isHeading) {
      content.push({
        type: 'toggleHeading',
        attrs: { level: firstCheck.level, collapsed: false, summary: lines[0].trim() },
        content: [{ type: 'paragraph' }],
      });
      startIndex = 1;
    }

    const body = lines.slice(startIndex).join(' ').replace(/\s+/g, ' ').trim();
    if (body) pushParagraphOrList(body);
  }

  if (content.length === 0) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    };
  }

  return { type: 'doc', content };
}

/**
 * Convert HTML string (from mammoth DOCX conversion) to TipTap JSON.
 * Handles the common elements mammoth produces: p, h1-h6, strong/b, em/i,
 * ul, ol, li, blockquote, a, br.
 */
export function htmlToTipTapJSON(html: string): TipTapDoc {
  const content = parseTopLevelElements(html);

  if (content.length === 0) {
    return {
      type: 'doc',
      content: [{ type: 'paragraph', content: [] }],
    };
  }

  return { type: 'doc', content };
}

// ---------------------------------------------------------------------------
// Internal HTML parser
// ---------------------------------------------------------------------------

/**
 * Split HTML into top-level block elements and convert each to a TipTap node.
 */
function parseTopLevelElements(html: string): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  // Match top-level block tags. Mammoth output is fairly flat.
  const blockTagRegex = /<(p|h[1-6]|ul|ol|blockquote|table|div|hr)([\s>])/gi;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = blockTagRegex.exec(html)) !== null) {
    const tagStart = match.index;

    // Any text between the last block and this one (unlikely from mammoth, but handle it)
    if (tagStart > lastIndex) {
      const between = html.slice(lastIndex, tagStart).trim();
      if (between) {
        const inlineContent = parseInlineContent(between);
        if (inlineContent.length > 0) {
          nodes.push({ type: 'paragraph', content: inlineContent });
        }
      }
    }

    const tagName = match[1].toLowerCase();
    const closeTag = `</${tagName}>`;
    const closeIndex = findMatchingClose(html, tagStart, tagName);
    const fullElementEnd = closeIndex !== -1 ? closeIndex + closeTag.length : html.length;

    const fullElement = html.slice(tagStart, fullElementEnd);
    const inner = extractInner(fullElement, tagName);

    const node = blockToNode(tagName, inner);
    if (node) {
      nodes.push(node);
    }

    lastIndex = fullElementEnd;
    blockTagRegex.lastIndex = lastIndex;
  }

  // Trailing content
  if (lastIndex < html.length) {
    const trailing = html.slice(lastIndex).trim();
    if (trailing) {
      const inlineContent = parseInlineContent(trailing);
      if (inlineContent.length > 0) {
        nodes.push({ type: 'paragraph', content: inlineContent });
      }
    }
  }

  return nodes;
}

/**
 * Find the matching closing tag, handling nesting of the same tag.
 */
function findMatchingClose(html: string, startIndex: number, tagName: string): number {
  const openRegex = new RegExp(`<${tagName}[\\s>]`, 'gi');
  const closeRegex = new RegExp(`</${tagName}>`, 'gi');

  // Start after the opening tag
  const afterOpen = html.indexOf('>', startIndex);
  if (afterOpen === -1) return -1;

  let depth = 1;
  let searchFrom = afterOpen + 1;

  while (depth > 0) {
    openRegex.lastIndex = searchFrom;
    closeRegex.lastIndex = searchFrom;

    const nextOpen = openRegex.exec(html);
    const nextClose = closeRegex.exec(html);

    if (!nextClose) return -1; // no closing tag found

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      searchFrom = nextOpen.index + nextOpen[0].length;
    } else {
      depth--;
      if (depth === 0) return nextClose.index;
      searchFrom = nextClose.index + nextClose[0].length;
    }
  }

  return -1;
}

/**
 * Extract the inner HTML of an element, given the full element string and tag name.
 */
function extractInner(fullElement: string, tagName: string): string {
  const openEnd = fullElement.indexOf('>');
  if (openEnd === -1) return '';
  const closeTag = `</${tagName}>`;
  const closeIdx = fullElement.lastIndexOf(closeTag);
  if (closeIdx === -1) return fullElement.slice(openEnd + 1);
  return fullElement.slice(openEnd + 1, closeIdx);
}

/**
 * Convert a block-level HTML element to a TipTap node.
 */
function blockToNode(tagName: string, inner: string): TipTapNode | null {
  // Headings → toggle headings
  const headingMatch = tagName.match(/^h([1-6])$/);
  if (headingMatch) {
    const level = Math.min(parseInt(headingMatch[1], 10), 3);
    const inlineContent = parseInlineContent(inner);
    const summaryText = inlineContent
      .filter((c) => c.type === 'text')
      .map((c) => (c as { text: string }).text)
      .join('');
    return {
      type: 'toggleHeading',
      attrs: { level, collapsed: false, summary: summaryText },
      content: [{ type: 'paragraph' }],
    };
  }

  switch (tagName) {
    case 'p': {
      const content = parseInlineContent(inner);
      return {
        type: 'paragraph',
        content: content.length > 0 ? content : undefined,
      };
    }

    case 'blockquote': {
      // Blockquote wraps block-level content
      const innerNodes = parseTopLevelElements(inner);
      const blockContent =
        innerNodes.length > 0
          ? innerNodes
          : [{ type: 'paragraph' as const, content: parseInlineContent(inner) }];
      return { type: 'blockquote', content: blockContent };
    }

    case 'ul': {
      const items = parseListItems(inner);
      return { type: 'bulletList', content: items };
    }

    case 'ol': {
      const items = parseListItems(inner);
      return { type: 'orderedList', content: items };
    }

    case 'hr':
      return { type: 'horizontalRule' };

    case 'table':
      return parseHtmlTable(inner);

    default: {
      // div, etc. — fall back to paragraph with text
      const content = parseInlineContent(inner);
      if (content.length === 0) return null;
      return { type: 'paragraph', content };
    }
  }
}

/**
 * Parse <li> elements from within a <ul> or <ol>.
 */
function parseListItems(html: string): TipTapNode[] {
  const items: TipTapNode[] = [];
  const liRegex = /<li[\s>]/gi;
  let match: RegExpExecArray | null;

  while ((match = liRegex.exec(html)) !== null) {
    const closeIndex = findMatchingClose(html, match.index, 'li');
    const closeTag = '</li>';
    const endIndex = closeIndex !== -1 ? closeIndex + closeTag.length : html.length;

    const fullLi = html.slice(match.index, endIndex);
    const inner = extractInner(fullLi, 'li');

    // Check if the li contains nested block elements (sub-lists, paragraphs)
    const hasBlocks = /<(p|ul|ol|blockquote|h[1-6])[\s>]/i.test(inner);

    let listItemContent: TipTapNode[];
    if (hasBlocks) {
      listItemContent = parseTopLevelElements(inner);
      // Ensure at least one paragraph wrapper
      if (listItemContent.length === 0) {
        listItemContent = [{ type: 'paragraph', content: parseInlineContent(inner) }];
      }
    } else {
      listItemContent = [{ type: 'paragraph', content: parseInlineContent(inner) }];
    }

    items.push({ type: 'listItem', content: listItemContent });
    liRegex.lastIndex = endIndex;
  }

  return items;
}

/**
 * Parse inline HTML content into TipTap text nodes with marks.
 * Handles: <strong>/<b>, <em>/<i>, <a>, <br>, and strips unknown tags.
 */
function parseInlineContent(html: string): (TipTapTextNode | TipTapNode)[] {
  const results: (TipTapTextNode | TipTapNode)[] = [];

  // We'll walk through the HTML character by character, tracking inline tags
  const tokens = tokenizeInline(html);

  const markStack: TipTapMark[] = [];

  for (const token of tokens) {
    if (token.type === 'text') {
      const text = decodeEntities(token.value);
      if (text) {
        const node: TipTapTextNode = { type: 'text', text };
        if (markStack.length > 0) {
          node.marks = [...markStack];
        }
        results.push(node);
      }
    } else if (token.type === 'open') {
      const mark = tagToMark(token.tag, token.attrs);
      if (mark) {
        markStack.push(mark);
      }
    } else if (token.type === 'close') {
      const markType = tagToMarkType(token.tag);
      if (markType) {
        // Remove the last occurrence of this mark type
        for (let i = markStack.length - 1; i >= 0; i--) {
          if (markStack[i].type === markType) {
            markStack.splice(i, 1);
            break;
          }
        }
      }
    } else if (token.type === 'selfclose' && token.tag === 'br') {
      results.push({ type: 'hardBreak' } as unknown as TipTapTextNode);
    }
  }

  return results;
}

interface Token {
  type: 'text' | 'open' | 'close' | 'selfclose';
  value: string;
  tag: string;
  attrs: string;
}

/**
 * Tokenize inline HTML into text segments and tag open/close markers.
 */
function tokenizeInline(html: string): Token[] {
  const tokens: Token[] = [];
  const tagRegex = /<\/?([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^>]*)?)\/?\s*>/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tagRegex.exec(html)) !== null) {
    // Text before this tag
    if (match.index > lastIndex) {
      const text = html.slice(lastIndex, match.index);
      if (text) {
        tokens.push({ type: 'text', value: text, tag: '', attrs: '' });
      }
    }

    const fullTag = match[0];
    const tagName = match[1].toLowerCase();
    const attrs = match[2] || '';

    if (fullTag.startsWith('</')) {
      tokens.push({ type: 'close', value: fullTag, tag: tagName, attrs: '' });
    } else if (
      fullTag.endsWith('/>') ||
      tagName === 'br' ||
      tagName === 'hr' ||
      tagName === 'img'
    ) {
      tokens.push({ type: 'selfclose', value: fullTag, tag: tagName, attrs });
    } else {
      tokens.push({ type: 'open', value: fullTag, tag: tagName, attrs });
    }

    lastIndex = match.index + fullTag.length;
  }

  // Trailing text
  if (lastIndex < html.length) {
    const text = html.slice(lastIndex);
    if (text) {
      tokens.push({ type: 'text', value: text, tag: '', attrs: '' });
    }
  }

  return tokens;
}

/**
 * Convert an opening inline HTML tag to a TipTap mark.
 */
function tagToMark(tag: string, attrs: string): TipTapMark | null {
  switch (tag) {
    case 'strong':
    case 'b':
      return { type: 'bold' };
    case 'em':
    case 'i':
      return { type: 'italic' };
    case 'u':
      return { type: 'underline' };
    case 's':
    case 'strike':
    case 'del':
      return { type: 'strike' };
    case 'code':
      return { type: 'code' };
    case 'a': {
      const hrefMatch = attrs.match(/href\s*=\s*["']([^"']*)["']/i);
      return {
        type: 'link',
        attrs: { href: hrefMatch ? hrefMatch[1] : '', target: '_blank' },
      };
    }
    case 'sub':
      return { type: 'subscript' };
    case 'sup':
      return { type: 'superscript' };
    default:
      return null;
  }
}

/**
 * Get the TipTap mark type for a closing HTML tag.
 */
function tagToMarkType(tag: string): string | null {
  switch (tag) {
    case 'strong':
    case 'b':
      return 'bold';
    case 'em':
    case 'i':
      return 'italic';
    case 'u':
      return 'underline';
    case 's':
    case 'strike':
    case 'del':
      return 'strike';
    case 'code':
      return 'code';
    case 'a':
      return 'link';
    case 'sub':
      return 'subscript';
    case 'sup':
      return 'superscript';
    default:
      return null;
  }
}

/**
 * Decode common HTML entities.
 */
function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&nbsp;/g, ' ');
}

/**
 * Parse an HTML table's inner HTML into a TipTap table node.
 */
function parseHtmlTable(html: string): TipTapNode | null {
  const rows: TipTapNode[] = [];
  const trRegex = /<tr[\s>]/gi;
  let trMatch: RegExpExecArray | null;

  while ((trMatch = trRegex.exec(html)) !== null) {
    const trClose = findMatchingClose(html, trMatch.index, 'tr');
    const trEnd = trClose !== -1 ? trClose + '</tr>'.length : html.length;
    const trInner = extractInner(html.slice(trMatch.index, trEnd), 'tr');

    const cells: TipTapNode[] = [];
    const cellRegex = /<(td|th)[\s>]/gi;
    let cellMatch: RegExpExecArray | null;

    while ((cellMatch = cellRegex.exec(trInner)) !== null) {
      const cellTag = cellMatch[1].toLowerCase();
      const cellClose = findMatchingClose(trInner, cellMatch.index, cellTag);
      const cellEnd = cellClose !== -1 ? cellClose + `</${cellTag}>`.length : trInner.length;
      const cellInner = extractInner(trInner.slice(cellMatch.index, cellEnd), cellTag);

      const cellContent = parseInlineContent(cellInner);
      cells.push({
        type: cellTag === 'th' ? 'tableHeader' : 'tableCell',
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [{ type: 'paragraph', content: cellContent.length > 0 ? cellContent : undefined }],
      });

      cellRegex.lastIndex = cellEnd;
    }

    if (cells.length > 0) {
      rows.push({ type: 'tableRow', content: cells });
    }

    trRegex.lastIndex = trEnd;
  }

  if (rows.length === 0) return null;
  return { type: 'table', content: rows };
}

/**
 * Convert Excel workbook sheet data into a TipTap JSON document with tables.
 */
export interface SheetData {
  name: string;
  rows: string[][];
}

const MAX_ROWS_PER_SHEET = 500;

export function xlsxToTipTapTableJSON(sheetsData: SheetData[]): TipTapDoc {
  const content: TipTapNode[] = [];

  for (const sheet of sheetsData) {
    const rows = sheet.rows.slice(0, MAX_ROWS_PER_SHEET);
    if (rows.length === 0) continue;

    // Normalize column count — pad ragged rows
    const maxCols = Math.max(...rows.map((r) => r.length));
    if (maxCols === 0) continue;

    // Add sheet heading if multiple sheets
    if (sheetsData.length > 1) {
      content.push({
        type: 'toggleHeading',
        attrs: { level: 2, collapsed: false, summary: sheet.name },
        content: [{ type: 'paragraph' }],
      });
    }

    const tableRows: TipTapNode[] = rows.map((row, rowIndex) => {
      const cells: TipTapNode[] = [];
      for (let c = 0; c < maxCols; c++) {
        const cellValue = row[c] ?? '';
        cells.push({
          type: rowIndex === 0 ? 'tableHeader' : 'tableCell',
          attrs: { colspan: 1, rowspan: 1, colwidth: null },
          content: [
            {
              type: 'paragraph',
              content: cellValue ? [{ type: 'text', text: cellValue }] : undefined,
            },
          ],
        });
      }
      return { type: 'tableRow', content: cells };
    });

    content.push({ type: 'table', content: tableRows });

    // Add truncation notice
    if (sheet.rows.length > MAX_ROWS_PER_SHEET) {
      content.push({
        type: 'paragraph',
        content: [
          {
            type: 'text',
            text: `⚠ Sheet "${sheet.name}" truncated: showing ${MAX_ROWS_PER_SHEET} of ${sheet.rows.length} rows.`,
          },
        ],
      });
    }
  }

  if (content.length === 0) {
    content.push({ type: 'paragraph' });
  }

  return { type: 'doc', content };
}
