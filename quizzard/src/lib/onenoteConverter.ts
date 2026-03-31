/**
 * Converts OneNote HTML (from Microsoft Graph API) to TipTap JSON document format.
 * Uses cheerio for robust HTML parsing since OneNote HTML is more complex than
 * the mammoth output handled by contentConverter.ts.
 */

import * as cheerio from 'cheerio';
import type { AnyNode, Element as DomElement, Text as DomText } from 'domhandler';
import type { TipTapDoc, TipTapNode, TipTapTextNode, TipTapMark } from '@/lib/contentConverter';

type ImageDownloader = (url: string) => Promise<string | null>;

/**
 * Convert OneNote page HTML to TipTap JSON document.
 * @param html - The raw HTML from Microsoft Graph API `/pages/{id}/content`
 * @param imageDownloader - Optional callback to download images from Graph API resource URLs
 */
export async function onenoteHtmlToTipTapJSON(
  html: string,
  imageDownloader?: ImageDownloader
): Promise<TipTapDoc> {
  const $ = cheerio.load(html);

  // OneNote wraps content in a <body>, possibly with <div data-id="..."> wrappers
  const body = $('body').length > 0 ? $('body') : $(':root');
  const nodes: TipTapNode[] = [];

  for (const child of body.children().toArray()) {
    const converted = await convertElement($, child, imageDownloader);
    if (converted) {
      if (Array.isArray(converted)) {
        nodes.push(...converted);
      } else {
        nodes.push(converted);
      }
    }
  }

  if (nodes.length === 0) {
    return { type: 'doc', content: [{ type: 'paragraph', content: [] }] };
  }

  return { type: 'doc', content: nodes };
}

/**
 * Strip all HTML tags and return plain text (for textContent field).
 */
export function onenoteHtmlToPlainText(html: string): string {
  const $ = cheerio.load(html);
  return $('body').text().trim() || $.root().text().trim();
}

// ── Element conversion ──

async function convertElement(
  $: cheerio.CheerioAPI,
  el: AnyNode,
  imageDownloader?: ImageDownloader
): Promise<TipTapNode | TipTapNode[] | null> {
  if (el.type === 'text') {
    return null; // Text nodes are handled by inline content parser
  }
  if (el.type !== 'tag') return null;

  const tagName = (el as DomElement).tagName?.toLowerCase();
  const $el = $(el);

  // Headings → toggleHeading (matching contentConverter.ts pattern)
  const headingMatch = tagName.match(/^h([1-6])$/);
  if (headingMatch) {
    const level = Math.min(parseInt(headingMatch[1], 10), 3);
    const summaryText = $el.text().trim();
    if (!summaryText) return null;
    return {
      type: 'toggleHeading',
      attrs: { level, collapsed: false, summary: summaryText },
      content: [{ type: 'paragraph' }],
    };
  }

  switch (tagName) {
    case 'p': {
      const content = await parseInlineContent($, $el, imageDownloader);
      return { type: 'paragraph', content: content.length > 0 ? content : undefined };
    }

    case 'br':
      return { type: 'paragraph', content: [] };

    case 'hr':
      return { type: 'horizontalRule' };

    case 'blockquote': {
      const children = await convertChildren($, $el, imageDownloader);
      const content = children.length > 0 ? children : [{ type: 'paragraph' as const }];
      return { type: 'blockquote', content };
    }

    case 'ul': {
      const items = await convertListItems($, $el, imageDownloader);
      if (items.length === 0) return null;
      return { type: 'bulletList', content: items };
    }

    case 'ol': {
      const items = await convertListItems($, $el, imageDownloader);
      if (items.length === 0) return null;
      return { type: 'orderedList', content: items };
    }

    case 'table': {
      return await convertTable($, $el, imageDownloader);
    }

    case 'img': {
      const src = $el.attr('src') || $el.attr('data-fullres-src');
      if (src && imageDownloader) {
        const localPath = await imageDownloader(src);
        if (localPath) {
          return {
            type: 'image',
            attrs: { src: localPath, alt: $el.attr('alt') || null },
          };
        }
      }
      return null;
    }

    case 'div': {
      // OneNote uses divs as wrappers. Recurse into children.
      const hasBlockChildren = $el.children('p, h1, h2, h3, h4, h5, h6, ul, ol, table, blockquote, div, hr, img').length > 0;
      if (hasBlockChildren) {
        return await convertChildren($, $el, imageDownloader);
      }
      // Leaf div → treat as paragraph
      const content = await parseInlineContent($, $el, imageDownloader);
      if (content.length === 0) return null;
      return { type: 'paragraph', content };
    }

    case 'span': {
      // Standalone span (rare) → paragraph
      const content = await parseInlineContent($, $el, imageDownloader);
      if (content.length === 0) return null;
      return { type: 'paragraph', content };
    }

    default: {
      // Unknown elements: try to extract inline content
      const content = await parseInlineContent($, $el, imageDownloader);
      if (content.length === 0) return null;
      return { type: 'paragraph', content };
    }
  }
}

