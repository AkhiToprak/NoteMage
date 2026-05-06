'use client';

import { useState, useEffect, useCallback } from 'react';
import CoWorkInviteModal from '@/components/notebook/CoWorkInviteModal';
import { useCoworkSocket } from '@/lib/cowork-socket';
import { UserAvatar } from '@/components/user/UserAvatar';

interface Participant {
  id: string;
  userId: string;
  user: {
    id: string;
    username: string;
    name?: string | null;
    avatarUrl: string | null;
    nameStyle?: { fontId?: string; colorId?: string } | null;
    equippedFrameId?: string | null;
    equippedTitleId?: string | null;
  };
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
  /**
   * Session-wide start time, as an absolute epoch-ms. Seeded from the
   * server's `createdAt` on the first GET so every peer shows the
   * same elapsed duration regardless of when they joined. We don't
   * default to Date.now() — starting from the local mount time made
   * joiners see a timer that restarted at "0:00" each time they
   * navigated into the page, while the host saw the real value.
   * `null` means "not yet known"; the timer effect no-ops until then.
   */
  const [startTime, setStartTime] = useState<number | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [hoveredInvite, setHoveredInvite] = useState(false);
  const [hoveredEnd, setHoveredEnd] = useState(false);
  const [hoveredLeave, setHoveredLeave] = useState(false);
  const [ending, setEnding] = useState(false);
  const [leaving, setLeaving] = useState(false);
  /**
   * Host-controlled "open editing" flag. When toggled on, everyone in the
   * session can edit the page even if the lock holder is someone else.
   * Broadcast via cowork:edit_mode through the ws-server so all peers end
   * up with the same state. Default off.
   */
  const [editOpen, setEditOpen] = useState(false);
  const [hoveredEdit, setHoveredEdit] = useState(false);

  const isHost = hostId === currentUserId;
  const socket = useCoworkSocket(sessionId);

  // Stay in sync with other peers' edit-mode changes (also reflects our
  // own toggle since the server broadcasts to the whole room).
  useEffect(() => {
    if (!socket) return;
    const onEditMode = (data: { sessionId: string; enabled: boolean }) => {
      if (data.sessionId !== sessionId) return;
      setEditOpen(!!data.enabled);
    };
    socket.on('cowork:edit_mode', onEditMode);
    return () => {
      socket.off('cowork:edit_mode', onEditMode);
    };
  }, [socket, sessionId]);

  const toggleEditOpen = () => {
    if (!socket || !isHost) return;
    socket.emit('cowork:edit_mode', { sessionId, enabled: !editOpen });
  };

  const fetchParticipants = useCallback(async () => {
    try {
      const res = await fetch(`/api/notebooks/${notebookId}/cowork/${sessionId}`);
      if (res.ok) {
        const json = await res.json();
        if (json.data?.participants) {
          setParticipants(json.data.participants);
        }
        // Anchor the timer to the server-side session start so every
        // peer shows the same elapsed duration. Parsed once — we
        // deliberately keep a stable reference after the first seed
        // so a drifting server clock doesn't cause the timer to jump
        // around on subsequent polls.
        if (typeof json.data?.createdAt === 'string') {
          const parsed = Date.parse(json.data.createdAt);
          if (Number.isFinite(parsed)) {
            setStartTime((prev) => (prev === null ? parsed : prev));
          }
        }
      }
    } catch {
      // silent
    }
  }, [notebookId, sessionId]);

