'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { all, createLowlight } from 'lowlight';
import { toHtml } from 'hast-util-to-html';
import type { Components } from 'react-markdown';

const lowlight = createLowlight(all);

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
        components={variant === 'bubble' ? bubbleComponents : undefined}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
