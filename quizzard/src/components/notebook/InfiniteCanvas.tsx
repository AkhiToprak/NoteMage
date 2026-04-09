'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { Loader } from 'lucide-react';
import { getSceneVersion } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from '@excalidraw/excalidraw/element/types';

// Excalidraw uses browser-only APIs — must be dynamically imported with SSR off.
const Excalidraw = dynamic(
  async () => (await import('@excalidraw/excalidraw')).Excalidraw,
  { ssr: false }
);

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

/**
 * Persisted shape we write back to the DB. We deliberately avoid persisting
 * the full AppState because it contains ephemeral data (selection, zoom,
 * pointer, collaborators, etc). Only viewBackgroundColor is kept.
 */
type PersistedScene = {
  elements: readonly ExcalidrawElement[];
  appState: { viewBackgroundColor: string };
  files: BinaryFiles;
};

const DEFAULT_BG = '#0d0c1f';

/**
 * Detect whether `raw` looks like an Excalidraw scene. Legacy rows may contain
 * tldraw store snapshots (shaped differently), which we silently drop and
 * start from a blank canvas — the next save overwrites the row.
 */
function toExcalidrawInitialData(raw: unknown): ExcalidrawInitialDataState | null {
  if (!raw || typeof raw !== 'object') return null;
  const maybe = raw as Record<string, unknown>;
  if (!Array.isArray(maybe.elements)) return null;

  const savedAppState = (maybe.appState ?? {}) as Partial<AppState>;

  return {
    elements: maybe.elements as readonly ExcalidrawElement[],
    appState: {
      viewBackgroundColor: savedAppState.viewBackgroundColor ?? DEFAULT_BG,
    },
    files: (maybe.files as BinaryFiles) ?? undefined,
    scrollToContent: true,
  };
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
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const lastSceneVersionRef = useRef<number>(-1);
  titleRef.current = title;

  /* ─── Fetch page data ───────────────────────────────────────────────── */
  useEffect(() => {
    isMountedRef.current = true;
    setIsLoading(true);
    setNotFound(false);
    lastSceneVersionRef.current = -1;

    (async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/pages/${pageId}`);
        if (res.status === 404) {
          if (isMountedRef.current) setNotFound(true);
          return;
        }
        const json = await res.json();
        if (json.success && isMountedRef.current) {
          setPage(json.data);
          setTitle(json.data.title);
        }
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    })();

    return () => {
      isMountedRef.current = false;
    };
  }, [notebookId, pageId]);

  /* ─── Save pipeline ─────────────────────────────────────────────────── */
  const save = useCallback(
    async (canvasState: PersistedScene | Record<string, never>, pageTitle: string) => {
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
    [notebookId, pageId]
  );

  // Keep save in a ref so handleChange can stay perfectly stable.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  /* ─── Excalidraw onChange — version-gated + 2s debounce ─────────────── */
  const handleChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      const version = getSceneVersion(elements);
      if (version === lastSceneVersionRef.current) return;
      // First onChange fires at mount — prime the version ref without saving.
      if (lastSceneVersionRef.current === -1) {
        lastSceneVersionRef.current = version;
        return;
      }
      lastSceneVersionRef.current = version;

      setSaveStatus('unsaved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveRef.current(
          {
            elements: elements as readonly ExcalidrawElement[],
            appState: { viewBackgroundColor: appState.viewBackgroundColor },
            files,
          },
          titleRef.current
        );
      }, 2000);
    },
    []
  );

  /* ─── Title change → debounced save (canvas snapshot read from API) ─ */
  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const api = excalidrawAPIRef.current;
      if (!api) {
        saveRef.current({}, newTitle);
        return;
      }
      const elements = api.getSceneElements();
      const appState = api.getAppState();
      const files = api.getFiles();
      saveRef.current(
        {
          elements: elements as readonly ExcalidrawElement[],
          appState: { viewBackgroundColor: appState.viewBackgroundColor },
          files,
        },
        newTitle
      );
    }, 1500);
  }, []);

  /* ─── Cleanup timer on unmount ──────────────────────────────────────── */
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, []);

  /* ─── Derive initial data from fetched page (memoized per page) ─────── */
  const initialData = useMemo<ExcalidrawInitialDataState | null>(() => {
    if (!page) return null;
    const parsed = toExcalidrawInitialData(page.content);
    if (parsed) return parsed;
    return {
      elements: [],
      appState: { viewBackgroundColor: DEFAULT_BG },
    };
  }, [page]);

  /* ─── Render ────────────────────────────────────────────────────────── */

  if (isLoading) {
    return (
      <div style={{ padding: '40px 56px' }}>
        <style>{`@keyframes pulse { 0%,100%{opacity:1} 50%{opacity:.4} }`}</style>
        <div
          style={{
            width: '240px',
            height: '28px',
            borderRadius: '8px',
            background: 'rgba(237,233,255,0.08)',
            marginBottom: '24px',
            animation: 'pulse 1.5s ease-in-out infinite',
          }}
        />
        <div
          style={{
            width: '100%',
            height: '400px',
            borderRadius: '12px',
            background: 'rgba(237,233,255,0.04)',
            animation: 'pulse 1.5s ease-in-out infinite 0.1s',
          }}
        />
      </div>
    );
  }

  if (notFound) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          minHeight: '400px',
        }}
      >
        <p style={{ fontFamily: 'inherit', fontSize: '15px', color: 'rgba(237,233,255,0.3)' }}>
          Page not found.
        </p>
      </div>
    );
  }

  if (!page || !initialData) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
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
              background: 'none',
              border: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              fontSize: '32px',
              fontWeight: 700,
              color: '#ede9ff',
              letterSpacing: '-0.04em',
              lineHeight: 1.2,
              padding: 0,
            }}
          />
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              flexShrink: 0,
              fontFamily: 'inherit',
              fontSize: '11px',
              color:
                saveStatus === 'saved'
                  ? 'rgba(237,233,255,0.2)'
                  : saveStatus === 'saving'
                    ? 'rgba(140,82,255,0.6)'
                    : 'rgba(249,115,22,0.6)',
              transition: 'color 0.2s',
            }}
          >
            {saveStatus === 'saving' && (
              <Loader size={11} style={{ animation: 'spin 0.8s linear infinite' }} />
            )}
            {saveStatus === 'saved' && 'Saved'}
            {saveStatus === 'saving' && 'Saving...'}
            {saveStatus === 'unsaved' && 'Unsaved'}
          </div>
        </div>
        <p
          style={{
            fontFamily: 'inherit',
            fontSize: '11px',
            color: 'rgba(237,233,255,0.22)',
            margin: '0 0 0 2px',
          }}
        >
          {new Date(page.updatedAt).toLocaleString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
          })}
        </p>
        <div style={{ height: '1px', background: 'rgba(140,82,255,0.1)', margin: '14px 0 0' }} />
      </div>

      {/* Canvas — absolute-inset wrapper gives Excalidraw a deterministic size */}
      <div style={{ flex: 1, position: 'relative', minHeight: 0 }}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <Excalidraw
            initialData={initialData}
            onChange={handleChange}
            excalidrawAPI={(api) => {
              excalidrawAPIRef.current = api;
            }}
            theme="dark"
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                export: false,
                clearCanvas: true,
                changeViewBackgroundColor: true,
                toggleTheme: false,
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
