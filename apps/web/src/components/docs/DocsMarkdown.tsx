'use client';

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Components } from 'react-markdown';

function slugify(input: React.ReactNode): string {
  const text = React.Children.toArray(input)
    .map((c) => (typeof c === 'string' ? c : ''))
    .join(' ');
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-');
}

const components: Components = {
  h1: ({ children }) => (
    <h1
      id={slugify(children)}
      style={{
        fontFamily: 'var(--font-display)',
        fontSize: 'clamp(34px, 4.2vw, 46px)',
        fontWeight: 800,
        letterSpacing: '-0.025em',
        lineHeight: 1.08,
        color: 'var(--on-surface)',
        margin: '0 0 20px 0',
      }}
    >
      {children}
    </h1>
  ),
  h2: ({ children }) => {
    const id = slugify(children);
    return (
      <h2
        id={id}
        className="docs-heading"
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(22px, 2.4vw, 28px)',
          fontWeight: 800,
          letterSpacing: '-0.018em',
          lineHeight: 1.2,
          color: 'var(--on-surface)',
          margin: '56px 0 16px 0',
          paddingBottom: 12,
          borderBottom: '1px solid rgba(174,137,255,0.14)',
          position: 'relative',
          scrollMarginTop: 100,
        }}
      >
        <a
          href={`#${id}`}
          aria-label={`Link to ${id}`}
          className="docs-heading-anchor"
          style={{
            position: 'absolute',
            left: -28,
            top: '50%',
            transform: 'translateY(-50%)',
            color: 'var(--primary)',
            opacity: 0,
            textDecoration: 'none',
            fontSize: 18,
            transition: 'opacity 0.25s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          #
        </a>
        {children}
      </h2>
    );
  },
  h3: ({ children }) => {
    const id = slugify(children);
    return (
      <h3
        id={id}
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '-0.01em',
          lineHeight: 1.3,
          color: '#dcd4ff',
          margin: '32px 0 10px 0',
          scrollMarginTop: 100,
        }}
      >
        {children}
      </h3>
    );
  },
  h4: ({ children }) => (
    <h4
      style={{
        fontFamily: 'var(--font-brand)',
        fontSize: 12,
        fontWeight: 600,
        letterSpacing: '0.14em',
        textTransform: 'uppercase',
        color: 'var(--primary)',
        margin: '24px 0 8px 0',
      }}
    >
      {children}
    </h4>
  ),
  p: ({ children }) => (
    <p
      style={{
        fontSize: 16,
        lineHeight: 1.78,
        color: 'rgba(238, 236, 255, 0.78)',
        margin: '0 0 18px 0',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {children}
    </p>
  ),
  strong: ({ children }) => (
    <strong style={{ fontWeight: 700, color: 'var(--on-surface)' }}>{children}</strong>
  ),
  em: ({ children }) => <em style={{ fontStyle: 'italic', color: '#d4caff' }}>{children}</em>,
  ul: ({ children }) => (
    <ul
      style={{
        margin: '4px 0 22px 0',
        padding: '0 0 0 22px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        listStyleType: 'disc',
      }}
    >
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol
      style={{
        margin: '4px 0 22px 0',
        padding: '0 0 0 24px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        listStyleType: 'decimal',
      }}
    >
      {children}
    </ol>
  ),
  li: ({ children }) => (
    <li
      style={{
        fontSize: 16,
        lineHeight: 1.7,
        color: 'rgba(238, 236, 255, 0.78)',
        fontFamily: 'var(--font-sans)',
      }}
    >
      {children}
    </li>
  ),
  blockquote: ({ children }) => (
    <blockquote
      style={{
        margin: '24px 0',
        padding: '14px 20px',
        borderLeft: '3px solid var(--primary)',
        background: 'rgba(174,137,255,0.06)',
        borderRadius: '0 var(--radius-md) var(--radius-md) 0',
        color: 'rgba(238, 236, 255, 0.8)',
        fontStyle: 'normal',
      }}
    >
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => {
    const isBlock = !!className;
    if (isBlock) {
      return (
        <code
          style={{
            display: 'block',
            fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
            fontSize: 13.5,
            lineHeight: 1.6,
            color: '#e0daf8',
            whiteSpace: 'pre',
            overflowX: 'auto',
          }}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        style={{
          background: 'rgba(174,137,255,0.12)',
          border: '1px solid rgba(174,137,255,0.22)',
          borderRadius: 6,
          padding: '1px 7px',
          fontSize: '0.86em',
          fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
          color: '#c9b6ff',
        }}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre
      style={{
        margin: '20px 0 24px 0',
        background: 'rgba(16, 16, 42, 0.65)',
        border: '1px solid rgba(174,137,255,0.18)',
        borderRadius: 'var(--radius-md)',
        padding: '16px 18px',
        overflow: 'auto',
      }}
    >
      {children}
    </pre>
  ),
  hr: () => (
    <hr
      style={{
        border: 'none',
        borderTop: '1px solid rgba(174,137,255,0.18)',
        margin: '36px 0',
      }}
    />
  ),
  a: ({ href, children }) => {
    const isInternal = href?.startsWith('/') || href?.startsWith('#');
    return (
      <a
        href={href}
        target={isInternal ? undefined : '_blank'}
        rel={isInternal ? undefined : 'noopener noreferrer'}
        style={{
          color: 'var(--primary)',
          textDecoration: 'none',
          borderBottom: '1px solid rgba(174,137,255,0.4)',
          paddingBottom: 1,
          transition:
            'border-color 0.25s cubic-bezier(0.22,1,0.36,1), color 0.25s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div
      style={{
        overflowX: 'auto',
        margin: '20px 0 28px 0',
        border: '1px solid rgba(174,137,255,0.18)',
        borderRadius: 'var(--radius-md)',
      }}
    >
      <table
        style={{
          borderCollapse: 'collapse',
          width: '100%',
          fontSize: 14,
        }}
      >
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ background: 'rgba(174,137,255,0.08)' }}>{children}</thead>
  ),
  th: ({ children }) => (
    <th
      style={{
        padding: '12px 16px',
        textAlign: 'left',
        fontFamily: 'var(--font-brand)',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        color: 'var(--primary)',
        fontWeight: 600,
        borderBottom: '1px solid rgba(174,137,255,0.18)',
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td
      style={{
        padding: '12px 16px',
        borderBottom: '1px solid rgba(174,137,255,0.08)',
        color: 'rgba(238, 236, 255, 0.78)',
        fontSize: 14,
        lineHeight: 1.6,
      }}
    >
      {children}
    </td>
  ),
};

export default function DocsMarkdown({ content }: { content: string }) {
  return (
    <div className="docs-content">
      <style>{`
        .docs-content .docs-heading:hover .docs-heading-anchor { opacity: 0.6; }
        .docs-content a:hover { border-bottom-color: var(--primary) !important; }
        .docs-content > *:first-child { margin-top: 0 !important; }
        .docs-content > *:last-child { margin-bottom: 0 !important; }
      `}</style>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
