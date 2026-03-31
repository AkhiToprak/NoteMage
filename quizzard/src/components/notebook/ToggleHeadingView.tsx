'use client';

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useState, useRef, useEffect, useCallback } from 'react';
import { TOGGLE_HEADING_STYLES, type ToggleLevel } from '@/lib/tiptap-toggle-heading';
import { ChevronRight } from 'lucide-react';

export default function ToggleHeadingView({ node, updateAttributes }: NodeViewProps) {
  const level = (node.attrs.level as ToggleLevel) || 1;
  const collapsed = !!node.attrs.collapsed;
  const summary = (node.attrs.summary as string) || '';
  const style = TOGGLE_HEADING_STYLES[level];
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState<number | undefined>(undefined);

  // Measure content height for animation
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  });

  const toggleCollapsed = useCallback(() => {
    // Measure before toggling so animation works
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
    updateAttributes({ collapsed: !collapsed });
  }, [collapsed, updateAttributes]);

  const handleSummaryChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateAttributes({ summary: e.target.value });
    },
    [updateAttributes],
  );

  const handleSummaryKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Focus into the content area
        if (collapsed) {
          updateAttributes({ collapsed: false });
        }
      }
    },
    [collapsed, updateAttributes],
  );

  return (
    <NodeViewWrapper
      data-toggle-level={level}
      data-collapsed={String(collapsed)}
      style={{
        margin: '16px 0',
        borderRadius: '8px',
        border: '1px solid rgba(140,82,255,0.12)',
        background: 'rgba(140,82,255,0.03)',
        overflow: 'hidden',
      }}
    >
      {/* Summary / heading row */}
      <div
        contentEditable={false}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '10px 14px',
          cursor: 'pointer',
          userSelect: 'none',
          borderBottom: collapsed ? 'none' : '1px solid rgba(140,82,255,0.08)',
          transition: 'border-color 0.2s',
        }}
        onClick={toggleCollapsed}
      >
        {/* Chevron */}
        <ChevronRight
          size={16}
          style={{
            color: 'rgba(140,82,255,0.6)',
            flexShrink: 0,
            transition: 'transform 0.2s ease',
            transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
          }}
        />

        {/* Editable summary input */}
        <input
          value={summary}
          onChange={handleSummaryChange}
          onKeyDown={handleSummaryKeyDown}
          onClick={(e) => e.stopPropagation()}
          placeholder={`Toggle Heading ${level}`}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            outline: 'none',
            fontFamily: 'inherit',
            fontSize: style.fontSize,
            fontWeight: Number(style.fontWeight),
            letterSpacing: style.letterSpacing,
            lineHeight: 1.3,
            color: '#ede9ff',
            padding: 0,
          }}
        />
      </div>

      {/* Collapsible content */}
      <div
        ref={contentRef}
        style={{
          overflow: 'hidden',
          transition: 'max-height 0.25s ease, opacity 0.2s ease',
          maxHeight: collapsed ? '0px' : contentHeight ? `${contentHeight + 40}px` : '2000px',
          opacity: collapsed ? 0 : 1,
        }}
      >
        <div style={{ padding: '12px 14px 14px 38px' }}>
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
