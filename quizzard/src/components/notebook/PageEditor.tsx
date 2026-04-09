'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useEditor, EditorContent, ReactNodeViewRenderer } from '@tiptap/react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
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
import { Table } from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableCell from '@tiptap/extension-table-cell';
import TableHeader from '@tiptap/extension-table-header';
import FontFamily from '@tiptap/extension-font-family';
import { Loader } from 'lucide-react';
import EditorToolbar from './EditorToolbar';
import DrawingOverlay, { hydrateStrokes } from './DrawingOverlay';
import type { StrokeData, EditorMode, ActiveTool, LineStyle, RulerState } from './DrawingOverlay';
import { ResizableImage } from './ResizableImage';
import { FontSize } from '@/lib/tiptap-font-size';
import { InlineHeading } from '@/lib/tiptap-inline-heading';
import { Callout } from '@/lib/tiptap-callout';
import CalloutView from './CalloutView';
import { ToggleHeading } from '@/lib/tiptap-toggle-heading';
import ToggleHeadingView from './ToggleHeadingView';
import PageLockIndicator from './PageLockIndicator';
import {
  SlashCommand,
  type SlashCommandState,
} from '@/lib/tiptap-slash-command';
import SlashMenu from './SlashMenu';
import InlineAIToolbar from './InlineAIToolbar';
import UpsellToast from '@/components/ui/UpsellToast';
import RemoteCursor from './RemoteCursor';
import { useCoworkSocket } from '@/lib/cowork-socket';

