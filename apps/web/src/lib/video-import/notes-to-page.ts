// P3 — map the model's structured video-notes JSON into a TipTap document and a
// plain-text mirror, using ONLY existing node types (D7): heading, paragraph,
// bulletList/listItem, and blockMath — exactly the conventions pdf-import's
// `assemble.ts` emits. No new node kinds, no `PageImage` rows in V1.
//
// Inline `[MM:SS]` markers ride INSIDE the text of headings/paragraphs/list
// items so downstream AI (chat corpus, path corpus) can cite moments without a
// structured per-block timestamp index — same approach as the Lane-1 transcript.

import type { TipTapDoc, TipTapNode, TipTapTextNode } from '@/lib/contentConverter';
import type { VideoNoteBlock, VideoNotes } from './gemini-ingest';

/** Page-content mirror cap — the page-content route hard-rejects over 500KB. */
const TEXT_CONTENT_LIMIT = 500_000;
/** Byte ceiling for the assembled doc; stop well under the 500KB route limit. */
const MAX_DOC_BYTES = 460_000;

/** A single text node, or null for an empty string (ProseMirror forbids those). */
function textNode(text: string): TipTapTextNode | null {
  return text.length > 0 ? { type: 'text', text } : null;
}

/** Prefix a `[MM:SS]` marker onto the block's text when the model supplied one. */
function withTimestamp(text: string, ts: string | undefined): string {
  return ts ? `[${ts}] ${text}` : text;
}

/** A paragraph node carrying the given text (empty text → bare paragraph). */
function paragraph(text: string): TipTapNode {
  const node = textNode(text);
  return node ? { type: 'paragraph', content: [node] } : { type: 'paragraph' };
}

/** Clamp a heading to the 1–3 range the heading node supports (chapters → h2). */
function headingNode(text: string, level: 1 | 2 | 3): TipTapNode {
  const node = textNode(text);
  const heading: TipTapNode = { type: 'heading', attrs: { level } };
  if (node) heading.content = [node];
  return heading;
}

/** One notes block → zero or more TipTap nodes (existing node types only). */
function blockToNodes(block: VideoNoteBlock): TipTapNode[] {
  switch (block.type) {
    case 'heading':
      // Chapter headings are level 2; the page title carries the h1 role.
      return [headingNode(withTimestamp(block.text, block.ts), 2)];

    case 'paragraph':
      return [paragraph(withTimestamp(block.text, block.ts))];

    case 'list': {
      const items = block.items
        .map((item, i) => withTimestamp(item, i === 0 ? block.ts : undefined))
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
        .map((item): TipTapNode => ({ type: 'listItem', content: [paragraph(item)] }));
      if (items.length === 0) return [];
      return [{ type: 'bulletList', content: items }];
    }

    case 'math': {
      // Display math is a block node carrying LaTeX — same convention as
      // pdf-import's `blockMath`. A leading `[MM:SS]` can't live inside KaTeX,
      // so emit it as a preceding paragraph when present.
      const latex = block.text.replace(/^\$+|\$+$/g, '').trim();
      if (!latex) return [];
      const nodes: TipTapNode[] = [];
      if (block.ts) nodes.push(paragraph(`[${block.ts}]`));
      nodes.push({ type: 'blockMath', attrs: { latex } });
      return nodes;
    }
  }
}

/** Plain-text fragment for the page mirror (search + AI context). */
function blockToPlainText(block: VideoNoteBlock): string {
  switch (block.type) {
    case 'heading':
    case 'paragraph':
    case 'math':
      return withTimestamp(block.text, block.ts);
    case 'list':
      return block.items
        .map((item, i) => `• ${withTimestamp(item, i === 0 ? block.ts : undefined)}`)
        .join('\n');
  }
}

export interface VideoPageDoc {
  doc: TipTapDoc;
  textContent: string;
  truncated: boolean;
}

/**
 * Assemble the notes into a single Page document + its plain-text mirror.
 * Nodes are appended one at a time and the running JSON size checked after each;
 * once it would exceed `MAX_DOC_BYTES` the last node is dropped and `truncated`
 * is returned true. The result always has at least one block.
 */
export function notesToPageDoc(notes: VideoNotes): VideoPageDoc {
  const allNodes: TipTapNode[] = [];
  const textParts: string[] = [];

  for (const chapter of notes.chapters) {
    for (const block of chapter.blocks) {
      allNodes.push(...blockToNodes(block));
      const text = blockToPlainText(block);
      if (text.trim().length > 0) textParts.push(text);
    }
  }

  const doc: TipTapDoc = { type: 'doc', content: [] };
  let truncated = false;
  for (const node of allNodes) {
    doc.content.push(node);
    if (Buffer.byteLength(JSON.stringify(doc)) > MAX_DOC_BYTES) {
      doc.content.pop();
      truncated = true;
      break;
    }
  }
  if (doc.content.length === 0) doc.content.push({ type: 'paragraph' });

  const textContent = textParts.join('\n\n').slice(0, TEXT_CONTENT_LIMIT);
  return { doc, textContent, truncated };
}

/** Page title from the model's notes title, falling back to the source name. */
export function deriveVideoPageTitle(notes: VideoNotes, fallback: string): string {
  const title = notes.title?.trim();
  if (title) return title.slice(0, 200);
  const fb = fallback.trim();
  return fb.length > 0 ? fb.slice(0, 200) : 'Video notes';
}
