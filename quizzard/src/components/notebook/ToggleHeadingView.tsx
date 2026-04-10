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

  // New-style flat toggle headings have a single empty paragraph as
  // their only child (a schema-compliance placeholder — the real
  // "section content" lives as following siblings and is hidden via
  // the position-collapse plugin on the extension). In that case we
  // don't render the content area at all — it would show up as a
  // blank line under every heading. Legacy toggles that still carry
  // real block content inside their body render the content area as
  // before.
  const hasInlineBody = !(
    node.content.childCount === 1 &&
    node.content.firstChild?.type.name === 'paragraph' &&
    node.content.firstChild.content.size === 0
  );

  // Track content height via ResizeObserver so it updates when images load, etc.
  useEffect(() => {
    const el = contentRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setContentHeight(el.scrollHeight);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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
    [updateAttributes]
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
    [collapsed, updateAttributes]
  );

  return (
    <NodeViewWrapper
      data-toggle-level={level}
      data-collapsed={String(collapsed)}
      style={{
        margin: '14px 0 2px 0',
      }}
    >
      {/* Summary / heading row */}
      <div
        contentEditable={false}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          cursor: 'pointer',
          userSelect: 'none',
        }}
        onClick={toggleCollapsed}
      >
        {/* Chevron */}
        <ChevronRight
          size={16}
          style={{
            color: 'rgba(140,82,255,0.55)',
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
          placeholder={`Heading ${level}`}
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

      {/* Collapsible body.
          For flat-model toggles the body is a single empty paragraph
          placeholder — we hide it entirely with display:none to keep
          the heading flush with the following content. Legacy toggles
          that still carry real nested content animate open/closed on
          the `collapsed` attr as before.
          NodeViewContent must always be mounted in the DOM (even when
          hidden) so ProseMirror can keep tracking the child positions. */}
      <div
        ref={contentRef}
        style={{
          display: hasInlineBody ? 'block' : 'none',
          overflow: 'hidden',
          transition: 'max-height 0.25s ease, opacity 0.2s ease',
          maxHeight: collapsed ? '0px' : contentHeight ? `${contentHeight + 40}px` : '2000px',
          opacity: collapsed ? 0 : 1,
        }}
      >
        <div style={{ padding: '4px 0 4px 22px' }}>
          <NodeViewContent />
        </div>
      </div>
    </NodeViewWrapper>
  );
}
