'use client';

import React, { useState, useEffect, useCallback } from 'react';

const COLORS = {
  pageBg: '#111126',
  cardBg: '#161630',
  elevated: '#232342',
  inputBg: '#2a2a4c',
  primary: '#ae89ff',
  deepPurple2: '#8348f6',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  yellow: '#ffde59',
  border: '#555578',
  success: '#4ade80',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

interface NotebookOption {
  id: string;
  name: string;
  subject: string | null;
  _count?: { sections: number };
}

interface Props {
  open: boolean;
  onClose: () => void;
  groupId: string;
  sharedId: string;
  contentType: string;
  contentTitle: string;
  onSaved: () => void;
}

export default function SaveDestinationModal({
  open,
  onClose,
  groupId,
  sharedId,
  contentType,
  contentTitle,
  onSaved,
}: Props) {
  const [notebooks, setNotebooks] = useState<NotebookOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredClose, setHoveredClose] = useState(false);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [createNew, setCreateNew] = useState(false);

  const isNotebook = contentType === 'notebook';

  const fetchNotebooks = useCallback(async () => {
    if (isNotebook) return;
    setLoading(true);
    try {
      const res = await fetch('/api/notebooks?folderId=all');
      if (!res.ok) throw new Error('Failed to load notebooks');
      const json = await res.json();
      const list = json.data?.notebooks || json.data || [];
      setNotebooks(
        list.map((n: { id: string; name: string; subject?: string | null; _count?: { sections: number } }) => ({
          id: n.id,
          name: n.name,
          subject: n.subject || null,
          _count: n._count,
        }))
      );
    } catch {
      setError('Failed to load notebooks');
    } finally {
      setLoading(false);
    }
  }, [isNotebook]);

  useEffect(() => {
    if (open) {
      fetchNotebooks();
      setSearch('');
      setSelectedId(null);
      setCreateNew(false);
      setSaving(false);
      setSaved(false);
      setError(null);
    }
  }, [open, fetchNotebooks]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleSave = async () => {
    if (saving || saved) return;
    setSaving(true);
    setError(null);
    try {
      const body: { targetNotebookId?: string } = {};
      if (!isNotebook && selectedId && !createNew) {
        body.targetNotebookId = selectedId;
      }
      const res = await fetch(`/api/groups/${groupId}/shared/${sharedId}/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Failed to save');
      }
      setSaved(true);
      onSaved();
      setTimeout(() => {
        onClose();
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  const filtered = notebooks.filter((n) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return n.name.toLowerCase().includes(s) || (n.subject || '').toLowerCase().includes(s);
  });

  const canSave = isNotebook || createNew || selectedId;

  return (
    <>
      <style>{`
        @keyframes sdmFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes sdmSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .sdm-scrollbar::-webkit-scrollbar { width: 6px; }
        .sdm-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .sdm-scrollbar::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
      `}</style>

      <div
        onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'sdmFadeIn 0.2s ease-out',
        }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Save to Library"
          style={{
            maxWidth: 480,
            width: 'calc(100% - 32px)',
            maxHeight: 'calc(100vh - 64px)',
            background: COLORS.cardBg,
            borderRadius: 24,
            padding: 0,
            boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
            animation: `sdmSlideUp 0.3s ${EASING}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ padding: '24px 28px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
                Save to Library
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
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
              </button>
            </div>
            <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: 0 }}>
              {contentTitle}
            </p>
          </div>

          {/* Body */}
          {isNotebook ? (
            /* Notebook type: simple confirmation */
            <div style={{ padding: '24px 28px' }}>
              <div style={{
                background: COLORS.elevated,
                borderRadius: 16,
                padding: 24,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 12,
                textAlign: 'center',
              }}>
                <div style={{
                  width: 56,
                  height: 56,
                  borderRadius: 16,
                  background: `${COLORS.primary}1a`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 28, color: COLORS.primary }}>auto_stories</span>
                </div>
                <p style={{ fontSize: 14, color: COLORS.textSecondary, margin: 0, lineHeight: 1.5 }}>
                  This notebook will be cloned to your library as a standalone copy.
                </p>
              </div>
            </div>
          ) : (
            /* Other types: notebook picker */
            <>
              {/* Search */}
              <div style={{ padding: '12px 20px 0' }}>
                <div style={{ position: 'relative' }}>
                  <span
                    className="material-symbols-outlined"
                    style={{
                      position: 'absolute',
                      left: 12,
                      top: '50%',
                      transform: 'translateY(-50%)',
                      fontSize: 18,
                      color: COLORS.textMuted,
                      pointerEvents: 'none',
                    }}
                  >
                    search
                  </span>
                  <input
                    type="text"
                    placeholder="Search notebooks..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    style={{
                      width: '100%',
                      background: COLORS.inputBg,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 10,
                      padding: '10px 12px 10px 38px',
                      fontSize: 13,
                      color: COLORS.textPrimary,
                      outline: 'none',
                      boxSizing: 'border-box',
                      transition: `border-color 0.2s ${EASING}`,
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = COLORS.primary; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = COLORS.border; }}
                  />
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{ padding: '8px 20px 0', fontSize: 13, color: '#fd6f85' }}>{error}</div>
              )}

              {/* Notebook list */}
              <div className="sdm-scrollbar" style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 16px', maxHeight: 320 }}>
                {/* Create New Notebook option */}
                <div
                  onMouseEnter={() => setHoveredItem('__new__')}
                  onMouseLeave={() => setHoveredItem(null)}
                  onClick={() => { setCreateNew(true); setSelectedId(null); }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 12px',
                    borderRadius: 12,
                    border: createNew
                      ? `2px solid ${COLORS.primary}`
                      : `2px dashed ${hoveredItem === '__new__' ? COLORS.primary : COLORS.border}`,
                    background: createNew ? `${COLORS.primary}0d` : 'transparent',
                    cursor: 'pointer',
                    transition: `border-color 0.2s ${EASING}, background 0.2s ${EASING}`,
                    marginBottom: 4,
                  }}
                >
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 10,
                    background: `${COLORS.primary}1a`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: COLORS.primary }}>add</span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: COLORS.primary }}>
                      Create New Notebook
                    </div>
                    <div style={{ fontSize: 12, color: COLORS.textMuted, marginTop: 1 }}>
                      Save into a brand new notebook
                    </div>
                  </div>
                  {createNew && (
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: COLORS.primary, flexShrink: 0 }}>check_circle</span>
                  )}
                </div>

                {loading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
                    {[1, 2, 3].map((i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 8px' }}>
                        <div style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: COLORS.elevated,
                          flexShrink: 0,
                        }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ width: '60%', height: 14, borderRadius: 6, background: COLORS.elevated, marginBottom: 6 }} />
                          <div style={{ width: '35%', height: 11, borderRadius: 6, background: COLORS.elevated }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : filtered.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '32px 16px', color: COLORS.textMuted }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 36, opacity: 0.4, display: 'block', marginBottom: 8 }}>
                      {search ? 'search_off' : 'auto_stories'}
                    </span>
                    <p style={{ fontSize: 13, margin: 0 }}>
                      {search ? 'No notebooks match your search' : 'No notebooks yet'}
                    </p>
                  </div>
                ) : (
                  filtered.map((nb) => {
                    const isSelected = !createNew && selectedId === nb.id;
                    const isHovered = hoveredItem === nb.id;
                    return (
                      <div
                        key={nb.id}
                        onMouseEnter={() => setHoveredItem(nb.id)}
                        onMouseLeave={() => setHoveredItem(null)}
                        onClick={() => { setSelectedId(nb.id); setCreateNew(false); }}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          borderRadius: 12,
                          border: isSelected ? `2px solid ${COLORS.primary}` : '2px solid transparent',
                          background: isSelected
                            ? `${COLORS.primary}0d`
                            : isHovered
                            ? COLORS.elevated
                            : 'transparent',
                          cursor: 'pointer',
                          transition: `background 0.15s ${EASING}, border-color 0.15s ${EASING}`,
                        }}
                      >
                        <div style={{
                          width: 36,
                          height: 36,
                          borderRadius: 10,
                          background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple2})`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#fff' }}>auto_stories</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: 14,
                            fontWeight: 600,
                            color: COLORS.textPrimary,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}>
                            {nb.name}
                          </div>
                          {nb.subject && (
                            <div style={{
                              fontSize: 12,
                              color: COLORS.textMuted,
                              marginTop: 1,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {nb.subject}
                            </div>
                          )}
                        </div>
                        {nb._count?.sections != null && (
                          <span style={{ fontSize: 11, color: COLORS.textMuted, flexShrink: 0, fontWeight: 600 }}>
                            {nb._count.sections} {nb._count.sections === 1 ? 'section' : 'sections'}
                          </span>
                        )}
                        {isSelected && (
                          <span className="material-symbols-outlined" style={{ fontSize: 20, color: COLORS.primary, flexShrink: 0 }}>check_circle</span>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* Footer with save button */}
          <div style={{
            padding: '16px 28px 24px',
            borderTop: `1px solid ${COLORS.border}`,
            display: 'flex',
            flexDirection: 'column',
            gap: 8,
          }}>
            {error && !isNotebook && null}
            <button
              onClick={handleSave}
              disabled={saving || saved || !canSave}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                width: '100%',
                padding: '12px 0',
                borderRadius: 12,
                border: 'none',
                background: saved
                  ? COLORS.success
                  : canSave
                  ? `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple2})`
                  : COLORS.elevated,
                color: saved ? '#000' : canSave ? '#fff' : COLORS.textMuted,
                fontSize: 14,
                fontWeight: 700,
                cursor: saving || saved || !canSave ? 'default' : 'pointer',
                fontFamily: 'inherit',
                opacity: saving ? 0.7 : 1,
                transition: `opacity 0.2s ${EASING}, background 0.2s ${EASING}`,
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                {saved ? 'check_circle' : saving ? 'progress_activity' : 'library_add'}
              </span>
              {saved ? 'Saved to Library!' : saving ? 'Saving...' : isNotebook ? 'Clone to Library' : createNew ? 'Save to New Notebook' : selectedId ? 'Save to Notebook' : 'Select a destination'}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
