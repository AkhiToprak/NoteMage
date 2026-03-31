'use client';

import React, { useState, useEffect, useRef } from 'react';

interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const COLORS = {
  cardBg: '#161630',
  elevated: '#232342',
  inputBg: '#2a2a4c',
  primary: '#ae89ff',
  deepPurple: '#884efb',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  error: '#fd6f85',
  border: '#555578',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

export default function CreateGroupModal({ open, onClose, onCreated }: CreateGroupModalProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredClose, setHoveredClose] = useState(false);
  const [hoveredSubmit, setHoveredSubmit] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setName('');
      setDescription('');
      setError(null);
      setLoading(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), description: description.trim() || null }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to create group');
      }

      onCreated();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !modalRef.current) return;
    const focusableEls = modalRef.current.querySelectorAll<HTMLElement>(
      'button, input, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableEls.length === 0) return;
    const firstEl = focusableEls[0];
    const lastEl = focusableEls[focusableEls.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      }
    } else {
      if (document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
  };

  if (!open) return null;

  const inputStyle = (focused: boolean): React.CSSProperties => ({
    width: '100%',
    background: COLORS.inputBg,
    border: `1px solid ${focused ? COLORS.primary : COLORS.border}`,
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: 14,
    color: COLORS.textPrimary,
    outline: 'none',
    transition: `border-color 0.2s ${EASING}, box-shadow 0.2s ${EASING}`,
    boxShadow: focused ? `0 0 0 3px rgba(174, 137, 255, 0.15)` : 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
    resize: 'none' as const,
  });

  return (
    <>
      <style>{`
        @keyframes cgmFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cgmSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        onClick={handleBackdropClick}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'cgmFadeIn 0.2s ease-out',
        }}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label="Create Study Group"
          onKeyDown={handleKeyDown}
          style={{
            maxWidth: 480,
            width: 'calc(100% - 32px)',
            background: COLORS.cardBg,
            borderRadius: 24,
            padding: 32,
            boxShadow: '0 32px 64px rgba(0, 0, 0, 0.5)',
            animation: `cgmSlideUp 0.3s ${EASING}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 24,
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: COLORS.textPrimary,
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              Create Study Group
            </h2>
            <button
              onClick={onClose}
              onMouseEnter={() => setHoveredClose(true)}
              onMouseLeave={() => setHoveredClose(false)}
              aria-label="Close"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 4,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 8,
                color: hoveredClose ? COLORS.textPrimary : COLORS.textMuted,
                transition: `color 0.2s ${EASING}`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                close
              </span>
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}
              >
                Group Name *
              </label>
              <input
                ref={inputRef}
                type="text"
                placeholder="e.g. Calculus Study Group"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                maxLength={100}
                style={inputStyle(false)}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = COLORS.primary;
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(174, 137, 255, 0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label
                style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}
              >
                Description
              </label>
              <textarea
                placeholder="What will your group study together?"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                maxLength={500}
                style={inputStyle(false)}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = COLORS.primary;
                  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(174, 137, 255, 0.15)';
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>

            {error && (
              <div
                style={{
                  fontSize: 13,
                  color: COLORS.error,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  error
                </span>
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !name.trim()}
              onMouseEnter={() => setHoveredSubmit(true)}
              onMouseLeave={() => setHoveredSubmit(false)}
              style={{
                background: loading || !name.trim()
                  ? COLORS.elevated
                  : hoveredSubmit
                    ? COLORS.deepPurple
                    : COLORS.primary,
                color: loading || !name.trim() ? COLORS.textMuted : '#1a0040',
                fontSize: 14,
                fontWeight: 700,
                borderRadius: 12,
                padding: '14px 24px',
                border: 'none',
                cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
                transition: `background 0.2s ${EASING}, color 0.2s ${EASING}, transform 0.15s ${EASING}`,
                transform: hoveredSubmit && !loading && name.trim() ? 'scale(1.01)' : 'scale(1)',
                letterSpacing: '-0.01em',
              }}
            >
              {loading ? 'Creating...' : 'Create Group'}
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
