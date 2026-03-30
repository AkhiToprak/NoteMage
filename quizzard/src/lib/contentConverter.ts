/**
 * Converts plain text and HTML to TipTap JSON document format.
 * Used when importing files (PDF, DOCX, TXT, MD) as notebook pages.
 */

interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface TipTapTextNode {
  type: 'text';
  text: string;
  marks?: TipTapMark[];
}

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: (TipTapNode | TipTapTextNode)[];
  marks?: TipTapMark[];
  text?: string;
}

interface TipTapDoc {
  type: 'doc';
  content: TipTapNode[];
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
  const blockTagRegex =
    /<(p|h[1-6]|ul|ol|blockquote|table|div|hr)([\s>])/gi;

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

    default: {
      // div, table, etc. — fall back to paragraph with text
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
    } else if (fullTag.endsWith('/>') || tagName === 'br' || tagName === 'hr' || tagName === 'img') {
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
