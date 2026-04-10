'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Loader } from 'lucide-react';
import { HexColorPicker, HexColorInput } from 'react-colorful';
// NOTE: This whole module is only ever loaded client-side because the parent
// `app/(dashboard)/notebooks/[id]/pages/[pageId]/page.tsx` imports it via
// `dynamic(..., { ssr: false })`. That means we can safely import Excalidraw
// (and its compound `MainMenu` / `WelcomeScreen` components) directly, which
// preserves the static members like `MainMenu.DefaultItems.ClearCanvas`.
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  getSceneVersion,
  CaptureUpdateAction,
} from '@excalidraw/excalidraw';
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
 * pointer, collaborators, etc). Only viewBackgroundColor and our custom
 * backgroundStyle are kept.
 */
type BackgroundStyle = 'blank' | 'dotted' | 'lined' | 'grid';

const BACKGROUND_STYLES: readonly BackgroundStyle[] = [
  'blank',
  'dotted',
  'lined',
  'grid',
] as const;

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
    typeof rawColor === 'string' && rawColor !== 'transparent'
      ? rawColor
      : DEFAULT_BG;
  const rawStyle = savedAppState.backgroundStyle;
  const backgroundStyle: BackgroundStyle =
    typeof rawStyle === 'string' &&
    (BACKGROUND_STYLES as readonly string[]).includes(rawStyle)
      ? (rawStyle as BackgroundStyle)
      : 'blank';
  return { userBgColor, backgroundStyle };
}

/**
 * Compute a faint ink color for pattern dots/lines that contrasts with the
 * given base color. Uses perceived luminance: dark bg → faint white, light
 * bg → faint black. Returns rgba strings with low alpha so the pattern
 * reads as subtle paper texture, not a loud grid.
 */
function getInkColor(hex: string): string {
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
    return 'rgba(255,255,255,0.12)';
  }
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum < 0.5 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.14)';
}

/**
 * Render the SVG children for a single pattern tile. The tile coordinate
 * system matches PATTERN_BASE[style] dimensions.
 */
