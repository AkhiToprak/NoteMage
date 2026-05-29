'use client';

import { useMemo } from 'react';
import MarkdownRenderer from '@/components/ui/MarkdownRenderer';

// Phase 10.6 persisted theory as a TipTap JSON document built by
// path-generator.ts → theoryInputToTipTap. That converter copies the model's
// Markdown into TipTap *text* nodes verbatim (it only lifts `$…$`/`$$…$$` math
// into math nodes), so the headings, bold, inline code, fenced code blocks,
// blockquotes, and lists the model wrote survived only as literal Markdown
// characters — and the old read-only TipTap viewer rendered them as plain text.
//
// The stored shape has to stay TipTap JSON (path-translator + moderation walk
// these nodes), so we fix rendering instead of storage: flatten the doc back
// to a Markdown string and hand it to the shared MarkdownRenderer — the same
// renderer chat, flashcards, and quiz questions use. This repairs both newly
// generated and already-stored theory.

interface TheoryViewerProps {
  body: unknown; // TipTap JSON document
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

function tiptapDocToMarkdown(body: unknown): string {
  if (!body || typeof body !== 'object') return '';
  const doc = body as TipTapNode;
  const blocks = Array.isArray(doc.content) ? doc.content : [];
  return blocks
    .map((block) => serializeBlock(block))
    .filter((chunk) => chunk.trim().length > 0)
    .join('\n\n')
    .trim();
}

export default function TheoryViewer({ body }: TheoryViewerProps) {
  const markdown = useMemo(() => tiptapDocToMarkdown(body), [body]);

  if (!markdown) {
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
      <MarkdownRenderer content={markdown} />
    </div>
  );
}
