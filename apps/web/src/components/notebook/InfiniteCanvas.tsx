'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Loader } from 'lucide-react';
import { HexColorPicker, HexColorInput } from 'react-colorful';
// NOTE: This whole module is only ever loaded client-side because the parent
// `app/(dashboard)/notebooks/[id]/pages/[pageId]/page.tsx` imports it via
// `dynamic(..., { ssr: false })`. That means we can safely import Excalidraw
// (and its compound `MainMenu` component) directly, which preserves the
// static members like `MainMenu.DefaultItems.ClearCanvas`.
import { Excalidraw, MainMenu, getSceneVersion } from '@excalidraw/excalidraw';
import '@excalidraw/excalidraw/index.css';
import type {
  AppState,
  BinaryFileData,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
} from '@excalidraw/excalidraw/types';
import type {
  ExcalidrawElement,
  OrderedExcalidrawElement,
} from '@excalidraw/excalidraw/element/types';
import { useCoworkSocket } from '@/lib/cowork-socket';
import { isInsideNativeShell, nativeBridge } from '@/lib/native-bridge';
import RemoteCursor from './RemoteCursor';
import PageLockIndicator from './PageLockIndicator';

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
  /**
   * Active cowork session id if this page is being viewed inside a
   * co-work session. `null` / `undefined` means "not in a session" —
   * the canvas behaves exactly like the solo-editing path.
   */
  coWorkSessionId?: string | null;
  /** Current user id, needed for cursor self-filtering + lock API. */
  currentUserId?: string | null;
}

/**
 * Persisted shape we write back to the DB. We deliberately avoid persisting
 * the full AppState because it contains ephemeral data (selection, zoom,
 * pointer, collaborators, etc). Only viewBackgroundColor and our custom
 * backgroundStyle are kept.
 */
type BackgroundStyle = 'blank' | 'dotted' | 'lined' | 'grid';

const BACKGROUND_STYLES: readonly BackgroundStyle[] = ['blank', 'dotted', 'lined', 'grid'] as const;

type PersistedScene = {
  elements: readonly ExcalidrawElement[];
  appState: {
    viewBackgroundColor: string;
    backgroundStyle: BackgroundStyle;
  };
  files: BinaryFiles;
};

const DEFAULT_BG = '#0d0c1f';

/** SVG pattern tile sizes per style (in scene units). Width=0 means no pattern. */
const PATTERN_BASE: Record<BackgroundStyle, { width: number; height: number }> = {
  blank: { width: 0, height: 0 },
  dotted: { width: 24, height: 24 },
  lined: { width: 32, height: 32 },
  grid: { width: 24, height: 24 },
};

/**
 * Parse the persisted appState from a raw Page.content. Returns the user's
 * real base color (never 'transparent') and background style, both with safe
 * defaults for legacy rows. Used both for seeding React state and for
 * building Excalidraw's initialData.
 */
function parsePersistedAppState(raw: unknown): {
  userBgColor: string;
  backgroundStyle: BackgroundStyle;
} {
  if (!raw || typeof raw !== 'object') {
    return { userBgColor: DEFAULT_BG, backgroundStyle: 'blank' };
  }
  const maybe = raw as Record<string, unknown>;
  const savedAppState = (maybe.appState ?? {}) as Record<string, unknown>;
  const rawColor = savedAppState.viewBackgroundColor;
  // Ignore stale 'transparent' values — we use that only as a live marker
  // while a pattern is active; the user's real color should always be saved.
  const userBgColor =
    typeof rawColor === 'string' && rawColor !== 'transparent' ? rawColor : DEFAULT_BG;
  const rawStyle = savedAppState.backgroundStyle;
  const backgroundStyle: BackgroundStyle =
    typeof rawStyle === 'string' && (BACKGROUND_STYLES as readonly string[]).includes(rawStyle)
      ? (rawStyle as BackgroundStyle)
      : 'blank';
  return { userBgColor, backgroundStyle };
}

/**
 * Perceived luminance of a hex color in [0, 1]. Uses the simple sRGB
 * weighted sum rather than the gamma-correct WCAG formula — that's
 * accurate enough for "is this bg dark or light" decisions and avoids
 * the pow() round-trip. Falls back to 0 (= dark) for unparseable input.
 */
function getLuminance(hex: string): number {
  let r = 0;
  let g = 0;
  let b = 0;
  if (/^#[0-9a-f]{6}$/i.test(hex)) {
    r = parseInt(hex.slice(1, 3), 16);
    g = parseInt(hex.slice(3, 5), 16);
    b = parseInt(hex.slice(5, 7), 16);
  } else if (/^#[0-9a-f]{3}$/i.test(hex)) {
    r = parseInt(hex[1] + hex[1], 16);
    g = parseInt(hex[2] + hex[2], 16);
    b = parseInt(hex[3] + hex[3], 16);
  } else {
    return 0;
  }
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Compute a faint ink color for pattern dots/lines that contrasts with the
 * given base color. Returns rgba strings with low alpha so the pattern
 * reads as subtle paper texture, not a loud grid.
 */
function getInkColor(hex: string): string {
  return getLuminance(hex) < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)';
}

/**
 * Render the SVG children for a single pattern tile. The tile coordinate
 * system matches PATTERN_BASE[style] dimensions.
 */
function renderPatternBody(style: BackgroundStyle, ink: string) {
  if (style === 'dotted') {
    return <circle cx={12} cy={12} r={1.2} fill={ink} />;
  }
  // Grid and lined both use vector-effect="non-scaling-stroke" so the lines
  // stay a constant 1px thick on screen regardless of pattern scale. At
  // high zoom the cells get bigger but the lines stay crisp and subtle,
  // matching the UX convention in design tools like Figma and Miro.
  if (style === 'grid') {
    return (
      <>
        <line
          x1={0}
          y1={0}
          x2={24}
          y2={0}
          stroke={ink}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={24}
          stroke={ink}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      </>
    );
  }
  if (style === 'lined') {
    return (
      <line
        x1={0}
        y1={31.5}
        x2={32}
        y2={31.5}
        stroke={ink}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
    );
  }
  return null;
}

/**
 * A tiny 36×20 preview used inside the style picker tiles in the burger
 * menu. Shows a miniature of the pattern so users can tell the four options
 * apart at a glance.
 */
