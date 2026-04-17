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
  textColor: string;
  textFontSize: number;
  ruler: RulerState;
  onRulerChange: (ruler: RulerState) => void;
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
}

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
}: TextAnnotationProps) {
  const [draft, setDraft] = useState(t.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (isEditing) {
      setDraft(t.text);
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    }
  }, [isEditing, t.text]);

  const ox = dragOffset?.x ?? t.offset?.x ?? 0;
  const oy = dragOffset?.y ?? t.offset?.y ?? 0;
  const padY = Math.max(2, t.fontSize * 0.2);
  const padX = 4;
  const displayText = isEditing ? draft : t.text;
  const lines = Math.max(1, (displayText.match(/\n/g)?.length ?? 0) + 1);
  const foHeight = Math.max(t.fontSize * 1.4, lines * t.fontSize * 1.4) + padY * 2;
  const pointerEventsValue: 'none' | 'auto' = mode === 'pen' ? 'none' : 'auto';

  const commonStyle: React.CSSProperties = {
    width: t.width,
    boxSizing: 'border-box',
    padding: `${padY}px ${padX}px`,
    color: t.color,
    fontSize: t.fontSize,
    lineHeight: 1.4,
    fontFamily: 'inherit',
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

  return (
    <g transform={`translate(${ox}, ${oy})`} data-text-annotation="true">
      <foreignObject
        x={t.x - padX}
        y={t.y - padY}
        width={t.width + padX * 2}
        height={foHeight}
        style={{ pointerEvents: pointerEventsValue, overflow: 'visible' }}
      >
        {isEditing ? (
          <textarea
            ref={textareaRef}
            data-text-annotation="true"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onPointerDown={(e) => e.stopPropagation()}
            onBlur={() => onCommit(draft)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.currentTarget.blur();
              }
            }}
            rows={lines}
            style={{
              ...commonStyle,
              resize: 'none',
              overflow: 'hidden',
              minHeight: t.fontSize * 1.4,
              cursor: 'text',
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
              minHeight: t.fontSize * 1.4,
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
            {t.text || (
              <span style={{ opacity: 0.4, fontStyle: 'italic' }}>
                {mode === 'text' ? 'Text' : ''}
              </span>
            )}
          </div>
        )}
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
  textColor,
  textFontSize,
  ruler,
  onRulerChange,
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

  // Resize SVG to match parent content height
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const parent = container.parentElement;
    if (!parent) return;

    const update = () => {
      // Match the parent's full height so the overlay covers all content
      const h = Math.max(parent.scrollHeight, parent.clientHeight, 1000);
      setSvgHeight(h);
    };
    update();

    const observer = new ResizeObserver(update);
    observer.observe(parent);
    const contentEl = parent.querySelector('.notemage-editor');
    if (contentEl) observer.observe(contentEl);

    return () => observer.disconnect();
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

  // Create a new text at a given point and enter edit mode
  const createTextAt = useCallback(
    (point: { x: number; y: number }) => {
      const newText: TextData = {
        kind: 'text',
        id: crypto.randomUUID(),
        x: point.x,
        y: point.y,
        width: 220,
        text: '',
        color: textColor,
        fontSize: textFontSize,
        offset: { x: 0, y: 0 },
      };
      onTextsChange([...texts, newText]);
      setEditingTextId(newText.id);
      setSelectedId(newText.id);
    },
    [texts, onTextsChange, textColor, textFontSize]
  );

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
          pointerEvents: mode === 'pen' || mode === 'text' ? 'auto' : 'none',
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
