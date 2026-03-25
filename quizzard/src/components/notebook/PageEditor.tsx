'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight';
import { all, createLowlight } from 'lowlight';
import UnderlineExt from '@tiptap/extension-underline';
import CodeBlockView from './CodeBlockView';

// Create lowlight instance once at module level with ALL languages
const lowlightInstance = createLowlight(all);
import { TextStyle } from '@tiptap/extension-text-style';
import Color from '@tiptap/extension-color';
import Highlight from '@tiptap/extension-highlight';
import Placeholder from '@tiptap/extension-placeholder';
import Typography from '@tiptap/extension-typography';
import FontFamily from '@tiptap/extension-font-family';
import { Loader } from 'lucide-react';
import EditorToolbar from './EditorToolbar';
import DrawingCanvas from './DrawingCanvas';
import type { StrokeData } from './DrawingCanvas';
import { ResizableImage } from './ResizableImage';
import { FontSize } from '@/lib/tiptap-font-size';
import { InlineHeading } from '@/lib/tiptap-inline-heading';
import PageLockIndicator from './PageLockIndicator';

interface PageData {
  id: string;
  title: string;
  content: Record<string, unknown> | null;
  textContent: string | null;
  drawingData: unknown;
  sectionId: string;
  updatedAt: string;
}

interface PageEditorProps {
  notebookId: string;
  pageId: string;
  coWorkSessionId?: string | null;
  currentUserId?: string | null;
}

