'use client';

import { useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { all, createLowlight } from 'lowlight';
import { toHtml } from 'hast-util-to-html';
import type { Components } from 'react-markdown';

const lowlight = createLowlight(all);

/** Highlight code via lowlight → HTML string */
function highlightCode(code: string, lang: string | null): string {
  try {
    const tree = lang && lowlight.registered(lang)
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
    <h1 style={{
      fontFamily: '"Shrikhand", serif',
      fontStyle: 'italic',
      fontSize: '1.35em',
      fontWeight: 700,
      color: '#ede9ff',
      margin: '0.75em 0 0.4em',
      lineHeight: 1.2,
      letterSpacing: '-0.01em',
    }}>{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 style={{
      fontFamily: '"Shrikhand", serif',
      fontStyle: 'italic',
      fontSize: '1.15em',
      fontWeight: 700,
      color: '#e0d8ff',
      margin: '0.75em 0 0.35em',
      lineHeight: 1.25,
      letterSpacing: '-0.01em',
      paddingBottom: '0.25em',
      borderBottom: '1px solid rgba(174,137,255,0.15)',
    }}>{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 style={{
      fontSize: '1em',
      fontWeight: 700,
      color: '#c4a9ff',
      margin: '0.65em 0 0.3em',
      lineHeight: 1.3,
    }}>{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 style={{
      fontSize: '0.9em',
      fontWeight: 700,
      color: '#ae89ff',
      margin: '0.5em 0 0.25em',
      textTransform: 'uppercase',
      letterSpacing: '0.06em',
    }}>{children}</h4>
  ),
  p: ({ children }) => (
    <p style={{
      margin: '0.5em 0',
      lineHeight: 1.72,
      color: 'inherit',
    }}>{children}</p>
  ),
  strong: ({ children }) => (
    <strong style={{ fontWeight: 700, color: '#ede9ff' }}>{children}</strong>
  ),
  em: ({ children }) => (
    <em style={{ fontStyle: 'italic', color: '#d4caff' }}>{children}</em>
  ),
  ul: ({ children }) => (
    <ul style={{
      margin: '0.5em 0',
      paddingLeft: '1.4em',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.3em',
    }}>{children}</ul>
  ),
  ol: ({ children }) => (
    <ol style={{
      margin: '0.5em 0',
      paddingLeft: '1.6em',
      display: 'flex',
      flexDirection: 'column',
      gap: '0.3em',
    }}>{children}</ol>
  ),
  li: ({ children }) => (
    <li style={{
      lineHeight: 1.65,
      color: 'inherit',
      paddingLeft: '0.2em',
    }}>{children}</li>
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
      <code style={{
        background: 'rgba(140,82,255,0.15)',
        border: '1px solid rgba(140,82,255,0.22)',
        borderRadius: '5px',
        padding: '2px 7px',
        fontSize: '0.85em',
        fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", monospace',
        color: '#c4a9ff',
      }}>{children}</code>
    );
  },
  pre: ({ children }) => (
    <pre style={{
      margin: '0.6em 0',
      background: 'rgba(0,0,0,0.4)',
      border: '1px solid rgba(140,82,255,0.18)',
      borderRadius: '8px',
      padding: '14px 16px',
      overflow: 'hidden',
      fontSize: '0.82em',
      lineHeight: 1.6,
      color: '#e0daf8',
    }}>{children}</pre>
  ),
  blockquote: ({ children }) => (
    <blockquote style={{
      borderLeft: '3px solid rgba(174,137,255,0.5)',
      paddingLeft: '1em',
      margin: '0.6em 0',
      color: 'rgba(229,227,255,0.65)',
      fontStyle: 'italic',
    }}>{children}</blockquote>
  ),
  hr: () => (
    <hr style={{
      border: 'none',
      borderTop: '1px solid rgba(140,82,255,0.2)',
      margin: '0.75em 0',
    }} />
  ),
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{
        color: '#ae89ff',
        textDecoration: 'underline',
        textDecorationColor: 'rgba(174,137,255,0.4)',
        textUnderlineOffset: '2px',
      }}
    >{children}</a>
  ),
  table: ({ children }) => (
    <div style={{ overflowX: 'auto', margin: '0.6em 0' }}>
      <table style={{
        borderCollapse: 'collapse',
        width: '100%',
        fontSize: '0.9em',
      }}>{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead style={{ borderBottom: '2px solid rgba(140,82,255,0.3)' }}>{children}</thead>
  ),
  th: ({ children }) => (
    <th style={{
      padding: '8px 12px',
      textAlign: 'left',
      color: '#c4a9ff',
      fontWeight: 700,
      fontSize: '0.85em',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
    }}>{children}</th>
  ),
  td: ({ children }) => (
    <td style={{
      padding: '8px 12px',
      borderBottom: '1px solid rgba(140,82,255,0.1)',
      color: 'rgba(229,227,255,0.8)',
    }}>{children}</td>
  ),
};

/* Syntax highlighting token colors matching Quizzard's purple aesthetic */
const HLJS_STYLES = `
  .md-renderer .hljs-keyword,
  .md-renderer .hljs-selector-tag,
  .md-renderer .hljs-built_in { color: #c4a0ff; }
  .md-renderer .hljs-string,
  .md-renderer .hljs-attr { color: #ffde59; }
  .md-renderer .hljs-number,
  .md-renderer .hljs-literal { color: #ff9e64; }
  .md-renderer .hljs-function,
  .md-renderer .hljs-title,
  .md-renderer .hljs-title.function_ { color: #7ec8ff; }
  .md-renderer .hljs-params { color: #e0daf8; font-style: italic; }
  .md-renderer .hljs-comment,
  .md-renderer .hljs-quote { color: #5c5680; font-style: italic; }
  .md-renderer .hljs-variable,
  .md-renderer .hljs-template-variable { color: #e0daf8; }
  .md-renderer .hljs-type,
  .md-renderer .hljs-class .hljs-title { color: #7ec8ff; }
  .md-renderer .hljs-tag { color: #c4a0ff; }
  .md-renderer .hljs-name { color: #c4a0ff; }
  .md-renderer .hljs-attribute { color: #b9c3ff; }
  .md-renderer .hljs-symbol,
  .md-renderer .hljs-bullet { color: #ff9e64; }
  .md-renderer .hljs-addition { color: #a6e3a1; }
  .md-renderer .hljs-deletion { color: #ff6b8a; }
  .md-renderer .hljs-operator { color: #c4a0ff; }
  .md-renderer .hljs-punctuation { color: #8b85a8; }
  .md-renderer .hljs-property { color: #b9c3ff; }
  .md-renderer .hljs-regexp { color: #ff9e64; }
  .md-renderer .hljs-meta { color: #ae89ff; }
`;

export default function MarkdownRenderer({ content, variant = 'bubble' }: MarkdownRendererProps) {
  return (
    <div style={{
      lineHeight: 1.7,
      fontSize: 'inherit',
      color: 'inherit',
    }}
      className="md-renderer"
    >
      <style>{`
        .md-renderer > *:first-child { margin-top: 0 !important; }
        .md-renderer > *:last-child { margin-bottom: 0 !important; }
        .md-renderer ul { list-style-type: disc; }
        .md-renderer ol { list-style-type: decimal; }
        .md-renderer li::marker { color: rgba(174,137,255,0.6); }
        ${HLJS_STYLES}
      `}</style>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={variant === 'bubble' ? bubbleComponents : undefined}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
