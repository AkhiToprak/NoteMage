'use client';

import { useMemo } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';
import PathDiagram from '@/components/learn/PathDiagram';
import { PathDiagramSchema, type PathDiagram as PathDiagramData } from '@notemage/shared';

// Phase 10.6 persisted theory as a TipTap JSON document built by
// path-generator.ts → theoryInputToTipTap. That converter copies the model's
// Markdown into TipTap *text* nodes verbatim (it only lifts `$…$`/`$$…$$` math
// into math nodes), so the headings, bold, inline code, fenced code blocks,
// blockquotes, and lists the model wrote survived only as literal Markdown
// characters — and the old read-only TipTap viewer rendered them as plain text.
//
// The stored shape has to stay TipTap JSON (path-translator + moderation walk
// these nodes), so we fix rendering instead of storage: flatten runs of
// standard blocks back to a Markdown string and hand them to the shared
// MarkdownRenderer (the same renderer chat, flashcards, and quiz questions
// use). The theory-visuals feature adds two custom block nodes — `pathImage`
// and `pathDiagram` — that can't be expressed as Markdown, so the doc is split
// into ordered SEGMENTS: standard-block runs render as Markdown, custom nodes
// render as their own React components, in document order.

interface TheoryViewerProps {
  body: unknown; // TipTap JSON document
  /**
   * The TheoryContent.id — required to build `pathImage` src URLs
   * (`/api/path-images/<theoryId>/<ref>`). Absent on surfaces that don't carry
   * embedded images; image segments are then skipped rather than broken.
   */
  theoryId?: string;
}

interface TipTapNode {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown> | null;
  marks?: Array<{ type?: string } | null> | null;
  content?: TipTapNode[] | null;
}

// Inline marks → Markdown delimiters. A `code` mark short-circuits the others
// (its text is literal), matching how MarkdownRenderer treats inline code.
const MARK_DELIMITERS: Record<string, string> = {
  bold: '**',
  strong: '**',
  italic: '*',
  em: '*',
  strike: '~~',
  strikethrough: '~~',
  s: '~~',
};

function attrString(node: TipTapNode, key: string): string {
  const value = node.attrs?.[key];
  return typeof value === 'string' ? value : '';
}

function rawText(nodes: TipTapNode[] | null | undefined): string {
  if (!Array.isArray(nodes)) return '';
  return nodes
    .map((n) => (n?.text ? n.text : n?.content ? rawText(n.content) : ''))
    .join('');
}

function serializeTextNode(node: TipTapNode): string {
  const text = node.text ?? '';
  if (!text) return '';
  const marks = Array.isArray(node.marks) ? node.marks : [];
  if (marks.some((m) => m?.type === 'code')) return `\`${text}\``;
  let out = text;
  for (const mark of marks) {
    const delimiter = mark?.type ? MARK_DELIMITERS[mark.type] : undefined;
    if (delimiter) out = `${delimiter}${out}${delimiter}`;
  }
  return out;
}

function serializeInline(nodes: TipTapNode[] | null | undefined): string {
  if (!Array.isArray(nodes)) return '';
  let out = '';
  for (const node of nodes) {
    if (!node || typeof node !== 'object') continue;
    switch (node.type) {
      case 'text':
        out += serializeTextNode(node);
        break;
      case 'inlineMath':
        out += `$${attrString(node, 'latex')}$`;
        break;
      case 'hardBreak':
        out += '\n';
        break;
      default:
        out += node.content ? serializeInline(node.content) : (node.text ?? '');
    }
  }
  return out;
}

// A listItem holds block children (usually a single paragraph). Flatten them
// onto one Markdown bullet line.
function listItemText(item: TipTapNode): string {
  if (!Array.isArray(item.content)) return '';
  return item.content
    .map((child) =>
      child?.type === 'paragraph' ? serializeInline(child.content) : serializeBlock(child),
    )
    .join(' ')
    .trim();
}

