'use client';

import { Children, cloneElement, isValidElement, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { common, createLowlight } from 'lowlight';
import { toHtml } from 'hast-util-to-html';
import type { Components } from 'react-markdown';
import {
  ADMONITION_MARKER_RE,
  CALLOUT_RENDER_META,
  CALLOUT_TYPE_BY_MARKER,
} from '@/lib/callout-markers';

// `common` (~37 mainstream grammars) instead of `all` (190+). MarkdownRenderer
// mounts on every dashboard route via the Mage panel, so the full grammar set was
// shipping in the hot-path client bundle to highlight languages study content
// never uses. highlightAuto still covers anything outside the common set.
const lowlight = createLowlight(common);

/**
 * GitHub-style admonition support for blockquotes.
 *
 * AI surfaces (chat, inline edit) emit callouts as `> [!TIP]\n> body`. The
 * editor converts those into real Callout nodes on insert, but everywhere
 * markdown is DISPLAYED (chat bubbles, the inline-AI preview popover) the
 * marker used to render as literal "[!TIP]" text inside a quote. Here we
 * detect the marker in the blockquote's first paragraph, strip it from the
 * rendered children, and dress the quote like its in-editor Callout twin so
 * the preview matches what Accept inserts.
 */

/** Index of the first non-whitespace child in a Children.toArray result. */
function firstRealIndex(arr: ReturnType<typeof Children.toArray>): number {
  return arr.findIndex((c) => !(typeof c === 'string' && c.trim() === ''));
}

/**
 * The candidate marker text: the first DIRECT string child of the
 * blockquote's first paragraph. Deliberately does NOT recurse into nested
 * elements — a quote whose first content is `` `[!TIP]` `` (inline code
 * ABOUT callout syntax) is a normal quote, exactly as the editor-insert
 * pipeline treats it (admonitionsToCallouts anchors on `^<p>\s*\[!`).
 */
function markerCandidate(children: ReactNode): string {
  const arr = Children.toArray(children);
  const idx = firstRealIndex(arr);
  if (idx === -1) return '';
  const first = arr[idx];
  if (typeof first === 'string') return first;
  if (!isValidElement(first)) return '';
  const kids = Children.toArray((first.props as { children?: ReactNode }).children);
  const kidIdx = firstRealIndex(kids);
  const lead = kidIdx === -1 ? undefined : kids[kidIdx];
  return typeof lead === 'string' ? lead : '';
}

/**
 * Remove the admonition marker from the first paragraph's leading string and
 * drop that paragraph entirely if nothing but whitespace remains (the
 * marker-on-its-own-line shape). Paragraphs that still hold non-text content
 * (e.g. an image right after the marker) are kept.
 */
function stripMarker(children: ReactNode): ReactNode {
  const arr = Children.toArray(children);
  const idx = firstRealIndex(arr);
  if (idx === -1) return children;
  const first = arr[idx];

  if (typeof first === 'string') {
    arr[idx] = first.replace(ADMONITION_MARKER_RE, '');
    return arr;
  }
  if (!isValidElement(first)) return children;

  const kids = Children.toArray((first.props as { children?: ReactNode }).children);
  const kidIdx = firstRealIndex(kids);
  if (kidIdx === -1 || typeof kids[kidIdx] !== 'string') return children;
  kids[kidIdx] = (kids[kidIdx] as string).replace(ADMONITION_MARKER_RE, '');

  const emptied = kids.every((k) => typeof k === 'string' && k.trim() === '');
  if (emptied) return arr.filter((_, i) => i !== idx);
  arr[idx] = cloneElement(first, undefined, kids);
  return arr;
}

function AdmonitionAwareBlockquote({
  children,
  variant,
}: {
  children?: ReactNode;
  variant: 'bubble' | 'plain';
}) {
  const marker = markerCandidate(children).match(ADMONITION_MARKER_RE);
  if (!marker) {
    if (variant === 'plain') return <blockquote>{children}</blockquote>;
    return (
      <blockquote
        style={{
          borderLeft: '3px solid rgba(174,137,255,0.5)',
          paddingLeft: '1em',
          margin: '0.6em 0',
          color: 'var(--ink-60)',
          fontStyle: 'italic',
        }}
      >
        {children}
      </blockquote>
    );
  }

  // Unknown markers fall back to `info` — same rule as the editor-insert
  // pipeline in src/lib/markdown-to-html.ts.
  const type = CALLOUT_TYPE_BY_MARKER[marker[1].toLowerCase()] ?? 'info';
  const meta = CALLOUT_RENDER_META[type];
  const content = stripMarker(children);

  return (
    <div
      style={{
        borderLeft: `3px solid ${meta.borderColor}`,
        background: meta.bgColor,
        borderRadius: '8px',
        padding: '10px 14px',
        margin: '0.6em 0',
        display: 'flex',
        gap: '10px',
        alignItems: 'flex-start',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-label={meta.label}
        style={{ fontSize: 18, color: meta.borderColor, marginTop: 3, flexShrink: 0 }}
      >
        {meta.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>{content}</div>
    </div>
  );
}

/** Highlight code via lowlight → HTML string */
function highlightCode(code: string, lang: string | null): string {
  try {
    const tree =
      lang && lowlight.registered(lang)
        ? lowlight.highlight(lang, code)
        : lowlight.highlightAuto(code);
    return toHtml(tree);
  } catch {
    // Fallback: escape HTML and return plain
    return code.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

interface MarkdownRendererProps {
  content: string;
  /** Use 'bubble' (default) for chat bubbles, 'plain' for inline/minimal contexts */
  variant?: 'bubble' | 'plain';
}

const bubbleComponents: Components = {
  h1: ({ children }) => (
    <h1
      style={{
        fontFamily: 'var(--font-chat)',
        fontSize: '2em',
        fontWeight: 700,
        color: 'var(--md-h1)',
        margin: '1em 0 0.5em',
        lineHeight: 1.2,
        letterSpacing: '-0.01em',
      }}
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2
      style={{
        fontFamily: 'var(--font-chat)',
        fontSize: '1.55em',
        fontWeight: 700,
        color: 'var(--md-h2)',
        margin: '0.9em 0 0.4em',
        lineHeight: 1.25,
        letterSpacing: '-0.01em',
        paddingBottom: '0.25em',
        borderBottom: '1px solid rgba(174,137,255,0.30)',
      }}
    >
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3
      style={{
        fontSize: '1.25em',
        fontWeight: 700,
        color: 'var(--md-h3)',
        margin: '0.75em 0 0.35em',
        lineHeight: 1.3,
      }}
    >
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4
      style={{
        fontSize: '1.1em',
        fontWeight: 700,
        color: 'var(--md-h4)',
        margin: '0.6em 0 0.3em',
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
      }}
    >
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p
      style={{
        margin: '0.5em 0',
        lineHeight: 1.72,
        color: 'inherit',
      }}
    >
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong style={{ fontWeight: 700, color: 'var(--md-text)' }}>{children}</strong>
  ),
  em: ({ children }) => <em style={{ fontStyle: 'italic', color: 'var(--md-em)' }}>{children}</em>,
  ul: ({ children }) => (
    <ul
      style={{
        margin: '0.5em 0',
        paddingLeft: '1.4em',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3em',
      }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      style={{
        margin: '0.5em 0',
        paddingLeft: '1.6em',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.3em',
      }}
    >
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li
      style={{
        lineHeight: 1.65,
        color: 'inherit',
        paddingLeft: '0.2em',
      }}
    >
      {children}
    </li>
  ),
  code: ({ children, className }) => {
    const match = className?.match(/language-(\w+)/);
    const lang = match ? match[1] : null;
    const codeString = String(children).replace(/\n$/, '');
    const isBlock = !!className;

    if (isBlock) {
      const html = highlightCode(codeString, lang);
      return (
        <code
          className="hljs"
          dangerouslySetInnerHTML={{ __html: html }}
          style={{
            display: 'block',
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            whiteSpace: 'pre',
            overflowX: 'auto',
          }}
        />
      );
    }

    // Inline code
    return (
      <code
        style={{
          background: 'rgba(140,82,255,0.15)',
          border: '1px solid rgba(140,82,255,0.22)',
          borderRadius: '5px',
          padding: '2px 7px',
          fontSize: '0.85em',
          fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
          color: 'var(--md-code)',
        }}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre
      style={{
        margin: '0.6em 0',
        background: 'rgba(0,0,0,0.4)',
        border: '1px solid rgba(174,137,255,0.36)',
        borderRadius: '8px',
        padding: '14px 16px',
        // Long code lines scroll horizontally instead of being clipped (was
        // overflow:hidden, which silently truncated wide code on phones).
        overflowX: 'auto',
        maxWidth: '100%',
        minWidth: 0,
        fontSize: '0.82em',
        lineHeight: 1.6,
        color: 'var(--md-pre)',
      }}
    >
      {children}
    </pre>
  ),
  blockquote: ({ children }) => (
    <AdmonitionAwareBlockquote variant="bubble">{children}</AdmonitionAwareBlockquote>
  ),
  hr: () => (
    <hr
      style={{
        border: 'none',
        borderTop: '1px solid rgba(174,137,255,0.40)',
        margin: '0.75em 0',
      }}
    />
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: 'var(--md-link)',
        textDecoration: 'underline',
        textDecorationColor: 'rgba(174,137,255,0.4)',
        textUnderlineOffset: '2px',
      }}
    >
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '0.6em 0' }}>
      <table
        style={{
          borderCollapse: 'collapse',
          width: '100%',
          fontSize: '0.9em',
        }}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ borderBottom: '2px solid rgba(174,137,255,0.45)' }}>{children}</thead>
  ),
  th: ({ children }) => (
    <th
      scope="col"
      style={{
        padding: '8px 12px',
        textAlign: 'left',
        color: 'var(--md-h3)',
        fontWeight: 700,
        fontSize: '0.85em',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      style={{
        padding: '8px 12px',
        borderBottom: '1px solid rgba(174,137,255,0.20)',
        color: 'var(--ink-70)',
      }}
    >
      {children}
    </td>
  ),
};

// The plain variant keeps default elements for everything except blockquotes,
// which still need the admonition treatment so callouts render as callouts in
// minimal contexts (e.g. the inline-AI preview popover).
const plainComponents: Components = {
  blockquote: ({ children }) => (
    <AdmonitionAwareBlockquote variant="plain">{children}</AdmonitionAwareBlockquote>
  ),
};

export default function MarkdownRenderer({ content, variant = 'bubble' }: MarkdownRendererProps) {
  return (
    <div
      style={{
        lineHeight: 1.7,
        fontSize: 'inherit',
        color: 'inherit',
      }}
      className="md-renderer"
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={variant === 'bubble' ? bubbleComponents : plainComponents}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