  // Initial load + defensive polling fallback. Real-time events via the
  // socket are the primary update mechanism, but a 5-second poll keeps the
  // bar accurate even if the socket is disconnected, flaky, or missed a
  // broadcast (e.g. the ws-server was briefly unreachable when a peer
  // joined). Also ends the session on the UI side if the server has
  // marked it inactive behind our back.
  useEffect(() => {
    fetchParticipants();
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/notebooks/${notebookId}/cowork/${sessionId}`);
        if (res.status === 404) {
          // Session disappeared — host ended it while we weren't looking.
          onSessionEnd?.();
          return;
        }
        if (res.ok) {
          const json = await res.json();
          if (json.data?.isActive === false) {
            onSessionEnd?.();
            return;
          }
          if (Array.isArray(json.data?.participants)) {
            setParticipants(json.data.participants);
          }
          // Safety net — in case the initial fetch missed the seed.
          if (typeof json.data?.createdAt === 'string') {
            const parsed = Date.parse(json.data.createdAt);
            if (Number.isFinite(parsed)) {
              setStartTime((prev) => (prev === null ? parsed : prev));
            }
          }
        }
      } catch {
        // silent — next tick will retry
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [fetchParticipants, notebookId, sessionId, onSessionEnd]);

  // Real-time participant updates via the cowork socket.
  useEffect(() => {
    if (!socket) return;

    const onJoined = (data: {
      sessionId: string;
      user: { id: string; username: string; avatarUrl: string | null };
    }) => {
      if (data.sessionId !== sessionId) return;
      setParticipants((prev) => {
        // De-dupe by userId — if the same user re-joins, keep one entry.
        if (prev.some((p) => p.userId === data.user.id)) return prev;
        return [
          ...prev,
          {
            id: `live-${data.user.id}`,
            userId: data.user.id,
            user: data.user,
            joinedAt: new Date().toISOString(),
          },
        ];
      });
    };

    const onLeft = (data: { sessionId: string; userId: string }) => {
      if (data.sessionId !== sessionId) return;
      setParticipants((prev) => prev.filter((p) => p.userId !== data.userId));
    };

    const onSessionEnded = (data: { sessionId: string }) => {
      if (data.sessionId !== sessionId) return;
      onSessionEnd?.();
    };

    socket.on('cowork:participant_joined', onJoined);
    socket.on('cowork:participant_left', onLeft);
    socket.on('cowork:session_ended', onSessionEnded);

    return () => {
      socket.off('cowork:participant_joined', onJoined);
      socket.off('cowork:participant_left', onLeft);
      socket.off('cowork:session_ended', onSessionEnded);
    };
  }, [socket, sessionId, onSessionEnd]);

  // Timer — no-op until `startTime` has been seeded from the server's
  // `createdAt`. We also prime `elapsed` immediately so the display
  // doesn't briefly show "0:00" before the next interval tick.
  useEffect(() => {
    if (startTime === null) return;
    setElapsed(Date.now() - startTime);
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

  // Non-host leave flow. POSTs to the leave endpoint (releases locks,
  // marks the participant inactive, auto-ends the session if the host is
  // the only one left) and then fires the same onSessionEnd callback the
  // host-ended path uses, so the parent routes the user back to their
  // origin chat with a single code path.
  const handleLeave = async () => {
    setLeaving(true);
    try {
      await fetch(`/api/notebooks/${notebookId}/cowork/${sessionId}/leave`, {
        method: 'POST',
      });
    } catch {
      // silent — navigate away anyway; stale participant will be cleaned
      // up by the server's next housekeeping pass.
    } finally {
      onSessionEnd?.();
      setLeaving(false);
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
          <span
            style={{ fontSize: 11, fontWeight: 700, color: '#4ade80', letterSpacing: '0.05em' }}
          >
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
              title={p.user.name || p.user.username}
              style={{
                border: '2px solid #1a1a36',
                borderRadius: 8,
                marginLeft: i > 0 ? -8 : 0,
                zIndex: shown.length - i,
                position: 'relative',
                flexShrink: 0,
                display: 'inline-flex',
              }}
            >
              <UserAvatar user={p.user} size={28} radius={6} />
            </div>
          ))}
          {overflow > 0 && (
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: 8,
                border: '2px solid #1a1a36',
                marginLeft: -8,
                background: '#35355c',
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

        {/* Allow-edit toggle (host only). When off, only the lock holder
            can type. When on, all participants can edit simultaneously —
            last writer wins at the 1.5s autosave granularity. */}
        {isHost ? (
          <button
            onClick={toggleEditOpen}
            onMouseEnter={() => setHoveredEdit(true)}
            onMouseLeave={() => setHoveredEdit(false)}
            title={
              editOpen
                ? 'Everyone in this session can edit'
                : 'Only you can edit — click to open editing for everyone'
            }
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 7,
              border: 'none',
              background: editOpen
                ? hoveredEdit
                  ? 'rgba(255,222,89,0.24)'
                  : 'rgba(255,222,89,0.18)'
                : hoveredEdit
                  ? 'rgba(237,233,255,0.1)'
                  : 'rgba(237,233,255,0.05)',
              color: editOpen ? '#ffde59' : '#aaa8c8',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: `all 0.15s ${EASING}`,
              fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {editOpen ? 'lock_open' : 'lock'}
            </span>
            {editOpen ? 'Open editing' : 'Host only'}
          </button>
        ) : (
          <span
            title={
              editOpen
                ? 'Everyone can edit'
                : 'Only the host can edit — wait for them to open editing'
            }
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 7,
              background: editOpen ? 'rgba(255,222,89,0.14)' : 'rgba(237,233,255,0.05)',
              color: editOpen ? '#ffde59' : '#8888a8',
              fontSize: 11,
              fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              {editOpen ? 'edit' : 'visibility'}
            </span>
            {editOpen ? 'Editing' : 'Read only'}
          </span>
        )}

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

        {/* Leave session (non-host only). The host can't leave — they
            must End, which is a destructive action for everyone else in
            the room. Everyone else gets this softer exit that just
            removes them from the participant list. */}
        {!isHost && (
          <button
            onClick={handleLeave}
            disabled={leaving}
            onMouseEnter={() => setHoveredLeave(true)}
            onMouseLeave={() => setHoveredLeave(false)}
            title="Leave this session and return to the chat"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 7,
              border: 'none',
              background: hoveredLeave ? 'rgba(253,111,133,0.2)' : 'rgba(253,111,133,0.08)',
              color: '#fd6f85',
              fontSize: 11,
              fontWeight: 600,
              cursor: leaving ? 'wait' : 'pointer',
              transition: `all 0.15s ${EASING}`,
              fontFamily: 'inherit',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
              logout
            </span>
            {leaving ? 'Leaving…' : 'Leave'}
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
