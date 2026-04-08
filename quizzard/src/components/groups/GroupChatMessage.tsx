'use client';

import React, { useState } from 'react';
import SaveDestinationModal from './SaveDestinationModal';

const COLORS = {
  pageBg: '#111126',
  cardBg: '#161630',
  elevated: '#232342',
  inputBg: '#2a2a4c',
  primary: '#ae89ff',
  deepPurple: '#884efb',
  deepPurple2: '#8348f6',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  error: '#fd6f85',
  success: '#4ade80',
  yellow: '#ffde59',
  border: '#555578',
} as const;

interface ChatMessageData {
  id: string;
  senderId: string | null;
  sender: { id: string; name: string | null; username: string; avatarUrl: string | null } | null;
  type: string;
  content: string;
  metadata: unknown;
  createdAt: string;
  status?: 'sending' | 'delivered' | 'read';
}

interface Props {
  message: ChatMessageData;
  groupId: string;
  isOwn: boolean;
}

function timeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.floor(diffHr / 24);
  return `${diffDay}d ago`;
}

function Avatar({ user, size = 36 }: { user: { name?: string | null; avatarUrl?: string | null; username: string }; size?: number }) {
  const initial = (user.name?.[0] || user.username[0] || '?').toUpperCase();
  if (user.avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={user.avatarUrl} alt="" style={{ width: size, height: size, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }} />
    );
  }
  return (
    <div style={{
      width: size, height: size, borderRadius: 12,
      background: `linear-gradient(135deg, ${COLORS.primary} 0%, ${COLORS.deepPurple2} 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 700, color: '#fff', flexShrink: 0,
    }}>
      {initial}
    </div>
  );
}

function MessageStatusIcon({ status, isOwn }: { status?: string; isOwn: boolean }) {
  if (!isOwn || !status) return null;
  const color = status === 'read' ? COLORS.primary : `${COLORS.textMuted}99`;
  if (status === 'sending') {
    return (
      <span className="material-symbols-outlined" style={{ fontSize: 14, color, marginLeft: 4, verticalAlign: 'middle' }}>
        check
      </span>
    );
  }
  // delivered or read: double check
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', marginLeft: 4, width: 18, height: 14 }}>
      <span className="material-symbols-outlined" style={{ fontSize: 14, color, position: 'absolute', left: 0 }}>check</span>
      <span className="material-symbols-outlined" style={{ fontSize: 14, color, position: 'absolute', left: 5 }}>check</span>
    </span>
  );
}

function ContentTypeIcon({ type }: { type: string }) {
  const icons: Record<string, string> = {
    notebook: 'auto_stories',
    folder: 'folder',
    document: 'description',
    flashcard_set: 'style',
    quiz_set: 'quiz',
  };
  return <span className="material-symbols-outlined" style={{ fontSize: 24, color: COLORS.primary }}>{icons[type] || 'attachment'}</span>;
}

export default function GroupChatMessage({ message, groupId, isOwn }: Props) {
  const [saved, setSaved] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  const [resolvedSharedId, setResolvedSharedId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);
  // System message
  if (message.type === 'system') {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0' }}>
        <span style={{
          fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em',
          color: `${COLORS.textMuted}99`, background: `${COLORS.elevated}80`,
          padding: '6px 16px', borderRadius: 9999,
        }}>
          {message.content}
        </span>
      </div>
    );
  }

  // Content share message
  if (message.type === 'content_share' && message.metadata) {
    const meta = message.metadata as {
      sharedId?: string;
      contentType?: string;
      contentId?: string;
      contentTitle?: string;
      fileName?: string;
      fileSize?: number;
      description?: string;
      cardCount?: number;
      questionCount?: number;
    };

    const handleOpenSaveModal = async () => {
      if (saved || resolving) return;
      let sid = meta.sharedId || resolvedSharedId;
      if (!sid && meta.contentType && meta.contentId) {
        setResolving(true);
        try {
          const listRes = await fetch(`/api/groups/${groupId}/shared?contentType=${meta.contentType}&limit=50`);
          if (listRes.ok) {
            const listJson = await listRes.json();
            const match = (listJson.data?.items || []).find(
              (i: { contentId: string }) => i.contentId === meta.contentId
            );
            if (match) sid = match.id;
          }
        } catch { /* ignore */ }
        setResolving(false);
      }
      if (!sid) return;
      setResolvedSharedId(sid);
      setSaveModalOpen(true);
    };

    const subtextParts: string[] = [];
    if (meta.contentType === 'document' && meta.fileSize) {
      subtextParts.push(`${(meta.fileSize / 1024 / 1024).toFixed(1)} MB`);
    }
    if (meta.contentType === 'flashcard_set' && meta.cardCount) {
      subtextParts.push(`${meta.cardCount} flashcards`);
    }
    if (meta.contentType === 'quiz_set' && meta.questionCount) {
      subtextParts.push(`${meta.questionCount} questions`);
    }
    if (meta.description) {
      subtextParts.push(meta.description);
    }

    return (
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexDirection: isOwn ? 'row-reverse' : 'row', maxWidth: '70%', marginLeft: isOwn ? 'auto' : 0, marginRight: isOwn ? 0 : 'auto' }}>
        {message.sender && <Avatar user={message.sender} size={40} />}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexDirection: isOwn ? 'row-reverse' : 'row' }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: isOwn ? COLORS.yellow : COLORS.primary }}>{isOwn ? 'You' : message.sender?.name || message.sender?.username}</span>
            <span style={{ fontSize: 10, fontWeight: 500, color: `${COLORS.textMuted}b3`, display: 'inline-flex', alignItems: 'center' }}>
              {timeAgo(message.createdAt)}
              <MessageStatusIcon status={message.status} isOwn={isOwn} />
            </span>
          </div>
          <div style={{
            background: COLORS.elevated, border: `1px solid ${COLORS.border}33`,
            padding: 16, borderRadius: 16, minWidth: 240, maxWidth: 340,
            boxSizing: 'border-box',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div style={{ width: 44, height: 44, background: `${COLORS.primary}1a`, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <ContentTypeIcon type={meta.contentType || ''} />
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <h4 style={{ fontSize: 13, fontWeight: 700, color: COLORS.textPrimary, lineHeight: 1.3, wordBreak: 'break-word' }}>{meta.contentTitle || meta.fileName || 'Shared content'}</h4>
                {subtextParts.length > 0 && (
                  <p style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 4 }}>{subtextParts.join(' · ')}</p>
                )}
              </div>
            </div>
            <button
              onClick={handleOpenSaveModal}
              disabled={saved || resolving}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                width: '100%', padding: '8px 0', borderRadius: 10,
                border: saved ? 'none' : `1px solid ${COLORS.border}`,
                background: saved ? `${COLORS.primary}1a` : 'transparent',
                color: saved ? COLORS.primary : COLORS.textSecondary,
                fontSize: 12, fontWeight: 600,
                cursor: saved || resolving ? 'default' : 'pointer',
                fontFamily: 'inherit',
                transition: `background 0.2s cubic-bezier(0.22,1,0.36,1), color 0.2s cubic-bezier(0.22,1,0.36,1), border-color 0.2s cubic-bezier(0.22,1,0.36,1)`,
              }}
              onMouseEnter={(e) => { if (!saved && !resolving) { e.currentTarget.style.borderColor = COLORS.primary; e.currentTarget.style.color = COLORS.primary; } }}
              onMouseLeave={(e) => { if (!saved && !resolving) { e.currentTarget.style.borderColor = COLORS.border; e.currentTarget.style.color = COLORS.textSecondary; } }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {saved ? 'check_circle' : 'library_add'}
              </span>
              {saved ? 'Saved to Library' : resolving ? 'Loading...' : 'Save to Library'}
            </button>
          </div>
        </div>
        {resolvedSharedId && (
          <SaveDestinationModal
            open={saveModalOpen}
            onClose={() => setSaveModalOpen(false)}
            groupId={groupId}
            sharedId={resolvedSharedId}
            contentType={meta.contentType || ''}
            contentTitle={meta.contentTitle || meta.fileName || 'Shared content'}
            onSaved={() => { setSaved(true); setSaveModalOpen(false); }}
          />
        )}
      </div>
    );
  }

  // Regular text message
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16, flexDirection: isOwn ? 'row-reverse' : 'row', maxWidth: '70%', marginLeft: isOwn ? 'auto' : 0, marginRight: isOwn ? 0 : 'auto' }}>
      {message.sender && <Avatar user={message.sender} size={40} />}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: isOwn ? 'flex-end' : 'flex-start' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, flexDirection: isOwn ? 'row-reverse' : 'row' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: isOwn ? COLORS.yellow : COLORS.primary }}>{isOwn ? 'You' : message.sender?.name || message.sender?.username}</span>
          <span style={{ fontSize: 10, fontWeight: 500, color: `${COLORS.textMuted}b3`, display: 'inline-flex', alignItems: 'center' }}>
            {timeAgo(message.createdAt)}
            <MessageStatusIcon status={message.status} isOwn={isOwn} />
          </span>
        </div>
        <div style={{
          background: isOwn ? `${COLORS.primary}33` : COLORS.cardBg,
          border: isOwn ? `1px solid ${COLORS.primary}33` : 'none',
          padding: '12px 20px',
          borderTopLeftRadius: isOwn ? 20 : 4,
          borderTopRightRadius: isOwn ? 4 : 20,
          borderBottomLeftRadius: 20,
          borderBottomRightRadius: 20,
          lineHeight: 1.6, fontSize: 14, color: COLORS.textPrimary,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {message.content}
        </div>
      </div>
    </div>
  );
}
