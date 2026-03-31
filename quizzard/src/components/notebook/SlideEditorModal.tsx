'use client';

import { useState, useCallback } from 'react';
import { X, Plus, Trash2, Download, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import SlidePreview from './SlidePreview';

export interface SlideData {
  title: string;
  content: string;
  notes?: string;
}

interface SlideEditorModalProps {
  initialSlides: SlideData[];
  presentationTitle: string;
  onExport: (slides: SlideData[]) => void;
  onClose: () => void;
}

export default function SlideEditorModal({ initialSlides, presentationTitle, onExport, onClose }: SlideEditorModalProps) {
  const [slides, setSlides] = useState<SlideData[]>(initialSlides);
  const [activeIndex, setActiveIndex] = useState(0);
  const [exporting, setExporting] = useState(false);

  const activeSlide = slides[activeIndex];

  const updateSlide = useCallback((index: number, updates: Partial<SlideData>) => {
    setSlides(prev => prev.map((s, i) => i === index ? { ...s, ...updates } : s));
  }, []);

  const addSlide = useCallback(() => {
    const newSlide: SlideData = { title: 'New Slide', content: '', notes: '' };
    setSlides(prev => {
      const next = [...prev];
      next.splice(activeIndex + 1, 0, newSlide);
      return next;
    });
    setActiveIndex(prev => prev + 1);
  }, [activeIndex]);

  const deleteSlide = useCallback((index: number) => {
    if (slides.length <= 1) return;
    setSlides(prev => prev.filter((_, i) => i !== index));
    setActiveIndex(prev => {
      if (prev >= slides.length - 1) return Math.max(0, slides.length - 2);
      if (prev > index) return prev - 1;
      if (prev === index) return Math.min(prev, slides.length - 2);
      return prev;
    });
  }, [slides.length]);

  const moveSlide = useCallback((from: number, to: number) => {
    if (to < 0 || to >= slides.length) return;
    setSlides(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setActiveIndex(to);
  }, [slides.length]);

  const handleExport = useCallback(async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/export/pptx', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: presentationTitle, slides }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || 'Export failed');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${presentationTitle.replace(/[^a-zA-Z0-9]/g, '_')}.pptx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      onExport(slides);
    } catch (err) {
      console.error('PPTX export error:', err);
      alert('Failed to export PPTX. Please try again.');
    } finally {
      setExporting(false);
    }
  }, [presentationTitle, slides, onExport]);

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(0,0,0,0.5)',
        backdropFilter: 'blur(4px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '90vw',
          maxWidth: '1000px',
          height: '80vh',
          background: '#111126',
          borderRadius: '16px',
          border: '1px solid rgba(140,82,255,0.18)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '16px 24px',
            borderBottom: '1px solid rgba(140,82,255,0.12)',
            flexShrink: 0,
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: '18px',
              fontWeight: 700,
              color: '#ede9ff',
              fontFamily: 'inherit',
            }}
          >
            Edit Slides
          </h2>
          <CloseButton onClick={onClose} />
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
          {/* Left sidebar — slide thumbnails */}
          <div
            style={{
              width: '200px',
              borderRight: '1px solid rgba(140,82,255,0.12)',
              overflowY: 'auto',
              padding: '12px',
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              flexShrink: 0,
            }}
          >
            {slides.map((slide, i) => (
              <SlidePreview
                key={i}
                title={slide.title}
                content={slide.content}
                index={i}
                isActive={i === activeIndex}
                onClick={() => setActiveIndex(i)}
              />
            ))}

            {/* Add Slide button */}
            <AddSlideButton onClick={addSlide} />
          </div>

          {/* Main editor area */}
          <div
            style={{
              flex: 1,
              padding: '24px',
              display: 'flex',
              flexDirection: 'column',
              gap: '16px',
              overflow: 'auto',
            }}
          >
            {activeSlide ? (
              <>
                {/* Title input */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label
                    style={{
                      fontSize: '11px',
                      color: 'rgba(237,233,255,0.4)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontFamily: 'inherit',
                    }}
                  >
                    Slide Title
                  </label>
                  <input
                    type="text"
                    value={activeSlide.title}
                    onChange={e => updateSlide(activeIndex, { title: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid rgba(140,82,255,0.15)',
                      background: 'rgba(140,82,255,0.04)',
                      color: '#ede9ff',
                      fontSize: '15px',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#8c52ff'; }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(140,82,255,0.15)'; }}
                  />
                </div>

                {/* Content textarea */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', flex: 1 }}>
                  <label
                    style={{
                      fontSize: '11px',
                      color: 'rgba(237,233,255,0.4)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontFamily: 'inherit',
                    }}
                  >
                    Content
                  </label>
                  <textarea
                    value={activeSlide.content}
                    onChange={e => updateSlide(activeIndex, { content: e.target.value })}
                    style={{
                      flex: 1,
                      minHeight: '120px',
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '1px solid rgba(140,82,255,0.15)',
                      background: 'rgba(140,82,255,0.04)',
                      color: '#ede9ff',
                      fontSize: '14px',
                      fontFamily: 'inherit',
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      lineHeight: '1.6',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#8c52ff'; }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(140,82,255,0.15)'; }}
                  />
                </div>

                {/* Speaker Notes textarea */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <label
                    style={{
                      fontSize: '11px',
                      color: 'rgba(237,233,255,0.4)',
                      textTransform: 'uppercase',
                      letterSpacing: '0.08em',
                      fontFamily: 'inherit',
                    }}
                  >
                    Speaker Notes
                  </label>
                  <textarea
                    value={activeSlide.notes || ''}
                    onChange={e => updateSlide(activeIndex, { notes: e.target.value })}
                    placeholder="Optional notes visible only to the presenter..."
                    style={{
                      minHeight: '72px',
                      width: '100%',
                      padding: '10px 14px',
                      borderRadius: '8px',
                      border: '1px solid rgba(140,82,255,0.15)',
                      background: 'rgba(140,82,255,0.04)',
                      color: '#ede9ff',
                      fontSize: '13px',
                      fontFamily: 'inherit',
                      outline: 'none',
                      resize: 'vertical',
                      boxSizing: 'border-box',
                      lineHeight: '1.5',
                    }}
                    onFocus={e => { e.target.style.borderColor = '#8c52ff'; }}
                    onBlur={e => { e.target.style.borderColor = 'rgba(140,82,255,0.15)'; }}
                  />
                </div>
              </>
            ) : (
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'rgba(237,233,255,0.3)',
                  fontSize: '14px',
                  fontFamily: 'inherit',
                }}
              >
                No slides yet. Click &quot;Add Slide&quot; to get started.
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 24px',
            borderTop: '1px solid rgba(140,82,255,0.12)',
            flexShrink: 0,
          }}
        >
          {/* Left — slide count */}
          <span
            style={{
              fontSize: '12px',
              color: 'rgba(237,233,255,0.4)',
              fontFamily: 'inherit',
            }}
          >
            {slides.length} slide{slides.length !== 1 ? 's' : ''}
          </span>

          {/* Right — action buttons */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {/* Move up */}
            <FooterIconButton
              onClick={() => moveSlide(activeIndex, activeIndex - 1)}
              disabled={activeIndex <= 0}
              title="Move slide up"
            >
              <ChevronUp size={16} />
            </FooterIconButton>

            {/* Move down */}
            <FooterIconButton
              onClick={() => moveSlide(activeIndex, activeIndex + 1)}
              disabled={activeIndex >= slides.length - 1}
              title="Move slide down"
            >
              <ChevronDown size={16} />
            </FooterIconButton>

            {/* Delete slide */}
            <FooterIconButton
              onClick={() => deleteSlide(activeIndex)}
              disabled={slides.length <= 1}
              title="Delete slide"
              danger
            >
              <Trash2 size={16} />
            </FooterIconButton>

            {/* Cancel */}
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(237,233,255,0.1)',
                background: 'transparent',
                color: 'rgba(237,233,255,0.5)',
                fontSize: '13px',
                cursor: 'pointer',
                fontFamily: 'inherit',
                transition: 'background 0.12s ease',
              }}
              onMouseEnter={e => { (e.target as HTMLButtonElement).style.background = 'rgba(237,233,255,0.05)'; }}
              onMouseLeave={e => { (e.target as HTMLButtonElement).style.background = 'transparent'; }}
            >
              Cancel
            </button>

            {/* Export PPTX */}
            <button
              onClick={handleExport}
              disabled={exporting || slides.length === 0}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 18px',
                borderRadius: '8px',
                border: 'none',
                background: exporting ? 'rgba(140,82,255,0.4)' : '#8c52ff',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 600,
                cursor: exporting ? 'not-allowed' : 'pointer',
                fontFamily: 'inherit',
                boxShadow: '0 4px 16px rgba(140,82,255,0.3)',
                transition: 'opacity 0.15s ease',
                opacity: slides.length === 0 ? 0.4 : 1,
              }}
              onMouseEnter={e => {
                if (!exporting) (e.target as HTMLButtonElement).style.opacity = '0.85';
              }}
              onMouseLeave={e => {
                if (!exporting) (e.target as HTMLButtonElement).style.opacity = slides.length === 0 ? '0.4' : '1';
              }}
            >
              {exporting ? <Loader2 size={14} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={14} />}
              {exporting ? 'Exporting...' : 'Export PPTX'}
            </button>
          </div>
        </div>

        {/* Keyframe for spinner */}
        <style>{`
          @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    </div>
  );
}

/* ── Sub-components ── */

function CloseButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '32px',
        height: '32px',
        borderRadius: '8px',
        border: '1px solid rgba(140,82,255,0.15)',
        background: hovered ? 'rgba(140,82,255,0.1)' : 'transparent',
        color: hovered ? '#c4a9ff' : 'rgba(237,233,255,0.4)',
        cursor: 'pointer',
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
    >
      <X size={16} />
    </button>
  );
}

function AddSlideButton({ onClick }: { onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '6px',
        padding: '8px 12px',
        borderRadius: '8px',
        border: '1px dashed rgba(140,82,255,0.25)',
        background: hovered ? 'rgba(140,82,255,0.08)' : 'transparent',
        color: hovered ? '#c4a9ff' : 'rgba(237,233,255,0.35)',
        fontSize: '11px',
        fontWeight: 600,
        cursor: 'pointer',
        fontFamily: 'inherit',
        transition: 'background 0.12s ease, color 0.12s ease',
        flexShrink: 0,
      }}
    >
      <Plus size={12} /> Add Slide
    </button>
  );
}

function FooterIconButton({ onClick, disabled, title, danger, children }: {
  onClick: () => void;
  disabled?: boolean;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const baseColor = danger ? 'rgba(252,165,165,' : 'rgba(140,82,255,';
  const activeColor = danger ? '#fca5a5' : '#c4a9ff';

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '34px',
        height: '34px',
        borderRadius: '8px',
        border: `1px solid ${danger ? 'rgba(252,165,165,0.2)' : 'rgba(140,82,255,0.15)'}`,
        background: hovered && !disabled ? `${baseColor}0.1)` : 'transparent',
        color: disabled ? 'rgba(237,233,255,0.15)' : hovered ? activeColor : `${baseColor}0.5)`,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'background 0.12s ease, color 0.12s ease',
      }}
    >
      {children}
    </button>
  );
}
