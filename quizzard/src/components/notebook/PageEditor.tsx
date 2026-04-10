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
import { isEffectivelyEmptyTiptapDoc } from '@/lib/tiptap-is-empty';
import { looksLikeMarkdown, markdownToHtml } from '@/lib/markdown-to-html';
import { DOMParser as PMDOMParser } from '@tiptap/pm/model';
import { CellSelection } from '@tiptap/pm/tables';
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
/**
 * Prepare saved page content for re-entry into the editor.
 *
 *   1. Migrate any legacy `heading` nodes from older pages into
 *      `toggleHeading` nodes so they keep rendering the same way.
 *
 *   2. Force every `toggleHeading` to `collapsed: false`. The outline
 *      collapse plugin hides everything under a collapsed heading via
 *      `display: none` — useful for live editing, but when the saved
 *      state carries `collapsed: true` into a fresh page load every-
 *      thing beneath that heading looks like it vanished (the user's
 *      real bug report). Collapse is a UI affordance, not a content
 *      property; it should not persist across reloads.
 */
function migrateHeadingsToToggle(doc: any): any {
  if (!doc || !doc.content) return doc;

  const walk = (node: any): any => {
    if (!node || typeof node !== 'object') return node;

    // Legacy `heading` → `toggleHeading` conversion.
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

    let next = node;

    // Force expanded state on every toggle heading we see.
    if (
      node.type === 'toggleHeading' &&
      node.attrs &&
      node.attrs.collapsed
    ) {
      next = { ...node, attrs: { ...node.attrs, collapsed: false } };
    }

    // Recurse into children so nested toggles inside callouts / toggles
    // also get reset.
    if (Array.isArray(next.content)) {
      const mapped = next.content.map(walk);
      next = { ...next, content: mapped };
    }

    return next;
  };

  return walk(doc);
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

  /* ─── Co-work cursor: emit own cursor (throttled) ───────────────────── *
   * We listen on `document` rather than on the editor container because
   * the container ref isn't attached until the initial page fetch
   * completes (gated by the `if (!page) return null;` earlier), and the
   * effect's deps don't include `page`, so it wouldn't re-run once the
   * ref finally became non-null. Doing the bounds check inside the
   * handler against `editorContainerRef.current` (read on every event)
   * dodges the timing issue entirely and has negligible cost.
   *
   * We also stash the most recently emitted position in a ref so a
   * periodic "presence" heartbeat can re-emit the same coords every 2s.
   * Without that, a participant who joins while the host is idle sees
   * nothing until the host happens to move — which made it look like
   * cursors were completely broken on initial mount. */
  const lastCursorPosRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!coworkSocket || !coWorkSessionId) return;
    let lastEmit = 0;

    const sendCursor = (x: number, y: number) => {
      lastCursorPosRef.current = { x, y };
      coworkSocket.emit('cowork:cursor', {
        sessionId: coWorkSessionId,
        pageId,
        x,
        y,
      });
    };

    const onMove = (e: PointerEvent) => {
      const container = editorContainerRef.current;
      if (!container) return;

      const now = performance.now();
      // ~16 events/sec is plenty for cursor smoothness without saturating
      // a slow connection.
      if (now - lastEmit < 60) return;

      const rect = container.getBoundingClientRect();
      // Viewport-relative coords inside the scrollable container — used
      // only for the "is the pointer inside the editor?" check.
      const viewportX = e.clientX - rect.left;
      const viewportY = e.clientY - rect.top;
      if (
        viewportX < 0 ||
        viewportY < 0 ||
        viewportX > rect.width ||
        viewportY > rect.height
      ) {
        return;
      }

      lastEmit = now;

      // Document-relative coords — add the container's scroll offset so
      // the position is tied to content, not viewport. This makes the
      // cursor appear at the same *content location* on every peer's
      // screen, regardless of how each peer has scrolled.
      const x = viewportX + container.scrollLeft;
      const y = viewportY + container.scrollTop;

      sendCursor(x, y);
    };

    document.addEventListener('pointermove', onMove);

    // Presence heartbeat: re-emit the last known cursor position every
    // 2 seconds so peers who join later (or missed the initial burst
    // because their socket was still joining the room) see a cursor
    // even while the user is idle. Cheap — it's one event every 2s,
    // and the receiver's 8s GC still cleans up genuinely absent peers.
    const presenceInterval = setInterval(() => {
      const pos = lastCursorPosRef.current;
      if (!pos) return;
      coworkSocket.emit('cowork:cursor', {
        sessionId: coWorkSessionId,
        pageId,
        x: pos.x,
        y: pos.y,
      });
    }, 2000);

    return () => {
      document.removeEventListener('pointermove', onMove);
      clearInterval(presenceInterval);
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

  // Stable ref to the cowork socket so the `save` callback can emit
  // broadcasts without listing the socket in its useCallback deps
  // (which would invalidate the callback on every socket re-render and
  // cascade a scheduleSave dependency change).
  const coworkSocketRef = useRef<typeof coworkSocket>(null);
  useEffect(() => {
    coworkSocketRef.current = coworkSocket;
  }, [coworkSocket]);

  const save = useCallback(
    async (contentJson: Record<string, unknown>, plainText: string, pageTitle: string) => {
      setSaveStatus('saving');
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/pages/${pageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: pageTitle, content: contentJson, textContent: plainText }),
        });
        // `fetch` only throws on network errors — a 4xx/5xx response is
        // still a resolved promise. Without this check, an API-side
        // rejection (e.g. the empty-doc guard, oversized-body guard)
        // would silently show "saved" and the user would reload to find
        // their changes missing.
        if (!res.ok) {
          if (isMountedRef.current) setSaveStatus('unsaved');
          return;
        }
        if (isMountedRef.current) setSaveStatus('saved');

        // Real-time cowork doc broadcast. After the save has landed in
        // Postgres, ping all other participants in the session so they
        // refresh the editor content immediately instead of waiting for
        // the 2.5s polling fallback. We only send a notification (no
        // content payload) — the receivers fetch the freshest version
        // themselves, which keeps broadcasts tiny and avoids races with
        // a participant who was mid-typing.
        if (coWorkSessionId && coworkSocketRef.current?.connected) {
          coworkSocketRef.current.emit('cowork:doc_notify', {
            sessionId: coWorkSessionId,
            pageId,
          });
        }
      } catch {
        if (isMountedRef.current) setSaveStatus('unsaved');
      }
    },
    [notebookId, pageId, coWorkSessionId]
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

  // NB: `page` and `effectiveReadOnly` are deliberately NOT in the
  // useEditor deps list. Earlier:
  //   - `page` in deps meant the 2.5s polling (which called setPage)
  //     rebuilt the editor every tick, which tore down useCoworkSocket
  //     before its `connect` event could run `sendJoin()`. The server
  //     saw connections but never any `cowork:join ✓` logs.
  //   - `effectiveReadOnly` in deps meant toggling "Open editing"
  //     rebuilt the editor into an empty document (because our
  //     hydration ref refuses to re-hydrate for the same pageId),
  //     and also caused another socket teardown. Result: the host's
  //     toggle flipped the participant into edit mode but they stared
  //     at a blank page.
  //
  // Fix: keep the editor instance stable for the full pageId lifetime
  // and drive content/editable imperatively via `setContent` and
  // `setEditable`.

  // Hydration tracking — declared BEFORE useEditor because the editor's
  // onUpdate closure captures these refs and we'd otherwise hit a TDZ
  // error. The hydration effect below is what actually writes to this
  // ref; `onUpdate` only reads it as a gate.
  //
  // Data-loss context: without this gate, onUpdate could fire while the
  // editor was still in its initial `content: ''` state and autosave
  // the TipTap default empty doc over a user's real content. We lost a
  // page this way on 2026-04-10 — the page was asleep (no tab open)
  // yet somehow got wiped at 11:30. The client-side root cause is
  // still under investigation, but even if another bug exists the gate
  // guarantees the damaging PUT cannot come from this editor instance
  // unless hydration has completed for the current pageId.
  const hydratedForPageIdRef = useRef<string | null>(null);
  const lastKnownContentWasEmptyRef = useRef<boolean>(false);

  const editor = useEditor(
    {
      immediatelyRender: false,
      // Initial editable state is "true" — we flip it imperatively
      // below once the lock state is known. Starting true prevents a
      // flash-of-read-only on mount.
      editable: true,
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
          placeholder: 'Start writing...',
        }),
        Typography,
        Table.configure({ resizable: true, handleWidth: 5, cellMinWidth: 80 }).extend({
          // When a full row or column is selected (CellSelection whose
          // span covers every column or every row), Delete/Backspace
          // by default only clears the cell content. Promote those
          // presses to `deleteRow`/`deleteColumn` so marking a row and
          // pressing Delete actually removes the row.
          addKeyboardShortcuts() {
            const handleDelete = (): boolean => {
              const { selection } = this.editor.state;
              if (!(selection instanceof CellSelection)) return false;
              if (selection.isRowSelection()) {
                return this.editor.commands.deleteRow();
              }
              if (selection.isColSelection()) {
                return this.editor.commands.deleteColumn();
              }
              return false;
            };
            return {
              Delete: handleDelete,
              Backspace: handleDelete,
            };
          },
        }),
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
        // Plain-text markdown paste support. If the clipboard has text/html
        // we let TipTap's default HTML pipeline handle it (that covers
        // Google Docs, Notion, web pages, etc.). If it's pure text/plain
        // and smells like markdown, we convert it to HTML first so the
        // existing extension parseHTML rules can take over.
        // See src/lib/markdown-to-html.ts for the detection heuristic.
        handlePaste: (view, event) => {
          const cb = event.clipboardData;
          if (!cb) return false;
          if (cb.types.includes('text/html')) return false;

          const text = cb.getData('text/plain');
          if (!text || !looksLikeMarkdown(text)) return false;

          const html = markdownToHtml(text);
          const container = document.createElement('div');
          container.innerHTML = html;
          const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(
            container,
            { preserveWhitespace: false }
          );
          view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView());
          event.preventDefault();
          return true;
        },
      },
      onUpdate: ({ editor: ed }) => {
        // Data-loss guard: drop any updates that fire before hydration has
        // landed for the current pageId. This catches the "editor briefly
        // has the default empty doc and onUpdate fires" race that was
        // silently overwriting page content with the TipTap default
        // {type:'doc',content:[{type:'paragraph'}]}.
        //
        // We also reject updates whose outgoing JSON is effectively empty
        // when the editor was supposed to be hydrated — this is a belt-and
        // -braces check that catches any other path that might emit an
        // empty doc (e.g. a transient extension reset).
        if (hydratedForPageIdRef.current !== pageId) return;
        const json = ed.getJSON() as Record<string, unknown>;
        if (isEffectivelyEmptyTiptapDoc(json) && !lastKnownContentWasEmptyRef.current) {
          // The user somehow went from non-empty to empty in a single
          // onUpdate tick. That's almost never a legitimate edit; it's
          // almost always the editor being reset under us. Skip the save.
          // If the user really did select-all-and-delete, the next real
          // keystroke will re-fire onUpdate with real content.
          return;
        }
        lastKnownContentWasEmptyRef.current = isEffectivelyEmptyTiptapDoc(json);
        scheduleSave(json, ed.getText());
      },
    },
    [pageId, handleSlashStateChange]
  );

  // Flip editable imperatively whenever the effective read-only state
  // changes. TipTap exposes `editor.setEditable(bool)` for exactly this
  // so we never have to rebuild the whole editor on a lock flip.
  useEffect(() => {
    if (!editor) return;
    editor.setEditable(!effectiveReadOnly);
  }, [editor, effectiveReadOnly]);

  // Hydrate editor content on initial page load. Only fires when the
  // editor instance or the pageId changes — NOT on every `page` state
  // update — so polling can't restart this effect either. The ref it
  // writes is declared above the useEditor call so onUpdate's closure
  // can read it as its hydration gate.
  //
  // The `page.id === pageId` check is critical: right after the pageId
  // prop changes (e.g. navigating from page A to page B), React re-
  // renders immediately with the new pageId but the `page` state still
  // holds page A's data until the fetch for B resolves. Without this
  // guard we'd hydrate the new editor with page A's content, then the
  // onUpdate gate (which only checks hydratedForPageIdRef === pageId)
  // would happily autosave A's content to page B's record. That's a
  // second, separate data-loss bug — fixed here by refusing to hydrate
  // until the fetched `page.id` matches the current `pageId`.
  useEffect(() => {
    if (!editor) return;
    if (!page?.content) return;
    if (page.id !== pageId) return;
    if (hydratedForPageIdRef.current === pageId) return;
    hydratedForPageIdRef.current = pageId;
    lastKnownContentWasEmptyRef.current = isEffectivelyEmptyTiptapDoc(page.content);
    editor.commands.setContent(
      migrateHeadingsToToggle(page.content),
      { emitUpdate: false }
    );
  }, [editor, pageId, page?.id, page?.content]);

  /* ─── Cowork: live document sync when viewing as a non-editor ─────── *
   * When the participant is locked out (host holds the lock and "open
   * editing" is off) the editor has no way to receive live updates from
   * the host's typing. Two mechanisms keep the participant's content
   * fresh:
   *   1. `cowork:doc_notify` broadcast — host's autosave fires a tiny
   *      notification through the ws-server; participants refetch
   *      immediately. ~100-200ms end-to-end after autosave commits.
   *   2. 5-second polling fallback — catches ws drops.
   *
   * Both paths funnel through the same `refresh()` helper which diffs
   * the fetched content against the editor and applies it via
   * `setContent(..., { emitUpdate: false })` so no autosave fires. */
  const refreshDocFromServerRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!editor) return;
    if (!coWorkSessionId) return;
    if (!effectiveReadOnly) {
      // No polling while the user is the live editor — they're the
      // source of truth.
      refreshDocFromServerRef.current = async () => {};
      return;
    }

    let cancelled = false;
    const refresh = async () => {
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

        editor.commands.setContent(
          migrateHeadingsToToggle(json.data.content),
          { emitUpdate: false }
        );
        // Update title only. Do NOT call setPage(json.data) — that
        // would re-trigger the useEditor dep chain historically and
        // tear down the cowork socket (see long comment above the
        // useEditor call).
        if (typeof json.data.title === 'string') setTitle(json.data.title);
      } catch {
        // silent — next tick will retry
      }
    };
    refreshDocFromServerRef.current = refresh;

    refresh(); // immediate refresh on entering read-only mode
    // Slower polling now that we have the ws notify path as the
    // primary mechanism. 5s is a safety net — if the ws chain is
    // healthy the notify path will have already refreshed within
    // ~200ms of the host's autosave.
    const interval = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [editor, coWorkSessionId, effectiveReadOnly, notebookId, pageId]);

  // Listen for host's cowork:doc_notify broadcast and refresh
  // immediately via the ref set up by the polling effect above.
  useEffect(() => {
    if (!coworkSocket || !coWorkSessionId) return;
    const onDocNotify = (data: { sessionId: string; pageId: string }) => {
      if (data.sessionId !== coWorkSessionId) return;
      if (data.pageId !== pageId) return;
      void refreshDocFromServerRef.current();
    };
    coworkSocket.on('cowork:doc_notify', onDocNotify);
    return () => {
      coworkSocket.off('cowork:doc_notify', onDocNotify);
    };
  }, [coworkSocket, coWorkSessionId, pageId]);

  /* ─── Cowork: sync content on socket connect ─────────────────────────── *
   * The first time the cowork socket connects (and on every reconnect),
   * trigger a content refresh. This closes the race window between the
   * participant landing on the page and their socket finishing its
   * handshake — any host edits broadcast during that window would
   * otherwise be missed until the 5s polling tick. Same fix applies to
   * reconnects after a transient drop.
   *
   * Gated on effectiveReadOnly so we never overwrite the local user's
   * in-flight edits when they're the one typing. */
  useEffect(() => {
    if (!coworkSocket || !coWorkSessionId) return;
    const syncIfReadOnly = () => {
      if (!effectiveReadOnly) return;
      void refreshDocFromServerRef.current();
    };
    coworkSocket.on('connect', syncIfReadOnly);
    // Also fire once now if the socket was already connected when the
    // effect ran (which is the common case on the host's side and can
    // also happen for participants if the socket handshake finishes
    // before React re-renders with the new socket instance).
    if (coworkSocket.connected) {
      syncIfReadOnly();
    }
    return () => {
      coworkSocket.off('connect', syncIfReadOnly);
    };
  }, [coworkSocket, coWorkSessionId, effectiveReadOnly]);

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
      // Hydration gate: refuse to save while the editor is still in its
      // pre-hydration blank state. Otherwise changing the title before
      // the initial fetch lands would autosave the TipTap default empty
      // doc over the real content. The title input only mounts after
      // `isLoading` is false so this guard is defence-in-depth, but
      // cheap.
      if (hydratedForPageIdRef.current !== pageId) return;
      setSaveStatus('unsaved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const json = editor.getJSON() as Record<string, unknown>;
        // Second-pass guard: if the editor somehow contains an empty
        // doc despite the hydration check, drop the save. This is the
        // same check the onUpdate path does.
        if (isEffectivelyEmptyTiptapDoc(json) && !lastKnownContentWasEmptyRef.current) {
          return;
        }
        save(json, editor.getText(), newTitle);
      }, 1500);
    },
    [editor, save, pageId]
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
