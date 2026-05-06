'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useCallback, useRef, useState } from 'react';

/* ── Types ── */
type HandlePosition = 'nw' | 'n' | 'ne' | 'w' | 'e' | 'sw' | 's' | 'se';
type LayoutMode = 'block' | 'wrap-left' | 'wrap-right' | 'behind';

interface HandleDef {
  pos: HandlePosition;
  cursor: string;
  style: React.CSSProperties;
}

const HANDLES: HandleDef[] = [
  { pos: 'nw', cursor: 'nw-resize', style: { top: -5, left: -5 } },
  { pos: 'n', cursor: 'n-resize', style: { top: -5, left: '50%', transform: 'translateX(-50%)' } },
  { pos: 'ne', cursor: 'ne-resize', style: { top: -5, right: -5 } },
  { pos: 'w', cursor: 'w-resize', style: { top: '50%', left: -5, transform: 'translateY(-50%)' } },
  { pos: 'e', cursor: 'e-resize', style: { top: '50%', right: -5, transform: 'translateY(-50%)' } },
  { pos: 'sw', cursor: 'sw-resize', style: { bottom: -5, left: -5 } },
  {
    pos: 's',
    cursor: 's-resize',
    style: { bottom: -5, left: '50%', transform: 'translateX(-50%)' },
  },
  { pos: 'se', cursor: 'se-resize', style: { bottom: -5, right: -5 } },
];

const MIN_W = 80;
const MIN_H = 40;

/* ── Compute new dimensions for a given handle drag ── */
function computeResize(
  h: HandlePosition,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  ex: number,
  ey: number,
  aspect: number
): { w: number; h: number } {
  const dx = ex - sx;
  const dy = ey - sy;
  let newW = sw;
  let newH = sh;

  // Corner handles: aspect-ratio locked
  if (h === 'se') {
    newW = Math.max(MIN_W, sw + dx);
    newH = Math.max(MIN_H, newW / aspect);
  } else if (h === 'sw') {
    newW = Math.max(MIN_W, sw - dx);
    newH = Math.max(MIN_H, newW / aspect);
  } else if (h === 'ne') {
    newW = Math.max(MIN_W, sw + dx);
    newH = Math.max(MIN_H, newW / aspect);
  } else if (h === 'nw') {
    newW = Math.max(MIN_W, sw - dx);
    newH = Math.max(MIN_H, newW / aspect);
  }
  // Edge handles: single axis
  else if (h === 'e') {
    newW = Math.max(MIN_W, sw + dx);
  } else if (h === 'w') {
    newW = Math.max(MIN_W, sw - dx);
  } else if (h === 's') {
    newH = Math.max(MIN_H, sh + dy);
  } else if (h === 'n') {
    newH = Math.max(MIN_H, sh - dy);
  }

  return { w: Math.round(newW), h: Math.round(newH) };
}

