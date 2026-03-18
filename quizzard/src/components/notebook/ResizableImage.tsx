'use client';

import { Node, mergeAttributes } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useCallback, useRef } from 'react';

/* ── React view ── */
function ResizableImageView({ node, updateAttributes }: NodeViewProps) {
  const attrs = node.attrs as { src: string; alt?: string; width?: number | null };
  const startRef = useRef<{ x: number; width: number } | null>(null);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const startX = e.clientX;
      const startWidth = (attrs.width ?? 400) as number;
      startRef.current = { x: startX, width: startWidth };

      const onMove = (ev: MouseEvent) => {
        if (!startRef.current) return;
        const newW = Math.max(80, startRef.current.width + (ev.clientX - startRef.current.x));
        updateAttributes({ width: newW });
      };
      const onUp = () => {
        startRef.current = null;
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
      };
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    },
    [attrs.width, updateAttributes],
  );

  const width = attrs.width ? `${attrs.width}px` : '100%';

  return (
    <NodeViewWrapper
      style={{ display: 'inline-block', position: 'relative', maxWidth: '100%' }}
      data-drag-handle
    >
      <img
        src={attrs.src}
        alt={attrs.alt ?? ''}
        style={{
          width,
          maxWidth: '100%',
          borderRadius: '8px',
          display: 'block',
          margin: '12px 0',
          userSelect: 'none',
        }}
        draggable={false}
      />
      {/* Resize handle */}
      <div
        onMouseDown={onMouseDown}
        style={{
          position: 'absolute',
          bottom: 18,
          right: 4,
          width: 14,
          height: 14,
          background: '#8c52ff',
          borderRadius: '3px',
          cursor: 'se-resize',
          opacity: 0.85,
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}
        title="Drag to resize"
      />
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
    };
  },

  parseHTML() {
    return [{ tag: 'img[src]' }];
  },

  renderHTML({ HTMLAttributes }) {
    const attrs = mergeAttributes(HTMLAttributes);
    if (attrs.width) attrs.style = `width:${attrs.width}px`;
    return ['img', attrs];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ResizableImageView as Parameters<typeof ReactNodeViewRenderer>[0]);
  },
});