function renderPatternBody(style: BackgroundStyle, ink: string) {
  if (style === 'dotted') {
    return <circle cx={12} cy={12} r={1.2} fill={ink} />;
  }
  if (style === 'grid') {
    return (
      <>
        <line x1={0} y1={0} x2={24} y2={0} stroke={ink} strokeWidth={1} />
        <line x1={0} y1={0} x2={0} y2={24} stroke={ink} strokeWidth={1} />
      </>
    );
  }
  if (style === 'lined') {
    return <line x1={0} y1={31.5} x2={32} y2={31.5} stroke={ink} strokeWidth={1} />;
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
          [6, 14].map((cy) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={1} fill={ink} />
          )),
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
 * NOTE: When a pattern style is active, we hand Excalidraw a
 * `viewBackgroundColor: 'transparent'` marker so its internal canvas is
 * see-through and our SVG overlay (which paints the user's real color and
 * the pattern) shows through. The user's real color is always persisted in
 * Page.content.appState.viewBackgroundColor — never 'transparent'.
 *
 * Known v1 limitation: Excalidraw's "Save as image" export captures only
 * Excalidraw's own canvas, so exports of patterned canvases will come out
 * transparent without the dots/lines/grid.
 */
function toExcalidrawInitialData(raw: unknown): ExcalidrawInitialDataState | null {
  if (!raw || typeof raw !== 'object') return null;
  const maybe = raw as Record<string, unknown>;
  if (!Array.isArray(maybe.elements)) return null;

  const { userBgColor, backgroundStyle } = parsePersistedAppState(raw);

  return {
    elements: maybe.elements as readonly ExcalidrawElement[],
    appState: {
      viewBackgroundColor:
        backgroundStyle === 'blank' ? userBgColor : 'transparent',
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
  const lastBgColorRef = useRef<string>(DEFAULT_BG);
  const [bgColor, setBgColor] = useState<string>(DEFAULT_BG);
  const [backgroundStyle, setBackgroundStyle] = useState<BackgroundStyle>('blank');
  const backgroundStyleRef = useRef<BackgroundStyle>('blank');
  const patternElementRef = useRef<SVGPatternElement | null>(null);
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

  /* ─── Imperatively sync the SVG pattern overlay to Excalidraw's viewport ─ *
   * Called from handleChange on every interaction (pan, zoom, draw, etc.).
   * Updates width/height and patternTransform on the <pattern> element
   * directly — no React re-render — so panning stays smooth. No-ops when
   * the current style is 'blank' or the ref isn't mounted yet. */
  const updatePatternTransform = useCallback(
    (scrollX: number, scrollY: number, zoom: number) => {
      const pat = patternElementRef.current;
      if (!pat) return;
      const base = PATTERN_BASE[backgroundStyleRef.current];
      if (base.width === 0) return;
      const w = base.width * zoom;
      const h = base.height * zoom;
      pat.setAttribute('width', String(w));
      pat.setAttribute('height', String(h));
      const ox = -scrollX * zoom;
      const oy = -scrollY * zoom;
      pat.setAttribute('patternTransform', `translate(${ox} ${oy})`);
    },
    [],
  );

  /* ─── Excalidraw onChange — version-gated + bg-change + 2s debounce ── *
   * Fires on every Excalidraw interaction (including pointer moves and
   * pan/zoom). We short-circuit no-ops by comparing both the scene version
   * AND the view background color against the previously seen values, so
   * background-only changes still trigger a save (scene version only
   * reflects element changes). The first onChange at mount primes the
   * scene-version ref without saving; bg refs are already seeded from the
   * fetch callback. We also pipe the current viewport into
   * updatePatternTransform so the SVG pattern overlay tracks pan/zoom
   * smoothly without causing a React re-render. */
  const handleChange = useCallback(
    (
      elements: readonly OrderedExcalidrawElement[],
      appState: AppState,
      files: BinaryFiles
    ) => {
      // Sync the pattern overlay on every interaction — covers pan, zoom,
      // draw, erase, etc. No React re-render; pure imperative attribute
      // updates on the mounted <pattern> element.
      updatePatternTransform(
        appState.scrollX,
        appState.scrollY,
        appState.zoom.value,
      );

      const version = getSceneVersion(elements);
      const reportedBg = appState.viewBackgroundColor || DEFAULT_BG;
      const isPatternMode = backgroundStyleRef.current !== 'blank';
      // In pattern mode, Excalidraw's internal viewBackgroundColor is the
      // 'transparent' marker we installed — NOT the user's real color.
      // The user's real color lives in lastBgColorRef (seeded from the
      // fetched page and updated by handleBgColorChange).
      const bgChanged =
        !isPatternMode && reportedBg !== lastBgColorRef.current;
      const sceneChanged = version !== lastSceneVersionRef.current;

      if (!sceneChanged && !bgChanged) return;

      // First call at mount primes the scene-version ref without saving.
      // bgColor state + ref were already seeded from the fetch callback,
      // so we only sync them here when we're in blank mode (where
      // Excalidraw owns the authoritative color).
      if (lastSceneVersionRef.current === -1) {
        lastSceneVersionRef.current = version;
        if (!isPatternMode) {
          lastBgColorRef.current = reportedBg;
          setBgColor(reportedBg);
        }
        return;
      }

      lastSceneVersionRef.current = version;
      if (bgChanged) {
        lastBgColorRef.current = reportedBg;
        setBgColor(reportedBg);
      }

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

  /* ─── Background color picker → Excalidraw updateScene (or overlay) ── *
   * Called from the react-colorful HexColorPicker inside our custom
   * MainMenu item. In 'blank' mode we push the color into Excalidraw and
   * let onChange → handleChange detect the change and schedule a save.
   * In pattern mode Excalidraw's internal bg stays 'transparent' so its
   * onChange won't notice the change; we update state/ref directly and
   * schedule a save manually. Either way lastBgColorRef is the single
   * source of truth for persistence. */
  const handleBgColorChange = useCallback((newColor: string) => {
    // Drive state + ref so the overlay + next save see the new color.
    setBgColor(newColor);
    lastBgColorRef.current = newColor;

    const api = excalidrawAPIRef.current;
    if (api && backgroundStyleRef.current === 'blank') {
      api.updateScene({
        appState: { viewBackgroundColor: newColor },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      return;
    }

    // Pattern mode — Excalidraw stays transparent, so schedule save here.
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
        titleRef.current,
      );
    }, 2000);
  }, []);

  /* ─── Background STYLE picker → swap Excalidraw bg ↔ overlay pattern ── *
   * Toggling between 'blank' and any pattern flips Excalidraw's internal
   * viewBackgroundColor between the user's real color and our
   * 'transparent' marker. The overlay div behind Excalidraw always paints
   * the real color, and the SVG pattern (if any) layers on top of it.
   * Excalidraw's own onChange may not fire for the transparent↔color flip
   * (it's our synthetic value), so we always schedule a save manually. */
  const handleBackgroundStyleChange = useCallback(
    (next: BackgroundStyle) => {
      setBackgroundStyle(next);
      backgroundStyleRef.current = next;

      const api = excalidrawAPIRef.current;
      if (api) {
        api.updateScene({
          appState: {
            viewBackgroundColor:
              next === 'blank' ? lastBgColorRef.current : 'transparent',
          },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
        // Immediately push the current viewport into the (possibly newly
        // mounted) pattern element. A useEffect below also syncs after
        // commit as a safety net for the first-frame case.
        const s = api.getAppState();
        updatePatternTransform(s.scrollX, s.scrollY, s.zoom.value);
      }

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
          titleRef.current,
        );
      }, 2000);
    },
    [updatePatternTransform],
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
    return () =>
      document.removeEventListener('keydown', handleKeyDown, { capture: true });
  }, [page]);

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
                <rect
                  width="100%"
                  height="100%"
                  fill={`url(#canvas-bg-pattern-${pageId})`}
                />
              </svg>
            )}
          </div>
          <Excalidraw
            initialData={initialData}
            onChange={handleChange}
            excalidrawAPI={(api) => {
              excalidrawAPIRef.current = api;
            }}
            theme="dark"
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
                          title={
                            styleOption.charAt(0).toUpperCase() +
                            styleOption.slice(1)
                          }
                          onClick={() => handleBackgroundStyleChange(styleOption)}
                          style={{
                            height: '32px',
                            borderRadius: '6px',
                            border: selected
                              ? '1px solid rgba(174,137,255,0.9)'
                              : '1px solid rgba(237,233,255,0.12)',
                            background: selected
                              ? 'rgba(174,137,255,0.12)'
                              : 'rgba(0,0,0,0.35)',
                            cursor: 'pointer',
                            padding: 0,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            transition:
                              'border-color 0.2s, background 0.2s',
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

            {/* Custom welcome screen with no "Welcome to Excalidraw" text. */}
            <WelcomeScreen>
              <WelcomeScreen.Center>
                <WelcomeScreen.Center.Heading>
                  Start drawing
                </WelcomeScreen.Center.Heading>
              </WelcomeScreen.Center>
            </WelcomeScreen>
          </Excalidraw>
        </div>
      </div>
    </div>
  );
}
