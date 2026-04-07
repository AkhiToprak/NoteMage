'use client';

import React, { useState } from 'react';

const COLORS = {
  cardBg: '#161630',
  elevated: '#232342',
  primary: '#ae89ff',
  deepPurple2: '#8348f6',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  error: '#fd6f85',
  yellow: '#ffde59',
  border: '#555578',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const CONTENT_ICONS: Record<string, { icon: string; color: string }> = {
  notebook: { icon: 'auto_stories', color: COLORS.primary },
  folder: { icon: 'folder', color: COLORS.yellow },
  document: { icon: 'description', color: COLORS.primary },
  flashcard_set: { icon: 'style', color: '#be99ff' },
  quiz_set: { icon: 'quiz', color: '#be99ff' },
};

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
  item: SharedItem;
  canDelete: boolean;
  onDelete: (id: string) => void;
}

function timeAgo(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function getSubtext(item: SharedItem): string {
  const meta = item.metadata || {};
  switch (item.contentType) {
    case 'notebook': return item.description || (meta.subject as string) || 'Notebook';
    case 'folder': return 'Folder';
    case 'document': {
      const size = meta.fileSize as number;
      return size ? `${(size / 1024 / 1024).toFixed(1)} MB • ${meta.fileType || 'Document'}` : 'Document';
    }
    case 'flashcard_set': return `${meta.cardCount || '?'} flashcards`;
    case 'quiz_set': return `${meta.questionCount || '?'} questions`;
    default: return '';
  }
}

export default function GroupSharedContentCard({ item, canDelete, onDelete }: Props) {
  const [hovered, setHovered] = useState(false);
  const iconInfo = CONTENT_ICONS[item.contentType] || { icon: 'attachment', color: COLORS.textMuted };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? COLORS.elevated : COLORS.cardBg,
        borderRadius: 16, padding: 20,
        display: 'flex', flexDirection: 'column',
        transition: `background 0.2s ${EASING}`,
        cursor: 'pointer', position: 'relative',
      }}
    >
      {/* Header: icon + delete */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 12,
          background: `${iconInfo.color}1a`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: iconInfo.color }}>{iconInfo.icon}</span>
        </div>
        {canDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
            style={{
              background: 'none', border: 'none', padding: 6, cursor: 'pointer',
              color: COLORS.textMuted, opacity: hovered ? 1 : 0,
              transition: `opacity 0.2s ${EASING}, color 0.2s ${EASING}`,
            }}
            onMouseEnter={(e) => { (e.currentTarget).style.color = COLORS.error; }}
            onMouseLeave={(e) => { (e.currentTarget).style.color = COLORS.textMuted; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>delete</span>
          </button>
        )}
      </div>

      {/* Title + description */}
      <h4 style={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4, lineHeight: 1.3 }}>{item.title}</h4>
      <p style={{ fontSize: 12, color: COLORS.textMuted, marginBottom: 16 }}>{getSubtext(item)}</p>

      {/* Sharer */}
      <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
        {item.sharedBy.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.sharedBy.avatarUrl} alt="" style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }} />
        ) : (
          <div style={{
            width: 24, height: 24, borderRadius: '50%',
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple2})`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 10, fontWeight: 700, color: '#fff',
          }}>
            {(item.sharedBy.name?.[0] || item.sharedBy.username[0] || '?').toUpperCase()}
          </div>
        )}
        <span style={{ fontSize: 11, fontWeight: 700, color: COLORS.textMuted }}>{item.sharedBy.name || item.sharedBy.username}</span>
        <span style={{ marginLeft: 'auto', fontSize: 10, color: `${COLORS.textMuted}99`, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {timeAgo(item.createdAt)}
        </span>
      </div>
    </div>
  );
}
