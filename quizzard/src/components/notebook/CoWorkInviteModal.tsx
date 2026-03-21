'use client';

import { useState, useEffect, useCallback } from 'react';

interface Friend {
  id: string;
  username: string;
  avatarUrl: string | null;
}

interface CoWorkInviteModalProps {
  open: boolean;
  onClose: () => void;
  notebookId: string;
  sessionId: string | null;
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

export default function CoWorkInviteModal({ open, onClose, notebookId, sessionId }: CoWorkInviteModalProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [loadingFriends, setLoadingFriends] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState<Set<string>>(new Set());
  const [hoveredFriend, setHoveredFriend] = useState<string | null>(null);
  const [hoveredSend, setHoveredSend] = useState(false);
  const [hoveredClose, setHoveredClose] = useState(false);

  const fetchFriends = useCallback(async () => {
    setLoadingFriends(true);
    try {
      const res = await fetch('/api/friends?status=accepted');
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          setFriends(
            (json.data.friends || []).map((f: { friend: Friend }) => f.friend)
          );
        }
      }
    } catch {
      // silent
    } finally {
      setLoadingFriends(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      fetchFriends();
      setSelected(new Set());
      setSent(new Set());
    }
  }, [open, fetchFriends]);

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleSendInvites = async () => {
    if (selected.size === 0 || !sessionId) return;
    setSending(true);
    try {
      // Send notification to each selected friend
      const promises = Array.from(selected).map((friendId) =>
        fetch('/api/notifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: friendId,
            type: 'co_work_invite',
            data: { notebookId, sessionId },
          }),
        }).catch(() => null)
      );

      // We use a simple approach: create notifications directly
      // In production this would go through a proper invite API
      // For now, we'll just mark them as sent in the UI
      await Promise.all(promises);
      setSent((prev) => {
        const next = new Set(prev);
        selected.forEach((id) => next.add(id));
        return next;
      });
      setSelected(new Set());
    } catch {
      // silent
    } finally {
      setSending(false);
    }
  };

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          zIndex: 9999,
          animation: 'coworkModalFadeIn 0.2s ease',
        }}
      />

      {/* Modal Card */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: '100%',
          maxWidth: 440,
          background: '#121222',
          borderRadius: 24,
          boxShadow: '0 32px 64px rgba(0,0,0,0.5)',
          zIndex: 10000,
          overflow: 'hidden',
          animation: 'coworkModalSlideUp 0.25s cubic-bezier(0.22,1,0.36,1)',
        }}
      >
        {/* Top gradient line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: 1,
            background: 'linear-gradient(90deg, transparent, rgba(174,137,255,0.4), transparent)',
          }}
        />

        {/* Header */}
        <div
          style={{
            padding: '24px 24px 16px',
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
          }}
        >
          <div>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: '#e5e3ff',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 22, color: '#ae89ff' }}
              >
                group_work
              </span>
              Invite Friends
            </h2>
            <p style={{ margin: '6px 0 0', fontSize: 13, color: '#aaa8c8' }}>
              Select friends to invite to this co-work session
            </p>
          </div>
          <button
            onClick={onClose}
            onMouseEnter={() => setHoveredClose(true)}
            onMouseLeave={() => setHoveredClose(false)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 10,
              border: 'none',
              background: hoveredClose ? '#1d1d33' : 'transparent',
              color: '#737390',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: `all 0.15s ${EASING}`,
              flexShrink: 0,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
              close
            </span>
          </button>
        </div>

        {/* Friends List */}
        <div
          style={{
            maxHeight: 320,
            overflowY: 'auto',
            padding: '0 16px',
          }}
        >
          {loadingFriends ? (
            <div
              style={{
                padding: '40px 0',
                textAlign: 'center',
                color: '#737390',
                fontSize: 13,
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: 24, animation: 'spin 1s linear infinite' }}
              >
                progress_activity
              </span>
            </div>
          ) : friends.length === 0 ? (
            <div
              style={{
                padding: '40px 0',
                textAlign: 'center',
                color: '#737390',
                fontSize: 13,
              }}
            >
              No friends to invite yet
            </div>
          ) : (
            friends.map((friend) => {
              const isSelected = selected.has(friend.id);
              const isSent = sent.has(friend.id);
              const isHovered = hoveredFriend === friend.id;
              return (
                <div
                  key={friend.id}
                  onClick={() => !isSent && toggleSelect(friend.id)}
                  onMouseEnter={() => setHoveredFriend(friend.id)}
                  onMouseLeave={() => setHoveredFriend(null)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '10px 12px',
                    borderRadius: 12,
                    cursor: isSent ? 'default' : 'pointer',
                    background: isSelected
                      ? 'rgba(174,137,255,0.08)'
                      : isHovered && !isSent
                        ? 'rgba(255,255,255,0.03)'
                        : 'transparent',
                    transition: `background 0.12s ${EASING}`,
                    marginBottom: 2,
                  }}
                >
                  {/* Checkbox */}
                  <div
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 6,
                      border: isSelected
                        ? 'none'
                        : isSent
                          ? '1.5px solid rgba(74,222,128,0.3)'
                          : '1.5px solid #464560',
                      background: isSelected
                        ? 'linear-gradient(135deg, #ae89ff, #884efb)'
                        : isSent
                          ? 'rgba(74,222,128,0.12)'
                          : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                      transition: `all 0.15s ${EASING}`,
                    }}
                  >
                    {isSelected && (
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#fff' }}>
                        check
                      </span>
                    )}
                    {isSent && (
                      <span className="material-symbols-outlined" style={{ fontSize: 14, color: '#4ade80' }}>
                        send
                      </span>
                    )}
                  </div>

                  {/* Avatar */}
                  {friend.avatarUrl ? (
                    <img
                      src={friend.avatarUrl}
                      alt={friend.username}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        objectFit: 'cover',
                        flexShrink: 0,
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 10,
                        background: getAvatarGradient(friend.id),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#fff',
                        flexShrink: 0,
                      }}
                    >
                      {friend.username[0].toUpperCase()}
                    </div>
                  )}

                  {/* Name */}
                  <span
                    style={{
                      flex: 1,
                      fontSize: 14,
                      fontWeight: 600,
                      color: isSent ? '#737390' : '#e5e3ff',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {friend.username}
                  </span>

                  {/* Sent indicator */}
                  {isSent && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#4ade80' }}>
                      Invited
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <span style={{ fontSize: 12, color: '#737390' }}>
            {selected.size > 0
              ? `${selected.size} selected`
              : sent.size > 0
                ? `${sent.size} invited`
                : '\u00A0'}
          </span>

          <button
            onClick={handleSendInvites}
            disabled={selected.size === 0 || sending}
            onMouseEnter={() => setHoveredSend(true)}
            onMouseLeave={() => setHoveredSend(false)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '10px 20px',
              borderRadius: 12,
              border: 'none',
              background:
                selected.size === 0
                  ? '#23233c'
                  : hoveredSend
                    ? 'linear-gradient(135deg, #c4a6ff, #9b5fff)'
                    : 'linear-gradient(135deg, #ae89ff, #884efb)',
              color: selected.size === 0 ? '#737390' : '#fff',
              fontSize: 13,
              fontWeight: 700,
              cursor: selected.size === 0 || sending ? 'not-allowed' : 'pointer',
              transition: `all 0.15s ${EASING}`,
              fontFamily: 'inherit',
              boxShadow: selected.size > 0 && hoveredSend
                ? '0 8px 24px rgba(174,137,255,0.3)'
                : 'none',
              transform: hoveredSend && selected.size > 0 ? 'translateY(-1px)' : 'none',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              send
            </span>
            {sending ? 'Sending…' : 'Send Invites'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes coworkModalFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes coworkModalSlideUp {
          from { opacity: 0; transform: translate(-50%, -48%) scale(0.96); }
          to { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
