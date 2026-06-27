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
  /**
   * `'callouts'` (the cream quiz player) renders the generator's keyPoints /
   * examples sections as Figma-style Key-idea / Example callout cards. Default
   * keeps the plain document rendering. Sections are classified by their
   * structure, not localized heading text (see `splitDocCallouts`), so it works
   * in every path language.
   */
  variant?: 'default' | 'callouts';
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
      // Standard StarterKit heading: text lives in inline `content`, level
      // clamps to 1-3 (the canonical shape after dropping `toggleHeading`).
      const rawLevel = node.attrs?.level;
      const level = typeof rawLevel === 'number' ? Math.min(3, Math.max(1, rawLevel)) : 2;
      return `${'#'.repeat(level)} ${serializeInline(node.content)}`;
    }
    case 'toggleHeading': {
      // Legacy, pre-migration node: text was stored in the `summary` attr and
      // levels were 1-3. Defensive fallback for theory bodies not yet migrated
      // to the standard `heading` node.
      const rawLevel = node.attrs?.level;
      const level = typeof rawLevel === 'number' ? Math.min(3, Math.max(1, rawLevel)) : 2;
      return `${'#'.repeat(level)} ${attrString(node, 'summary')}`;
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

// ── Callouts variant (cream quiz player) ──────────────────────────────────
// theoryInputToTipTap emits the generated sections deterministically:
//   keyPoints → h3 + bulletList   ·   examples → h3 + h4 sub-headings
//   summary   → h3 + paragraphs (left as prose)
// So a section is identified by the SHAPE of the blocks under its h3, never by
// matching the localized heading text — this works across every path language.
type CalloutKind = 'keyIdea' | 'example';

type CalloutSegment =
  | { type: 'prose'; text: string }
  | { type: 'callout'; kind: CalloutKind; label: string; text: string }
  | { type: 'image'; ref: number; alt: string }
  | { type: 'diagram'; diagram: PathDiagramData };

const CALLOUT_META: Record<CalloutKind, { bg: string; border: string; ink: string; icon: string }> = {
  keyIdea: { bg: 'var(--nm-primary-light)', border: 'var(--nm-primary)', ink: 'var(--nm-primary-on-light)', icon: 'lightbulb' },
  example: { bg: 'var(--nm-streak-soft)', border: 'var(--nm-streak)', ink: 'var(--nm-streak)', icon: 'science' },
};

function classifySection(blocks: TipTapNode[]): CalloutKind | null {
  if (blocks.some((b) => b?.type === 'bulletList' || b?.type === 'orderedList')) return 'keyIdea';
  if (blocks.some((b) => b?.type === 'heading' && b.attrs?.level === 4)) return 'example';
  return null; // summary / anything else → render as plain prose
}

// Split the generated theory doc into ordered segments: intro + summary prose,
// Key-idea / Example callout cards, and the existing image / diagram nodes.
function splitDocCallouts(body: unknown): CalloutSegment[] {
  if (!body || typeof body !== 'object') return [];
  const doc = body as TipTapNode;
  const blocks = Array.isArray(doc.content) ? doc.content : [];
  const segments: CalloutSegment[] = [];
  let prose: TipTapNode[] = [];
  const flushProse = () => {
    if (prose.length === 0) return;
    const md = prose
      .map((b) => serializeBlock(b))
      .filter((chunk) => chunk.trim().length > 0)
      .join('\n\n')
      .trim();
    if (md) segments.push({ type: 'prose', text: md });
    prose = [];
  };

  let i = 0;
  while (i < blocks.length) {
    const block = blocks[i];
    if (block?.type === 'pathImage') {
      flushProse();
      const ref = block.attrs?.ref;
      const alt = block.attrs?.alt;
      if (typeof ref === 'number') segments.push({ type: 'image', ref, alt: typeof alt === 'string' ? alt : '' });
      i += 1;
      continue;
    }
    if (block?.type === 'pathDiagram') {
      flushProse();
      const parsed = PathDiagramSchema.safeParse(block.attrs?.diagram);
      if (parsed.success) segments.push({ type: 'diagram', diagram: parsed.data });
      i += 1;
      continue;
    }
    if (block?.type === 'heading' && block.attrs?.level === 3) {
      // Gather this section's body — blocks until the next section heading or a
      // custom node — then classify it by shape.
      const sectionBlocks: TipTapNode[] = [];
      let j = i + 1;
      for (; j < blocks.length; j += 1) {
        const b = blocks[j];
        const lvl = b?.type === 'heading' ? b.attrs?.level : undefined;
        if (lvl === 3 || lvl === 2 || b?.type === 'pathImage' || b?.type === 'pathDiagram') break;
        sectionBlocks.push(b);
      }
      const kind = classifySection(sectionBlocks);
      if (kind) {
        flushProse();
        const md = sectionBlocks
          .map((b) => serializeBlock(b))
          .filter((chunk) => chunk.trim().length > 0)
          .join('\n\n')
          .trim();
        segments.push({ type: 'callout', kind, label: rawText(block.content).trim(), text: md });
        i = j;
        continue;
      }
      // Unclassified (summary / other) → keep heading + body in the prose flow.
      prose.push(block);
      i += 1;
      continue;
    }
    prose.push(block);
    i += 1;
  }
  flushProse();
  return segments;
}

function TheoryCallout({ kind, label, text }: { kind: CalloutKind; label: string; text: string }) {
  const meta = CALLOUT_META[kind];
  return (
    <div
      style={{
        borderRadius: 'var(--radius-md)',
        background: meta.bg,
        border: `1px solid ${meta.border}`,
        padding: '14px 16px',
        margin: '18px 0',
      }}
    >
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '6px',
          fontSize: '11px',
          fontWeight: 800,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          color: meta.ink,
          marginBottom: '6px',
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 15 }} aria-hidden>
          {meta.icon}
        </span>
        {label}
      </span>
      <div style={{ fontSize: '15px', lineHeight: 1.6, color: 'var(--on-surface)' }}>
        <MarkdownRenderer content={text} />
      </div>
    </div>
  );
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

export default function TheoryViewer({ body, theoryId, variant = 'default' }: TheoryViewerProps) {
  const segments = useMemo<Array<Segment | CalloutSegment>>(
    () => (variant === 'callouts' ? splitDocCallouts(body) : splitDoc(body)),
    [body, variant],
  );

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
        switch (seg.type) {
          case 'markdown':
          case 'prose':
            return <MarkdownRenderer key={i} content={seg.text} />;
          case 'callout':
            return <TheoryCallout key={i} kind={seg.kind} label={seg.label} text={seg.text} />;
          case 'image':
            return theoryId ? (
              <TheoryFigure
                key={i}
                src={`/api/path-images/${encodeURIComponent(theoryId)}/${seg.ref}`}
                alt={seg.alt}
              />
            ) : null;
          case 'diagram':
            return <PathDiagram key={i} diagram={seg.diagram} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
