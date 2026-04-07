'use client';

import { useState, useEffect, useCallback } from 'react';

interface LockInfo {
  lockedBy: { id: string; username: string; avatarUrl: string | null };
  expiresAt: string;
}

interface PageLockIndicatorProps {
  notebookId: string;
  sessionId: string;
  pageId: string;
  currentUserId: string;
}

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #ae89ff, #884efb)',
  'linear-gradient(135deg, #ff89ae, #fb4e88)',
  'linear-gradient(135deg, #89ffd4, #4efba5)',
  'linear-gradient(135deg, #ffde59, #fbae4e)',
];

function getAvatarGradient(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_GRADIENTS[Math.abs(hash) % AVATAR_GRADIENTS.length];
}

export default function PageLockIndicator({
  notebookId,
  sessionId,
  pageId,
  currentUserId,
}: PageLockIndicatorProps) {
  const [lock, setLock] = useState<LockInfo | null>(null);

  const fetchLockStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/cowork/${sessionId}`);
      if (res.ok) {
        const json = await res.json();
        const pageLocks = json.data?.pageLocks || [];
        const pageLock = pageLocks.find(
          (l: { pageId: string; lockedBy: { id: string } }) =>
            l.pageId === pageId && l.lockedBy.id !== currentUserId
        );
        setLock(pageLock ? { lockedBy: pageLock.lockedBy, expiresAt: pageLock.expiresAt } : null);
      }
    } catch {
      // silent
    }
  }, [notebookId, sessionId, pageId, currentUserId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchLockStatus();
    const interval = setInterval(fetchLockStatus, 10000);
    return () => clearInterval(interval);
  }, [fetchLockStatus]);

  if (!lock) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 20px',
        background: 'rgba(251,146,60,0.08)',
        borderBottom: '1px solid rgba(251,146,60,0.15)',
        animation: 'lockBannerIn 0.25s cubic-bezier(0.22,1,0.36,1)',
      }}
    >
      {/* Avatar */}
      {lock.lockedBy.avatarUrl ? (
        <img
          src={lock.lockedBy.avatarUrl}
          alt={lock.lockedBy.username}
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            objectFit: 'cover',
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            background: getAvatarGradient(lock.lockedBy.id),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 10,
            fontWeight: 700,
            color: '#fff',
            flexShrink: 0,
          }}
        >
          {lock.lockedBy.username[0].toUpperCase()}
        </div>
      )}

      {/* Lock icon */}
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 16, color: '#fb923c' }}
      >
        lock
      </span>

      {/* Text */}
      <span
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: '#fb923c',
          fontFamily: 'inherit',
        }}
      >
        @{lock.lockedBy.username} is editing this page
      </span>

      <span
        style={{
          fontSize: 11,
          color: 'rgba(251,146,60,0.5)',
          marginLeft: 'auto',
          fontFamily: 'inherit',
        }}
      >
        Read-only
      </span>

      <style>{`
        @keyframes lockBannerIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