function StyleTileSwatch({ style }: { style: BackgroundStyle }) {
  const ink = 'rgba(237,233,255,0.55)';
  const bg = 'rgba(0,0,0,0.3)';
  if (style === 'blank') {
    return (
      <svg width={36} height={20} style={{ display: 'block' }}>
        <rect width={36} height={20} rx={3} fill={bg} />
      </svg>
    );
  }
  if (style === 'dotted') {
    return (
      <svg width={36} height={20} style={{ display: 'block' }}>
        <rect width={36} height={20} rx={3} fill={bg} />
        {[6, 14, 22, 30].flatMap((cx) =>
          [6, 14].map((cy) => <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1} fill={ink} />)
        )}
      </svg>
    );
  }
  if (style === 'lined') {
    return (
      <svg width={36} height={20} style={{ display: 'block' }}>
        <rect width={36} height={20} rx={3} fill={bg} />
        <line x1={3} y1={7} x2={33} y2={7} stroke={ink} strokeWidth={1} />
        <line x1={3} y1={13} x2={33} y2={13} stroke={ink} strokeWidth={1} />
      </svg>
    );
  }
  return (
    <svg width={36} height={20} style={{ display: 'block' }}>
      <rect width={36} height={20} rx={3} fill={bg} />
      <line x1={3} y1={7} x2={33} y2={7} stroke={ink} strokeWidth={1} />
      <line x1={3} y1={13} x2={33} y2={13} stroke={ink} strokeWidth={1} />
      <line x1={11} y1={3} x2={11} y2={17} stroke={ink} strokeWidth={1} />
      <line x1={19} y1={3} x2={19} y2={17} stroke={ink} strokeWidth={1} />
      <line x1={27} y1={3} x2={27} y2={17} stroke={ink} strokeWidth={1} />
    </svg>
  );
}

/**
 * Detect whether `raw` looks like an Excalidraw scene. Legacy rows may contain
 * tldraw store snapshots (shaped differently), which we silently drop and
 * start from a blank canvas — the next save overwrites the row.
 *
 * NOTE: We ALWAYS hand Excalidraw `viewBackgroundColor: 'transparent'` —
 * regardless of the background style. The user's real color is painted by
 * our overlay div which sits behind Excalidraw's canvas, so it isn't
 * affected by Excalidraw's dark-theme invert filter. Excalidraw itself is
 * pinned to its light theme (see `theme="light"` on the JSX element) so
 * the invert filter is never active and the color the user picks is the
 * color they see. The user's real color is persisted in
 * Page.content.appState.viewBackgroundColor — never 'transparent'.
 *
 * Known v1 limitation: Excalidraw's "Save as image" export captures only
 * Excalidraw's own canvas, so exports will come out transparent without
 * the base color, the pattern, or the overlay.
 */
function toExcalidrawInitialData(raw: unknown): ExcalidrawInitialDataState | null {
  if (!raw || typeof raw !== 'object') return null;
  const maybe = raw as Record<string, unknown>;
  if (!Array.isArray(maybe.elements)) return null;

  return {
    elements: maybe.elements as readonly ExcalidrawElement[],
    appState: {
      viewBackgroundColor: 'transparent',
    },
    files: (maybe.files as BinaryFiles) ?? undefined,
    scrollToContent: true,
  };
}

