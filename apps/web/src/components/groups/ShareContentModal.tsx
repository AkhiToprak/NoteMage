'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';

interface ShareContentModalProps {
  open: boolean;
  onClose: () => void;
  groupId: string;
  groupName: string;
  onShared: () => void;
}

interface ContentItem {
  id: string;
  title: string;
  subtitle: string | null;
  contentType: string;
}

const COLORS = {
  cardBg: '#21213e',
  elevated: '#2d2d52',
  inputBg: '#35355c',
  primary: '#ae89ff',
  deepPurple: '#8348f6',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  error: '#fd6f85',
  success: '#4ade80',
  border: '#555578',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const TABS = [
  { key: 'notebook', label: 'Notebooks', icon: 'menu_book' },
  { key: 'flashcard_set', label: 'Flashcards', icon: 'style' },
  { key: 'quiz_set', label: 'Quizzes', icon: 'quiz' },
  { key: 'document', label: 'Files', icon: 'description' },
] as const;

export default function ShareContentModal({
  open,
  onClose,
  groupId,
  groupName,
  onShared,
}: ShareContentModalProps) {
  const [activeTab, setActiveTab] = useState<string>('notebook');
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [sharing, setSharing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successId, setSuccessId] = useState<string | null>(null);
  const [hoveredItem, setHoveredItem] = useState<string | null>(null);
  const [hoveredClose, setHoveredClose] = useState(false);
  const [search, setSearch] = useState('');
  const modalRef = useRef<HTMLDivElement>(null);

  const fetchContent = useCallback(async (type: string) => {
    setLoading(true);
    setError(null);
    setItems([]);
    try {
      let mapped: ContentItem[] = [];

      if (type === 'notebook') {
        const res = await fetch('/api/notebooks?folderId=all');
        if (!res.ok) throw new Error('Failed to load notebooks');
        const json = await res.json();
        const notebooks = json.data?.notebooks || json.data || [];
        mapped = notebooks.map((n: { id: string; name: string; subject?: string | null }) => ({
          id: n.id,
          title: n.name,
          subtitle: n.subject || null,
          contentType: 'notebook',
        }));
      } else if (type === 'flashcard_set') {
        const res = await fetch('/api/flashcard-sets');
        if (!res.ok) throw new Error('Failed to load flashcard sets');
        const json = await res.json();
        const sets = json.data || [];
        mapped = sets.map(
          (s: {
            id: string;
            title: string;
            _count?: { flashcards: number };
            notebook?: { name: string };
          }) => ({
            id: s.id,
            title: s.title,
            subtitle: s.notebook?.name
              ? `${s.notebook.name}${s._count?.flashcards != null ? ` · ${s._count.flashcards} cards` : ''}`
              : s._count?.flashcards != null
                ? `${s._count.flashcards} cards`
                : null,
            contentType: 'flashcard_set',
          })
        );
      } else if (type === 'quiz_set') {
        const res = await fetch('/api/quiz-sets');
        if (!res.ok) throw new Error('Failed to load quiz sets');
        const json = await res.json();
        const sets = json.data || [];
        mapped = sets.map(
          (s: {
            id: string;
            title: string;
            _count?: { questions: number };
            notebook?: { name: string };
          }) => ({
            id: s.id,
            title: s.title,
            subtitle: s.notebook?.name
              ? `${s.notebook.name}${s._count?.questions != null ? ` · ${s._count.questions} questions` : ''}`
              : s._count?.questions != null
                ? `${s._count.questions} questions`
                : null,
            contentType: 'quiz_set',
          })
        );
      } else if (type === 'document') {
        const res = await fetch('/api/documents');
        if (!res.ok) throw new Error('Failed to load files');
        const json = await res.json();
        const docs = json.data || [];
        mapped = docs.map(
          (d: {
            id: string;
            fileName: string;
            fileSize: number;
            fileType: string;
            notebook?: { name: string };
          }) => ({
            id: d.id,
            title: d.fileName,
            subtitle: `${(d.fileSize / 1024 / 1024).toFixed(1)} MB · ${d.fileType}${d.notebook?.name ? ` · ${d.notebook.name}` : ''}`,
            contentType: 'document',
          })
        );
      }

      setItems(mapped);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load content');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchContent(activeTab);
      setSearch('');
      setSuccessId(null);
    }
  }, [open, activeTab, fetchContent]);

  useEffect(() => {
    if (!open) {
      setError(null);
      setSharing(null);
      setSuccessId(null);
      setSearch('');
    }
  }, [open]);

  // Escape to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const handleShare = async (item: ContentItem) => {
    if (sharing) return;
    setSharing(item.id);
    setError(null);
    try {
      const res = await fetch(`/api/groups/${groupId}/shared`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contentType: item.contentType, contentId: item.id }),
      });

      if (!res.ok) {
        const json = await res.json().catch(() => null);
        throw new Error(json?.error || 'Failed to share');
      }

      setSuccessId(item.id);
      onShared();
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        setSuccessId(null);
      }, 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to share');
    } finally {
      setSharing(null);
    }
  };

  if (!open) return null;

  const filtered = items.filter((i) => {
    if (!search.trim()) return true;
    const s = search.toLowerCase();
    return i.title.toLowerCase().includes(s) || (i.subtitle || '').toLowerCase().includes(s);
  });

  return (
    <>
      <style>{`
        @keyframes modalFadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes modalSlideUp { from { opacity: 0; transform: translateY(20px) scale(0.97); } to { opacity: 1; transform: translateY(0) scale(1); } }
        .share-modal-scrollbar::-webkit-scrollbar { width: 6px; }
        .share-modal-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .share-modal-scrollbar::-webkit-scrollbar-thumb { background: ${COLORS.border}; border-radius: 3px; }
      `}</style>

      <div
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
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
          animation: `modalFadeIn 0.2s ease-out`,
        }}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label="Share Content"
          style={{
            maxWidth: 520,
            width: 'calc(100% - 32px)',
            maxHeight: 'calc(100vh - 64px)',
            background: COLORS.cardBg,
            borderRadius: 24,
            padding: 0,
            boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
            animation: `modalSlideUp 0.3s ${EASING}`,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          {/* Header */}
          <div style={{ padding: '24px 28px 16px', borderBottom: `1px solid ${COLORS.border}` }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 4,
              }}
            >
              <h2 style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
                Share Content
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
            <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: 0 }}>
              Share to <strong style={{ color: COLORS.textPrimary }}>{groupName}</strong>
            </p>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', gap: 0, borderBottom: `1px solid ${COLORS.border}` }}>
            {TABS.map((tab) => {
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 6,
                    padding: '12px 0',
                    background: 'none',
                    border: 'none',
                    borderBottom: active ? `2px solid ${COLORS.primary}` : '2px solid transparent',
                    color: active ? COLORS.primary : COLORS.textMuted,
                    fontSize: 13,
                    fontWeight: active ? 700 : 600,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    transition: `color 0.2s ${EASING}, border-color 0.2s ${EASING}`,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                    {tab.icon}
                  </span>
                  {tab.label}
                </button>
              );
            })}
          </div>

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
                placeholder="Filter..."
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
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = COLORS.primary;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                }}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ padding: '8px 20px 0', fontSize: 13, color: COLORS.error }}>{error}</div>
          )}

          {/* Content list */}
          <div
            className="share-modal-scrollbar"
            style={{ flex: 1, overflowY: 'auto', padding: '8px 12px 16px' }}
          >
            {loading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '8px 0' }}>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 8px',
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: COLORS.elevated,
                        animation: 'shimmer 1.5s infinite',
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1 }}>
                      <div
                        style={{
                          width: '60%',
                          height: 14,
                          borderRadius: 6,
                          background: COLORS.elevated,
                          animation: 'shimmer 1.5s infinite',
                          marginBottom: 6,
                        }}
                      />
                      <div
                        style={{
                          width: '35%',
                          height: 11,
                          borderRadius: 6,
                          background: COLORS.elevated,
                          animation: 'shimmer 1.5s infinite',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : filtered.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px 16px', color: COLORS.textMuted }}>
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 36, opacity: 0.4, display: 'block', marginBottom: 8 }}
                >
                  {search ? 'search_off' : 'folder_open'}
                </span>
                <p style={{ fontSize: 13, margin: 0 }}>
                  {search ? 'No items match your search' : 'Nothing to share yet'}
                </p>
              </div>
            ) : (
              filtered.map((item) => {
                const isSharing = sharing === item.id;
                const isSuccess = successId === item.id;
                const isHovered = hoveredItem === item.id;
                const iconMap: Record<string, string> = {
                  notebook: 'menu_book',
                  flashcard_set: 'style',
                  quiz_set: 'quiz',
                  document: 'description',
                };
                const icon = iconMap[item.contentType] || 'attachment';

                return (
                  <div
                    key={item.id}
                    onMouseEnter={() => setHoveredItem(item.id)}
                    onMouseLeave={() => setHoveredItem(null)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 12px',
                      borderRadius: 12,
                      background: isHovered ? COLORS.elevated : 'transparent',
                      transition: `background 0.15s ${EASING}`,
                    }}
                  >
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple})`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 18, color: '#fff' }}
                      >
                        {icon}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 600,
                          color: COLORS.textPrimary,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div
                          style={{
                            fontSize: 12,
                            color: COLORS.textMuted,
                            marginTop: 1,
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => handleShare(item)}
                      disabled={isSharing || isSuccess}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '6px 14px',
                        borderRadius: 8,
                        border: 'none',
                        background: isSuccess ? COLORS.success : COLORS.primary,
                        color: isSuccess ? '#000' : '#1a0040',
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: isSharing ? 'wait' : 'pointer',
                        fontFamily: 'inherit',
                        flexShrink: 0,
                        opacity: isSharing ? 0.6 : 1,
                        transition: `opacity 0.2s ${EASING}, background 0.2s ${EASING}`,
                      }}
                    >
                      {isSuccess ? (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                            check
                          </span>
                          Shared
                        </>
                      ) : isSharing ? (
                        'Sharing...'
                      ) : (
                        <>
                          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
                            share
                          </span>
                          Share
                        </>
                      )}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </>
  );
}
