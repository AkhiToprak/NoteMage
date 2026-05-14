'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import UnderlineExt from '@tiptap/extension-underline';
import Typography from '@tiptap/extension-typography';
import Highlight from '@tiptap/extension-highlight';
import { InlineMath, BlockMath } from '@/lib/tiptap-math';

// Phase 10.6 — read-only TipTap viewer for `TheoryContent.body`.
//
// The orchestrator (path-generator.ts → theoryInputToTipTap) emits a
// minimal subset of TipTap nodes: doc / paragraph / heading (h2-h4) /
// bulletList / listItem, plus inlineMath / blockMath when the AI used
// `$...$` / `$$...$$` LaTeX. StarterKit covers the prose nodes; the
// math extensions render via katex.renderToString at mount time.
//
// `editable: false` puts the editor in pure-render mode — no toolbar,
// no slash-commands, no focus management. The drawer hosts navigation
// (Mark as read & continue →) outside this component.

interface TheoryViewerProps {
  body: unknown; // TipTap JSON document
}

export default function TheoryViewer({ body }: TheoryViewerProps) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    extensions: [
      StarterKit.configure({
        // Heading is provided by StarterKit; we let it handle h1–h6.
        codeBlock: false,
      }),
      UnderlineExt,
      Highlight.configure({ multicolor: true }),
      Typography,
      InlineMath,
      BlockMath,
    ],
    // Defensive: if the JSON is missing or malformed we fall back to an
    // empty doc rather than crashing TipTap.
    content: (body as object) ?? { type: 'doc', content: [{ type: 'paragraph' }] },
  });

  if (!editor) {
    return (
      <p style={{ color: 'var(--on-surface-variant)', fontSize: '14px' }}>
        Loading lesson…
      </p>
    );
  }

  return (
    <div
      className="learn-theory-viewer"
      style={{
        color: 'var(--on-surface)',
        fontSize: '15px',
        lineHeight: 1.6,
      }}
    >
      <style>{`
        .learn-theory-viewer h1,
        .learn-theory-viewer h2,
        .learn-theory-viewer h3,
        .learn-theory-viewer h4 {
          font-family: var(--font-display);
          color: var(--on-surface);
          letter-spacing: -0.01em;
        }
        .learn-theory-viewer h2 {
          font-size: 22px;
          font-weight: 800;
          margin: 0 0 12px;
        }
        .learn-theory-viewer h3 {
          font-size: 17px;
          font-weight: 700;
          margin: 20px 0 8px;
        }
        .learn-theory-viewer h4 {
          font-size: 15px;
          font-weight: 700;
          margin: 14px 0 4px;
        }
        .learn-theory-viewer p {
          margin: 0 0 12px;
          color: var(--on-surface);
        }
        .learn-theory-viewer ul {
          margin: 0 0 14px;
          padding-left: 22px;
          color: var(--on-surface);
        }
        .learn-theory-viewer li { margin-bottom: 4px; }
        .learn-theory-viewer ol {
          margin: 0 0 14px;
          padding-left: 22px;
          color: var(--on-surface);
        }
        .learn-theory-viewer strong { color: var(--on-surface); }
        .learn-theory-viewer em { color: var(--on-surface); }
        .learn-theory-viewer code {
          background: var(--surface-container-high);
          color: var(--on-surface);
          padding: 1px 5px;
          border-radius: 4px;
          font-size: 13px;
        }
        .learn-theory-viewer blockquote {
          margin: 0 0 12px;
          padding: 8px 14px;
          border-left: 3px solid var(--primary);
          background: var(--surface-container-low);
          color: var(--on-surface);
          border-radius: 0 var(--radius-md) var(--radius-md) 0;
        }
      `}</style>
      <EditorContent editor={editor} />
    </div>
  );
}