/* eslint-disable @typescript-eslint/no-explicit-any */
/** Migrate legacy `heading` nodes to `toggleHeading` nodes in saved content. */
function migrateHeadingsToToggle(doc: any): any {
  if (!doc || !doc.content) return doc;
  return {
    ...doc,
    content: doc.content.map((node: any) => {
      if (node.type === 'heading') {
        const summaryText = (node.content || [])
          .filter((c: any) => c.type === 'text')
          .map((c: any) => c.text)
          .join('');
        return {
          type: 'toggleHeading',
          attrs: {
            level: node.attrs?.level || 1,
            collapsed: false,
            summary: summaryText,
          },
          content: [{ type: 'paragraph' }],
        };
      }
      return node;
    }),
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

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
  highlightTerm?: string;
}

export default function PageEditor({
  notebookId,
  pageId,
  coWorkSessionId,
  currentUserId,
  highlightTerm,
}: PageEditorProps) {
  const { isPhone, isTablet } = useBreakpoint();
  const [page, setPage] = useState<PageData | null>(null);
  const [title, setTitle] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  /**
   * Host-controlled "open editing" flag. When the host flips this on via
   * the CoWorkBar button, all participants receive a `cowork:edit_mode`
   * broadcast and ignore their page lock so they can type freely.
   * When off (default), only the lock holder (usually the host) can edit.
   *
   * Note: simultaneous typing is last-writer-wins at the 1.5s autosave
   * granularity. Real conflict-free editing would need a CRDT/OT layer.
   */
  const [coworkEditOpen, setCoworkEditOpen] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving' | 'unsaved'>('saved');
  const [lockedByOther, setLockedByOther] = useState(false);

  // Drawing state
  const [editorMode, setEditorMode] = useState<EditorMode>('cursor');
  const [penColor, setPenColor] = useState('#ede9ff');
  const [penWidth, setPenWidth] = useState(4);
  const [lineStyle, setLineStyle] = useState<LineStyle>('solid');
  const [activeTool, setActiveTool] = useState<ActiveTool>('pen');
  const [ruler, setRuler] = useState<RulerState>({
    active: false,
    angle: 0,
    position: { x: 400, y: 300 },
  });
  const [strokes, setStrokes] = useState<StrokeData[]>([]);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const titleRef = useRef(title);
  titleRef.current = title;

  /* ─── Inline AI upsell toast state ──────────────────────────────────── */
  const [upsellOpen, setUpsellOpen] = useState(false);
  const handleRequiresUpgrade = useCallback(() => setUpsellOpen(true), []);
  const handleUpsellClose = useCallback(() => setUpsellOpen(false), []);

  /* ─── Co-work remote cursors ────────────────────────────────────────── */
  // Map<userId, { x, y, name, lastSeenAt }> in container-relative pixels.
  // Cursors are dropped after 8 seconds of silence to handle the case where
  // a peer's tab is closed without a clean disconnect.
  type RemoteCursorEntry = { x: number; y: number; name: string; lastSeenAt: number };
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursorEntry>>(
    new Map()
  );
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const coworkSocket = useCoworkSocket(coWorkSessionId ?? null);

  // Cache participant usernames so cursor events can render a name without
  // a per-event fetch. We rely on the participants list returned from the
  // session GET endpoint, fetched once when the session id changes.
  const participantNamesRef = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    if (!coWorkSessionId) {
      participantNamesRef.current.clear();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/notebooks/${notebookId}/cowork/${coWorkSessionId}`
        );
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const participants = json.data?.participants || [];
        const next = new Map<string, string>();
        for (const p of participants) {
          if (p.user?.id && p.user?.username) {
            next.set(p.user.id, p.user.username);
          }
        }
        participantNamesRef.current = next;
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coWorkSessionId, notebookId]);

  /* ─── Slash command menu state ──────────────────────────────────────── */
  const [slashState, setSlashState] = useState<SlashCommandState>({
    isOpen: false,
    query: '',
    range: null,
    clientRect: null,
  });
  // Stable wrapper around setSlashState so the ProseMirror plugin can keep
  // a single function reference across renders without re-instantiating.
  const slashSetterRef = useRef(setSlashState);
  slashSetterRef.current = setSlashState;
  const handleSlashStateChange = useCallback(
    (next: SlashCommandState) => slashSetterRef.current(next),
    []
  );

  /* ─── Co-work cursor: emit own cursor (throttled) ───────────────────── */
  useEffect(() => {
    if (!coworkSocket || !coWorkSessionId || !editorContainerRef.current) return;
    const container = editorContainerRef.current;
    let lastEmit = 0;

    const emit = (clientX: number, clientY: number) => {
      const now = performance.now();
      // ~16 events/sec is plenty for cursor smoothness without saturating
      // a slow connection.
      if (now - lastEmit < 60) return;
      lastEmit = now;

      const rect = container.getBoundingClientRect();
      // Viewport-relative coords inside the scrollable container — used
      // only for the "is the pointer inside the editor?" check.
      const viewportX = clientX - rect.left;
      const viewportY = clientY - rect.top;
      if (
        viewportX < 0 ||
        viewportY < 0 ||
        viewportX > rect.width ||
        viewportY > rect.height
      ) {
        return;
      }

      // Document-relative coords — add the container's scroll offset so
      // the position is tied to content, not viewport. This makes the
      // cursor appear at the same *content location* on every peer's
      // screen, regardless of how each peer has scrolled.
      const x = viewportX + container.scrollLeft;
      const y = viewportY + container.scrollTop;

      coworkSocket.emit('cowork:cursor', {
        sessionId: coWorkSessionId,
        pageId,
        x,
        y,
      });
    };

    const onMove = (e: PointerEvent) => emit(e.clientX, e.clientY);
    container.addEventListener('pointermove', onMove);
    return () => {
      container.removeEventListener('pointermove', onMove);
    };
  }, [coworkSocket, coWorkSessionId, pageId]);

  /* ─── Co-work cursor: subscribe to remote cursors ───────────────────── */
  useEffect(() => {
    if (!coworkSocket || !coWorkSessionId) return;

    const onCursor = (data: {
      sessionId: string;
      userId: string;
      pageId: string | null;
      x: number;
      y: number;
    }) => {
      if (data.sessionId !== coWorkSessionId) return;
      // Only show remote cursors on the same page
      if (data.pageId && data.pageId !== pageId) return;
      // Don't show our own cursor
      if (data.userId === currentUserId) return;
      const name = participantNamesRef.current.get(data.userId) || 'Anon';
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.set(data.userId, {
          x: data.x,
          y: data.y,
          name,
          lastSeenAt: performance.now(),
        });
        return next;
      });
    };

    const onCursorGone = (data: { sessionId: string; userId: string }) => {
      if (data.sessionId !== coWorkSessionId) return;
      setRemoteCursors((prev) => {
        if (!prev.has(data.userId)) return prev;
        const next = new Map(prev);
        next.delete(data.userId);
        return next;
      });
    };

    coworkSocket.on('cowork:cursor', onCursor);
    coworkSocket.on('cowork:cursor_gone', onCursorGone);

    // Garbage-collect stale cursors every 2s. A peer who closes their tab
    // without a clean disconnect will fall off the overlay after ~8s.
    const sweep = setInterval(() => {
      const now = performance.now();
      setRemoteCursors((prev) => {
        let mutated = false;
        const next = new Map(prev);
        for (const [userId, entry] of next) {
          if (now - entry.lastSeenAt > 8000) {
            next.delete(userId);
            mutated = true;
          }
        }
        return mutated ? next : prev;
      });
    }, 2000);

    return () => {
      coworkSocket.off('cowork:cursor', onCursor);
      coworkSocket.off('cowork:cursor_gone', onCursorGone);
      clearInterval(sweep);
    };
  }, [coworkSocket, coWorkSessionId, pageId, currentUserId]);

  // Co-work page locking
  useEffect(() => {
    if (!coWorkSessionId || !currentUserId) return;

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
        await fetch(`/api/notebooks/${notebookId}/cowork/${coWorkSessionId}/lock/${pageId}`, {
          method: 'DELETE',
        });
      } catch {
        // silent
      }
    };

    acquireLock();
    // Heartbeat every 2 minutes
    const heartbeatInterval = setInterval(acquireLock, 2 * 60 * 1000);

    // Release lock on tab close
    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable cleanup on tab close
      navigator.sendBeacon(
        `/api/notebooks/${notebookId}/cowork/${coWorkSessionId}/lock/${pageId}`
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

  const saveDrawingRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const saveDrawing = useCallback(
    async (data: StrokeData[]) => {
      try {
        await fetch(`/api/notebooks/${notebookId}/pages/${pageId}/drawing`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ drawingData: data }),
        });
      } catch {
        // silent
      }
    },
    [notebookId, pageId]
  );

  const handleStrokesChange = useCallback(
    (newStrokes: StrokeData[]) => {
      setStrokes(newStrokes);
      if (saveDrawingRef.current) clearTimeout(saveDrawingRef.current);
      saveDrawingRef.current = setTimeout(() => saveDrawing(newStrokes), 1500);
    },
    [saveDrawing]
  );

  useEffect(() => {
    isMountedRef.current = true;
    setIsLoading(true);
    setNotFound(false);

    (async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/pages/${pageId}`);
        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        const json = await res.json();
        if (json.success) {
          setPage(json.data);
          setTitle(json.data.title);
          if (json.data.drawingData) {
            setStrokes(hydrateStrokes(json.data.drawingData as unknown[]));
          }
        }
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    })();

    return () => {
      isMountedRef.current = false;
    };
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
    [notebookId, pageId]
  );

  const scheduleSave = useCallback(
    (contentJson: Record<string, unknown>, plainText: string) => {
      setSaveStatus('unsaved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        save(contentJson, plainText, titleRef.current);
      }, 1500);
    },
    [save]
  );

  // Effective read-only state:
  //   - Not in a cowork session → lock applies as normal
  //   - In a cowork session and the host has enabled open editing → anyone
  //     can type regardless of who holds the lock
  //   - Otherwise → locked out when someone else holds the lock
  const effectiveReadOnly = coWorkSessionId
    ? lockedByOther && !coworkEditOpen
    : lockedByOther;

  // NB: `page` is deliberately NOT in the useEditor deps list. When we
  // polled the live document during a cowork session, the old deps
  // `[page, ...]` caused a full editor teardown + rebuild every 2.5s
  // (polling → setPage → useEditor dep changed → destroy+recreate
  // editor → whole subtree remounts → useCoworkSocket hook tears down
  // before its `connect` event could run `cowork:join`). The server
  // saw connections but never any `cowork:join ✓` logs. Fix: keep the
  // editor instance stable across polling ticks and hydrate content
  // imperatively (see the effect below this hook).
  const editor = useEditor(
    {
      immediatelyRender: false,
      editable: !effectiveReadOnly,
      extensions: [
        StarterKit.configure({ heading: false, codeBlock: false }),
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
        Callout.extend({
          addNodeView() {
            return ReactNodeViewRenderer(CalloutView);
          },
        }),
        ToggleHeading.extend({
          addNodeView() {
            return ReactNodeViewRenderer(ToggleHeadingView);
          },
        }),
        ResizableImage,
        Placeholder.configure({
          placeholder: effectiveReadOnly
            ? 'This page is being edited by someone else...'
            : 'Start writing...',
        }),
        Typography,
        Table.configure({ resizable: true, handleWidth: 5, cellMinWidth: 80 }),
        TableRow,
        TableCell,
        TableHeader,
        SlashCommand.configure({ onStateChange: handleSlashStateChange }),
      ],
      // Start blank; hydrated imperatively in the effect below once the
      // initial fetch completes.
      content: '',
      editorProps: {
        attributes: { class: 'notemage-editor' },
      },
      onUpdate: ({ editor: ed }) => {
        const json = ed.getJSON() as Record<string, unknown>;
        scheduleSave(json, ed.getText());
      },
    },
    [pageId, effectiveReadOnly, handleSlashStateChange]
  );

  // Hydrate editor content on initial page load. Only fires when the
  // editor instance or the pageId changes — NOT on every `page` state
  // update — so polling can't restart this effect either.
  const hydratedForPageIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!editor) return;
    if (!page?.content) return;
    if (hydratedForPageIdRef.current === pageId) return;
    hydratedForPageIdRef.current = pageId;
    editor.commands.setContent(
      migrateHeadingsToToggle(page.content),
      { emitUpdate: false }
    );
  }, [editor, pageId, page?.content]);

  /* ─── Cowork: live document polling when viewing as a non-editor ─────── *
   * The editor itself has no built-in sync. When a cowork participant is
   * read-only (host is the lock holder), we refetch the page content every
   * 2.5 seconds and replace the editor's content via `setContent(..., false)`
   * so no onUpdate fires. This is a polling MVP — a CRDT/OT layer would be
   * cleaner but is out of scope for now.
   *
   * Runs only when:
   *   - a cowork session is active
   *   - the user is currently read-only (not holding the lock, and the
   *     host hasn't opened editing to all participants)
   * That avoids wiping the lock holder's own typing while they edit. */
  useEffect(() => {
    if (!editor) return;
    if (!coWorkSessionId) return;
    if (!effectiveReadOnly) return;

    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(
          `/api/notebooks/${notebookId}/pages/${pageId}`
        );
        if (cancelled || !res.ok) return;
        const json = await res.json();
        if (!json.success || !json.data?.content) return;

        const currentJson = JSON.stringify(editor.getJSON());
        const remoteJson = JSON.stringify(json.data.content);
        if (currentJson === remoteJson) return;

        // Replace content without firing onUpdate — this is a passive
        // view refresh, not a local edit. TipTap v3's setContent takes
        // (content, options) where options includes `emitUpdate: false`
        // to skip triggering the autosave loop.
        editor.commands.setContent(
          migrateHeadingsToToggle(json.data.content),
          { emitUpdate: false }
        );
        // Update title only. Do NOT call setPage(json.data) here — that
        // would mutate the `page` state and (historically) trigger a
        // useEditor teardown, which tore down useCoworkSocket with it.
        // Keeping `page` stable during polling is what keeps the cowork
        // socket alive long enough to actually emit cowork:join.
        if (typeof json.data.title === 'string') setTitle(json.data.title);
      } catch {
        // silent — next tick will retry
      }
    };

    poll(); // immediate refresh on entering read-only mode
    const interval = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [editor, coWorkSessionId, effectiveReadOnly, notebookId, pageId]);

  /* ─── Cowork: listen for the host's "open editing" broadcast ─────────── */
  useEffect(() => {
    if (!coworkSocket || !coWorkSessionId) return;
    const onEditMode = (data: { sessionId: string; enabled: boolean }) => {
      if (data.sessionId !== coWorkSessionId) return;
      setCoworkEditOpen(!!data.enabled);
    };
    coworkSocket.on('cowork:edit_mode', onEditMode);
    return () => {
      coworkSocket.off('cowork:edit_mode', onEditMode);
    };
  }, [coworkSocket, coWorkSessionId]);

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
    [editor, save]
  );

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      if (saveDrawingRef.current) clearTimeout(saveDrawingRef.current);
    };
  }, []);

  // Highlight search term from navigation
  useEffect(() => {
    if (!highlightTerm || !editor || editor.isDestroyed) return;
    // Wait for content to render
    const timer = setTimeout(() => {
      if (!editor || editor.isDestroyed) return;
      const doc = editor.state.doc;
      const searchLower = highlightTerm.toLowerCase();
      let foundFrom = -1;
      let foundTo = -1;
      doc.descendants((node, pos) => {
        if (foundFrom !== -1) return false;
        if (node.isText && node.text) {
          const idx = node.text.toLowerCase().indexOf(searchLower);
          if (idx !== -1) {
            foundFrom = pos + idx;
            foundTo = foundFrom + highlightTerm.length;
            return false;
          }
        }
      });
      if (foundFrom !== -1) {
        editor.chain().setTextSelection({ from: foundFrom, to: foundTo }).scrollIntoView().run();
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [highlightTerm, editor]);

  /* ── Loading skeleton ── */
  if (isLoading) {
    return (
      <div style={{ padding: isPhone ? '24px 16px' : isTablet ? '32px 28px' : '40px 56px' }}>
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
        {[1, 0.9, 0.7].map((w, i) => (
          <div
            key={i}
            style={{
              width: `${w * 100}%`,
              height: '14px',
              borderRadius: '6px',
              background: 'rgba(237,233,255,0.05)',
              marginBottom: '12px',
              animation: `pulse 1.5s ease-in-out infinite ${i * 0.1}s`,
            }}
          />
        ))}
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

  if (!page) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <style>{`
        /* ── editor base ── */
        .notemage-editor {
          outline: none;
          min-height: 100%;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          color: #ede9ff;
          line-height: 1.75;
          caret-color: #a47bff;
        }
        /* ── headings ── */
        .notemage-editor h1 { font-size: 30px; font-weight: 700; letter-spacing: -0.03em; margin: 28px 0 10px; line-height: 1.2; }
        .notemage-editor h2 { font-size: 22px; font-weight: 700; letter-spacing: -0.02em; margin: 22px 0 8px; line-height: 1.3; }
        .notemage-editor h3 { font-size: 18px; font-weight: 600; margin: 18px 0 6px; line-height: 1.4; }
        /* ── inline formatting ── */
        .notemage-editor strong, .notemage-editor b { font-weight: 700 !important; }
        .notemage-editor em, .notemage-editor i { font-style: italic !important; }
        .notemage-editor u { text-decoration: underline !important; }
        .notemage-editor s { text-decoration: line-through !important; }
        /* ── paragraph ── */
        .notemage-editor p { margin: 0 0 10px; }
        /* ── lists ── */
        .notemage-editor ul { list-style-type: disc !important; padding-left: 28px; margin: 8px 0 10px; }
        .notemage-editor ol { list-style-type: decimal !important; padding-left: 28px; margin: 8px 0 10px; }
        .notemage-editor li { margin: 3px 0; display: list-item !important; }
        .notemage-editor li p { margin: 0; }
        /* ── blockquote ── */
        .notemage-editor blockquote { border-left: 3px solid #8c52ff; padding-left: 16px; color: rgba(237,233,255,0.6); margin: 12px 0; }
        /* ── inline code ── */
        .notemage-editor code { background: rgba(140,82,255,0.14); padding: 2px 6px; border-radius: 4px; font-size: 13px; font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Courier New', monospace; color: #c4a9ff; }
        /* ── code block ── */
        .notemage-editor pre {
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
          position: relative;
          z-index: auto;
        }
        .notemage-editor pre code { background: none; padding: 0; border-radius: 0; color: inherit; font-size: inherit; display: block; }
        .notemage-editor .code-block-wrapper select option { background: #1a1428; color: #e0daf8; }
        /* ── syntax highlighting tokens ── */
        .notemage-editor .hljs-keyword,
        .notemage-editor .hljs-selector-tag,
        .notemage-editor .hljs-built_in { color: #c4a0ff; }
        .notemage-editor .hljs-string,
        .notemage-editor .hljs-attr { color: #ffde59; }
        .notemage-editor .hljs-number,
        .notemage-editor .hljs-literal { color: #ff9e64; }
        .notemage-editor .hljs-function,
        .notemage-editor .hljs-title,
        .notemage-editor .hljs-title.function_ { color: #7ec8ff; }
        .notemage-editor .hljs-params { color: #e0daf8; font-style: italic; }
        .notemage-editor .hljs-comment,
        .notemage-editor .hljs-quote { color: #7a72a0; font-style: italic; }
        .notemage-editor .hljs-variable,
        .notemage-editor .hljs-template-variable { color: #e0daf8; }
        .notemage-editor .hljs-type,
        .notemage-editor .hljs-class .hljs-title { color: #7ec8ff; }
        .notemage-editor .hljs-tag { color: #c4a0ff; }
        .notemage-editor .hljs-name { color: #c4a0ff; }
        .notemage-editor .hljs-attribute { color: #b9c3ff; }
        .notemage-editor .hljs-symbol,
        .notemage-editor .hljs-bullet { color: #ff9e64; }
        .notemage-editor .hljs-addition { color: #a6e3a1; }
        .notemage-editor .hljs-deletion { color: #ff6b8a; }
        .notemage-editor .hljs-operator { color: #c4a0ff; }
        .notemage-editor .hljs-punctuation { color: #8b85a8; }
        .notemage-editor .hljs-property { color: #b9c3ff; }
        .notemage-editor .hljs-regexp { color: #ff9e64; }
        .notemage-editor .hljs-meta { color: #ae89ff; }
        /* ── callout blocks ── */
        .notemage-editor [data-callout-type] p { margin: 0 0 6px; }
        .notemage-editor [data-callout-type] p:last-child { margin: 0; }
        /* ── toggle heading ── */
        .notemage-editor [data-toggle-level] p { margin: 0 0 6px; }
        .notemage-editor [data-toggle-level] p:last-child { margin: 0; }
        /* ── mark / highlight ── */
        .notemage-editor mark { border-radius: 3px; padding: 1px 3px; }
        /* ── float clearfix for wrap-mode images ── */
        .notemage-editor .ProseMirror::after { content: ''; display: table; clear: both; }
        /* ── placeholder ── */
        .notemage-editor p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: rgba(237,233,255,0.2);
          pointer-events: none;
          float: left;
          height: 0;
        }
        /* ── tables ── */
        .notemage-editor table { border-collapse: collapse; width: 100%; table-layout: fixed; margin: 14px 0; overflow: hidden; }
        .notemage-editor td, .notemage-editor th { border: 1px solid rgba(140,82,255,0.18); padding: 8px 12px; vertical-align: top; position: relative; }
        .notemage-editor th { background: rgba(140,82,255,0.10); font-weight: 600; color: #c4b5fd; }
        .notemage-editor td { background: rgba(140,82,255,0.03); }
        .notemage-editor .selectedCell:after { content: ''; position: absolute; inset: 0; background: rgba(140,82,255,0.12); pointer-events: none; z-index: 2; }
        .notemage-editor .column-resize-handle { position: absolute; right: -2px; top: 0; bottom: 0; width: 4px; background: rgba(140,82,255,0.4); cursor: col-resize; z-index: 10; }
        .notemage-editor .resize-cursor { cursor: col-resize; }
        .notemage-editor td p, .notemage-editor th p { margin: 0; }
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
      <div style={{ padding: isPhone ? '20px 16px 0' : isTablet ? '24px 28px 0' : '32px 56px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled"
            readOnly={lockedByOther}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontFamily: 'inherit',
              fontSize: isPhone ? '24px' : '32px',
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

      {/* ── Toolbar ── */}
      <EditorToolbar
        editor={editor}
        notebookId={notebookId}
        sectionId={page?.sectionId ?? ''}
        pageId={pageId}
        editorMode={editorMode}
        onModeChange={setEditorMode}
        penColor={penColor}
        onPenColorChange={setPenColor}
        penWidth={penWidth}
        onPenWidthChange={setPenWidth}
        lineStyle={lineStyle}
        onLineStyleChange={setLineStyle}
        activeTool={activeTool}
        onActiveToolChange={setActiveTool}
        ruler={ruler}
        onRulerToggle={() => setRuler((r) => ({ ...r, active: !r.active }))}
        onClearDrawing={() => handleStrokesChange([])}
      />

      {/* ── Editor canvas (full width, infinite scroll) ── */}
      <div ref={editorContainerRef} style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        <div style={{ padding: isPhone ? '16px 16px 60px' : isTablet ? '20px 28px 80px' : '28px 56px 80px', minHeight: '100%', position: 'relative' }}>
          <EditorContent editor={editor} />
          <SlashMenu state={slashState} editor={editor} />
          <InlineAIToolbar
            editor={editor}
            notebookId={notebookId}
            pageId={pageId}
            onRequiresUpgrade={handleRequiresUpgrade}
          />
          {/* Co-work remote cursor overlays */}
          {Array.from(remoteCursors.entries()).map(([userId, entry]) => (
            <RemoteCursor
              key={userId}
              userId={userId}
              name={entry.name}
              x={entry.x}
              y={entry.y}
            />
          ))}
          <DrawingOverlay
            strokes={strokes}
            onStrokesChange={handleStrokesChange}
            mode={editorMode}
            activeTool={activeTool}
            penColor={penColor}
            penWidth={penWidth}
            lineStyle={lineStyle}
            ruler={ruler}
            onRulerChange={setRuler}
          />
        </div>
      </div>

      <UpsellToast
        open={upsellOpen}
        onClose={handleUpsellClose}
        title="Inline AI is a Pro feature"
        description="Rewrite, summarize, and expand your notes with one click — upgrade to Pro to unlock it."
      />
    </div>
  );
}
