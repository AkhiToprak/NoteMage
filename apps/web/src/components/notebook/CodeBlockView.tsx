'use client';

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';

const POPULAR_LANGUAGES = [
  { value: '', label: 'Auto-detect' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
  { value: 'java', label: 'Java' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
  { value: 'csharp', label: 'C#' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'php', label: 'PHP' },
  { value: 'swift', label: 'Swift' },
  { value: 'kotlin', label: 'Kotlin' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'scss', label: 'SCSS' },
  { value: 'sql', label: 'SQL' },
  { value: 'bash', label: 'Bash' },
  { value: 'shell', label: 'Shell' },
  { value: 'json', label: 'JSON' },
  { value: 'yaml', label: 'YAML' },
  { value: 'xml', label: 'XML' },
  { value: 'markdown', label: 'Markdown' },
  { value: 'dockerfile', label: 'Dockerfile' },
  { value: 'graphql', label: 'GraphQL' },
  { value: 'lua', label: 'Lua' },
  { value: 'r', label: 'R' },
  { value: 'plaintext', label: 'Plain Text' },
];

export default function CodeBlockView({ node, updateAttributes, extension }: NodeViewProps) {
  const language = node.attrs.language || '';

  return (
    <NodeViewWrapper as="pre" className="code-block-wrapper">
      <div
        contentEditable={false}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
          padding: '6px 12px 0',
          userSelect: 'none',
        }}
      >
        <select
          value={language}
          onChange={(e) => updateAttributes({ language: e.target.value })}
          style={{
            background: 'rgba(140,82,255,0.12)',
            border: '1px solid rgba(140,82,255,0.2)',
            borderRadius: '5px',
            padding: '2px 8px',
            fontSize: '11px',
            fontFamily: 'inherit',
            color: '#ae89ff',
            cursor: 'pointer',
            outline: 'none',
            appearance: 'auto',
          }}
        >
          {POPULAR_LANGUAGES.map((lang) => (
            <option key={lang.value} value={lang.value}>
              {lang.label}
            </option>
          ))}
        </select>
      </div>
      {/* @ts-expect-error - NodeViewContent supports 'as' prop for custom elements */}
      <NodeViewContent as={'code'} />
    </NodeViewWrapper>
  );
}
