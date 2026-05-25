'use client';

import { NodeViewWrapper, NodeViewContent } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { useState, useRef, useEffect } from 'react';
import { CALLOUT_STYLES, type CalloutType } from '@/lib/tiptap-callout';

const CALLOUT_ICONS: Record<string, string> = {
  Info: 'info',
  AlertTriangle: 'warning',
  CheckCircle: 'check_circle',
  Lightbulb: 'lightbulb',
};

const TYPES: CalloutType[] = ['info', 'warning', 'success', 'tip'];

export default function CalloutView({ node, updateAttributes }: NodeViewProps) {
  const calloutType = (node.attrs.calloutType as CalloutType) || 'info';
  const style = CALLOUT_STYLES[calloutType];
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const handler = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [pickerOpen]);

  return (
    <NodeViewWrapper
      data-callout-type={calloutType}
      style={{
        borderLeft: `3px solid ${style.borderColor}`,
        background: style.bgColor,
        borderRadius: '8px',
        padding: '14px 16px 14px 14px',
        margin: '12px 0',
        position: 'relative',
        display: 'flex',
        gap: '12px',
        alignItems: 'flex-start',
      }}
    >
      {/* Icon + type picker */}
      <div ref={pickerRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          contentEditable={false}
          onClick={() => setPickerOpen((v) => !v)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '2px',
            background: 'var(--ink-08)',
            border: '1px solid var(--ink-12)',
            borderRadius: '6px',
            padding: '3px 6px',
            cursor: 'pointer',
            fontSize: '16px',
            lineHeight: 1,
            transition: 'background 0.15s',
            color: 'var(--ink-60)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'var(--ink-12)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'var(--ink-08)';
          }}
          title="Change callout type"
        >
          <span style={{ display: 'flex', alignItems: 'center', color: style.borderColor }}>
            {(() => {
              const name = CALLOUT_ICONS[style.icon];
              return name ? (
                <span className="material-symbols-outlined" style={{ fontSize: 16 }} aria-hidden>
                  {name}
                </span>
              ) : null;
            })()}
          </span>
          <span
            className="material-symbols-outlined"
            style={{ fontSize: 10, opacity: 0.5 }}
            aria-hidden
          >
            expand_more
          </span>
        </button>

        {pickerOpen && (
          <div
            contentEditable={false}
            style={{
              position: 'absolute',
              top: 'calc(100% + 4px)',
              left: 0,
              background: 'var(--surface-container-low)',
              border: '1px solid rgba(174,137,255,0.40)',
              borderRadius: '8px',
              padding: '4px',
              zIndex: 100,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              minWidth: '120px',
            }}
          >
            {TYPES.map((t) => {
              const s = CALLOUT_STYLES[t];
              return (
                <button
                  key={t}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    updateAttributes({ calloutType: t });
                    setPickerOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '6px 10px',
                    borderRadius: '6px',
                    border: 'none',
                    background: calloutType === t ? 'rgba(140,82,255,0.18)' : 'transparent',
                    color: calloutType === t ? '#a47bff' : 'var(--ink-70)',
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'background 0.1s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--ink-08)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      calloutType === t ? 'rgba(140,82,255,0.18)' : 'transparent';
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', color: s.borderColor }}>
                    {(() => {
                      const name = CALLOUT_ICONS[s.icon];
                      return name ? (
                        <span
                          className="material-symbols-outlined"
                          style={{ fontSize: 14 }}
                          aria-hidden
                        >
                          {name}
                        </span>
                      ) : null;
                    })()}
                  </span>
                  <span>{s.label}</span>
                  <span
                    style={{
                      marginLeft: 'auto',
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: s.borderColor,
                    }}
                  />
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Content area */}
      <NodeViewContent
        style={{
          flex: 1,
          minWidth: 0,
        }}
      />
    </NodeViewWrapper>
  );
}
