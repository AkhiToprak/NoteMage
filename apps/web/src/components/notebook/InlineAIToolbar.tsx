'use client';

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { useAiTask } from './AiTaskContext';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/**
 * Floating toolbar that appears whenever the user has a non-trivial text
 * selection in the page editor. Three buttons — Rewrite / Summarize / Expand —
 * call the inline-AI SSE endpoint and replace the selected text with the
 * streamed response.
 *
 * Tier gating happens server-side. If the API returns 402 with
 * `{ upgrade: true }`, this component fires `onRequiresUpgrade()` so the
 * host can show its UpsellToast.
 *
 * Selection preservation: TipTap selections vanish when focus moves to the
 * toolbar. We snapshot `{ from, to }` into a ref before the API call and use
 * it for `setTextSelection` + `insertContent` after the stream finishes.
 */

interface InlineAIToolbarProps {
  editor: Editor | null;
  notebookId: string;
  pageId: string;
  /** Called when the API responds with HTTP 402 (Pro feature locked). */
  onRequiresUpgrade: () => void;
  /** Optional error sink. If omitted, errors are logged to the console. */
  onError?: (message: string) => void;
}

type InlineAction = 'rewrite' | 'summarize' | 'expand';

const ACTION_LABELS: Record<InlineAction, string> = {
  rewrite: 'Rewrite',
  summarize: 'Summarize',
  expand: 'Expand',
};

// Labels shown in the global AI status pill while each action is running.
const RUNNING_LABELS: Record<InlineAction, string> = {
  rewrite: 'Rewriting…',
  summarize: 'Summarizing…',
  expand: 'Expanding…',
};

const ACTION_ICONS: Record<InlineAction, string> = {
  rewrite: 'auto_fix',
  summarize: 'short_text',
  expand: 'unfold_more',
};

const MIN_SELECTION_CHARS = 5;

