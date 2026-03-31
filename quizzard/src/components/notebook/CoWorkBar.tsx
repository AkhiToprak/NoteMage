'use client';

import { useState, useEffect, useCallback } from 'react';
import CoWorkInviteModal from '@/components/notebook/CoWorkInviteModal';

interface Participant {
  id: string;
  userId: string;
  user: { id: string; username: string; avatarUrl: string | null };
  joinedAt: string;
}

interface CoWorkBarProps {
  notebookId: string;
  sessionId: string;
  hostId: string;
  currentUserId: string;
  onSessionEnd?: () => void;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

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

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export default function CoWorkBar({
  notebookId,
  sessionId,
  hostId,
  currentUserId,
  onSessionEnd,
}: CoWorkBarProps) {
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [startTime] = useState(Date.now());
  const [inviteOpen, setInviteOpen] = useState(false);
  const [hoveredInvite, setHoveredInvite] = useState(false);
  const [hoveredEnd, setHoveredEnd] = useState(false);
  const [ending, setEnding] = useState(false);

  const isHost = hostId === currentUserId;

  const fetchParticipants = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/cowork/${sessionId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data?.participants) {
          setParticipants(json.data.participants);
        }
      }
    } catch {
      // silent
    }
  }, [notebookId, sessionId]);

  useEffect(() => {
    fetchParticipants();
    const interval = setInterval(fetchParticipants, 10000);
    return () => clearInterval(interval);
  }, [fetchParticipants]);

  // Timer
  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Date.now() - startTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [startTime]);

  const handleEnd = async () => {
    setEnding(true);
    try {
      await fetch(`/api/notebooks/${notebookId}/cowork/${sessionId}`, {
        method: 'DELETE',
      });
      onSessionEnd?.();
    } catch {
      // silent
    } finally {
      setEnding(false);
    }
  };

  const maxAvatars = 5;
  const shown = participants.slice(0, maxAvatars);
  const overflow = participants.length - maxAvatars;

  return (
    <>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '8px 16px',
          background: 'rgba(174,137,255,0.06)',
          borderBottom: '1px solid rgba(174,137,255,0.1)',
          fontFamily: 'inherit',
        }}
      >
        {/* Pulsing live indicator */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#4ade80',
              boxShadow: '0 0 8px rgba(74,222,128,0.4)',
              animation: 'coworkBarPulse 2s ease-in-out infinite',
            }}
          />
          <span style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', letterSpacing: '0.05em' }}>
            LIVE
          </span>
        </div>

        {/* Separator */}
        <div style={{ width: 1, height: 20, background: 'rgba(140,82,255,0.12)' }} />

        {/* Overlapping avatars */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {shown.map((p, i) => (
            <div
              key={p.id}
              title={p.user.username}
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: '2px solid #111126',
                marginLeft: i > 0 ? -8 : 0,
                zIndex: shown.length - i,
                position: 'relative',
                overflow: 'hidden',
                flexShrink: 0,
              }}
            >
              {p.user.avatarUrl ? (
                <img
                  src={p.user.avatarUrl}
                  alt={p.user.username}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    background: getAvatarGradient(p.userId),
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 11,
                    fontWeight: 700,
                    color: '#fff',
                  }}
                >
                  {p.user.username[0].toUpperCase()}
                </div>
              )}
            </div>
          ))}
          {overflow > 0 && (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: '2px solid #111126',
                marginLeft: -8,
                background: '#2a2a4c',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 10,
                fontWeight: 700,
                color: '#aaa8c8',
                flexShrink: 0,
              }}
            >
              +{overflow}
            </div>
          )}
        </div>

        <span style={{ fontSize: 12, color: '#aaa8c8', fontWeight: 500 }}>
          {participants.length} participant{participants.length !== 1 ? 's' : ''}
        </span>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Timer */}
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'rgba(237,233,255,0.35)',
            fontFamily: "'Courier New', monospace",
            letterSpacing: '0.04em',
          }}
        >
          {formatDuration(elapsed)}
        </span>

        {/* Invite button */}
        <button
          onClick={() => setInviteOpen(true)}
          onMouseEnter={() => setHoveredInvite(true)}
          onMouseLeave={() => setHoveredInvite(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            padding: '5px 10px',
            borderRadius: 7,
            border: 'none',
            background: hoveredInvite ? 'rgba(174,137,255,0.15)' : 'rgba(174,137,255,0.08)',
            color: '#ae89ff',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
            transition: `all 0.15s ${EASING}`,
            fontFamily: 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            person_add
          </span>
          Invite
        </button>

        {/* End session (host only) */}
        {isHost && (
          <button
            onClick={handleEnd}
            disabled={ending}
            onMouseEnter={() => setHoveredEnd(true)}
            onMouseLeave={() => setHoveredEnd(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 7,
              border: 'none',
              background: hoveredEnd ? 'rgba(253,111,133,0.2)' : 'rgba(253,111,133,0.08)',
              color: '#fd6f85',
              fontSize: 11,
              fontWeight: 600,
              cursor: ending ? 'wait' : 'pointer',
              transition: `all 0.15s ${EASING}`,
              fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              stop_circle
            </span>
            {ending ? 'Ending…' : 'End'}
          </button>
        )}
      </div>

      <style>{`
        @keyframes coworkBarPulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <CoWorkInviteModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        notebookId={notebookId}
        sessionId={sessionId}
      />
    </>
  );
}
