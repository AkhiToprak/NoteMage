'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';

/* ── Types ── */
export type LineStyle = 'solid' | 'dashed' | 'dotted';

export interface StrokeData {
  id: string;
  points: { x: number; y: number }[];
  color: string;
  width: number;
  lineStyle?: LineStyle;
  offset?: { x: number; y: number };
}

export interface TextData {
  kind: 'text';
  id: string;
  x: number;
  y: number;
  width: number;
  text: string;
  color: string;
  fontSize: number;
  offset?: { x: number; y: number };
  fontFamily?: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
}

export type EditorMode = 'cursor' | 'pen' | 'text';
export type ActiveTool = 'pen' | 'eraser';

export interface RulerState {
  active: boolean;
  angle: number;
  position: { x: number; y: number };
}

interface DrawingOverlayProps {
  strokes: StrokeData[];
  onStrokesChange: (strokes: StrokeData[]) => void;
  texts: TextData[];
  onTextsChange: (texts: TextData[]) => void;
  mode: EditorMode;
  activeTool: ActiveTool;
  penColor: string;
  penWidth: number;
  lineStyle: LineStyle;
  ruler: RulerState;
  onRulerChange: (ruler: RulerState) => void;
  /** Notify the parent of the currently selected text annotation (or null)
   *  so the editor toolbar can retarget its controls at overlay text. */
  onSelectedTextChange?: (annotation: TextData | null) => void;
  /** Style defaults used when a fresh text annotation is created. Lets
   *  the user pick color/font/size BEFORE dropping a text. */
  textDefaults?: {
    color: string;
    fontSize: number;
    fontFamily?: string;
    bold: boolean;
    italic: boolean;
    underline: boolean;
    strike: boolean;
  };
}

/* ── Helpers ── */

/** Hydrate legacy stroke data that may lack id/lineStyle/offset */
export function hydrateStrokes(raw: unknown[]): StrokeData[] {
  if (!Array.isArray(raw)) return [];
  return raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((s: any) => s && typeof s === 'object' && s.kind !== 'text')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((s: any) => ({
      id: (s.id as string) || crypto.randomUUID(),
      points: (s.points as { x: number; y: number }[]) || [],
      color: (s.color as string) || '#ede9ff',
      width: (s.width as number) || 4,
      lineStyle: (s.lineStyle as LineStyle) || 'solid',
      offset: (s.offset as { x: number; y: number }) || { x: 0, y: 0 },
    }));
}

/** Hydrate text annotations from persisted drawing array */
export function hydrateTexts(raw: unknown[]): TextData[] {
  if (!Array.isArray(raw)) return [];
  return raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .filter((t: any) => t && typeof t === 'object' && t.kind === 'text')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((t: any) => ({
      kind: 'text' as const,
      id: (t.id as string) || crypto.randomUUID(),
      x: typeof t.x === 'number' ? t.x : 0,
      y: typeof t.y === 'number' ? t.y : 0,
      width: typeof t.width === 'number' ? t.width : 200,
      text: typeof t.text === 'string' ? t.text : '',
      color: typeof t.color === 'string' ? t.color : '#ede9ff',
      fontSize: typeof t.fontSize === 'number' ? t.fontSize : 16,
      offset: (t.offset as { x: number; y: number }) || { x: 0, y: 0 },
      fontFamily: typeof t.fontFamily === 'string' ? t.fontFamily : undefined,
      bold: !!t.bold,
      italic: !!t.italic,
      underline: !!t.underline,
      strike: !!t.strike,
    }));
}

function getStrokeDashArray(style: LineStyle, width: number): string | undefined {
  switch (style) {
    case 'dashed':
      return `${Math.max(8, width * 3)} ${Math.max(4, width * 1.5)}`;
    case 'dotted':
      return `${Math.max(1, width * 0.5)} ${Math.max(4, width * 1.5)}`;
    default:
      return undefined;
  }
}

function pointsToSvgPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) {
    return `M ${points[0].x},${points[0].y} L ${points[0].x},${points[0].y}`;
  }
  // Smooth quadratic bezier through midpoints
  let d = `M ${points[0].x},${points[0].y}`;
  if (points.length === 2) {
    d += ` L ${points[1].x},${points[1].y}`;
    return d;
  }
  for (let i = 1; i < points.length - 1; i++) {
    const mx = (points[i].x + points[i + 1].x) / 2;
    const my = (points[i].y + points[i + 1].y) / 2;
    d += ` Q ${points[i].x},${points[i].y} ${mx},${my}`;
  }
  const last = points[points.length - 1];
  d += ` L ${last.x},${last.y}`;
  return d;
}