export default function InlineAIToolbar({
  editor,
  notebookId,
  pageId,
  onRequiresUpgrade,
  onError,
}: InlineAIToolbarProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const [busyAction, setBusyAction] = useState<InlineAction | null>(null);
  const [hidden, setHidden] = useState(false);
  const { isPhone } = useBreakpoint();

  const { startAiTask, finishAiTask } = useAiTask();

  // Snapshot of the selection captured the moment a button is pressed.
  // Used to restore selection + insert the AI text after the SSE stream.
  const pendingRangeRef = useRef<{ from: number; to: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Reset hidden flag whenever the editor's selection changes.
  // Without this, dismissing the toolbar with Escape would persist forever
  // even after the user makes a brand new selection.
  useEffect(() => {
    if (!editor) return;
    const handler = () => setHidden(false);
    editor.on('selectionUpdate', handler);
    return () => {
      editor.off('selectionUpdate', handler);
    };
  }, [editor]);

  // Compute the toolbar position from the current selection.
  // Re-runs on every selection change. Returns null if the selection is
  // empty, too short, or doesn't have a renderable rect (e.g. inside a
  // collapsed node view).
  useEffect(() => {
    if (!editor) {
      setPosition(null);
      return;
    }

    const recompute = () => {
      const { state, view } = editor;
      const { from, to, empty } = state.selection;

      if (empty || to - from < MIN_SELECTION_CHARS) {
        setPosition(null);
        return;
      }

      try {
        const start = view.coordsAtPos(from);
        const end = view.coordsAtPos(to);
        // On phone, sit BELOW the selection so we don't collide with iOS's
        // native callout (Copy / Look Up) that floats above the selection
        // and intercepts taps. On desktop, keep the original above-selection
        // placement.
        const top = isPhone
          ? Math.max(end.bottom, start.bottom) + 12
          : Math.min(start.top, end.top) - 48;
        const left = (start.left + end.left) / 2;
        setPosition({ top, left });
      } catch {
        setPosition(null);
      }
    };

    recompute();
    editor.on('selectionUpdate', recompute);
    // Window scroll / resize must also recompute since position is `fixed`
    // in viewport coordinates.
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('resize', recompute);
    // Touch devices don't always fire selectionUpdate on every drag of the
    // native handles — listen to the document's selectionchange so the
    // toolbar tracks the selection while the user adjusts it.
    document.addEventListener('selectionchange', recompute);
    return () => {
      editor.off('selectionUpdate', recompute);
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('resize', recompute);
      document.removeEventListener('selectionchange', recompute);
    };
  }, [editor, isPhone]);

  // Abort any in-flight stream on unmount.
  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  // Escape key dismisses the toolbar (until the user makes a new selection).
  useEffect(() => {
    if (!position || hidden) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setHidden(true);
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [position, hidden]);

  const runAction = useCallback(
    async (action: InlineAction) => {
      if (!editor || busyAction) return;

      const { state } = editor;
      const { from, to } = state.selection;
      if (to - from < MIN_SELECTION_CHARS) return;

      // Snapshot the selection BEFORE the network call.
      pendingRangeRef.current = { from, to };

      // Pull the plain text directly from the doc; this is what the AI
      // works on. We use the plain string (not the Markdown / JSON) so the
      // model isn't confused by ProseMirror node attributes.
      const selectedText = state.doc.textBetween(from, to, '\n');

      setBusyAction(action);

      // Surface the busy state in the global AI status pill so progress is
      // visible regardless of scroll position or toolbar visibility.
      const taskId = startAiTask(RUNNING_LABELS[action]);

      // Abort any previous in-flight call before starting a new one
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(`/api/notebooks/${notebookId}/pages/${pageId}/ai-inline`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, text: selectedText }),
          signal: controller.signal,
        });

        // Tier gate
        if (res.status === 402) {
          onRequiresUpgrade();
          setBusyAction(null);
          return;
        }

        if (!res.ok) {
          let message = `AI request failed (${res.status}).`;
          try {
            const body = await res.json();
            if (body?.error) message = body.error;
          } catch {
            // ignore
          }
          (onError ?? console.error)(message);
          setBusyAction(null);
          return;
        }

        if (!res.body) {
          (onError ?? console.error)('Empty response body.');
          setBusyAction(null);
          return;
        }

        // Parse SSE stream
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        let fullText = '';

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          // Split into individual SSE events (separated by blank lines)
          const events = buffer.split('\n\n');
          buffer = events.pop() ?? '';

          for (const block of events) {
            const lines = block.split('\n');
            let eventName = 'message';
            let dataStr = '';
            for (const line of lines) {
              if (line.startsWith('event:')) {
                eventName = line.slice(6).trim();
              } else if (line.startsWith('data:')) {
                dataStr += line.slice(5).trim();
              }
            }
            if (!dataStr) continue;
            let payload: { delta?: string; fullText?: string; error?: string };
            try {
              payload = JSON.parse(dataStr);
            } catch {
              continue;
            }
            if (eventName === 'text' && payload.delta) {
              fullText += payload.delta;
            } else if (eventName === 'done') {
              if (payload.fullText) fullText = payload.fullText;
            } else if (eventName === 'error') {
              (onError ?? console.error)(payload.error ?? 'AI stream error.');
              setBusyAction(null);
              return;
            }
          }
        }

        // Apply the result
        const range = pendingRangeRef.current;
        if (range && fullText) {
          editor
            .chain()
            .focus()
            .setTextSelection(range)
            .deleteSelection()
            .insertContent(fullText)
            .run();
        }
      } catch (err) {
        if ((err as Error).name === 'AbortError') return;
        (onError ?? console.error)((err as Error).message);
      } finally {
        finishAiTask(taskId);
        setBusyAction(null);
        pendingRangeRef.current = null;
      }
    },
    [editor, busyAction, notebookId, pageId, onRequiresUpgrade, onError, startAiTask, finishAiTask]
  );

  const visible = position !== null && !hidden && editor !== null;

  // Clamp position to the viewport
  const clamped = useMemo(() => {
    if (!position) return null;
    // On phone the buttons are larger; reserve more horizontal room.
    const TOOLBAR_WIDTH = isPhone ? 320 : 280;
    const TOOLBAR_HEIGHT = isPhone ? 56 : 40;
    const halfWidth = TOOLBAR_WIDTH / 2;
    const left = Math.max(
      8 + halfWidth,
      Math.min(position.left, window.innerWidth - 8 - halfWidth)
    );
    // Clamp top so the toolbar never falls under the bottom edge (or below
    // the on-screen keyboard, when the visualViewport API exposes it).
    const viewportBottom =
      typeof window !== 'undefined' && window.visualViewport
        ? window.visualViewport.height + window.visualViewport.offsetTop
        : window.innerHeight;
    const maxTop = viewportBottom - TOOLBAR_HEIGHT - 8;
    const top = Math.max(8, Math.min(position.top, maxTop));
    return { top, left };
  }, [position, isPhone]);

  if (!visible || !clamped) return null;

  const wrapperStyle: CSSProperties = {
    position: 'fixed',
    top: clamped.top,
    left: clamped.left,
    transform: 'translateX(-50%)',
    zIndex: 250,
    background: 'rgba(20, 18, 44, 0.96)',
    border: '1px solid rgba(255, 222, 89, 0.32)',
    borderRadius: 999,
    padding: isPhone ? '8px' : '6px',
    boxShadow:
      '0 16px 48px rgba(0, 0, 0, 0.55), 0 4px 16px rgba(255, 222, 89, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
    backdropFilter: 'blur(20px)',
    WebkitBackdropFilter: 'blur(20px)',
    display: 'flex',
    alignItems: 'center',
    gap: isPhone ? 6 : 4,
    fontFamily: 'var(--font-sans)',
  };

  const buttonStyle = (active: boolean): CSSProperties => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    padding: isPhone ? '10px 14px' : '7px 12px',
    minHeight: isPhone ? 40 : undefined,
    borderRadius: 999,
    border: 'none',
    background: active ? 'rgba(255, 222, 89, 0.2)' : 'transparent',
    color: active ? '#ffde59' : 'var(--on-surface)',
    fontSize: isPhone ? 13 : 12,
    fontWeight: 600,
    cursor: busyAction ? 'wait' : 'pointer',
    transition: 'background 0.2s ease, color 0.2s ease',
    fontFamily: 'var(--font-sans)',
    touchAction: 'manipulation',
  });

  return (
    <div
      role="toolbar"
      aria-label="Inline AI actions"
      style={wrapperStyle}
      onMouseDown={(e) => {
        // Critical: prevent the editor from losing focus / collapsing the
        // selection when the toolbar is clicked. On iOS this is the
        // *synthesized* mousedown that fires after touchend — calling
        // preventDefault here suppresses the focus default without
        // cancelling the click chain (unlike pointerdown, which would).
        e.preventDefault();
      }}
    >
      <div
        aria-hidden
        style={{
          width: 26,
          height: 26,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #ffde59 0%, #ffc94a 100%)',
          color: '#2a2200',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginLeft: 2,
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 16, fontVariationSettings: "'FILL' 1" }}
        >
          bolt
        </span>
      </div>
      {(['rewrite', 'summarize', 'expand'] as InlineAction[]).map((action) => {
        const active = busyAction === action;
        return (
          <button
            key={action}
            type="button"
            disabled={busyAction !== null && !active}
            onClick={() => runAction(action)}
            style={buttonStyle(active)}
            onMouseEnter={(e) => {
              if (busyAction) return;
              e.currentTarget.style.background = 'rgba(255, 222, 89, 0.14)';
              e.currentTarget.style.color = '#ffde59';
            }}
            onMouseLeave={(e) => {
              if (active) return;
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.color = 'var(--on-surface)';
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
              {active ? 'progress_activity' : ACTION_ICONS[action]}
            </span>
            {ACTION_LABELS[action]}
          </button>
        );
      })}
    </div>
  );
}
