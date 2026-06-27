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

/* Light docs theme — ink headings on cream, slate body, purple/gold accents.
   Lists, the tip callout, and heading-anchor behaviour are handled in the
   <style> block so the ordered list can render the Figma's purple step badges. */
const components: Components = {
  h1: ({ children }) => (
    <h1
      id={slugify(children)}
      style={{
        fontSize: 'clamp(30px, 4vw, 42px)',
        fontWeight: 800,
        letterSpacing: '-0.025em',
        lineHeight: 1.08,
        color: '#18202f',
        margin: '0 0 8px 0',
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
          fontSize: 'clamp(21px, 2.2vw, 26px)',
          fontWeight: 700,
          letterSpacing: '-0.018em',
          lineHeight: 1.2,
          color: '#18202f',
          margin: '48px 0 14px 0',
          position: 'relative',
          scrollMarginTop: 96,
        }}
      >
        <a href={`#${id}`} aria-label={`Link to ${id}`} className="docs-heading-anchor">
          #
        </a>
        {children}
      </h2>
    );
  },
  h3: ({ children }) => (
    <h3
      id={slugify(children)}
      style={{
        fontSize: 18,
        fontWeight: 700,
        letterSpacing: '-0.01em',
        lineHeight: 1.3,
        color: '#18202f',
        margin: '30px 0 8px 0',
        scrollMarginTop: 96,
      }}
    >
      {children}
    </h3>
  ),
  h4: ({ children }) => (
    <h4
      style={{
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        color: '#4326b8',
        margin: '24px 0 8px 0',
      }}
    >
      {children}
    </h4>
  ),
  p: ({ children }) => <p className="docs-p">{children}</p>,
  strong: ({ children }) => <strong style={{ fontWeight: 700, color: '#18202f' }}>{children}</strong>,
  em: ({ children }) => <em style={{ fontStyle: 'italic', color: '#4326b8' }}>{children}</em>,
  ul: ({ children }) => <ul className="docs-ul">{children}</ul>,
  ol: ({ children }) => <ol className="docs-ol">{children}</ol>,
  li: ({ children }) => <li className="docs-li">{children}</li>,
  blockquote: ({ children }) => <blockquote className="docs-tip">{children}</blockquote>,
  code: ({ children, className }) => {
    const isBlock = !!className;
    if (isBlock) {
      return (
        <code
          style={{
            display: 'block',
            fontFamily: '"JetBrains Mono", "Fira Code", monospace',
            fontSize: 13.5,
            lineHeight: 1.6,
            color: '#3a2f6b',
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
          background: '#f1edfb',
          border: '1px solid #e3dbf7',
          borderRadius: 6,
          padding: '1px 7px',
          fontSize: '0.86em',
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          color: '#5b3fd1',
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
        background: '#f6f2ea',
        border: '1px solid #ece6d8',
        borderRadius: 14,
        padding: '16px 18px',
        overflow: 'auto',
      }}
    >
      {children}
    </pre>
  ),
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid #ece6d8', margin: '36px 0' }} />,
  a: ({ href, children }) => {
    const isInternal = href?.startsWith('/') || href?.startsWith('#');
    return (
      <a
        href={href}
        target={isInternal ? undefined : '_blank'}
        rel={isInternal ? undefined : 'noopener noreferrer'}
        style={{
          color: '#7c5cff',
          textDecoration: 'none',
          borderBottom: '1px solid rgba(124,92,255,0.4)',
          paddingBottom: 1,
          transition: 'border-color 0.25s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {children}
      </a>
    );
  },
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '20px 0 28px 0', border: '1px solid #ece6d8', borderRadius: 14 }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 14 }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead style={{ background: '#f6f2ea' }}>{children}</thead>,
  th: ({ children }) => (
    <th
      style={{
        padding: '12px 16px',
        textAlign: 'left',
        fontSize: 11,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: '#4326b8',
        fontWeight: 700,
        borderBottom: '1px solid #ece6d8',
      }}
    >
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td style={{ padding: '12px 16px', borderBottom: '1px solid #ece6d8', color: '#374151', fontSize: 14, lineHeight: 1.6 }}>
      {children}
    </td>
  ),
};

export default function DocsMarkdown({ content }: { content: string }) {
  return (
    <div className="docs-content">
      <style>{`
        .docs-content .docs-p { font-size: 16px; line-height: 1.78; color: #374151; margin: 0 0 18px 0; }
        .docs-content .docs-ul { margin: 4px 0 22px 0; padding: 0 0 0 22px; display: flex; flex-direction: column; gap: 8px; list-style: disc; }
        .docs-content .docs-ul > .docs-li { display: list-item; }
        .docs-content .docs-ul > .docs-li::marker { color: #7c5cff; }
        .docs-content .docs-ol { margin: 8px 0 24px 0; padding: 0; list-style: none; counter-reset: dstep; display: flex; flex-direction: column; gap: 16px; }
        .docs-content .docs-ol > .docs-li { counter-increment: dstep; position: relative; padding-left: 44px; list-style: none; }
        .docs-content .docs-ol > .docs-li::before {
          content: counter(dstep); position: absolute; left: 0; top: -1px;
          width: 28px; height: 28px; border-radius: 999px; background: #7c5cff; color: #fff;
          display: grid; place-items: center; font-size: 14px; font-weight: 700;
        }
        .docs-content .docs-li { font-size: 16px; line-height: 1.7; color: #374151; }
        .docs-content .docs-tip {
          position: relative; margin: 28px 0; padding: 18px 22px 18px 50px;
          background: #ede9ff; border: 1px solid #d9cef2; border-radius: 16px;
        }
        .docs-content .docs-tip::before { content: "✦"; position: absolute; left: 20px; top: 18px; color: #f0a91e; font-size: 17px; }
        .docs-content .docs-tip .docs-p { margin: 0 !important; color: #4326b8 !important; font-weight: 500; }
        .docs-content .docs-heading { cursor: default; }
        .docs-content .docs-heading-anchor {
          position: absolute; left: -26px; top: 50%; transform: translateY(-50%);
          color: #7c5cff; opacity: 0; text-decoration: none; font-size: 18px;
          transition: opacity 0.2s cubic-bezier(0.22,1,0.36,1);
        }
        .docs-content .docs-heading:hover .docs-heading-anchor { opacity: 0.55; }
        .docs-content a:hover { border-bottom-color: #7c5cff !important; }
        .docs-content > *:first-child { margin-top: 0 !important; }
        .docs-content > *:last-child { margin-bottom: 0 !important; }
      `}</style>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