/* ── React view ── */
function ResizableImageView({ node, updateAttributes, selected }: NodeViewProps) {
  const attrs = node.attrs as {
    src: string;
    alt?: string;
    width?: number | null;
    height?: number | null;
    layoutMode?: LayoutMode;
  };

  const layoutMode: LayoutMode = attrs.layoutMode || 'block';
  const imgRef = useRef<HTMLImageElement>(null);
  const naturalRef = useRef<{ w: number; h: number } | null>(null);
  const startRef = useRef<{
    x: number;
    y: number;
    width: number;
    height: number;
    handle: HandlePosition;
    aspect: number;
  } | null>(null);

  // Local drag state — drives visuals instantly without ProseMirror transactions
  const [dragSize, setDragSize] = useState<{ w: number; h: number } | null>(null);
  const isDragging = dragSize !== null;
  const [hovered, setHovered] = useState(false);

  const onImgLoad = useCallback(() => {
    const img = imgRef.current;
    if (img) {
      naturalRef.current = { w: img.naturalWidth, h: img.naturalHeight };
    }
  }, []);

  /* ── Resize logic ── */
  const makeMouseDown = useCallback(
    (handle: HandlePosition) => (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const img = imgRef.current;
      if (!img) return;

      const startWidth = attrs.width ?? img.clientWidth;
      const startHeight = attrs.height ?? img.clientHeight;
      const aspect = naturalRef.current
        ? naturalRef.current.w / naturalRef.current.h
        : startWidth / startHeight;

      startRef.current = {
        x: e.clientX,
        y: e.clientY,
        width: startWidth,
        height: startHeight,
        handle,
        aspect,
      };

      // Lock cursor on body during drag
      const prevCursor = document.body.style.cursor;
      const prevSelect = document.body.style.userSelect;
      document.body.style.cursor = HANDLES.find((h) => h.pos === handle)!.cursor;
      document.body.style.userSelect = 'none';

      const onMove = (ev: MouseEvent) => {
        const s = startRef.current;
        if (!s) return;
        const next = computeResize(
          s.handle,
          s.x,
          s.y,
          s.width,
          s.height,
          ev.clientX,
          ev.clientY,
          s.aspect
        );
        // Update local state only — fast, no ProseMirror overhead
        setDragSize(next);
      };

      const onUp = (ev: MouseEvent) => {
        const s = startRef.current;
        if (s) {
          const final = computeResize(
            s.handle,
            s.x,
            s.y,
            s.width,
            s.height,
            ev.clientX,
            ev.clientY,
            s.aspect
          );
          // Commit to ProseMirror once on release
          updateAttributes({ width: final.w, height: final.h });
        }
        startRef.current = null;
        setDragSize(null);
        document.body.style.cursor = prevCursor;
        document.body.style.userSelect = prevSelect;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [attrs.width, attrs.height, updateAttributes]
  );

  /* ── Dimensions: prefer live drag state, fall back to committed attrs ── */
  const displayW = isDragging ? dragSize.w : (attrs.width ?? null);
  const displayH = isDragging ? dragSize.h : (attrs.height ?? null);

  /* ── Layout mode wrapper styles ── */
  const wrapperStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = {
      position: 'relative',
      maxWidth: '100%',
      borderRadius: '10px',
      transition: isDragging ? 'none' : 'box-shadow 0.2s ease, outline 0.15s ease',
      outline: selected
        ? '2px solid rgba(140,82,255,0.6)'
        : hovered
          ? '1px solid rgba(140,82,255,0.25)'
          : '1px solid transparent',
      outlineOffset: '3px',
      boxShadow: selected
        ? '0 0 0 1px rgba(140,82,255,0.1), 0 8px 24px rgba(0,0,0,0.28), 0 2px 8px rgba(140,82,255,0.08)'
        : hovered
          ? '0 4px 16px rgba(0,0,0,0.2), 0 1px 4px rgba(140,82,255,0.06)'
          : '0 2px 8px rgba(0,0,0,0.12)',
      cursor: isDragging ? undefined : 'grab',
    };

    if (layoutMode === 'wrap-left') {
      return { ...base, float: 'left', margin: '4px 16px 12px 0', display: 'inline-block' };
    }
    if (layoutMode === 'wrap-right') {
      return { ...base, float: 'right', margin: '4px 0 12px 16px', display: 'inline-block' };
    }
    if (layoutMode === 'behind') {
      return {
        ...base,
        height: 0,
        overflow: 'visible',
        zIndex: 0,
        pointerEvents: selected ? 'auto' : 'none',
        boxShadow: 'none',
        outline: 'none',
      };
    }
    // block (default)
    return { ...base, display: 'inline-block', margin: '12px 0' };
  })();

  const imgWidth = displayW ? `${displayW}px` : '100%';
  const imgHeight = displayH ? `${displayH}px` : 'auto';

  const imgStyle: React.CSSProperties = (() => {
    const base: React.CSSProperties = {
      width: imgWidth,
      height: imgHeight,
      maxWidth: '100%',
      borderRadius: '10px',
      display: 'block',
      userSelect: 'none',
      willChange: isDragging ? 'width, height' : 'auto',
    };

    if (layoutMode === 'behind') {
      return {
        ...base,
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: -1,
        pointerEvents: selected ? 'auto' : 'none',
      };
    }

    return base;
  })();

  return (
    <NodeViewWrapper
      style={wrapperStyle}
      data-drag-handle
      data-layout-mode={layoutMode}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <img
        ref={imgRef}
        src={attrs.src}
        alt={attrs.alt ?? ''}
        style={imgStyle}
        draggable={false}
        onLoad={onImgLoad}
      />

      {/* ── Resize handles (fade in on select/hover) ── */}
      {HANDLES.map((h) => (
        <div
          key={h.pos}
          onMouseDown={makeMouseDown(h.pos)}
          style={{
            position: 'absolute',
            ...h.style,
            width: 10,
            height: 10,
            background: '#8c52ff',
            borderRadius: '3px',
            cursor: h.cursor,
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
            zIndex: 10,
            opacity: selected ? 0.9 : 0,
            transform: selected ? 'scale(1)' : 'scale(0.5)',
            transition: 'opacity 0.15s ease, transform 0.15s ease',
            pointerEvents: selected ? 'auto' : 'none',
          }}
        />
      ))}

    </NodeViewWrapper>
  );
}

/* ── TipTap Node ── */
export const ResizableImage = Node.create({
  name: 'resizableImage',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      src: { default: null },
      alt: { default: null },
      width: { default: null },
      height: { default: null },
      layoutMode: {
        default: 'block',
        parseHTML: (el) => el.getAttribute('data-layout-mode') || 'block',
        renderHTML: (attrs) => ({ 'data-layout-mode': attrs.layoutMode }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = mergeAttributes(HTMLAttributes);
    const styles: string[] = [];

    if (attrs.width) styles.push(`width:${attrs.width}px`);
    if (attrs.height) styles.push(`height:${attrs.height}px`);

    const mode = attrs['data-layout-mode'] || 'block';
    if (mode === 'wrap-left') styles.push('float:left', 'margin:0 16px 12px 0');
    else if (mode === 'wrap-right') styles.push('float:right', 'margin:0 0 12px 16px');

    if (styles.length) attrs.style = styles.join(';');
    return ['img', attrs];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView as Parameters<typeof ReactNodeViewRenderer>[0]);
  },
});
