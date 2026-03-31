'use client';

import { useState } from 'react';

interface SlidePreviewProps {
  title: string;
  content: string;
  index: number;
  isActive: boolean;
  onClick: () => void;
}

export default function SlidePreview({ title, content, index, isActive, onClick }: SlidePreviewProps) {
  const [hovered, setHovered] = useState(false);

  const truncatedTitle = title.length > 22 ? title.slice(0, 22) + '...' : title;
  const firstLine = content.split('\n')[0] || '';
  const truncatedContent = firstLine.length > 30 ? firstLine.slice(0, 30) + '...' : firstLine;

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: '160px',
        minHeight: '90px',
        padding: '10px 12px',
        borderRadius: '8px',
        border: isActive
          ? '1px solid #8c52ff'
          : '1px solid rgba(140,82,255,0.15)',
        background: isActive
          ? 'rgba(140,82,255,0.08)'
          : hovered
            ? 'rgba(140,82,255,0.04)'
            : '#1e1d35',
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        textAlign: 'left',
        position: 'relative',
        flexShrink: 0,
        transition: 'border-color 0.15s ease, background 0.15s ease',
        fontFamily: 'inherit',
      }}
    >
      {/* Slide number badge */}
      <span
        style={{
          position: 'absolute',
          top: '6px',
          left: '8px',
          fontSize: '9px',
          fontWeight: 700,
          color: isActive ? '#8c52ff' : 'rgba(237,233,255,0.35)',
          background: isActive ? 'rgba(140,82,255,0.15)' : 'rgba(140,82,255,0.06)',
          borderRadius: '4px',
          padding: '1px 5px',
          lineHeight: '14px',
          fontFamily: 'inherit',
        }}
      >
        {index + 1}
      </span>

      {/* Title */}
      <span
        style={{
          marginTop: '16px',
          fontSize: '11px',
          fontWeight: 600,
          color: '#8c52ff',
          lineHeight: '14px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
        }}
      >
        {truncatedTitle}
      </span>

      {/* Content preview */}
      <span
        style={{
          fontSize: '10px',
          color: 'rgba(237,233,255,0.5)',
          lineHeight: '13px',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          width: '100%',
        }}
      >
        {truncatedContent || '\u00A0'}
      </span>
    </button>
  );
}
