'use client';

import React, { useRef, useState, useEffect, useCallback } from 'react';
import { PenTool, Eraser, Trash2, Check } from 'lucide-react';

export interface StrokeData {
  points: { x: number; y: number }[];
  color: string;
  width: number;
}

interface DrawingCanvasProps {
  drawingData: StrokeData[];
  onSave: (data: StrokeData[]) => void;
  onClose: () => void;
}

const PEN_COLORS = ['#ede9ff', '#8c52ff', '#5170ff', '#ef4444', '#22c55e', '#eab308'];

const PEN_WIDTHS = [
  { label: 'Thin', value: 2 },
  { label: 'Medium', value: 4 },
  { label: 'Thick', value: 8 },
];

const ERASER_HIT_RADIUS = 12;

export default function DrawingCanvas({ drawingData, onSave, onClose }: DrawingCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<StrokeData[]>(() => [...drawingData]);
  const [currentStroke, setCurrentStroke] = useState<StrokeData | null>(null);
  const [penColor, setPenColor] = useState('#ede9ff');
  const [penWidth, setPenWidth] = useState(4);
  const [isErasing, setIsErasing] = useState(false);
  const isDrawing = useRef(false);

  const getCanvasPoint = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top,
      };
    },
    []
  );

  const drawStroke = useCallback((ctx: CanvasRenderingContext2D, stroke: StrokeData) => {
    if (stroke.points.length < 2) return;
    ctx.beginPath();
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
    for (let i = 1; i < stroke.points.length; i++) {
      ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
    }
    ctx.stroke();
  }, []);

  const redrawAll = useCallback(
    (allStrokes: StrokeData[], activeStroke?: StrokeData | null) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.restore();
      // dpr scale is already set, just draw
      for (const stroke of allStrokes) {
        drawStroke(ctx, stroke);
      }
      if (activeStroke) {
        drawStroke(ctx, activeStroke);
      }
    },
    [drawStroke]
  );

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.scale(dpr, dpr);
    }
  }, []);

  // Setup canvas and observe resizes
  useEffect(() => {
    setupCanvas();
    redrawAll(strokes);

    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      setupCanvas();
      redrawAll(strokes);
    });
    observer.observe(container);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Redraw when strokes change (but not during active drawing)
  useEffect(() => {
    if (!isDrawing.current) {
      redrawAll(strokes);
    }
  }, [strokes, redrawAll]);

  const findStrokeNear = useCallback(
    (x: number, y: number): number => {
      for (let i = strokes.length - 1; i >= 0; i--) {
        for (const pt of strokes[i].points) {
          const dx = pt.x - x;
          const dy = pt.y - y;
          if (dx * dx + dy * dy <= ERASER_HIT_RADIUS * ERASER_HIT_RADIUS) {
            return i;
          }
        }
      }
      return -1;
    },
    [strokes]
  );

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const point = getCanvasPoint(e);
      if (isErasing) {
        const idx = findStrokeNear(point.x, point.y);
        if (idx >= 0) {
          setStrokes((prev) => prev.filter((_, i) => i !== idx));
        }
        return;
      }
      isDrawing.current = true;
      const newStroke: StrokeData = {
        points: [point],
        color: penColor,
        width: penWidth,
      };
      setCurrentStroke(newStroke);
      (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    },
    [getCanvasPoint, isErasing, findStrokeNear, penColor, penWidth]
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!isDrawing.current || !currentStroke) return;
      const point = getCanvasPoint(e);
      const updated: StrokeData = {
        ...currentStroke,
        points: [...currentStroke.points, point],
      };
      setCurrentStroke(updated);
      redrawAll(strokes, updated);
    },
    [getCanvasPoint, currentStroke, strokes, redrawAll]
  );

  const handlePointerUp = useCallback(() => {
    if (!isDrawing.current || !currentStroke) return;
    isDrawing.current = false;
    if (currentStroke.points.length >= 2) {
      setStrokes((prev) => [...prev, currentStroke]);
    }
    setCurrentStroke(null);
  }, [currentStroke]);

  const handleClearAll = () => {
    setStrokes([]);
  };

  const handleDone = () => {
    onSave(strokes);
    onClose();
  };

  const toolButtonStyle = (active: boolean): React.CSSProperties => ({
    width: 28,
    height: 28,
    borderRadius: 6,
    border: 'none',
    background: active ? 'rgba(140,82,255,0.2)' : 'transparent',
    color: '#ede9ff',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    transition: 'background 0.15s ease',
  });

  const swatchStyle = (color: string, active: boolean): React.CSSProperties => ({
    width: 20,
    height: 20,
    borderRadius: '50%',
    border: active ? '2px solid #ede9ff' : '2px solid transparent',
    background: color,
    cursor: 'pointer',
    padding: 0,
    outline: 'none',
    boxShadow: active ? '0 0 0 2px rgba(140,82,255,0.4)' : 'none',
    transition: 'box-shadow 0.15s ease, border-color 0.15s ease',
  });

  const widthButtonStyle = (active: boolean): React.CSSProperties => ({
    height: 28,
    borderRadius: 6,
    border: 'none',
    background: active ? 'rgba(140,82,255,0.2)' : 'transparent',
    color: '#ede9ff',
    cursor: 'pointer',
    padding: '0 8px',
    fontSize: 11,
    fontFamily: 'inherit',
    fontWeight: 500,
    transition: 'background 0.15s ease',
  });

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(0,0,0,0.02)',
        zIndex: 50,
      }}
    >
      {/* Toolbar */}
      <div
        style={{
          position: 'absolute',
          top: 10,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 51,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          background: '#131228',
          border: '1px solid rgba(140,82,255,0.18)',
          borderRadius: 10,
          padding: '6px 12px',
        }}
      >
        {/* Pen tool indicator */}
        <button
          onClick={() => setIsErasing(false)}
          style={toolButtonStyle(!isErasing)}
          title="Pen"
        >
          <PenTool size={16} />
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'rgba(140,82,255,0.18)' }} />

        {/* Color swatches */}
        {PEN_COLORS.map((color) => (
          <button
            key={color}
            onClick={() => {
              setPenColor(color);
              setIsErasing(false);
            }}
            style={swatchStyle(color, penColor === color && !isErasing)}
            title={color}
          />
        ))}

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'rgba(140,82,255,0.18)' }} />

        {/* Width presets */}
        {PEN_WIDTHS.map((w) => (
          <button
            key={w.value}
            onClick={() => setPenWidth(w.value)}
            style={widthButtonStyle(penWidth === w.value && !isErasing)}
            title={`${w.label} (${w.value}px)`}
          >
            {w.label}
          </button>
        ))}

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'rgba(140,82,255,0.18)' }} />

        {/* Eraser */}
        <button
          onClick={() => setIsErasing(true)}
          style={toolButtonStyle(isErasing)}
          title="Eraser"
        >
          <Eraser size={16} />
        </button>

        {/* Clear All */}
        <button onClick={handleClearAll} style={toolButtonStyle(false)} title="Clear All">
          <Trash2 size={16} />
        </button>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'rgba(140,82,255,0.18)' }} />

        {/* Done */}
        <button
          onClick={handleDone}
          style={{
            ...toolButtonStyle(false),
            background: 'rgba(140,82,255,0.25)',
          }}
          title="Done"
        >
          <Check size={16} />
        </button>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          cursor: 'crosshair',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
}
