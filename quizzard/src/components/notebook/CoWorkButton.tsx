'use client';

import { useState, useEffect, useCallback } from 'react';
import CoWorkInviteModal from '@/components/notebook/CoWorkInviteModal';

interface CoWorkSession {
  id: string;
  hostId: string;
  host: { id: string; username: string; avatarUrl: string | null };
  participants: {
    userId: string;
    user: { id: string; username: string; avatarUrl: string | null };
  }[];
}

interface CoWorkButtonProps {
  notebookId: string;
  currentUserId: string;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

export default function CoWorkButton({ notebookId, currentUserId }: CoWorkButtonProps) {
  const [session, setSession] = useState<CoWorkSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);

  const fetchSession = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/cowork`);
      if (res.ok) {
        const json = await res.json();
        setSession(json.data?.session || null);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [notebookId]);

  useEffect(() => {
    fetchSession();
    // Poll every 15s for session updates
    const interval = setInterval(fetchSession, 15000);
    return () => clearInterval(interval);
  }, [fetchSession]);

  const isHost = session?.hostId === currentUserId;
  const isParticipant = session?.participants.some((p) => p.userId === currentUserId) ?? false;
  const participantCount = session?.participants.length ?? 0;

  const handleStart = async () => {
    setActionLoading(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/cowork`, {
        method: 'POST',
      });
      if (res.ok) {
        await fetchSession();
        setInviteOpen(true);
      }
    } catch {
      // silent
    } finally {
      setActionLoading(false);
    }
  };

  const handleEnd = async () => {
    if (!session) return;
    setActionLoading(true);
    try {
      await fetch(`/api/notebooks/${notebookId}/cowork/${session.id}`, {
        method: 'DELETE',
      });
      setSession(null);
    } catch {
      // silent
    } finally {
      setActionLoading(false);
    }
  };

  const handleJoin = async () => {
    if (!session) return;
    setActionLoading(true);
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/cowork/${session.id}/join`, {
        method: 'POST',
      });
      if (res.ok) await fetchSession();
    } catch {
      // silent
    } finally {
      setActionLoading(false);
    }
  };

  const handleLeave = async () => {
    if (!session) return;
    setActionLoading(true);
    try {
      await fetch(`/api/notebooks/${notebookId}/cowork/${session.id}/leave`, {
        method: 'POST',
      });
      await fetchSession();
    } catch {
      // silent
    } finally {
      setActionLoading(false);
    }
  };

  if (loading) return null;

  // No active session — show "Start Co-Work"
  if (!session) {
    return (
      <>
        <button
          onClick={handleStart}
          disabled={actionLoading}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 12px',
            borderRadius: 8,
            border: `1.5px solid ${hovered ? 'rgba(174,137,255,0.4)' : 'rgba(140,82,255,0.2)'}`,
            background: hovered ? 'rgba(174,137,255,0.1)' : 'transparent',
            color: hovered ? '#ae89ff' : 'rgba(237,233,255,0.55)',
            fontSize: 12,
            fontWeight: 600,
            cursor: actionLoading ? 'wait' : 'pointer',
            transition: `all 0.15s ${EASING}`,
            fontFamily: 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            group_work
          </span>
          {actionLoading ? 'Starting…' : 'Co-Work'}
        </button>
        <CoWorkInviteModal
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          notebookId={notebookId}
          sessionId={session}
        />
      </>
    );
  }

  // Active session — user is host
  if (isHost) {
    return (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setInviteOpen(true)}
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              padding: '6px 12px',
              borderRadius: 8,
              border: 'none',
              background: hovered
                ? 'linear-gradient(135deg, rgba(174,137,255,0.2), rgba(136,78,251,0.2))'
                : 'rgba(174,137,255,0.12)',
              color: '#ae89ff',
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              transition: `all 0.15s ${EASING}`,
              fontFamily: 'inherit',
              position: 'relative',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              group_work
            </span>
            Co-Working
            <span
              style={{
                minWidth: 18,
                height: 18,
                borderRadius: 9,
                background: '#ae89ff',
                color: '#0d0d1a',
                fontSize: 10,
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 4px',
              }}
            >
              {participantCount}
            </span>
            {/* Pulsing dot indicator */}
            <span
              style={{
                position: 'absolute',
                top: -2,
                right: -2,
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#4ade80',
                boxShadow: '0 0 6px rgba(74,222,128,0.5)',
                animation: 'coworkPulse 2s ease-in-out infinite',
              }}
            />
          </button>
          <button
            onClick={handleEnd}
            disabled={actionLoading}
            title="End session"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 28,
              height: 28,
              borderRadius: 7,
              border: 'none',
              background: 'rgba(253,111,133,0.1)',
              color: '#fd6f85',
              cursor: actionLoading ? 'wait' : 'pointer',
              transition: `all 0.15s ${EASING}`,
              fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
              stop_circle
            </span>
          </button>
        </div>

        <style>{`
          @keyframes coworkPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.8); }
          }
        `}</style>

        <CoWorkInviteModal
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          notebookId={notebookId}
          sessionId={session.id}
        />
      </>
    );
  }

  // Active session — user is participant (not host)
  if (isParticipant) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 12px',
            borderRadius: 8,
            background: 'rgba(174,137,255,0.12)',
            color: '#ae89ff',
            fontSize: 12,
            fontWeight: 700,
            fontFamily: 'inherit',
            position: 'relative',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            group_work
          </span>
          Co-Working
          <span
            style={{
              minWidth: 18,
              height: 18,
              borderRadius: 9,
              background: '#ae89ff',
              color: '#0d0d1a',
              fontSize: 10,
              fontWeight: 800,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '0 4px',
            }}
          >
            {participantCount}
          </span>
          <span
            style={{
              position: 'absolute',
              top: -2,
              right: -2,
              width: 8,
              height: 8,
              borderRadius: '50%',
              background: '#4ade80',
              boxShadow: '0 0 6px rgba(74,222,128,0.5)',
              animation: 'coworkPulse 2s ease-in-out infinite',
            }}
          />
        </div>
        <button
          onClick={handleLeave}
          disabled={actionLoading}
          title="Leave session"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 28,
            height: 28,
            borderRadius: 7,
            border: 'none',
            background: 'rgba(253,111,133,0.1)',
            color: '#fd6f85',
            cursor: actionLoading ? 'wait' : 'pointer',
            transition: `all 0.15s ${EASING}`,
            fontFamily: 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 15 }}>
            logout
          </span>
        </button>

        <style>{`
          @keyframes coworkPulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.5; transform: scale(0.8); }
          }
        `}</style>
      </div>
    );
  }

  // Active session — user is not in session, show "Join"
  return (
    <button
      onClick={handleJoin}
      disabled={actionLoading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 5,
        padding: '6px 12px',
        borderRadius: 8,
        border: 'none',
        background: hovered
          ? 'linear-gradient(135deg, #ae89ff, #884efb)'
          : 'rgba(174,137,255,0.12)',
        color: hovered ? '#fff' : '#ae89ff',
        fontSize: 12,
        fontWeight: 700,
        cursor: actionLoading ? 'wait' : 'pointer',
        transition: `all 0.15s ${EASING}`,
        fontFamily: 'inherit',
        boxShadow: hovered ? '0 4px 16px rgba(174,137,255,0.3)' : 'none',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
        group_add
      </span>
      {actionLoading ? 'Joining…' : `Join Co-Work (${participantCount})`}
    </button>
  );
}