export default function InfiniteCanvas({
  notebookId,
  pageId,
  coWorkSessionId,
  currentUserId,
}: InfiniteCanvasProps) {
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
  const lastBgColorRef = useRef<string>(DEFAULT_BG);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_BG);
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>('blank');
  const [hasPendingImage, setHasPendingImage] = useState(false);
  const backgroundStyleRef = useRef<BackgroundStyle>('blank');
  const patternElementRef = useRef<SVGPatternElement | null>(null);
  titleRef.current = title;

  /* ─── Co-work state ─────────────────────────────────────────────────── *
   * Mirrors PageEditor's cowork plumbing but adapted for Excalidraw's
   * scene-based model.
   *
   *   - `lockedByOther`  — whoever mounted the page first holds the lock
   *     via the existing /lock/:pageId endpoint. 409 → locked by someone
   *     else → we flip to read-only.
   *   - `coworkEditOpen` — host-toggleable "open editing" broadcast from
   *     the CoWorkBar that lifts the lock for everyone.
   *   - `effectiveReadOnly` — what actually gates the canvas. Passed to
   *     Excalidraw's `viewModeEnabled` prop and used to short-circuit the
   *     save pipeline so non-host edits never reach the server.
   *
   * The handleChange callback reads this via a ref so we don't have to
   * re-create the memoized callback (and its stable identity against
   * Excalidraw) every time the read-only flag flips. */
  const [lockedByOther, setLockedByOther] = useState(false);
  const [coworkEditOpen, setCoworkEditOpen] = useState(false);
  const effectiveReadOnly = coWorkSessionId ? lockedByOther && !coworkEditOpen : false;
  const effectiveReadOnlyRef = useRef(effectiveReadOnly);
  useEffect(() => {
    effectiveReadOnlyRef.current = effectiveReadOnly;
  }, [effectiveReadOnly]);

  const coworkSocket = useCoworkSocket(coWorkSessionId ?? null);
  // Stable ref so save() can emit broadcasts without listing the socket
  // in its deps (which would invalidate the callback on every socket
  // render and break the debounced save identity).
  const coworkSocketRef = useRef<typeof coworkSocket>(null);
  useEffect(() => {
    coworkSocketRef.current = coworkSocket;
  }, [coworkSocket]);

  /* Remote cursor overlays. Stored in SCENE coordinates and re-projected
   * to viewport pixels on every Excalidraw onChange via `viewport` state.
   * Cursors get garbage-collected after 8s of silence to handle tabs that
   * disconnect without a clean leave. */
  type RemoteCursorUser = {
    id: string;
    username?: string | null;
    name?: string | null;
    nameStyle?: { fontId?: string; colorId?: string } | null;
    equippedTitleId?: string | null;
    equippedFrameId?: string | null;
  };
  type RemoteCursorEntry = {
    sceneX: number;
    sceneY: number;
    user: RemoteCursorUser;
    lastSeenAt: number;
  };
  const [remoteCursors, setRemoteCursors] = useState<Map<string, RemoteCursorEntry>>(new Map());
  // Viewport tracker — updated imperatively inside handleChange. We only
  // bump React state when one of the three values actually changes, so
  // pointer-only frames (no pan/zoom) don't trigger re-renders of the
  // cursor overlay.
  const [viewport, setViewport] = useState({
    scrollX: 0,
    scrollY: 0,
    zoom: 1,
  });
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  // Cache participant user shapes (including cosmetic styling) so cursor
  // events can render a styled name without a per-event fetch. Fetched
  // once when the session id changes. Peers who join mid-session render
  // their cursor with a fallback name until the next refetch.
  const participantUsersRef = useRef<Map<string, RemoteCursorUser>>(new Map());
  useEffect(() => {
    if (!coWorkSessionId) {
      participantUsersRef.current.clear();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/cowork/${coWorkSessionId}`);
        if (!res.ok || cancelled) return;
        const json = await res.json();
        const participants = json.data?.participants || [];
        const next = new Map<string, RemoteCursorUser>();
        for (const p of participants) {
          if (p.user?.id) {
            next.set(p.user.id, p.user as RemoteCursorUser);
          }
        }
        participantUsersRef.current = next;
      } catch {
        // silent
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [coWorkSessionId, notebookId]);

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
          // Seed base color + background style from persisted appState so
          // the first render of our overlay and the first Excalidraw
          // onChange see the right values. parsePersistedAppState normalises
          // defaults and strips stale 'transparent' markers.
          const parsed = parsePersistedAppState(json.data.content);
          setBgColor(parsed.userBgColor);
          setBackgroundStyle(parsed.backgroundStyle);
          lastBgColorRef.current = parsed.userBgColor;
          backgroundStyleRef.current = parsed.backgroundStyle;
        }
      } finally {
        if (isMountedRef.current) setIsLoading(false);
      }
    })();

    return () => {
      isMountedRef.current = false;
    };
  }, [notebookId, pageId]);

  /* ─── Save pipeline ─────────────────────────────────────────────────── *
   * When a cowork session is active we also ping all peers via
   * `cowork:doc_notify` so read-only participants refresh their scene
   * right after the host's autosave commits — same mechanism PageEditor
   * uses for text pages. Broadcast is best-effort; a missed notify still
   * gets picked up by the 5s polling fallback in the refresh effect. */
  const save = useCallback(
    async (canvasState: PersistedScene | Record<string, never>, pageTitle: string) => {
      // Defence-in-depth: refuse to save while read-only. handleChange,
      // handleBgColorChange, handleBackgroundStyleChange and
      // handleTitleChange all guard their own scheduleSave paths, but a
      // stray call path could still reach save() — bail here too so we
      // never clobber the host's content from a participant's tab.
      if (effectiveReadOnlyRef.current) return;
      setSaveStatus('saving');
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/pages/${pageId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: pageTitle, content: canvasState }),
        });
        if (!res.ok) {
          if (isMountedRef.current) setSaveStatus('unsaved');
          return;
        }
        if (isMountedRef.current) setSaveStatus('saved');

        // Broadcast doc-change to peers so they refetch immediately
        // instead of waiting for the 5s polling tick.
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

  // Keep save in a ref so handleChange can stay perfectly stable.
  const saveRef = useRef(save);
  useEffect(() => {
    saveRef.current = save;
  }, [save]);

  /* ─── Imperatively sync the SVG pattern overlay to Excalidraw's viewport ─ *
   * Called from handleChange on every interaction (pan, zoom, draw, etc.).
   * Sets a combined translate+scale patternTransform on the <pattern>
   * element directly — no React re-render — so panning stays smooth.
   *
   * We keep the pattern's width/height fixed at their scene-unit base
   * (from the JSX props) and let patternTransform handle both pan and
   * zoom. The scale(zoom) factor grows the tile AND its children
   * proportionally, so tile spacing stays correct at every zoom level.
   * Lines in grid/lined patterns use vector-effect="non-scaling-stroke"
   * so strokes stay visually 1px thick regardless of scale — without
   * that, zooming in would make grid lines chunky and ugly.
   *
   * No-ops when the current style is 'blank' or the ref isn't mounted. */
  const updatePatternTransform = useCallback((scrollX: number, scrollY: number, zoom: number) => {
    const pat = patternElementRef.current;
    if (!pat) return;
    const base = PATTERN_BASE[backgroundStyleRef.current];
    if (base.width === 0) return;
    const ox = -scrollX * zoom;
    const oy = -scrollY * zoom;
    pat.setAttribute('patternTransform', `translate(${ox} ${oy}) scale(${zoom})`);
  }, []);

  /* ─── Excalidraw onChange — version-gated + 2s debounce ─────────────── *
   * Fires on every Excalidraw interaction (including pointer moves and
   * pan/zoom). We short-circuit no-ops by comparing the scene version
   * against the previously seen value. Background changes are handled
   * entirely outside this path — Excalidraw's internal viewBackgroundColor
   * is always 'transparent' (our overlay paints the real color), so its
   * onChange never sees a meaningful bg change. handleBgColorChange and
   * handleBackgroundStyleChange schedule their own saves directly.
   *
   * We pipe the current viewport into updatePatternTransform on every
   * call so the SVG pattern overlay tracks pan/zoom smoothly without
   * causing a React re-render. */
  const handleChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      // Sync the pattern overlay on every interaction — covers pan, zoom,
      // draw, erase, etc. No React re-render; pure imperative attribute
      // updates on the mounted <pattern> element.
      updatePatternTransform(appState.scrollX, appState.scrollY, appState.zoom.value);

      // Remote-cursor overlays are rendered at `(sceneX + scrollX) *
      // zoom` so we need viewport values in React state — otherwise
      // peers' cursors would drift when the local user pans or zooms.
      // Functional setter short-circuits when none of the three values
      // changed, so pointer-only frames during a draw don't re-render.
      setViewport((prev) => {
        if (
          prev.scrollX === appState.scrollX &&
          prev.scrollY === appState.scrollY &&
          prev.zoom === appState.zoom.value
        ) {
          return prev;
        }
        return {
          scrollX: appState.scrollX,
          scrollY: appState.scrollY,
          zoom: appState.zoom.value,
        };
      });

      // Track Excalidraw's "waiting for user to click to place an image"
      // state so we can render a hint overlay. pendingImageElementId is
      // non-null only between file-pick and click-to-place; it resets to
      // null on placement AND on Escape/tool-cancel. Using the functional
      // setter lets React bail out when the value hasn't changed, so this
      // is free on pointer-move frames.
      const nextPending = appState.pendingImageElementId !== null;
      setHasPendingImage((prev) => (prev === nextPending ? prev : nextPending));

      const version = getSceneVersion(elements);
      if (version === lastSceneVersionRef.current) return;

      // First call at mount primes the scene-version ref without saving.
      if (lastSceneVersionRef.current === -1) {
        lastSceneVersionRef.current = version;
        return;
      }

      lastSceneVersionRef.current = version;

      // Read-only (cowork participant viewing the host's edits): never
      // schedule a save. We still updated lastSceneVersionRef above so
      // the next local pan/zoom doesn't re-fire us, but the remote
      // content — pushed via `updateScene` in the refresh effect —
      // must not round-trip back to the server from a non-editor tab.
      if (effectiveReadOnlyRef.current) return;

      setSaveStatus('unsaved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        saveRef.current(
          {
            elements: elements as readonly ExcalidrawElement[],
            appState: {
              // Always persist the user's real color, never 'transparent'.
              viewBackgroundColor: lastBgColorRef.current,
              backgroundStyle: backgroundStyleRef.current,
            },
            files,
          },
          titleRef.current
        );
      }, 2000);
    },
    [updatePatternTransform]
  );

  /* ─── Background color picker → overlay only ────────────────────────── *
   * Called from the react-colorful HexColorPicker inside our custom
   * MainMenu item. Drives the overlay div's background via React state
   * (lastBgColorRef is the single source of truth for persistence).
   * Excalidraw's own canvas stays transparent and its theme is pinned
   * to light at the JSX prop, so the dark-theme invert filter never
   * runs and the color the user picks is the color they see. Schedules
   * a save manually since Excalidraw's own onChange never sees a
   * meaningful bg change. */
  const handleBgColorChange = useCallback((newColor: string) => {
    // Drive state + ref so the overlay + next save see the new color.
    setBgColor(newColor);
    lastBgColorRef.current = newColor;

    if (effectiveReadOnlyRef.current) return;
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const current = excalidrawAPIRef.current;
      if (!current) return;
      saveRef.current(
        {
          elements: current.getSceneElements() as readonly ExcalidrawElement[],
          appState: {
            viewBackgroundColor: newColor,
            backgroundStyle: backgroundStyleRef.current,
          },
          files: current.getFiles(),
        },
        titleRef.current
      );
    }, 2000);
  }, []);

  /* ─── Background STYLE picker → toggle the SVG pattern overlay ─────── *
   * The overlay div always paints the user's real base color; picking a
   * style just mounts/unmounts the SVG <pattern> layer on top. Excalidraw
   * stays transparent either way, so there's nothing to push into
   * updateScene. We still sync the pattern transform immediately so the
   * new (or removed) pattern picks up the current viewport, and a
   * useEffect below syncs again after commit as a safety net for the
   * first-frame case where the ref isn't attached yet. */
  const handleBackgroundStyleChange = useCallback(
    (next: BackgroundStyle) => {
      setBackgroundStyle(next);
      backgroundStyleRef.current = next;

      const api = excalidrawAPIRef.current;
      if (api) {
        const s = api.getAppState();
        updatePatternTransform(s.scrollX, s.scrollY, s.zoom.value);
      }

      if (effectiveReadOnlyRef.current) return;
      setSaveStatus('unsaved');
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      saveTimerRef.current = setTimeout(() => {
        const current = excalidrawAPIRef.current;
        if (!current) return;
        saveRef.current(
          {
            elements: current.getSceneElements() as readonly ExcalidrawElement[],
            appState: {
              viewBackgroundColor: lastBgColorRef.current,
              backgroundStyle: next,
            },
            files: current.getFiles(),
          },
          titleRef.current
        );
      }, 2000);
    },
    [updatePatternTransform]
  );

  /* ─── Title change → debounced save (canvas snapshot read from API) ─ */
  const handleTitleChange = useCallback((newTitle: string) => {
    setTitle(newTitle);
    if (effectiveReadOnlyRef.current) return;
    setSaveStatus('unsaved');
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const api = excalidrawAPIRef.current;
      if (!api) {
        saveRef.current({}, newTitle);
        return;
      }
      const elements = api.getSceneElements();
      const files = api.getFiles();
      saveRef.current(
        {
          elements: elements as readonly ExcalidrawElement[],
          appState: {
            // Use the ref'd real color — Excalidraw's live value may be the
            // 'transparent' marker when a pattern is active.
            viewBackgroundColor: lastBgColorRef.current,
            backgroundStyle: backgroundStyleRef.current,
          },
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

  /* ─── Co-work: page lock acquisition + heartbeat ────────────────────── *
   * Same lifecycle as PageEditor's text-page lock: whoever mounts the
   * page first grabs the lock, refreshes it every 2 minutes, and
   * releases it on unmount. If someone else already holds it, we flip
   * `lockedByOther` on and Excalidraw enters viewMode via the
   * `effectiveReadOnly` prop further down. */
  useEffect(() => {
    if (!coWorkSessionId || !currentUserId) return;

    const acquireLock = async () => {
      try {
        const res = await fetch(
          `/api/notebooks/${notebookId}/cowork/${coWorkSessionId}/lock/${pageId}`,
          { method: 'POST' }
        );
        if (res.status === 409) {
          if (isMountedRef.current) setLockedByOther(true);
        } else if (res.ok) {
          if (isMountedRef.current) setLockedByOther(false);
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
    const heartbeatInterval = setInterval(acquireLock, 2 * 60 * 1000);

    // Best-effort cleanup on tab close. sendBeacon can't send DELETE;
    // the lock auto-expires after 5 min as a safety net.
    const handleBeforeUnload = () => {
      navigator.sendBeacon(`/api/notebooks/${notebookId}/cowork/${coWorkSessionId}/lock/${pageId}`);
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      clearInterval(heartbeatInterval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      releaseLock();
    };
  }, [coWorkSessionId, currentUserId, notebookId, pageId]);

  /* ─── Co-work: listen for host's "open editing" toggle ──────────────── */
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

  /* ─── Co-work: pull the latest scene from the server and push it into
   * Excalidraw. Called when this participant is locked out and a
   * doc_notify arrives, or as a 5s polling fallback. Exposed via
   * `refreshFromServerRef` so the doc_notify listener effect below
   * doesn't have to re-declare the refresher.
   *
   * After `updateScene` runs, Excalidraw re-snapshots its internal
   * scene-version counter. We deliberately do NOT pre-sync
   * lastSceneVersionRef because `handleChange` — fired synchronously
   * inside updateScene — already short-circuits on effectiveReadOnly
   * above, so the remote apply never leaks back out as a save. */
  const refreshFromServerRef = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    if (!coWorkSessionId) return;
    if (!effectiveReadOnly) {
      // Host / unlocked participant is the source of truth — never
      // overwrite their in-flight edits from server polls.
      refreshFromServerRef.current = async () => {};
      return;
    }

    let cancelled = false;
    const refresh = async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/pages/${pageId}`);
        if (cancelled || !res.ok) return;
        const json = await res.json();
        if (!json.success || !json.data?.content) return;

        const api = excalidrawAPIRef.current;
        if (!api) return;

        const content = json.data.content as Record<string, unknown>;
        if (!Array.isArray(content.elements)) return;

        // Apply remote scene. viewBackgroundColor stays 'transparent'
        // because our overlay div paints the real color (see the long
        // comment on toExcalidrawInitialData for why).
        api.updateScene({
          elements: content.elements as readonly ExcalidrawElement[],
          appState: { viewBackgroundColor: 'transparent' },
        });

        // Re-ingest any image files referenced by the new scene.
        // addFiles is a no-op for files Excalidraw already has cached.
        const rawFiles = content.files;
        if (rawFiles && typeof rawFiles === 'object') {
          const filesArr = Object.values(rawFiles as Record<string, BinaryFileData>);
          if (filesArr.length > 0) {
            try {
              api.addFiles(filesArr);
            } catch {
              // Malformed legacy rows — silently skip; the elements
              // referring to missing files render as placeholders.
            }
          }
        }

        // Mirror host's background base color + pattern so the overlay
        // under Excalidraw matches their view.
        const parsed = parsePersistedAppState(content);
        if (isMountedRef.current) {
          setBgColor(parsed.userBgColor);
          setBackgroundStyle(parsed.backgroundStyle);
        }
        lastBgColorRef.current = parsed.userBgColor;
        backgroundStyleRef.current = parsed.backgroundStyle;

        if (isMountedRef.current && typeof json.data.title === 'string') {
          setTitle(json.data.title);
        }
      } catch {
        // silent — next tick will retry
      }
    };
    refreshFromServerRef.current = refresh;

    refresh(); // immediate refresh on entering read-only mode
    const interval = setInterval(refresh, 5000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [coWorkSessionId, effectiveReadOnly, notebookId, pageId]);

  /* ─── Co-work: doc_notify listener — refresh scene immediately ──────── */
  useEffect(() => {
    if (!coworkSocket || !coWorkSessionId) return;
    const onDocNotify = (data: { sessionId: string; pageId: string }) => {
      if (data.sessionId !== coWorkSessionId) return;
      if (data.pageId !== pageId) return;
      void refreshFromServerRef.current();
    };
    coworkSocket.on('cowork:doc_notify', onDocNotify);
    return () => {
      coworkSocket.off('cowork:doc_notify', onDocNotify);
    };
  }, [coworkSocket, coWorkSessionId, pageId]);

  /* ─── Co-work: sync on socket (re)connect ───────────────────────────── *
   * Closes the race between the participant landing on the page and
   * their socket finishing its handshake — any host edits broadcast
   * during that window would otherwise be missed until the 5s tick. */
  useEffect(() => {
    if (!coworkSocket || !coWorkSessionId) return;
    const syncIfReadOnly = () => {
      if (!effectiveReadOnly) return;
      void refreshFromServerRef.current();
    };
    coworkSocket.on('connect', syncIfReadOnly);
    if (coworkSocket.connected) {
      syncIfReadOnly();
    }
    return () => {
      coworkSocket.off('connect', syncIfReadOnly);
    };
  }, [coworkSocket, coWorkSessionId, effectiveReadOnly]);

  /* ─── Co-work cursor: emit own cursor (throttled) ───────────────────── *
   * Unlike the text editor we emit SCENE coordinates, not viewport
   * pixels, so each peer can reproject them against their own current
   * pan/zoom. The scene→viewport math in the receive effect uses the
   * `viewport` state synced from handleChange above. */
  const lastCursorScenePosRef = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    if (!coworkSocket || !coWorkSessionId) return;
    let lastEmit = 0;

    const sendCursor = (sceneX: number, sceneY: number) => {
      lastCursorScenePosRef.current = { x: sceneX, y: sceneY };
      coworkSocket.emit('cowork:cursor', {
        sessionId: coWorkSessionId,
        pageId,
        x: sceneX,
        y: sceneY,
      });
    };

    const onMove = (e: PointerEvent) => {
      const container = canvasWrapperRef.current;
      const api = excalidrawAPIRef.current;
      if (!container || !api) return;

      const rect = container.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      if (px < 0 || py < 0 || px > rect.width || py > rect.height) return;

      const now = performance.now();
      if (now - lastEmit < 60) return;
      lastEmit = now;

      // Convert viewport pixels to Excalidraw scene coords. Excalidraw
      // stores `scrollX/Y` as a scene-unit offset that corresponds to
      // the top-left of the viewport, and `zoom.value` as the current
      // scale factor. Inverse of `(sceneX + scrollX) * zoom`:
      //   sceneX = px / zoom - scrollX
      const s = api.getAppState();
      const sceneX = px / s.zoom.value - s.scrollX;
      const sceneY = py / s.zoom.value - s.scrollY;
      sendCursor(sceneX, sceneY);
    };

    document.addEventListener('pointermove', onMove);

    // Presence heartbeat: re-emit last scene position every 2s so peers
    // joining after an idle period see a cursor without waiting for the
    // host to move.
    const presenceInterval = setInterval(() => {
      const pos = lastCursorScenePosRef.current;
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
      if (data.pageId && data.pageId !== pageId) return;
      if (data.userId === currentUserId) return;
      const cached = participantUsersRef.current.get(data.userId);
      const user: RemoteCursorUser = cached ?? { id: data.userId, username: 'Anon' };
      setRemoteCursors((prev) => {
        const next = new Map(prev);
        next.set(data.userId, {
          sceneX: data.x,
          sceneY: data.y,
          user,
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

    // GC stale cursors every 2s — peers who disconnected without a
    // clean leave fall off after ~8s.
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

  /* ─── Sync the pattern overlay transform after a style change ───────── *
   * Switching from 'blank' to a pattern mounts a new <pattern> element
   * whose ref isn't attached yet when handleBackgroundStyleChange runs.
   * This effect fires after commit, once the new SVG is attached, and
   * pushes the current Excalidraw viewport into the pattern so the first
   * paint already has the correct width/height/translate. Safe to re-run. */
  useEffect(() => {
    const api = excalidrawAPIRef.current;
    if (!api) return;
    const s = api.getAppState();
    updatePatternTransform(s.scrollX, s.scrollY, s.zoom.value);
  }, [backgroundStyle, updatePatternTransform]);

  /* ─── Stylus barrel-button → eraser ─────────────────────────────────── *
   * Maps non-Apple stylus buttons to the eraser tool via Excalidraw's
   * imperative API. Works for Surface Pen, Wacom, S Pen, etc. — anything
   * that reports `pointerType === 'pen'` with a modifier button pressed.
   * Apple Pencil double-tap / squeeze gestures are NOT exposed to web
   * pages by Safari and cannot be detected here — no workaround exists.
   * Detection rules:
   *   - buttons & 2  → barrel / right-click button (Wacom, Surface)
   *   - buttons & 32 → eraser tip in contact (Surface Pen flipped)
   * We only switch on pointerdown; the user can switch back via the
   * toolbar (or keyboard: T / P / E / V). */
  useEffect(() => {
    if (!page) return;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'pen') return;
      const hasBarrel = (e.buttons & 2) === 2;
      const hasEraserTip = (e.buttons & 32) === 32;
      if (!hasBarrel && !hasEraserTip) return;

      const api = excalidrawAPIRef.current;
      if (!api) return;
      api.setActiveTool({ type: 'eraser' });
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    return () => document.removeEventListener('pointerdown', handlePointerDown, true);
  }, [page]);

  /* ─── Apple Pencil double-tap / squeeze → eraser ─────────────────────── *
   * Apple Pencil 2 double-tap and Pencil Pro squeeze are NOT exposed to
   * web pages by Safari/WKWebView, so the iOS shell wraps
   * UIPencilInteraction in a Swift native module
   * (apps/mobile/ios/Notemage/PencilInteractionModule.swift) and forwards
   * a `pencilTap` event over the native bridge. We subscribe through
   * `nativeBridge.onPencilTap` and toggle the eraser exactly the same
   * way the barrel-button effect above does. When the page is loaded in
   * a regular browser, `isInsideNativeShell()` returns false and the
   * subscription is a no-op, so this code is safe in every context. */
  useEffect(() => {
    if (!page) return;
    if (!isInsideNativeShell()) return;

    const off = nativeBridge.onPencilTap(() => {
      const api = excalidrawAPIRef.current;
      if (!api) return;
      const current = api.getAppState().activeTool.type;
      api.setActiveTool({ type: current === 'eraser' ? 'freedraw' : 'eraser' });
    });
    return () => off();
  }, [page]);

  /* ─── Remap number shortcuts 1/2/3 → Text / Pen / Eraser ────────────── *
   * Excalidraw's built-in numeric shortcuts are hardcoded in its SHAPES
   * array (text=8, freedraw=7, eraser=0). With the new toolbar order
   * (Text first, Pen second, Eraser third) that's confusing — users
   * expect to press 1/2/3 for the first three visible tools. We
   * intercept the keydown event in the capture phase, before it reaches
   * Excalidraw's window-level bubble listener, and call setActiveTool
   * directly; stopImmediatePropagation prevents Excalidraw's default
   * handler from also firing for the same key.
   *
   * Guard against remapping inside text inputs (title field, in-canvas
   * text annotations) or while modifiers are held. */
  useEffect(() => {
    if (!page) return;

    const remap: Record<string, 'text' | 'freedraw' | 'eraser'> = {
      '1': 'text',
      '2': 'freedraw',
      '3': 'eraser',
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable) return;
      }

      const tool = remap[e.key];
      if (!tool) return;

      const api = excalidrawAPIRef.current;
      if (!api) return;

      e.preventDefault();
      e.stopImmediatePropagation();
      api.setActiveTool({ type: tool });
    };

    document.addEventListener('keydown', handleKeyDown, { capture: true });
    return () => document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [page]);

  /* ─── Derive initial data from fetched page (memoized per page) ─────── */
  const initialData = useMemo<ExcalidrawInitialDataState | null>(() => {
    if (!page) return null;
    const parsed = toExcalidrawInitialData(page.content);
    if (parsed) return parsed;
    // Blank fallback (empty page.content or legacy tldraw snapshot). Must
    // match toExcalidrawInitialData's invariant: Excalidraw's canvas is
    // always transparent so our overlay's base color shows through.
    return {
      elements: [],
      appState: {
        viewBackgroundColor: 'transparent',
      },
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
      {/* ── Co-work lock banner ── */}
      {coWorkSessionId && currentUserId && lockedByOther && (
        <PageLockIndicator
          notebookId={notebookId}
          sessionId={coWorkSessionId}
          pageId={pageId}
          currentUserId={currentUserId}
        />
      )}
      <style>{`
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }

        /* ─── De-brand Excalidraw ─────────────────────────────────────
         * Excalidraw is MIT-licensed so we're allowed to hide its
         * branded UI. The library sidebar and the default burger menu
         * both stay enabled — we only strip the outbound links:
         *   1. the floating "?" help button (bottom-right) which opens
         *      a dialog titled "Excalidraw";
         *   2. the "Browse libraries" button inside the library panel,
         *      which links out to libraries.excalidraw.com;
         *   3. any outbound anchor in the main menu pointing at
         *      excalidraw.com / plus.excalidraw.com / libraries. /
         *      docs. / blog. or the Excalidraw social accounts on
         *      github.com, twitter.com, x.com, discord.gg.
         * Selector uses attribute-contains (*=) so it also catches
         * /excalidraw-dev/, etc. The MainMenu.DefaultItems.Socials
         * group is rendered as anchor tags and is fully hidden by the
         * :has(...) rule so we don't leave an empty group separator.
         * ───────────────────────────────────────────────────────────── */
        .excalidraw .help-icon,
        .excalidraw button.help-icon,
        .excalidraw .HelpButton,
        .excalidraw [data-testid="HelpDialog"] {
          display: none !important;
        }
        .excalidraw .library-menu-browse-button,
        .excalidraw .library-menu-browse-button * {
          display: none !important;
        }
        .excalidraw a[href*="plus.excalidraw.com"],
        .excalidraw a[href*="libraries.excalidraw.com"],
        .excalidraw a[href*="docs.excalidraw.com"],
        .excalidraw a[href*="blog.excalidraw.com"],
        .excalidraw a[href="https://excalidraw.com"],
        .excalidraw a[href*="//excalidraw.com"],
        .excalidraw a[href*="github.com/excalidraw"],
        .excalidraw a[href*="twitter.com/excalidraw"],
        .excalidraw a[href*="x.com/excalidraw"],
        .excalidraw a[href*="discord.gg/UexuTaE"],
        .excalidraw a[href*="discord.com/invite/UexuTaE"] {
          display: none !important;
        }
        /* Hide any dropdown-menu group that contains only excalidraw
         * links (the Socials group) so the main menu doesn't end in
         * an orphan separator. */
        .excalidraw .dropdown-menu-group:has(> a[href*="excalidraw"]:only-child),
        .excalidraw .dropdown-menu-group:not(:has(> :not(a[href*="excalidraw"]))) {
          display: none !important;
        }

        /* ─── Reorder shape toolbar: Lock | divider | Text, Pen, Eraser | rest ──
         * Excalidraw's shapes toolbar is a flex container where each
         * tool is a label.ToolIcon wrapping a radio input. Lock sits
         * before a divider, then all the shape tools follow.
         *
         * We want: Lock → divider → Text → Pen → Eraser → (everything
         * else in DOM order) → divider → extras button.
         *
         * Strategy: give every direct child of the flex container a
         * default order of 10, then override the five items we care
         * about with specific low values, and push the trailing
         * divider + extras button to high values. Items we don't
         * override sit at order 10 and fall into their DOM order,
         * which is what we want for Hand/Selection/Rect/etc. */
        .excalidraw .App-toolbar .Stack_horizontal > * {
          order: 10;
        }
        .excalidraw .App-toolbar .Stack_horizontal > label:has(> input[data-testid="toolbar-lock"]) {
          order: 1 !important;
        }
        .excalidraw .App-toolbar .Stack_horizontal > .App-toolbar__divider:first-of-type {
          order: 2 !important;
        }
        .excalidraw .App-toolbar .Stack_horizontal > label:has(> input[data-testid="toolbar-text"]) {
          order: 3 !important;
        }
        .excalidraw .App-toolbar .Stack_horizontal > label:has(> input[data-testid="toolbar-freedraw"]) {
          order: 4 !important;
        }
        .excalidraw .App-toolbar .Stack_horizontal > label:has(> input[data-testid="toolbar-eraser"]) {
          order: 5 !important;
        }
        .excalidraw .App-toolbar .Stack_horizontal > .App-toolbar__divider:last-of-type {
          order: 20 !important;
        }
        .excalidraw .App-toolbar .Stack_horizontal > button.App-toolbar__extra-tools-trigger {
          order: 21 !important;
        }

        /* Hide Excalidraw's default numeric keybinding badges on every
         * tool by default. The built-in numbers (Selection=1, Rect=2,
         * Text=8, Pen=7, Eraser=0, ...) conflict with the new toolbar
         * order, so we suppress them and show only the remapped ones
         * on Text/Pen/Eraser below. Tooltips on hover still show the
         * full "Text — T or 8" hint for anyone who wants the original. */
        .excalidraw .ToolIcon__keybinding {
          display: none !important;
        }

        /* Re-show the badge on Text/Pen/Eraser but mask the original
         * text by shrinking its font to 0, and inject the new shortcut
         * number ("1" / "2" / "3") via the ::after pseudo-element.
         * The ::after inherits color and position from its parent, so
         * the badge looks identical to Excalidraw's native styling. */
        .excalidraw label:has(> input[data-testid="toolbar-text"]) .ToolIcon__keybinding,
        .excalidraw label:has(> input[data-testid="toolbar-freedraw"]) .ToolIcon__keybinding,
        .excalidraw label:has(> input[data-testid="toolbar-eraser"]) .ToolIcon__keybinding {
          display: inline-block !important;
          font-size: 0 !important;
          line-height: 1 !important;
        }
        .excalidraw label:has(> input[data-testid="toolbar-text"]) .ToolIcon__keybinding::after {
          content: "1";
          font-size: 11px;
        }
        .excalidraw label:has(> input[data-testid="toolbar-freedraw"]) .ToolIcon__keybinding::after {
          content: "2";
          font-size: 11px;
        }
        .excalidraw label:has(> input[data-testid="toolbar-eraser"]) .ToolIcon__keybinding::after {
          content: "3";
          font-size: 11px;
        }

        /* Shrink react-colorful for the compact burger-menu item.
         * Defaults are 200x200 with a 24px hue bar and 28x28 pointers,
         * which looks oversized inside a dropdown. The outer size is
         * already set via the inline style prop on <HexColorPicker>;
         * these rules bring the hue bar and pointer down to match. */
        .excalidraw .dropdown-menu .react-colorful {
          border-radius: 6px;
        }
        .excalidraw .dropdown-menu .react-colorful__hue,
        .excalidraw .dropdown-menu .react-colorful__alpha {
          height: 14px;
        }
        .excalidraw .dropdown-menu .react-colorful__saturation {
          border-bottom-width: 8px;
          border-radius: 6px 6px 0 0;
        }
        .excalidraw .dropdown-menu .react-colorful__last-control {
          border-radius: 0 0 6px 6px;
        }
        .excalidraw .dropdown-menu .react-colorful__pointer {
          width: 14px;
          height: 14px;
          border-width: 2px;
        }
      `}</style>

      {/* Title + save status */}
      <div style={{ padding: '32px 56px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <input
            value={title}
            onChange={(e) => handleTitleChange(e.target.value)}
            placeholder="Untitled Canvas"
            readOnly={effectiveReadOnly}
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
        <div ref={canvasWrapperRef} style={{ position: 'absolute', inset: 0 }}>
          {/* Pattern overlay — paints the user's real base color plus the
              selected pattern BEHIND Excalidraw. When a pattern is active,
              Excalidraw's own canvas is rendered with 'transparent' so this
              layer shows through; in blank mode Excalidraw paints the base
              color itself and this div is visually a no-op. pointer-events
              is none so it never steals clicks from Excalidraw.
              The <pattern> element's width/height and patternTransform are
              updated imperatively by updatePatternTransform on every
              Excalidraw onChange so the pattern pans and zooms 1:1 with
              the scene without triggering React re-renders. */}
          <div
            aria-hidden
            style={{
              position: 'absolute',
              inset: 0,
              pointerEvents: 'none',
              background: bgColor,
            }}
          >
            {backgroundStyle !== 'blank' && (
              <svg
                width="100%"
                height="100%"
                style={{ position: 'absolute', inset: 0, display: 'block' }}
              >
                <defs>
                  <pattern
                    ref={patternElementRef}
                    id={`canvas-bg-pattern-${pageId}`}
                    patternUnits="userSpaceOnUse"
                    width={PATTERN_BASE[backgroundStyle].width}
                    height={PATTERN_BASE[backgroundStyle].height}
                  >
                    {renderPatternBody(backgroundStyle, getInkColor(bgColor))}
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill={`url(#canvas-bg-pattern-${pageId})`} />
              </svg>
            )}
          </div>
          {hasPendingImage && (
            <div
              role="status"
              aria-live="polite"
              style={{
                position: 'absolute',
                top: '24px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 5,
                pointerEvents: 'none',
                padding: '10px 16px',
                borderRadius: 'var(--radius-full)',
                background: 'rgba(33, 33, 54,0.9)',
                backdropFilter: 'blur(20px)',
                WebkitBackdropFilter: 'blur(20px)',
                border: '1px solid rgba(174,137,255,0.35)',
                boxShadow: '0 8px 32px rgba(174,137,255,0.15), 0 2px 8px rgba(0,0,0,0.4)',
                color: '#ede9ff',
                fontFamily: 'inherit',
                fontSize: '13px',
                fontWeight: 500,
                letterSpacing: '-0.005em',
                whiteSpace: 'nowrap',
              }}
            >
              Click anywhere on the canvas to place your image
            </div>
          )}
          <Excalidraw
            initialData={initialData}
            onChange={handleChange}
            excalidrawAPI={(api) => {
              excalidrawAPIRef.current = api;
            }}
            theme="light"
            // In a cowork session, participants who don't hold the lock
            // enter Excalidraw's built-in view mode: they can still pan,
            // zoom and select, but toolbar edits, keyboard shortcuts
            // for creation, and drag-to-draw are all disabled at the
            // Excalidraw level. Combined with the handleChange guard
            // (which drops any scene-version bump while read-only)
            // this means a non-host tab cannot push edits to the
            // server even if Excalidraw's view-mode had a bypass.
            viewModeEnabled={effectiveReadOnly}
            UIOptions={{
              canvasActions: {
                loadScene: true,
                saveToActiveFile: true,
                export: {},
                clearCanvas: true,
                changeViewBackgroundColor: true,
              },
            }}
          >
            {/* Custom burger menu: replicates Excalidraw's default set,
                but swaps the built-in ChangeCanvasBackground (preset
                swatches + hex input) for our react-colorful HexColorPicker
                so the "Canvas background" section shows a full spectrum
                wheel. Selecting a color calls handleBgColorChange, which
                fires updateScene; Excalidraw's onChange then propagates
                back through handleChange, syncing bgColor state and
                triggering the debounced save. */}
            <MainMenu>
              <MainMenu.DefaultItems.LoadScene />
              <MainMenu.DefaultItems.SaveToActiveFile />
              <MainMenu.DefaultItems.Export />
              <MainMenu.DefaultItems.SaveAsImage />
              <MainMenu.DefaultItems.CommandPalette />
              <MainMenu.DefaultItems.SearchMenu />
              <MainMenu.DefaultItems.Help />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.Separator />
              <MainMenu.ItemCustom>
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                    padding: '2px 0',
                    width: '100%',
                  }}
                  onPointerDown={(e) => {
                    // Prevent Excalidraw's menu from closing when the
                    // user drags inside the saturation square / hue slider.
                    e.stopPropagation();
                  }}
                >
                  <div
                    style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      color: 'rgba(237,233,255,0.5)',
                      letterSpacing: '0.02em',
                      padding: '0 2px',
                    }}
                  >
                    Canvas background
                  </div>
                  {/* Style picker — Blank / Dotted / Lined / Grid tiles.
                      Sits above the color picker so users set the style
                      first (the larger decision) and then fine-tune the
                      base color. */}
                  <div
                    role="radiogroup"
                    aria-label="Background style"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: '6px',
                      padding: '0 2px',
                    }}
                  >
                    {BACKGROUND_STYLES.map((styleOption) => {
                      const selected = backgroundStyle === styleOption;
                      return (
                        <button
                          key={styleOption}
                          type="button"
                          role="radio"
                          aria-checked={selected}
                          aria-label={styleOption}
                          title={styleOption.charAt(0).toUpperCase() + styleOption.slice(1)}
                          onClick={() => handleBackgroundStyleChange(styleOption)}
                          style={{
                            height: '32px',
                            borderRadius: '6px',
                            border: selected
                              ? '1px solid rgba(174,137,255,0.9)'
                              : '1px solid rgba(237,233,255,0.12)',
                            background: selected ? 'rgba(174,137,255,0.12)' : 'rgba(0,0,0,0.35)',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition: 'border-color 0.2s, background 0.2s',
                          }}
                        >
                          <StyleTileSwatch style={styleOption} />
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ padding: '0 2px' }}>
                    <HexColorPicker
                      color={bgColor}
                      onChange={handleBgColorChange}
                      style={{ width: '100%', height: '96px' }}
                    />
                  </div>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '0 2px',
                    }}
                  >
                    <div
                      aria-hidden="true"
                      style={{
                        width: '16px',
                        height: '16px',
                        borderRadius: '4px',
                        background: bgColor,
                        border: '1px solid rgba(237,233,255,0.15)',
                        flexShrink: 0,
                      }}
                    />
                    <HexColorInput
                      prefixed
                      color={bgColor}
                      onChange={handleBgColorChange}
                      style={{
                        flex: 1,
                        background: 'rgba(0,0,0,0.35)',
                        border: '1px solid rgba(237,233,255,0.12)',
                        borderRadius: '5px',
                        color: '#ede9ff',
                        fontFamily: 'inherit',
                        fontSize: '11px',
                        padding: '4px 6px',
                        outline: 'none',
                        minWidth: 0,
                      }}
                    />
                  </div>
                </div>
              </MainMenu.ItemCustom>
            </MainMenu>
          </Excalidraw>
          {/* ── Co-work remote cursor overlays ──
              Absolute-positioned over the canvas wrapper, re-projected
              from scene coordinates to viewport pixels using the latest
              viewport state (synced from Excalidraw's onChange). The
              overlay layer itself has pointer-events: none so it never
              steals clicks from Excalidraw.
              Cursors are hidden when the viewport hasn't initialized
              yet (zoom still at the default 1 but scrollX/Y not yet
              primed by Excalidraw's first mount onChange). */}
          {coWorkSessionId && (
            <div
              aria-hidden
              style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                overflow: 'hidden',
                zIndex: 80,
              }}
            >
              {Array.from(remoteCursors.entries()).map(([userId, entry]) => {
                const screenX = (entry.sceneX + viewport.scrollX) * viewport.zoom;
                const screenY = (entry.sceneY + viewport.scrollY) * viewport.zoom;
                return (
                  <RemoteCursor
                    key={userId}
                    userId={userId}
                    user={entry.user}
                    x={screenX}
                    y={screenY}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
