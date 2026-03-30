'use client';

import { FileText, Shapes } from 'lucide-react';

interface PageTypeSelectorProps {
  onSelect: (type: 'text' | 'canvas') => void;
  onCancel: () => void;
}

export default function PageTypeSelector({ onSelect, onCancel }: PageTypeSelectorProps) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(8px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: '#131228',
          border: '1px solid rgba(140,82,255,0.2)',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
          maxWidth: '400px',
          width: '90vw',
        }}
      >
        <h3
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '18px',
            fontWeight: 700,
            color: '#ede9ff',
            marginBottom: '6px',
            textAlign: 'center',
          }}
        >
          Create New Page
        </h3>
        <p
          style={{
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '13px',
            color: 'rgba(237,233,255,0.4)',
            marginBottom: '20px',
            textAlign: 'center',
          }}
        >
          Choose a page type
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
          {/* Text Page */}
          <button
            onClick={() => onSelect('text')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              padding: '20px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(140,82,255,0.15)',
              background: 'rgba(140,82,255,0.04)',
              color: '#ede9ff',
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
              fontFamily: "'DM Sans', sans-serif",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(140,82,255,0.12)';
              e.currentTarget.style.borderColor = 'rgba(140,82,255,0.35)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(140,82,255,0.04)';
              e.currentTarget.style.borderColor = 'rgba(140,82,255,0.15)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(140,82,255,0.12)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#a47bff',
              }}
            >
              <FileText size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                Text Page
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(237,233,255,0.4)', lineHeight: 1.5 }}>
                Rich text editor with formatting, headings, and lists
              </div>
            </div>
          </button>

          {/* Canvas Page */}
          <button
            onClick={() => onSelect('canvas')}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '10px',
              padding: '20px 16px',
              borderRadius: '12px',
              border: '1px solid rgba(140,82,255,0.15)',
              background: 'rgba(140,82,255,0.04)',
              color: '#ede9ff',
              cursor: 'pointer',
              transition: 'background 0.15s, border-color 0.15s, transform 0.15s',
              fontFamily: "'DM Sans', sans-serif",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(140,82,255,0.12)';
              e.currentTarget.style.borderColor = 'rgba(140,82,255,0.35)';
              e.currentTarget.style.transform = 'translateY(-2px)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(140,82,255,0.04)';
              e.currentTarget.style.borderColor = 'rgba(140,82,255,0.15)';
              e.currentTarget.style.transform = 'translateY(0)';
            }}
          >
            <div
              style={{
                width: '48px',
                height: '48px',
                borderRadius: '12px',
                background: 'rgba(255,222,89,0.10)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#ffde59',
              }}
            >
              <Shapes size={24} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px' }}>
                Canvas
              </div>
              <div style={{ fontSize: '11px', color: 'rgba(237,233,255,0.4)', lineHeight: 1.5 }}>
                Infinite canvas for freeform drawing and diagrams
              </div>
            </div>
          </button>
        </div>

        {/* Cancel */}
        <button
          onClick={onCancel}
          style={{
            display: 'block',
            width: '100%',
            marginTop: '14px',
            padding: '8px',
            borderRadius: '8px',
            border: 'none',
            background: 'transparent',
            color: 'rgba(237,233,255,0.35)',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '12px',
            cursor: 'pointer',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'rgba(237,233,255,0.6)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'rgba(237,233,255,0.35)'; }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