function getBoundingBox(points: { x: number; y: number }[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function projectToRulerLine(
  point: { x: number; y: number },
  origin: { x: number; y: number },
  angleDeg: number
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const dir = { x: Math.cos(rad), y: Math.sin(rad) };
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const t = dx * dir.x + dy * dir.y;
  return { x: origin.x + t * dir.x, y: origin.y + t * dir.y };
}

const ERASER_HIT_RADIUS_DEFAULT = 16;
const ERASER_HIT_RADIUS_PHONE = 24;

interface TextAnnotationProps {
  data: TextData;
  dragOffset: { x: number; y: number } | null;
  mode: EditorMode;
  isSelected: boolean;
  isEditing: boolean;
  onSelect: () => void;
  onBeginEdit: () => void;
  onDragStart: (e: React.PointerEvent) => void;
  onCommit: (value: string) => void;
  onUpdate: (updates: Partial<TextData>) => void;
}

type ResizeHandle = 'nw' | 'ne' | 'sw' | 'se' | 'e' | 'w';

function TextAnnotation({
  data: t,
  dragOffset,
  mode,
  isSelected,
  isEditing,
  onSelect,
  onBeginEdit,
  onDragStart,
  onCommit,
  onUpdate,
}: TextAnnotationProps) {
  const [draft, setDraft] = useState<string>(() => t.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Start as `false` so the "entering editing" transition fires on the
  // very first mount when a freshly-created text renders with
  // isEditing=true. Otherwise focus() is never called and the textarea
  // silently sits blurred inside the foreignObject.
  const wasEditingRef = useRef(false);
  const resizeState = useRef<{
    handle: ResizeHandle;
    startClientX: number;
    startClientY: number;
    origWidth: number;
    origFontSize: number;
    origX: number;
    origY: number;
    origLines: number;
  } | null>(null);
  const [resizePreview, setResizePreview] = useState<{
    width: number;
    fontSize: number;
    x: number;
    y: number;
  } | null>(null);

  // Sync draft and imperatively focus when transitioning into editing.
  // autoFocus inside <foreignObject> is unreliable across browsers, so we
  // call focus() manually once the textarea is mounted.
  useEffect(() => {
    if (isEditing && !wasEditingRef.current) {
      setDraft(t.text);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          const len = el.value.length;
          el.setSelectionRange(len, len);
        }
      });
    }
    wasEditingRef.current = isEditing;
  }, [isEditing, t.text]);

  const ox = dragOffset?.x ?? t.offset?.x ?? 0;
  const oy = dragOffset?.y ?? t.offset?.y ?? 0;

  const liveWidth = resizePreview?.width ?? t.width;
  const liveFontSize = resizePreview?.fontSize ?? t.fontSize;
  const liveX = resizePreview?.x ?? t.x;
  const liveY = resizePreview?.y ?? t.y;

  const padY = Math.max(2, liveFontSize * 0.2);
  const padX = 4;
  const displayText = isEditing ? draft : t.text;
  const lineCount = Math.max(1, (displayText.match(/\n/g)?.length ?? 0) + 1);
  const foHeight = Math.max(liveFontSize * 1.4, lineCount * liveFontSize * 1.4) + padY * 2;
  // Room for handles extending outside the text box
  const handleMargin = 8;
  const foPointerEventsValue: 'none' | 'auto' = mode === 'pen' ? 'none' : 'auto';
  const showHandles = isSelected && !isEditing && mode === 'cursor';

  const decorations: string[] = [];
  if (t.underline) decorations.push('underline');
  if (t.strike) decorations.push('line-through');

  const commonStyle: React.CSSProperties = {
    width: liveWidth,
    boxSizing: 'border-box',
    padding: `${padY}px ${padX}px`,
    color: t.color,
    fontSize: liveFontSize,
    lineHeight: 1.4,
    fontFamily: t.fontFamily || "'DM Sans', sans-serif",
    fontWeight: t.bold ? 700 : 400,
    fontStyle: t.italic ? 'italic' : 'normal',
    textDecoration: decorations.length ? decorations.join(' ') : 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    borderRadius: 4,
    margin: 0,
    border: 'none',
    outline: isEditing
      ? '1.5px solid rgba(164,123,255,0.8)'
      : isSelected
        ? '1.5px dashed rgba(164,123,255,0.6)'
        : 'none',
    outlineOffset: 2,
    background: isEditing ? 'rgba(26,26,54,0.35)' : 'transparent',
  };

  // ── Resize handlers ──
  const handleResizePointerDown = (handle: ResizeHandle) => (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    resizeState.current = {
      handle,
      startClientX: e.clientX,
      startClientY: e.clientY,
      origWidth: t.width,
      origFontSize: t.fontSize,
      origX: t.x,
      origY: t.y,
      origLines: lineCount,
    };
    (e.target as Element).setPointerCapture?.(e.pointerId);
  };

  const handleResizePointerMove = (e: React.PointerEvent) => {
    const s = resizeState.current;
    if (!s) return;
    const dx = e.clientX - s.startClientX;
    const dy = e.clientY - s.startClientY;
    const origHeight = s.origLines * s.origFontSize * 1.4;

    let sx = 0;
    // East-direction growth for each handle (positive dx grows width)
    if (s.handle === 'se' || s.handle === 'ne' || s.handle === 'e') sx = dx;
    else if (s.handle === 'sw' || s.handle === 'nw' || s.handle === 'w') sx = -dx;

    // For corners, combine with vertical drag so user can scale via either axis
    if (s.handle === 'se' || s.handle === 'nw') sx = Math.max(sx, dy * (s.origWidth / origHeight));
    if (s.handle === 'ne' || s.handle === 'sw') sx = Math.max(sx, -dy * (s.origWidth / origHeight));

    const minWidth = 40;
    const newWidth = Math.max(minWidth, s.origWidth + sx);

    const isCorner = s.handle === 'nw' || s.handle === 'ne' || s.handle === 'sw' || s.handle === 'se';
    const scale = newWidth / s.origWidth;
    const newFontSize = isCorner ? Math.max(8, s.origFontSize * scale) : s.origFontSize;
    const newHeight = s.origLines * newFontSize * 1.4;

    // Adjust origin so the opposite edge/corner stays anchored
    let newX = s.origX;
    let newY = s.origY;
    if (s.handle === 'nw' || s.handle === 'sw' || s.handle === 'w') {
      newX = s.origX + (s.origWidth - newWidth);
    }
    if ((s.handle === 'nw' || s.handle === 'ne') && isCorner) {
      newY = s.origY + (origHeight - newHeight);
    }

    setResizePreview({ width: newWidth, fontSize: newFontSize, x: newX, y: newY });
  };

  const handleResizePointerUp = () => {
    const s = resizeState.current;
    if (!s || !resizePreview) {
      resizeState.current = null;
      setResizePreview(null);
      return;
    }
    onUpdate({
      width: resizePreview.width,
      fontSize: resizePreview.fontSize,
      x: resizePreview.x,
      y: resizePreview.y,
    });
    resizeState.current = null;
    setResizePreview(null);
  };

  const handleDotStyle: React.CSSProperties = {
    position: 'absolute',
    width: 10,
    height: 10,
    background: '#1a1a36',
    border: '1.5px solid rgba(164,123,255,0.8)',
    borderRadius: '50%',
    boxSizing: 'border-box',
    pointerEvents: 'auto',
  };

  const contentHeight = lineCount * liveFontSize * 1.4 + padY * 2;

  return (
    <g transform={`translate(${ox}, ${oy})`} data-text-annotation="true">
      <foreignObject
        x={liveX - padX - handleMargin}
        y={liveY - padY - handleMargin}
        width={liveWidth + (padX + handleMargin) * 2}
        height={foHeight + handleMargin * 2}
        style={{ pointerEvents: foPointerEventsValue, overflow: 'visible' }}
      >
        <div
          data-text-annotation="true"
          style={{
            position: 'relative',
            width: liveWidth + (padX + handleMargin) * 2,
            padding: handleMargin,
            boxSizing: 'border-box',
          }}
        >
          {isEditing ? (
            <textarea
              ref={textareaRef}
              data-text-annotation="true"
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onPointerDown={(e) => e.stopPropagation()}
              onBlur={() => onCommit(draft)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  e.currentTarget.blur();
                }
              }}
              rows={lineCount}
              style={{
                ...commonStyle,
                resize: 'none',
                overflow: 'hidden',
                minHeight: liveFontSize * 1.4,
                cursor: 'text',
                display: 'block',
              }}
            />
          ) : (
            <div
              data-text-annotation="true"
              onPointerDown={(e) => {
                if (mode === 'cursor') {
                  e.stopPropagation();
                  if (isSelected) onDragStart(e);
                  else onSelect();
                } else if (mode === 'text') {
                  e.stopPropagation();
                  onBeginEdit();
                }
              }}
              onDoubleClick={(e) => {
                if (mode === 'cursor') {
                  e.stopPropagation();
                  onBeginEdit();
                }
              }}
              style={{
                ...commonStyle,
                minHeight: liveFontSize * 1.4,
                cursor:
                  mode === 'cursor'
                    ? isSelected
                      ? 'grab'
                      : 'pointer'
                    : mode === 'text'
                      ? 'text'
                      : 'default',
                userSelect: 'none',
              }}
            >
              {t.text}
            </div>
          )}

          {/* Resize handles (cursor mode, when selected and not editing) */}
          {showHandles && (
            <>
              {(
                [
                  { h: 'nw' as const, top: handleMargin - 5, left: handleMargin - 5, cursor: 'nw-resize' },
                  {
                    h: 'ne' as const,
                    top: handleMargin - 5,
                    left: handleMargin + liveWidth - 5,
                    cursor: 'ne-resize',
                  },
                  {
                    h: 'sw' as const,
                    top: handleMargin + contentHeight - 5,
                    left: handleMargin - 5,
                    cursor: 'sw-resize',
                  },
                  {
                    h: 'se' as const,
                    top: handleMargin + contentHeight - 5,
                    left: handleMargin + liveWidth - 5,
                    cursor: 'se-resize',
                  },
                  {
                    h: 'w' as const,
                    top: handleMargin + contentHeight / 2 - 5,
                    left: handleMargin - 5,
                    cursor: 'w-resize',
                  },
                  {
                    h: 'e' as const,
                    top: handleMargin + contentHeight / 2 - 5,
                    left: handleMargin + liveWidth - 5,
                    cursor: 'e-resize',
                  },
                ]
              ).map((handle) => (
                <div
                  key={handle.h}
                  data-text-annotation="true"
                  onPointerDown={handleResizePointerDown(handle.h)}
                  onPointerMove={handleResizePointerMove}
                  onPointerUp={handleResizePointerUp}
                  style={{
                    ...handleDotStyle,
                    top: handle.top,
                    left: handle.left,
                    cursor: handle.cursor,
                  }}
                />
              ))}
            </>
          )}
        </div>
      </foreignObject>
    </g>
  );
}