export default function PageEditor({ notebookId, pageId, coWorkSessionId, currentUserId }: PageEditorProps) {
  const [page, setPage] = useState<PageData | null>(null);
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [showDrawing, setShowDrawing] = useState(false);
  const [lockedByOther, setLockedByOther] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const titleRef = useRef(title);
  titleRef.current = title;

  // Co-work page locking
  useEffect(() => {
    if (!coWorkSessionId || !currentUserId) return;

    let heartbeatInterval: ReturnType<typeof setInterval>;

    const acquireLock = async () => {
      try {
        const res = await fetch(
          `/api/notebooks/${notebookId}/cowork/${coWorkSessionId}/lock/${pageId}`,
          { method: 'POST' }
        );
        if (res.status === 409) {
          setLockedByOther(true);
        } else if (res.ok) {
          setLockedByOther(false);
        }
      } catch {
        // silent
      }
    };

    const releaseLock = async () => {
      try {
        await fetch(
          `/api/notebooks/${notebookId}/cowork/${coWorkSessionId}/lock/${pageId}`,
          { method: 'DELETE' }
        );
      } catch {
        // silent
      }
    };

    acquireLock();
    // Heartbeat every 2 minutes
    heartbeatInterval = setInterval(acquireLock, 2 * 60 * 1000);

    // Release lock on tab close
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable cleanup on tab close
      navigator.sendBeacon(
        `/api/notebooks/${notebookId}/cowork/${coWorkSessionId}/lock/${pageId}`,
        // sendBeacon doesn't support DELETE, so the lock will auto-expire after 5 min
      );
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    // Release lock on unmount or page change
    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      releaseLock();
    };
  }, [coWorkSessionId, currentUserId, notebookId, pageId]);

  const handleSaveDrawing = useCallback(
    async (strokes: StrokeData[]) => {
      try {
        await fetch(`/api/notebooks/${notebookId}/pages/${pageId}/drawing`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drawingData: strokes }),
        });
      } catch {
        // silent
      }
    },
    [notebookId, pageId],
  );

  useEffect(() => {
    isMountedRef.current = true;
    setIsLoading(true);
    setNotFound(false);

    (async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/pages/${pageId}`);
        if (res.status === 404) { setNotFound(true); return; }
        const json = await res.json();
        if (json.success) { setPage(json.data); setTitle(json.data.title); }
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    })();

    return () => { isMountedRef.current = false; };
  }, [notebookId, pageId]);

  const save = useCallback(
    async (contentJson: Record<string, unknown>, plainText: string, pageTitle: string) => {
      setSaveStatus('saving');
      try {
        await fetch(`/api/notebooks/${notebookId}/pages/${pageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: pageTitle, content: contentJson, textContent: plainText }),
        });
        if (isMountedRef.current) setSaveStatus('saved');
      } catch {
        if (isMountedRef.current) setSaveStatus('unsaved');
      }
    },
    [notebookId, pageId],
  );

  const scheduleSave = useCallback(
    (contentJson: Record<string, unknown>, plainText: string) => {
      setSaveStatus('unsaved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        save(contentJson, plainText, titleRef.current);
      }, 1500);
    },
    [save],
  );

  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: !lockedByOther,
      extensions: [
        StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }),
        CodeBlockLowlight.extend({
          addNodeView() {
            return ReactNodeViewRenderer(CodeBlockView);
          },
        }).configure({ lowlight: lowlightInstance, defaultLanguage: 'javascript' }),
        UnderlineExt,
        TextStyle,
        FontFamily,
        FontSize,
        Color,
        Highlight.configure({ multicolor: true }),
        InlineHeading,
        ResizableImage,
        Placeholder.configure({ placeholder: lockedByOther ? 'This page is being edited by someone else...' : 'Start writing...' }),
        Typography,
      ],
      content: page?.content ?? '',
      editorProps: {
        attributes: { class: 'quizzard-editor' },
      },
      onUpdate: ({ editor: ed }) => {
        const json = ed.getJSON() as Record<string, unknown>;
        scheduleSave(json, ed.getText());
      },
    },
    [page, lockedByOther],
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      if (!editor) return;
      setSaveStatus('unsaved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const json = editor.getJSON() as Record<string, unknown>;
        save(json, editor.getText(), newTitle);
      }, 1500);
    },
    [editor, save],
  );

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  /* ── Loading skeleton ── */
  if (isLoading) {
    return (
      <div style={{ padding: '40px 56px' }}>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
        <div style={{ width: '240px', height: '28px', borderRadius: '8px', background: 'rgba(237,233,255,0.08)', marginBottom: '24px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        {[1, 0.9, 0.7].map((w, i) => (
          <div key={i} style={{ width: `${w * 100}%`, height: '14px', borderRadius: '6px', background: 'rgba(237,233,255,0.05)', marginBottom: '12px', animation: `pulse 1.5s ease-in-out infinite ${i * 0.1}s` }} />
        ))}
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '400px' }}>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '15px', color: 'rgba(237,233,255,0.3)' }}>Page not found.</p>
      </div>
    );
  }

  if (!page) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <style>{`
        /* ── editor base ── */
        .quizzard-editor {
          outline: none;
          min-height: 100%;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          color: #ede9ff;
          line-height: 1.75;
          caret-color: #a47bff;
        }
        /* ── headings ── */
        .quizzard-editor h1 { font-size: 30px; font-weight: 700; letter-spacing: -0.03em; margin: 28px 0 10px; line-height: 1.2; }
        .quizzard-editor h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 22px 0 8px; line-height: 1.3; }
        .quizzard-editor h3 { font-size: 18px; font-weight: 600; margin: 18px 0 6px; line-height: 1.4; }
        /* ── inline formatting ── */
        .quizzard-editor strong, .quizzard-editor b { font-weight: 700 !important; }
        .quizzard-editor em, .quizzard-editor i { font-style: italic !important; }
        .quizzard-editor u { text-decoration: underline !important; }
        .quizzard-editor s { text-decoration: line-through !important; }
        /* ── paragraph ── */
        .quizzard-editor p { margin: 0 0 10px; }
        /* ── lists ── */
        .quizzard-editor ul { list-style-type: disc !important; padding-left: 28px; margin: 8px 0 10px; }
        .quizzard-editor ol { list-style-type: decimal !important; padding-left: 28px; margin: 8px 0 10px; }
        .quizzard-editor li { margin: 3px 0; display: list-item !important; }
        .quizzard-editor li p { margin: 0; }
        /* ── blockquote ── */
        .quizzard-editor blockquote { border-left: 3px solid #8c52ff; padding-left: 16px; color: rgba(237,233,255,0.6); margin: 12px 0; }
        /* ── inline code ── */
        .quizzard-editor code { background: rgba(140,82,255,0.14); padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace; color: #c4a9ff; }
        /* ── code block ── */
        .quizzard-editor pre {
          background: rgba(140,82,255,0.06);
          border: 1px solid rgba(140,82,255,0.15);
          padding: 16px 18px;
          border-radius: 10px;
          overflow-x: auto;
          margin: 12px 0;
          font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
          font-size: 13px;
          line-height: 1.65;
          color: #ede9ff;
        }
        .quizzard-editor pre code { background: none; padding: 0; border-radius: 0; color: inherit; font-size: inherit; display: block; }
        .quizzard-editor .code-block-wrapper select option { background: #1a1428; color: #e0daf8; }
        /* ── syntax highlighting tokens ── */
        .quizzard-editor .hljs-keyword,
        .quizzard-editor .hljs-selector-tag,
        .quizzard-editor .hljs-built_in { color: #c4a0ff; }
        .quizzard-editor .hljs-string,
        .quizzard-editor .hljs-attr { color: #ffde59; }
        .quizzard-editor .hljs-number,
        .quizzard-editor .hljs-literal { color: #ff9e64; }
        .quizzard-editor .hljs-function,
        .quizzard-editor .hljs-title,
        .quizzard-editor .hljs-title.function_ { color: #7ec8ff; }
        .quizzard-editor .hljs-params { color: #e0daf8; font-style: italic; }
        .quizzard-editor .hljs-comment,
        .quizzard-editor .hljs-quote { color: #7a72a0; font-style: italic; }
        .quizzard-editor .hljs-variable,
        .quizzard-editor .hljs-template-variable { color: #e0daf8; }
        .quizzard-editor .hljs-type,
        .quizzard-editor .hljs-class .hljs-title { color: #7ec8ff; }
        .quizzard-editor .hljs-tag { color: #c4a0ff; }
        .quizzard-editor .hljs-name { color: #c4a0ff; }
        .quizzard-editor .hljs-attribute { color: #b9c3ff; }
        .quizzard-editor .hljs-symbol,
        .quizzard-editor .hljs-bullet { color: #ff9e64; }
        .quizzard-editor .hljs-addition { color: #a6e3a1; }
        .quizzard-editor .hljs-deletion { color: #ff6b8a; }
        .quizzard-editor .hljs-operator { color: #c4a0ff; }
        .quizzard-editor .hljs-punctuation { color: #8b85a8; }
        .quizzard-editor .hljs-property { color: #b9c3ff; }
        .quizzard-editor .hljs-regexp { color: #ff9e64; }
        .quizzard-editor .hljs-meta { color: #ae89ff; }
        /* ── mark / highlight ── */
        .quizzard-editor mark { border-radius: 3px; padding: 1px 3px; }
        /* ── placeholder ── */
        .quizzard-editor p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: rgba(237,233,255,0.2);
          pointer-events: none;
          float: left;
          height: 0;
        }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
      `}</style>

      {/* ── Co-work lock banner ── */}
      {coWorkSessionId && currentUserId && lockedByOther && (
        <PageLockIndicator
          notebookId={notebookId}
          sessionId={coWorkSessionId}
          pageId={pageId}
          currentUserId={currentUserId}
        />
      )}

      {/* ── Title + save status ── */}
      <div style={{ padding: '32px 56px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled"
            readOnly={lockedByOther}
            style={{
              flex: 1,
              background: 'none', border: 'none', outline: 'none',
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '32px', fontWeight: 700,
              color: '#ede9ff',
              letterSpacing: '-0.04em', lineHeight: 1.2, padding: 0,
            }}
          />
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0,
            fontFamily: "'DM Sans', sans-serif", fontSize: '11px',
            color: saveStatus === 'saved'
              ? 'rgba(237,233,255,0.2)'
              : saveStatus === 'saving' ? 'rgba(140,82,255,0.6)' : 'rgba(249,115,22,0.6)',
            transition: 'color 0.2s',
          }}>
            {saveStatus === 'saving' && <Loader size={11} style={{ animation: 'spin 0.8s linear infinite' }} />}
            {saveStatus === 'saved' && 'Saved'}
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'unsaved' && 'Unsaved'}
          </div>
        </div>
        <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: '11px', color: 'rgba(237,233,255,0.22)', margin: '0 0 0 2px' }}>
          {new Date(page.updatedAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
        <div style={{ height: '1px', background: 'rgba(140,82,255,0.1)', margin: '14px 0 0' }} />
      </div>

      {/* ── Toolbar ── */}
      <EditorToolbar
        editor={editor}
        notebookId={notebookId}
        pageId={pageId}
        onToggleDrawing={() => setShowDrawing((v) => !v)}
        isDrawing={showDrawing}
      />

      {/* ── Editor canvas (full width, infinite scroll) ── */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        <div style={{ padding: '28px 56px 80px', minHeight: '100%' }}>
          <EditorContent editor={editor} />
        </div>
        {showDrawing && (
          <DrawingCanvas
            drawingData={(page?.drawingData as StrokeData[]) ?? []}
            onSave={handleSaveDrawing}
            onClose={() => setShowDrawing(false)}
          />
        )}
      </div>
    </div>
  );
}