async function convertChildren(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<AnyNode>,
  imageDownloader?: ImageDownloader
): Promise<TipTapNode[]> {
  const nodes: TipTapNode[] = [];
  for (const child of $el.children().toArray()) {
    const converted = await convertElement($, child, imageDownloader);
    if (converted) {
      if (Array.isArray(converted)) {
        nodes.push(...converted);
      } else {
        nodes.push(converted);
      }
    }
  }
  return nodes;
}

async function convertListItems(
  $: cheerio.CheerioAPI,
  $list: cheerio.Cheerio<AnyNode>,
  imageDownloader?: ImageDownloader
): Promise<TipTapNode[]> {
  const items: TipTapNode[] = [];
  for (const li of $list.children('li').toArray()) {
    const $li = $(li);
    const hasBlocks = $li.children('p, ul, ol, blockquote, h1, h2, h3, h4, h5, h6').length > 0;

    let content: TipTapNode[];
    if (hasBlocks) {
      content = await convertChildren($, $li, imageDownloader);
      if (content.length === 0) {
        content = [{ type: 'paragraph' }];
      }
    } else {
      const inlineContent = await parseInlineContent($, $li, imageDownloader);
      content = [{ type: 'paragraph', content: inlineContent.length > 0 ? inlineContent : undefined }];
    }

    items.push({ type: 'listItem', content });
  }
  return items;
}

async function convertTable(
  $: cheerio.CheerioAPI,
  $table: cheerio.Cheerio<AnyNode>,
  imageDownloader?: ImageDownloader
): Promise<TipTapNode | null> {
  const rows: TipTapNode[] = [];

  for (const tr of $table.find('tr').toArray()) {
    const cells: TipTapNode[] = [];
    for (const cell of $(tr).children('td, th').toArray()) {
      const $cell = $(cell);
      const isHeader = cell.type === 'tag' && (cell as DomElement).tagName?.toLowerCase() === 'th';
      const inlineContent = await parseInlineContent($, $cell, imageDownloader);
      cells.push({
        type: isHeader ? 'tableHeader' : 'tableCell',
        content: [{ type: 'paragraph', content: inlineContent.length > 0 ? inlineContent : undefined }],
      });
    }
    if (cells.length > 0) {
      rows.push({ type: 'tableRow', content: cells });
    }
  }

  if (rows.length === 0) return null;
  return { type: 'table', content: rows };
}

// ── Inline content parsing ──

async function parseInlineContent(
  $: cheerio.CheerioAPI,
  $el: cheerio.Cheerio<AnyNode>,
  imageDownloader?: ImageDownloader
): Promise<(TipTapNode | TipTapTextNode)[]> {
  const result: (TipTapNode | TipTapTextNode)[] = [];

  for (const child of $el.contents().toArray()) {
    if (child.type === 'text') {
      const text = (child as DomText).data;
      if (text && text.trim()) {
        result.push({ type: 'text', text });
      }
      continue;
    }

    if (child.type !== 'tag') continue;
    const tag = (child as DomElement).tagName?.toLowerCase();
    const $child = $(child);

    switch (tag) {
      case 'br':
        result.push({ type: 'hardBreak' } as TipTapNode);
        break;

      case 'strong':
      case 'b': {
        const inner = await parseInlineContent($, $child, imageDownloader);
        for (const node of inner) {
          if (node.type === 'text') {
            addMark(node as TipTapTextNode, { type: 'bold' });
          }
          result.push(node);
        }
        break;
      }

      case 'em':
      case 'i': {
        const inner = await parseInlineContent($, $child, imageDownloader);
        for (const node of inner) {
          if (node.type === 'text') {
            addMark(node as TipTapTextNode, { type: 'italic' });
          }
          result.push(node);
        }
        break;
      }

      case 'u': {
        const inner = await parseInlineContent($, $child, imageDownloader);
        for (const node of inner) {
          if (node.type === 'text') {
            addMark(node as TipTapTextNode, { type: 'underline' });
          }
          result.push(node);
        }
        break;
      }

      case 'a': {
        const href = $child.attr('href');
        const inner = await parseInlineContent($, $child, imageDownloader);
        if (href) {
          for (const node of inner) {
            if (node.type === 'text') {
              addMark(node as TipTapTextNode, { type: 'link', attrs: { href } });
            }
            result.push(node);
          }
        } else {
          result.push(...inner);
        }
        break;
      }

      case 'img': {
        const src = $child.attr('src') || $child.attr('data-fullres-src');
        if (src && imageDownloader) {
          const localPath = await imageDownloader(src);
          if (localPath) {
            result.push({
              type: 'image',
              attrs: { src: localPath, alt: $child.attr('alt') || null },
            } as TipTapNode);
          }
        }
        break;
      }

      case 'span': {
        // Spans may carry styles — just recurse for inline content
        const inner = await parseInlineContent($, $child, imageDownloader);
        result.push(...inner);
        break;
      }

      default: {
        // Unknown inline element — extract text
        const inner = await parseInlineContent($, $child, imageDownloader);
        result.push(...inner);
        break;
      }
    }
  }

  return result;
}

function addMark(node: TipTapTextNode, mark: TipTapMark): void {
  if (!node.marks) node.marks = [];
  node.marks.push(mark);
}