export default function DrawingOverlay({
  strokes,
  onStrokesChange,
  texts,
  onTextsChange,
  mode,
  activeTool,
  penColor,
  penWidth,
  lineStyle,
  ruler,
  onRulerChange,
  onSelectedTextChange,
  textDefaults,
}: DrawingOverlayProps) {
  const { isPhone } = useBreakpoint();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentStroke, setCurrentStroke] = useState<StrokeData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [svgHeight, setSvgHeight] = useState(1000);
  const isDrawing = useRef(false);
  const textDragState = useRef<{
    textId: string;
    startX: number;
    startY: number;
    origOffset: { x: number; y: number };
  } | null>(null);
  const [textDragOffset, setTextDragOffset] = useState<{ id: string; x: number; y: number } | null>(
    null
  );

  // Drag state
  const dragState = useRef<{
    strokeId: string;
    startX: number;
    startY: number;
    origOffset: { x: number; y: number };
  } | null>(null);
  const [dragOffset, setDragOffset] = useState<{ id: string; x: number; y: number } | null>(null);

  // Ruler drag state
  const rulerDrag = useRef<{
    type: 'move' | 'rotate';
    startX: number;
    startY: number;
    origPosition: { x: number; y: number };
    origAngle: number;
  } | null>(null);

  // Resize SVG to match parent content height. This is load-bearing for
  // the "click over an image to place text" flow: if svgHeight doesn't
  // reach the image's bottom, the SVG hit rect ends above the image and
  // clicks fall through to the <img> below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const parent = container.parentElement;
    if (!parent) return;

    const update = () => {
      const h = Math.max(parent.scrollHeight, parent.clientHeight, 1000);
      setSvgHeight(h);
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(parent);

    // Watch for new images being added to the editor. When a freshly
    // inserted <img> finishes loading its content shifts the parent's
    // height — we need a re-measure at that exact moment because the
    // ResizeObserver alone can miss cases where explicit width/height
    // attrs mean layout doesn't actually shift on load.
    const attachImgLoaders = (root: ParentNode) => {
      const imgs = root.querySelectorAll('img');
      imgs.forEach((img) => {
        if ((img as HTMLImageElement).complete) return;
        img.addEventListener('load', update, { once: true });
        img.addEventListener('error', update, { once: true });
      });
    };
    attachImgLoaders(parent);

    const contentEl = parent.querySelector('.notemage-editor');
    if (contentEl) observer.observe(contentEl);

    const mutationObs = new MutationObserver((records) => {
      for (const rec of records) {
        rec.addedNodes.forEach((n) => {
          if (n.nodeType !== 1) return;
          const el = n as Element;
          if (el.tagName === 'IMG') {
            const img = el as HTMLImageElement;
            if (!img.complete) {
              img.addEventListener('load', update, { once: true });
              img.addEventListener('error', update, { once: true });
            }
          } else {
            attachImgLoaders(el);
          }
        });
      }
      // Any DOM mutation inside the editor is a cheap signal to re-measure
      update();
    });
    mutationObs.observe(parent, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      mutationObs.disconnect();
    };
  }, []);

  const getSvgPoint = useCallback(
    (e: React.PointerEvent | PointerEvent): { x: number; y: number } => {
      const container = containerRef.current;
      if (!container) return { x: 0, y: 0 };
      const rect = container.getBoundingClientRect();
      // Container scrolls with content, so no scroll offset needed
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    []
  );

  // Keep a ref to the freshest texts so createTextAt (captured by the
  // SVG's pointerDown handler) never appends to a stale array.
  const textsRef = useRef(texts);
  useEffect(() => {
    textsRef.current = texts;
  }, [texts]);

  // Keep textDefaults fresh via a ref so the capture-phase pointerdown
  // handler doesn't need to re-subscribe every time a default changes.
  const textDefaultsRef = useRef(textDefaults);
  useEffect(() => {
    textDefaultsRef.current = textDefaults;
  }, [textDefaults]);

  // Create a new text at a given point and enter edit mode. Style comes
  // from the parent-provided textDefaults so toolbar changes made BEFORE
  // placing the text are applied on first render.
  const createTextAt = useCallback(
    (point: { x: number; y: number }) => {
      const d = textDefaultsRef.current;
      const newText: TextData = {
        kind: 'text',
        id: crypto.randomUUID(),
        x: point.x,
        y: point.y,
        width: 220,
        text: '',
        color: d?.color ?? penColor,
        fontSize: d?.fontSize ?? 15,
        fontFamily: d?.fontFamily,
        bold: d?.bold ?? false,
        italic: d?.italic ?? false,
        underline: d?.underline ?? false,
        strike: d?.strike ?? false,
        offset: { x: 0, y: 0 },
      };
      onTextsChange([...textsRef.current, newText]);
      setEditingTextId(newText.id);
      setSelectedId(newText.id);
    },
    [onTextsChange, penColor]
  );

  // Track editingTextId via a ref so the capture-phase handler (below)
  // can check without forcing the effect to re-subscribe on every edit.
  const editingTextIdRef = useRef(editingTextId);
  useEffect(() => {
    editingTextIdRef.current = editingTextId;
  }, [editingTextId]);

  // Surface the selected (or currently-editing) text annotation to the
  // parent so the toolbar can target it. Editing takes priority so
  // typing + changing color/font/size applies to the in-flight text.
  useEffect(() => {
    if (!onSelectedTextChange) return;
    const activeId = editingTextId ?? selectedId;
    if (!activeId) {
      onSelectedTextChange(null);
      return;
    }
    const match = texts.find((t) => t.id === activeId);
    onSelectedTextChange(match ?? null);
  }, [selectedId, editingTextId, texts, onSelectedTextChange]);

  // ── Text-mode click interception at the parent level ──
  // The SVG overlay sits at z-index 100, but clicks over <img> elements
  // inside the editor were still falling through — likely because
  // ProseMirror's own pointerdown handler on the editor fires and the
  // image's node-view stacking in some layouts wins over the overlay.
  //
  // Solution: when text mode is active, listen for pointerdown at the
  // editor container in the CAPTURE phase. Capture-phase handlers run
  // before any descendant's bubble-phase handlers (including
  // ProseMirror's image selection and our own SVG handler), so we're
  // guaranteed to see the click regardless of what's underneath the
  // cursor. We skip events originating on existing text annotations so
  // selecting/editing them still works.
  useEffect(() => {
    if (mode !== 'text') return;
    const container = containerRef.current;
    if (!container) return;
    const parent = container.parentElement;
    if (!parent) return;

    const handler = (e: PointerEvent) => {
      const target = e.target as Element | null;
      if (!target) return;
      // Respect existing text annotations — their own handlers run after
      // this one in the bubble phase.
      if (target.closest('[data-text-annotation]')) return;

      // If the user is currently editing a text, don't create a new one —
      // let this click commit the in-flight edit via blur. Without this
      // guard, clicking outside the textarea spawns an empty annotation
      // AND preventDefault prevents the blur → the typed draft is lost.
      if (editingTextIdRef.current) {
        const active = document.activeElement as HTMLElement | null;
        if (active && active.tagName === 'TEXTAREA') {
          active.blur();
        }
        return;
      }

      e.preventDefault();
      e.stopPropagation();
      const rect = container.getBoundingClientRect();
      const point = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      createTextAt(point);
    };

    parent.addEventListener('pointerdown', handler, true);
    return () => parent.removeEventListener('pointerdown', handler, true);
  }, [mode, createTextAt]);

  // Handle pointer down
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (mode === 'text') {
        // Don't create a new text if the click originated on an existing text element
        const target = e.target as Element;
        if (target.closest('[data-text-annotation]')) return;
        const point = getSvgPoint(e);
        createTextAt(point);
        return;
      }
      if (mode !== 'pen') return;
      const point = getSvgPoint(e);

      if (activeTool === 'eraser') {
        // Find and remove stroke near point
        for (let i = strokes.length - 1; i >= 0; i--) {
          const s = strokes[i];
          const ox = s.offset?.x ?? 0;
          const oy = s.offset?.y ?? 0;
          for (const pt of s.points) {
            const dx = pt.x + ox - point.x;
            const dy = pt.y + oy - point.y;
            const eraserR = isPhone ? ERASER_HIT_RADIUS_PHONE : ERASER_HIT_RADIUS_DEFAULT;
            if (dx * dx + dy * dy <= eraserR * eraserR) {
              onStrokesChange(strokes.filter((_, idx) => idx !== i));
              return;
            }
          }
        }
        return;
      }

      // Pen drawing
      isDrawing.current = true;
      let drawPoint = point;
      if (ruler.active) {
        drawPoint = projectToRulerLine(point, ruler.position, ruler.angle);
      }
      const newStroke: StrokeData = {
        id: crypto.randomUUID(),
        points: [drawPoint],
        color: penColor,
        width: penWidth,
        lineStyle,
        offset: { x: 0, y: 0 },
      };
      setCurrentStroke(newStroke);
      (e.target as SVGSVGElement).setPointerCapture?.(e.pointerId);
    },
    [
      mode,
      activeTool,
      getSvgPoint,
      strokes,
      onStrokesChange,
      penColor,
      penWidth,
      lineStyle,
      ruler,
      isPhone,
      createTextAt,
    ]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (!isDrawing.current || !currentStroke || mode !== 'pen') return;
      let point = getSvgPoint(e);
      if (ruler.active) {
        point = projectToRulerLine(point, ruler.position, ruler.angle);
      }
      setCurrentStroke((prev) => {
        if (!prev) return prev;
        return { ...prev, points: [...prev.points, point] };
      });
    },
    [currentStroke, mode, getSvgPoint, ruler]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawing.current || !currentStroke) return;
    isDrawing.current = false;
    if (currentStroke.points.length >= 2) {
      onStrokesChange([...strokes, currentStroke]);
    }
    setCurrentStroke(null);
  }, [currentStroke, strokes, onStrokesChange]);

  // Stroke selection (cursor mode)
  const handleStrokeClick = useCallback(
    (e: React.PointerEvent, strokeId: string) => {
      if (mode !== 'cursor') return;
      e.stopPropagation();
      setSelectedId(strokeId);
    },
    [mode]
  );

  // Deselect on background click
  const handleBackgroundClick = useCallback(() => {
    if (mode === 'cursor') setSelectedId(null);
  }, [mode]);

  // Drag start
  const handleDragStart = useCallback(
    (e: React.PointerEvent, strokeId: string) => {
      if (mode !== 'cursor' || selectedId !== strokeId) return;
      e.stopPropagation();
      const stroke = strokes.find((s) => s.id === strokeId);
      if (!stroke) return;
      dragState.current = {
        strokeId,
        startX: e.clientX,
        startY: e.clientY,
        origOffset: stroke.offset ?? { x: 0, y: 0 },
      };
      (e.target as SVGElement).setPointerCapture?.(e.pointerId);
    },
    [mode, selectedId, strokes]
  );

  const handleDragMove = useCallback((e: React.PointerEvent) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    setDragOffset({
      id: dragState.current.strokeId,
      x: dragState.current.origOffset.x + dx,
      y: dragState.current.origOffset.y + dy,
    });
  }, []);

  const handleDragEnd = useCallback(() => {
    if (!dragState.current || !dragOffset) {
      dragState.current = null;
      return;
    }
    const updated = strokes.map((s) =>
      s.id === dragState.current!.strokeId
        ? { ...s, offset: { x: dragOffset.x, y: dragOffset.y } }
        : s
    );
    onStrokesChange(updated);
    dragState.current = null;
    setDragOffset(null);
  }, [strokes, onStrokesChange, dragOffset]);

  // Keyboard: Delete selected stroke/text, Escape to deselect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const tgt = e.target as HTMLElement;
        // Don't intercept if user is typing in an input/textarea/contentEditable
        if (
          tgt.tagName === 'INPUT' ||
          tgt.tagName === 'TEXTAREA' ||
          tgt.isContentEditable ||
          editingTextId
        )
          return;
        e.preventDefault();
        if (texts.some((t) => t.id === selectedId)) {
          onTextsChange(texts.filter((t) => t.id !== selectedId));
        } else {
          onStrokesChange(strokes.filter((s) => s.id !== selectedId));
        }
        setSelectedId(null);
      } else if (e.key === 'Escape') {
        setSelectedId(null);
        setEditingTextId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, strokes, texts, onStrokesChange, onTextsChange, editingTextId]);

  // ── Text drag handlers (cursor mode) ──
  const handleTextDragStart = useCallback(
    (e: React.PointerEvent, textId: string) => {
      if (mode !== 'cursor') return;
      e.stopPropagation();
      const t = texts.find((tt) => tt.id === textId);
      if (!t) return;
      textDragState.current = {
        textId,
        startX: e.clientX,
        startY: e.clientY,
        origOffset: t.offset ?? { x: 0, y: 0 },
      };
      (e.target as Element).setPointerCapture?.(e.pointerId);
    },
    [mode, texts]
  );

  const handleTextDragMove = useCallback((e: React.PointerEvent) => {
    if (!textDragState.current) return;
    const dx = e.clientX - textDragState.current.startX;
    const dy = e.clientY - textDragState.current.startY;
    setTextDragOffset({
      id: textDragState.current.textId,
      x: textDragState.current.origOffset.x + dx,
      y: textDragState.current.origOffset.y + dy,
    });
  }, []);

  const handleTextDragEnd = useCallback(() => {
    if (!textDragState.current || !textDragOffset) {
      textDragState.current = null;
      return;
    }
    const updated = texts.map((t) =>
      t.id === textDragState.current!.textId
        ? { ...t, offset: { x: textDragOffset.x, y: textDragOffset.y } }
        : t
    );
    onTextsChange(updated);
    textDragState.current = null;
    setTextDragOffset(null);
  }, [texts, onTextsChange, textDragOffset]);

  const commitTextEdit = useCallback(
    (textId: string, value: string) => {
      const trimmed = value;
      if (trimmed.length === 0) {
        // Remove empty texts on blur
        onTextsChange(texts.filter((t) => t.id !== textId));
      } else {
        onTextsChange(texts.map((t) => (t.id === textId ? { ...t, text: trimmed } : t)));
      }
      setEditingTextId((cur) => (cur === textId ? null : cur));
    },
    [texts, onTextsChange]
  );

  // ── Ruler handlers ──

  const handleRulerPointerDown = useCallback(
    (e: React.PointerEvent, type: 'move' | 'rotate') => {
      e.stopPropagation();
      e.preventDefault();
      rulerDrag.current = {
        type,
        startX: e.clientX,
        startY: e.clientY,
        origPosition: { ...ruler.position },
        origAngle: ruler.angle,
      };
      (e.target as SVGElement).setPointerCapture?.(e.pointerId);
    },
    [ruler]
  );

  const handleRulerPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!rulerDrag.current) return;
      const rd = rulerDrag.current;
      if (rd.type === 'move') {
        const dx = e.clientX - rd.startX;
        const dy = e.clientY - rd.startY;
        onRulerChange({
          ...ruler,
          position: { x: rd.origPosition.x + dx, y: rd.origPosition.y + dy },
        });
      } else {
        // Rotate: angle from position to current mouse
        const svg = svgRef.current;
        if (!svg) return;
        const rect = svg.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;
        const angle = Math.atan2(my - ruler.position.y, mx - ruler.position.x) * (180 / Math.PI);
        onRulerChange({ ...ruler, angle });
      }
    },
    [ruler, onRulerChange]
  );

  const handleRulerPointerUp = useCallback(() => {
    rulerDrag.current = null;
  }, []);

  // Compute ruler line endpoints (extend far enough to span the SVG)
  const rulerLen = 4000;
  const rulerRad = (ruler.angle * Math.PI) / 180;
  const rulerX1 = ruler.position.x - Math.cos(rulerRad) * rulerLen;
  const rulerY1 = ruler.position.y - Math.sin(rulerRad) * rulerLen;
  const rulerX2 = ruler.position.x + Math.cos(rulerRad) * rulerLen;
  const rulerY2 = ruler.position.y + Math.sin(rulerRad) * rulerLen;

  // Handle endpoint for rotation
  const handleDist = 200;
  const handleX = ruler.position.x + Math.cos(rulerRad) * handleDist;
  const handleY = ruler.position.y + Math.sin(rulerRad) * handleDist;
  const handleX2 = ruler.position.x - Math.cos(rulerRad) * handleDist;
  const handleY2 = ruler.position.y - Math.sin(rulerRad) * handleDist;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: svgHeight,
        pointerEvents: 'none',
        zIndex: 100,
      }}
    >
      <svg
        ref={svgRef}
        width="100%"
        height={svgHeight}
        style={{
          display: 'block',
          // `all` (not `auto`) forces the SVG to capture pointer events on
          // its entire bounding box — including transparent areas over
          // images below. With `auto`, the SVG root sometimes falls back
          // to `visiblePainted` semantics and empty regions above
          // images let clicks slip through to the image instead.
          pointerEvents: mode === 'pen' || mode === 'text' ? 'all' : 'none',
          cursor: mode === 'pen' ? 'crosshair' : mode === 'text' ? 'text' : 'default',
        }}
        onPointerDown={
          mode === 'pen' || mode === 'text' ? handlePointerDown : handleBackgroundClick
        }
        onPointerMove={(e) => {
          if (mode === 'pen') handlePointerMove(e);
          if (dragState.current) handleDragMove(e);
          if (textDragState.current) handleTextDragMove(e);
          if (rulerDrag.current) handleRulerPointerMove(e);
        }}
        onPointerUp={() => {
          if (mode === 'pen') handlePointerUp();
          if (dragState.current) handleDragEnd();
          if (textDragState.current) handleTextDragEnd();
          if (rulerDrag.current) handleRulerPointerUp();
        }}
        onPointerLeave={() => {
          if (mode === 'pen') handlePointerUp();
        }}
      >
        {/* Explicit full-canvas hit target for pen/text modes. Without
            this, clicks over opaque <img> elements below the SVG can slip
            through even though the SVG has pointer-events: all — some
            browsers treat the root <svg>'s empty area inconsistently.
            A transparent <rect> guarantees a hit target everywhere. */}
        {(mode === 'pen' || mode === 'text') && (
          <rect
            x={0}
            y={0}
            width="100%"
            height={svgHeight}
            fill="transparent"
            style={{ pointerEvents: 'all' }}
          />
        )}

        {/* Rendered strokes */}
        {strokes.map((stroke) => {
          const ox = dragOffset?.id === stroke.id ? dragOffset.x : (stroke.offset?.x ?? 0);
          const oy = dragOffset?.id === stroke.id ? dragOffset.y : (stroke.offset?.y ?? 0);
          const isSelected = selectedId === stroke.id;
          const dashArray = getStrokeDashArray(stroke.lineStyle ?? 'solid', stroke.width);
          const d = pointsToSvgPath(stroke.points);
          const bb = isSelected ? getBoundingBox(stroke.points) : null;

          return (
            <g key={stroke.id} transform={`translate(${ox}, ${oy})`}>
              {/* Invisible hit area for selection (always active in cursor mode) */}
              <path
                d={d}
                fill="none"
                stroke="transparent"
                strokeWidth={stroke.width + (isPhone ? 28 : 16)}
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  pointerEvents: mode === 'cursor' ? 'stroke' : 'none',
                  cursor: mode === 'cursor' ? (isSelected ? 'grab' : 'pointer') : 'default',
                }}
                onPointerDown={(e) => {
                  if (isSelected) handleDragStart(e, stroke.id);
                  else handleStrokeClick(e, stroke.id);
                }}
              />
              {/* Visible stroke */}
              <path
                d={d}
                fill="none"
                stroke={stroke.color}
                strokeWidth={stroke.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={dashArray}
                style={{ pointerEvents: 'none' }}
              />
              {/* Selection bounding box */}
              {isSelected && bb && (
                <rect
                  x={bb.x - 8}
                  y={bb.y - 8}
                  width={bb.width + 16}
                  height={bb.height + 16}
                  fill="none"
                  stroke="rgba(164,123,255,0.6)"
                  strokeWidth={1.5}
                  strokeDasharray="6 4"
                  rx={4}
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
          );
        })}

        {/* Active drawing stroke */}
        {currentStroke && (
          <path
            d={pointsToSvgPath(currentStroke.points)}
            fill="none"
            stroke={currentStroke.color}
            strokeWidth={currentStroke.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeDasharray={getStrokeDashArray(
              currentStroke.lineStyle ?? 'solid',
              currentStroke.width
            )}
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Text annotations */}
        {texts.map((t) => (
          <TextAnnotation
            key={t.id}
            data={t}
            dragOffset={
              textDragOffset?.id === t.id
                ? { x: textDragOffset.x, y: textDragOffset.y }
                : null
            }
            mode={mode}
            isSelected={selectedId === t.id}
            isEditing={editingTextId === t.id}
            onSelect={() => setSelectedId(t.id)}
            onBeginEdit={() => {
              setEditingTextId(t.id);
              setSelectedId(t.id);
            }}
            onDragStart={(e) => handleTextDragStart(e, t.id)}
            onCommit={(v) => commitTextEdit(t.id, v)}
            onUpdate={(updates) =>
              onTextsChange(texts.map((tt) => (tt.id === t.id ? { ...tt, ...updates } : tt)))
            }
          />
        ))}

        {/* Ruler */}
        {ruler.active && (
          <g>
            {/* Main ruler line */}
            <line
              x1={rulerX1}
              y1={rulerY1}
              x2={rulerX2}
              y2={rulerY2}
              stroke="rgba(164,123,255,0.35)"
              strokeWidth={1.5}
              strokeDasharray="8 4"
              style={{ pointerEvents: 'none' }}
            />
            {/* Ruler body (wider hit area for dragging) */}
            <line
              x1={rulerX1}
              y1={rulerY1}
              x2={rulerX2}
              y2={rulerY2}
              stroke="transparent"
              strokeWidth={isPhone ? 44 : 20}
              style={{ pointerEvents: 'stroke', cursor: 'move' }}
              onPointerDown={(e) => handleRulerPointerDown(e, 'move')}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
            />
            {/* Center handle */}
            <circle
              cx={ruler.position.x}
              cy={ruler.position.y}
              r={isPhone ? 12 : 6}
              fill="rgba(164,123,255,0.5)"
              stroke="rgba(164,123,255,0.8)"
              strokeWidth={1.5}
              style={{ pointerEvents: 'auto', cursor: 'move' }}
              onPointerDown={(e) => handleRulerPointerDown(e, 'move')}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
            />
            {/* Rotation handle 1 */}
            <circle
              cx={handleX}
              cy={handleY}
              r={isPhone ? 11 : 5}
              fill="rgba(140,82,255,0.4)"
              stroke="rgba(140,82,255,0.7)"
              strokeWidth={1.5}
              style={{ pointerEvents: 'auto', cursor: 'grab' }}
              onPointerDown={(e) => handleRulerPointerDown(e, 'rotate')}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
            />
            {/* Rotation handle 2 */}
            <circle
              cx={handleX2}
              cy={handleY2}
              r={isPhone ? 11 : 5}
              fill="rgba(140,82,255,0.4)"
              stroke="rgba(140,82,255,0.7)"
              strokeWidth={1.5}
              style={{ pointerEvents: 'auto', cursor: 'grab' }}
              onPointerDown={(e) => handleRulerPointerDown(e, 'rotate')}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
            />
            {/* Angle label */}
            <text
              x={ruler.position.x + 14}
              y={ruler.position.y - 14}
              fill="rgba(164,123,255,0.6)"
              fontSize={11}
              fontFamily="inherit"
              style={{ pointerEvents: 'none', userSelect: 'none' }}
            >
              {Math.round(ruler.angle)}°
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
