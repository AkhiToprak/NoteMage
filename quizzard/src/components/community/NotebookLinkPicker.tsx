'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface Notebook {
  id: string;
  name: string;
  subject: string | null;
  color: string | null;
  _count: { sections: number };
}

interface NotebookLinkPickerProps {
  open: boolean;
  onClose: () => void;
  onSelect: (notebook: { id: string; name: string; subject: string | null; color: string | null }) => void;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  pageBg: '#111126',
  cardBg: '#161630',
  elevated: '#232342',
  inputBg: '#2a2a4c',
  primary: '#ae89ff',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
} as const;

export default function NotebookLinkPicker({ open, onClose, onSelect }: NotebookLinkPickerProps) {
  const [notebooks, setNotebooks] = useState<Notebook[]>([]);
  const [loading, setLoading] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredClose, setHoveredClose] = useState(false);
  const [search, setSearch] = useState('');
  const [focusedSearch, setFocusedSearch] = useState(false);
  const modalRef = useRef<HTMLDivElement>(null);

  const fetchNotebooks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/notebooks');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setNotebooks(json.data.notebooks || json.data || []);
        }
      }
    } catch {
      // silently fail
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchNotebooks();
      setSearch('');
    }
  }, [open, fetchNotebooks]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open, onClose]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handler);
    }, 10);
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handler);
    };
  }, [open, onClose]);

  if (!open) return null;

  const filtered = search
    ? notebooks.filter((n) =>
        n.name.toLowerCase().includes(search.toLowerCase()) ||
        n.subject?.toLowerCase().includes(search.toLowerCase())
      )
    : notebooks;

  return (
    <>
      <style>{`
        @keyframes pickerFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes pickerSlideUp {
          from { opacity: 0; transform: translateY(16px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.55)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'pickerFadeIn 0.15s ease-out',
        }}
      >
        <div
          ref={modalRef}
          style={{
            maxWidth: 440,
            width: 'calc(100% - 32px)',
            maxHeight: 'calc(100vh - 100px)',
            background: COLORS.cardBg,
            borderRadius: 20,
            boxShadow: '0 24px 48px rgba(0,0,0,0.5)',
            animation: 'pickerSlideUp 0.25s cubic-bezier(0.22,1,0.36,1)',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '22px 22px 0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 20, color: COLORS.primary }}
              >
                menu_book
              </span>
              <h3
                style={{
                  margin: 0,
                  fontSize: 16,
                  fontWeight: 700,
                  color: COLORS.textPrimary,
                }}
              >
                Link Notebook
              </h3>
            </div>
            <button
              onClick={onClose}
              onMouseEnter={() => setHoveredClose(true)}
              onMouseLeave={() => setHoveredClose(false)}
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                border: 'none',
                background: hoveredClose ? COLORS.elevated : 'transparent',
                color: hoveredClose ? COLORS.textPrimary : COLORS.textMuted,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: `all 0.2s ${EASING}`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
            </button>
          </div>

          {/* Search */}
          <div style={{ padding: '16px 22px 0' }}>
            <div style={{ position: 'relative' }}>
              <span
                className="material-symbols-outlined"
                style={{
                  position: 'absolute',
                  left: 12,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  fontSize: 18,
                  color: focusedSearch ? COLORS.primary : COLORS.textMuted,
                  transition: `color 0.2s ${EASING}`,
                }}
              >
                search
              </span>
              <input
                type="text"
                placeholder="Search notebooks..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onFocus={() => setFocusedSearch(true)}
                onBlur={() => setFocusedSearch(false)}
                style={{
                  width: '100%',
                  padding: '10px 14px 10px 38px',
                  borderRadius: 10,
                  border: `1.5px solid ${focusedSearch ? COLORS.primary : COLORS.border}`,
                  background: COLORS.inputBg,
                  color: COLORS.textPrimary,
                  fontSize: 13,
                  outline: 'none',
                  transition: `border-color 0.2s ${EASING}`,
                  boxSizing: 'border-box',
                }}
              />
            </div>
          </div>

          {/* List */}
          <div
            style={{
              flex: 1,
              overflowY: 'auto',
              padding: '12px 22px 22px',
              display: 'flex',
              flexDirection: 'column',
              gap: 4,
            }}
          >
            {loading ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  padding: 40,
                  gap: 8,
                  color: COLORS.textMuted,
                  fontSize: 13,
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 20, animation: 'spin 1s linear infinite' }}
                >
                  progress_activity
                </span>
                Loading...
              </div>
            ) : filtered.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  padding: '40px 20px',
                  gap: 8,
                  color: COLORS.textMuted,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 36, opacity: 0.5 }}>
                  search_off
                </span>
                <span style={{ fontSize: 13 }}>
                  {search ? 'No notebooks match your search' : 'No notebooks yet'}
                </span>
              </div>
            ) : (
              filtered.map((nb) => {
                const isHovered = hoveredId === nb.id;
                return (
                  <button
                    key={nb.id}
                    onClick={() => {
                      onSelect({ id: nb.id, name: nb.name, subject: nb.subject, color: nb.color });
                      onClose();
                    }}
                    onMouseEnter={() => setHoveredId(nb.id)}
                    onMouseLeave={() => setHoveredId(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 10,
                      border: 'none',
                      background: isHovered ? 'rgba(174,137,255,0.06)' : 'transparent',
                      cursor: 'pointer',
                      width: '100%',
                      textAlign: 'left',
                      transition: `all 0.15s ${EASING}`,
                    }}
                  >
                    {/* Color dot */}
                    <div
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 4,
                        background: nb.color || COLORS.primary,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 13,
                          fontWeight: 600,
                          color: COLORS.textPrimary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {nb.name}
                      </div>
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 8,
                          marginTop: 2,
                        }}
                      >
                        {nb.subject && (
                          <span
                            style={{
                              fontSize: 11,
                              color: COLORS.textMuted,
                              background: 'rgba(174,137,255,0.08)',
                              padding: '1px 6px',
                              borderRadius: 4,
                            }}
                          >
                            {nb.subject}
                          </span>
                        )}
                        <span style={{ fontSize: 11, color: COLORS.textMuted }}>
                          {nb._count.sections} section{nb._count.sections !== 1 ? 's' : ''}
                        </span>
                      </div>
                    </div>
                    <span
                      className="material-symbols-outlined"
                      style={{
                        fontSize: 18,
                        color: isHovered ? COLORS.primary : 'transparent',
                        transition: `color 0.15s ${EASING}`,
                      }}
                    >
                      add_link
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}