function serializeBlock(node: TipTapNode | null | undefined): string {
  if (!node || typeof node !== 'object') return '';
  switch (node.type) {
    case 'heading': {
      const rawLevel = node.attrs?.level;
      const level = typeof rawLevel === 'number' ? Math.min(6, Math.max(1, rawLevel)) : 2;
      return `${'#'.repeat(level)} ${serializeInline(node.content)}`;
    }
    case 'paragraph':
      return serializeInline(node.content);
    case 'bulletList':
      return (node.content ?? []).map((item) => `- ${listItemText(item)}`).join('\n');
    case 'orderedList':
      return (node.content ?? []).map((item, i) => `${i + 1}. ${listItemText(item)}`).join('\n');
    case 'blockquote':
      return (node.content ?? [])
        .map((child) => serializeBlock(child))
        .join('\n\n')
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
    case 'codeBlock':
      return `\`\`\`${attrString(node, 'language')}\n${rawText(node.content)}\n\`\`\``;
    case 'blockMath':
      return `$$\n${attrString(node, 'latex')}\n$$`;
    default:
      return serializeInline(node.content);
  }
}

type Segment =
  | { type: 'markdown'; text: string }
  | { type: 'image'; ref: number; alt: string }
  | { type: 'diagram'; diagram: PathDiagramData };

// Split the doc into ordered segments at custom-node boundaries. Runs of
// standard blocks coalesce into one Markdown chunk; `pathImage` / `pathDiagram`
// nodes become their own segments. A malformed custom node is dropped (never
// crashes the renderer) — diagrams are re-validated with PathDiagramSchema.
function splitDoc(body: unknown): Segment[] {
  if (!body || typeof body !== 'object') return [];
  const doc = body as TipTapNode;
  const blocks = Array.isArray(doc.content) ? doc.content : [];
  const segments: Segment[] = [];
  let buffer: TipTapNode[] = [];
  const flush = () => {
    if (buffer.length === 0) return;
    const md = buffer
      .map((b) => serializeBlock(b))
      .filter((chunk) => chunk.trim().length > 0)
      .join('\n\n')
      .trim();
    if (md) segments.push({ type: 'markdown', text: md });
    buffer = [];
  };
  for (const block of blocks) {
    if (block?.type === 'pathImage') {
      flush();
      const ref = block.attrs?.ref;
      const alt = block.attrs?.alt;
      if (typeof ref === 'number') {
        segments.push({ type: 'image', ref, alt: typeof alt === 'string' ? alt : '' });
      }
    } else if (block?.type === 'pathDiagram') {
      flush();
      const parsed = PathDiagramSchema.safeParse(block.attrs?.diagram);
      if (parsed.success) segments.push({ type: 'diagram', diagram: parsed.data });
    } else {
      buffer.push(block);
    }
  }
  flush();
  return segments;
}

function TheoryFigure({ src, alt }: { src: string; alt: string }) {
  return (
    <figure style={{ margin: '1em 0' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={alt}
        loading="lazy"
        style={{
          display: 'block',
          maxWidth: '100%',
          maxHeight: '380px',
          margin: '0 auto',
          borderRadius: 'var(--radius-md)',
          objectFit: 'contain',
          border: '1px solid var(--outline-variant)',
          background: 'var(--surface-container)',
        }}
      />
      {alt ? (
        <figcaption
          style={{
            marginTop: '8px',
            textAlign: 'center',
            fontSize: '13px',
            lineHeight: 1.5,
            color: 'var(--on-surface-variant)',
          }}
        >
          {alt}
        </figcaption>
      ) : null}
    </figure>
  );
}

export default function TheoryViewer({ body, theoryId }: TheoryViewerProps) {
  const segments = useMemo(() => splitDoc(body), [body]);

  if (segments.length === 0) {
    return (
      <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>
        This lesson has no content yet.
      </p>
    );
  }

  return (
    <div
      className="learn-theory-viewer"
      style={{ color: 'var(--on-surface)', fontSize: '15px', lineHeight: 1.7 }}
    >
      {segments.map((seg, i) => {
        if (seg.type === 'markdown') {
          return <MarkdownRenderer key={i} content={seg.text} />;
        }
        if (seg.type === 'image') {
          if (!theoryId) return null;
          return (
            <TheoryFigure
              key={i}
              src={`/api/path-images/${encodeURIComponent(theoryId)}/${seg.ref}`}
              alt={seg.alt}
            />
          );
        }
        return <PathDiagram key={i} diagram={seg.diagram} />;
      })}
    </div>
  );
}
