'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Tldraw, type Editor as TldrawEditor } from 'tldraw';
import 'tldraw/tldraw.css';
import { Loader } from 'lucide-react';

interface CanvasPageData {
  id: string;
  title: string;
  content: Record<string, unknown> | null;
  sectionId: string;
  updatedAt: string;
  pageType: string;
}

interface InfiniteCanvasProps {
  notebookId: string;
  pageId: string;
}

export default function InfiniteCanvas({ notebookId, pageId }: InfiniteCanvasProps) {
  const [page, setPage] = useState<CanvasPageData | null>(null);
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const titleRef = useRef(title);
  const editorRef = useRef<TldrawEditor | null>(null);
  titleRef.current = title;

  // Fetch page data
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
    async (canvasState: Record<string, unknown>, pageTitle: string) => {
      setSaveStatus('saving');
      try {
        await fetch(`/api/notebooks/${notebookId}/pages/${pageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: pageTitle, content: canvasState }),
        });
        if (isMountedRef.current) setSaveStatus('saved');
      } catch {
        if (isMountedRef.current) setSaveStatus('unsaved');
      }
    },
    [notebookId, pageId],
  );

  const scheduleSave = useCallback(
    (canvasState: Record<string, unknown>) => {
      setSaveStatus('unsaved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        save(canvasState, titleRef.current);
      }, 2000);
    },
    [save],
  );

  const handleTitleChange = useCallback(
    (newTitle: string) => {
      setTitle(newTitle);
      setSaveStatus('unsaved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        if (!editorRef.current) {
          save({}, newTitle);
          return;
        }
        const snapshot = editorRef.current.store.getStoreSnapshot();
        save(snapshot as unknown as Record<string, unknown>, newTitle);
      }, 1500);
    },
    [save],
  );

  const handleMount = useCallback(
    (editor: TldrawEditor) => {
      editorRef.current = editor;

      // Load saved canvas state
      if (page?.content && typeof page.content === 'object' && Object.keys(page.content).length > 0) {
        try {
          editor.store.loadStoreSnapshot(page.content as Parameters<typeof editor.store.loadStoreSnapshot>[0]);
        } catch {
          // If loading fails, start with empty canvas
        }
      }

      // Subscribe to store changes for auto-save
      const unsub = editor.store.listen(() => {
        const snapshot = editor.store.getStoreSnapshot();
        scheduleSave(snapshot as unknown as Record<string, unknown>);
      }, { source: 'user', scope: 'document' });

      return () => {
        unsub();
      };
    },
    [page, scheduleSave],
  );

  useEffect(() => {
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, []);

  /* Loading skeleton */
  if (isLoading) {
    return (
      <div style={{ padding: '40px 56px' }}>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
        <div style={{ width: '240px', height: '28px', borderRadius: '8px', background: 'rgba(237,233,255,0.08)', marginBottom: '24px', animation: 'pulse 1.5s ease-in-out infinite' }} />
        <div style={{ width: '100%', height: '400px', borderRadius: '12px', background: 'rgba(237,233,255,0.04)', animation: 'pulse 1.5s ease-in-out infinite 0.1s' }} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', minHeight: '400px' }}>
        <p style={{ fontFamily: 'inherit', fontSize: '15px', color: 'rgba(237,233,255,0.3)' }}>Page not found.</p>
      </div>
    );
  }

  if (!page) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        /* Override tldraw theme for dark mode compatibility */
        .tl-container {
          --color-background: #0d0c1f !important;
        }
      `}</style>

      {/* Title + save status */}
      <div style={{ padding: '32px 56px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled Canvas"
            style={{
              flex: 1,
              background: 'none', border: 'none', outline: 'none',
              fontFamily: 'inherit',
              fontSize: '32px', fontWeight: 700,
              color: '#ede9ff',
              letterSpacing: '-0.04em', lineHeight: 1.2, padding: 0,
            }}
          />
          <div style={{
            display: 'flex', alignItems: 'center', gap: '5px', flexShrink: 0,
            fontFamily: 'inherit', fontSize: '11px',
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
        <p style={{ fontFamily: 'inherit', fontSize: '11px', color: 'rgba(237,233,255,0.22)', margin: '0 0 0 2px' }}>
          {new Date(page.updatedAt).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
        </p>
        <div style={{ height: '1px', background: 'rgba(140,82,255,0.1)', margin: '14px 0 0' }} />
      </div>

      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <Tldraw
          onMount={handleMount}
          inferDarkMode
        />
      </div>
    </div>
  );
}
