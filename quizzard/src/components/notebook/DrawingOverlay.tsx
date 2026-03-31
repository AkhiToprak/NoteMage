'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';

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

export type EditorMode = 'cursor' | 'pen';
export type ActiveTool = 'pen' | 'eraser';

export interface RulerState {
  active: boolean;
  angle: number;
  position: { x: number; y: number };
}

interface DrawingOverlayProps {
  strokes: StrokeData[];
  onStrokesChange: (strokes: StrokeData[]) => void;
  mode: EditorMode;
  activeTool: ActiveTool;
  penColor: string;
  penWidth: number;
  lineStyle: LineStyle;
  ruler: RulerState;
  onRulerChange: (ruler: RulerState) => void;
}

/* ── Helpers ── */

/** Hydrate legacy stroke data that may lack id/lineStyle/offset */
export function hydrateStrokes(raw: unknown[]): StrokeData[] {
  if (!Array.isArray(raw)) return [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return raw.map((s: any) => ({
    id: (s.id as string) || crypto.randomUUID(),
    points: (s.points as { x: number; y: number }[]) || [],
    color: (s.color as string) || '#ede9ff',
    width: (s.width as number) || 4,
    lineStyle: (s.lineStyle as LineStyle) || 'solid',
    offset: (s.offset as { x: number; y: number }) || { x: 0, y: 0 },
  }));
}

function getStrokeDashArray(style: LineStyle, width: number): string | undefined {
  switch (style) {
    case 'dashed': return `${Math.max(8, width * 3)} ${Math.max(4, width * 1.5)}`;
    case 'dotted': return `${Math.max(1, width * 0.5)} ${Math.max(4, width * 1.5)}`;
    default: return undefined;
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
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
  angleDeg: number,
): { x: number; y: number } {
  const rad = (angleDeg * Math.PI) / 180;
  const dir = { x: Math.cos(rad), y: Math.sin(rad) };
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  const t = dx * dir.x + dy * dir.y;
  return { x: origin.x + t * dir.x, y: origin.y + t * dir.y };
}

const ERASER_HIT_RADIUS = 16;

export default function DrawingOverlay({
  strokes,
  onStrokesChange,
  mode,
  activeTool,
  penColor,
  penWidth,
  lineStyle,
  ruler,
  onRulerChange,
}: DrawingOverlayProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentStroke, setCurrentStroke] = useState<StrokeData | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [svgHeight, setSvgHeight] = useState(1000);
  const isDrawing = useRef(false);

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
    const contentEl = parent.querySelector('.quizzard-editor');
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
    [],
  );

  // Handle pointer down
  const handlePointerDown = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      if (mode !== 'pen') return;
      const point = getSvgPoint(e);

      if (activeTool === 'eraser') {
        // Find and remove stroke near point
        for (let i = strokes.length - 1; i >= 0; i--) {
          const s = strokes[i];
          const ox = s.offset?.x ?? 0;
          const oy = s.offset?.y ?? 0;
          for (const pt of s.points) {
            const dx = (pt.x + ox) - point.x;
            const dy = (pt.y + oy) - point.y;
            if (dx * dx + dy * dy <= ERASER_HIT_RADIUS * ERASER_HIT_RADIUS) {
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
    [mode, activeTool, getSvgPoint, strokes, onStrokesChange, penColor, penWidth, lineStyle, ruler],
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
    [currentStroke, mode, getSvgPoint, ruler],
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
    [mode],
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
    [mode, selectedId, strokes],
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
        : s,
    );
    onStrokesChange(updated);
    dragState.current = null;
    setDragOffset(null);
  }, [strokes, onStrokesChange, dragOffset]);

  // Keyboard: Delete selected stroke, Escape to deselect
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!selectedId) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        // Don't intercept if user is typing in an input
        if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') return;
        e.preventDefault();
        onStrokesChange(strokes.filter((s) => s.id !== selectedId));
        setSelectedId(null);
      } else if (e.key === 'Escape') {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, strokes, onStrokesChange]);

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
    [ruler],
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
    [ruler, onRulerChange],
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
          pointerEvents: mode === 'pen' ? 'auto' : 'none',
          cursor: mode === 'pen' ? 'crosshair' : 'default',
        }}
        onPointerDown={mode === 'pen' ? handlePointerDown : handleBackgroundClick}
        onPointerMove={(e) => {
          if (mode === 'pen') handlePointerMove(e);
          if (dragState.current) handleDragMove(e);
          if (rulerDrag.current) handleRulerPointerMove(e);
        }}
        onPointerUp={() => {
          if (mode === 'pen') handlePointerUp();
          if (dragState.current) handleDragEnd();
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
                strokeWidth={stroke.width + 16}
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
            strokeDasharray={getStrokeDashArray(currentStroke.lineStyle ?? 'solid', currentStroke.width)}
            style={{ pointerEvents: 'none' }}
          />
        )}

        {/* Ruler */}
        {ruler.active && (
          <g>
            {/* Main ruler line */}
            <line
              x1={rulerX1} y1={rulerY1}
              x2={rulerX2} y2={rulerY2}
              stroke="rgba(164,123,255,0.35)"
              strokeWidth={1.5}
              strokeDasharray="8 4"
              style={{ pointerEvents: 'none' }}
            />
            {/* Ruler body (wider hit area for dragging) */}
            <line
              x1={rulerX1} y1={rulerY1}
              x2={rulerX2} y2={rulerY2}
              stroke="transparent"
              strokeWidth={20}
              style={{ pointerEvents: 'stroke', cursor: 'move' }}
              onPointerDown={(e) => handleRulerPointerDown(e, 'move')}
              onPointerMove={handleRulerPointerMove}
              onPointerUp={handleRulerPointerUp}
            />
            {/* Center handle */}
            <circle
              cx={ruler.position.x} cy={ruler.position.y}
              r={6}
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
              cx={handleX} cy={handleY}
              r={5}
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
              cx={handleX2} cy={handleY2}
              r={5}
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
