'use client';

import React, { useState, useEffect, useCallback } from 'react';
import GroupSharedContentCard from './GroupSharedContentCard';

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
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const FILTERS = [
  { key: '', label: 'All Resources' },
  { key: 'notebook', label: 'Notebooks' },
  { key: 'flashcard_set', label: 'Flashcards' },
  { key: 'quiz_set', label: 'Quizzes' },
  { key: 'document', label: 'Documents' },
  { key: 'folder', label: 'Folders' },
] as const;

interface SharedItem {
  id: string;
  contentType: string;
  contentId: string;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  sharedBy: { id: string; name: string | null; username: string; avatarUrl: string | null };
  createdAt: string;
}

interface Props {
  groupId: string;
  currentUserId: string;
  userRole: string;
}

export default function GroupSharedContent({ groupId, currentUserId, userRole }: Props) {
  const [items, setItems] = useState<SharedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('');

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filter) params.set('contentType', filter);
      params.set('limit', '50');
      const res = await fetch(`/api/groups/${groupId}/shared?${params}`);
      if (res.ok) {
        const json = await res.json();
        setItems(json.data?.items || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  }, [groupId, filter]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (sharedId: string) => {
    if (!window.confirm('Remove this shared content?')) return;
    try {
      const res = await fetch(`/api/groups/${groupId}/shared/${sharedId}`, { method: 'DELETE' });
      if (res.ok) {
        setItems((prev) => prev.filter((i) => i.id !== sharedId));
      }
    } catch { /* ignore */ }
  };

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 32 }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: COLORS.textPrimary, letterSpacing: '-0.02em' }}>Shared Knowledge</h2>
          <p style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 4, maxWidth: 500, fontWeight: 500 }}>
            Filter through documents, flashcards, and notebooks shared by the group.
          </p>
        </div>
        <button style={{
          display: 'flex', alignItems: 'center', gap: 8,
          background: COLORS.yellow, color: '#5f4f00', border: 'none',
          borderRadius: 12, padding: '12px 24px', fontWeight: 700, fontSize: 14,
          cursor: 'pointer', fontFamily: 'inherit',
          boxShadow: `0 8px 24px rgba(255,222,89,0.15)`,
          transition: `transform 0.2s ${EASING}`,
        }}
          onMouseEnter={(e) => { (e.currentTarget).style.transform = 'scale(1.03)'; }}
          onMouseLeave={(e) => { (e.currentTarget).style.transform = 'scale(1)'; }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add_circle</span>
          Share Content
        </button>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, overflowX: 'auto', paddingBottom: 4 }}>
        {FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              style={{
                padding: '8px 20px', borderRadius: 9999, border: 'none',
                background: active ? COLORS.primary : COLORS.elevated,
                color: active ? '#fff' : COLORS.textSecondary,
                fontWeight: active ? 700 : 600, fontSize: 13,
                cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'inherit',
                transition: `background 0.2s ${EASING}, color 0.2s ${EASING}`,
                boxShadow: active ? `0 4px 12px ${COLORS.primary}33` : 'none',
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* Grid */}
      {loading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="groups-skeleton" style={{ height: 180, borderRadius: 16 }} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: COLORS.textMuted }}>
          <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.4, display: 'block', marginBottom: 12 }}>folder_off</span>
          <p style={{ fontSize: 14, fontWeight: 500 }}>No shared content yet. Be the first to share!</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 20 }}>
          {items.map((item) => (
            <GroupSharedContentCard
              key={item.id}
              item={item}
              canDelete={item.sharedBy.id === currentUserId || userRole === 'owner' || userRole === 'admin'}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      <style>{`
        .groups-skeleton {
          background: linear-gradient(90deg, ${COLORS.cardBg} 25%, ${COLORS.elevated} 50%, ${COLORS.cardBg} 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}
