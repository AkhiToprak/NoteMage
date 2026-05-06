'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';

interface FriendsListProps {
  compact?: boolean;
  onAddFriendClick?: () => void;
}

interface FriendUser {
  id: string;
  username: string;
  name?: string | null;
  avatarUrl?: string | null;
  nameStyle?: { fontId?: string; colorId?: string } | null;
  equippedFrameId?: string | null;
  equippedTitleId?: string | null;
}

interface Friend {
  friendshipId: string;
  id: string;
  username: string;
  name?: string | null;
  avatarUrl?: string | null;
  nameStyle?: { fontId?: string; colorId?: string } | null;
  equippedFrameId?: string | null;
  equippedTitleId?: string | null;
}

interface FriendRequest {
  friendshipId: string;
  direction: string;
  user: FriendUser;
  createdAt: string;
}

const TRANSITION = 'all 0.2s cubic-bezier(0.22,1,0.36,1)';

function Avatar({
  user,
  size = 32,
}: {
  user: {
    name?: string | null;
    avatarUrl?: string | null;
    username: string;
    equippedFrameId?: string | null;
  };
  size?: number;
}) {
  return <UserAvatar user={user} size={size} radius="50%" />;
}

function SkeletonRow({ compact }: { compact: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: compact ? 8 : 10,
        padding: compact ? '6px 0' : '8px 12px',
      }}
    >
      <div
        style={{
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: '#2d2d52',
          flexShrink: 0,
          animation: 'friendsListPulse 1.5s ease-in-out infinite',
        }}
      />
      <div style={{ flex: 1 }}>
        <div
          style={{
            width: 80,
            height: 12,
            borderRadius: 6,
            background: '#2d2d52',
            marginBottom: compact ? 0 : 4,
            animation: 'friendsListPulse 1.5s ease-in-out 0.1s infinite',
          }}
        />
        {!compact && (
          <div
            style={{
              width: 56,
              height: 10,
              borderRadius: 6,
              background: '#2d2d52',
              animation: 'friendsListPulse 1.5s ease-in-out 0.2s infinite',
            }}
          />
        )}
      </div>
    </div>
  );
}

export default function FriendsList({ compact = false, onAddFriendClick }: FriendsListProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendsCount, setFriendsCount] = useState(0);
  const [pendingRequests, setPendingRequests] = useState<FriendRequest[]>([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingExpanded, setPendingExpanded] = useState(true);
  const [hoveredFriendId, setHoveredFriendId] = useState<string | null>(null);
  const [respondingTo, setRespondingTo] = useState<string | null>(null);
  const [hoveredAccept, setHoveredAccept] = useState<string | null>(null);
  const [hoveredDecline, setHoveredDecline] = useState<string | null>(null);
  const [hoveredAddFriend, setHoveredAddFriend] = useState(false);
  const [hoveredSeeAll, setHoveredSeeAll] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [friendsRes, pendingRes] = await Promise.all([
        fetch('/api/friends'),
        fetch('/api/friends?status=pending&direction=incoming'),
      ]);

      if (!friendsRes.ok || !pendingRes.ok) {
        throw new Error('Failed to fetch friends data');
      }

      const friendsData = await friendsRes.json();
      const pendingData = await pendingRes.json();

      if (friendsData.success) {
        setFriends(friendsData.data.friends);
        setFriendsCount(friendsData.data.count);
      }
      if (pendingData.success) {
        setPendingRequests(pendingData.data.requests);
        setPendingCount(pendingData.data.count);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleRequestAction = async (friendshipId: string, action: 'accept' | 'decline') => {
    setRespondingTo(friendshipId);
    try {
      const res = await fetch(`/api/friends/request/${friendshipId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!res.ok) throw new Error('Failed to respond to request');

      setPendingRequests((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
      setPendingCount((prev) => Math.max(0, prev - 1));

      if (action === 'accept') {
        fetchData();
      }
    } catch {
      setError('Failed to respond to friend request');
    } finally {
      setRespondingTo(null);
    }
  };

  // Keyframe injection for skeleton pulse
  useEffect(() => {
    const styleId = 'friends-list-keyframes';
    if (document.getElementById(styleId)) return;
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes friendsListPulse {
        0%, 100% { opacity: 0.4; }
        50% { opacity: 0.8; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      const el = document.getElementById(styleId);
      if (el) el.remove();
    };
  }, []);

  if (compact) {
    return (
      <div style={{ padding: '8px 0' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: '#8888a8',
                letterSpacing: '0.08em',
              }}
            >
              Friends
            </span>
            {pendingCount > 0 && (
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#ae89ff',
                  color: '#fff',
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                {pendingCount}
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {Array.from({ length: 3 }).map((_, i) => (
              <SkeletonRow key={i} compact />
            ))}
          </div>
        ) : error ? (
          <div
            style={{
              fontSize: 12,
              color: '#fd6f85',
              padding: '8px 0',
            }}
          >
            {error}
          </div>
        ) : friends.length === 0 ? (
          <div
            style={{
              fontSize: 12,
              color: '#8888a8',
              padding: '8px 0',
              textAlign: 'center',
            }}
          >
            No friends yet
          </div>
        ) : (
          <>
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
              }}
            >
              {friends.slice(0, 5).map((friend) => (
                <div
                  key={friend.friendshipId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 8px',
                    borderRadius: 8,
                    background: hoveredFriendId === friend.friendshipId ? '#2d2d52' : 'transparent',
                    transition: TRANSITION,
                    cursor: 'pointer',
                  }}
                  onMouseEnter={() => setHoveredFriendId(friend.friendshipId)}
                  onMouseLeave={() => setHoveredFriendId(null)}
                >
                  <Avatar user={friend} size={32} />
                  <UserName
                    user={friend}
                    preferUsername
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: '#e5e3ff',
                      maxWidth: '100%',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  />
                </div>
              ))}
            </div>
            {friendsCount > 5 && (
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  color: hoveredSeeAll ? '#c4abff' : '#ae89ff',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  padding: '6px 8px',
                  marginTop: 2,
                  transition: TRANSITION,
                }}
                onMouseEnter={() => setHoveredSeeAll(true)}
                onMouseLeave={() => setHoveredSeeAll(false)}
                onClick={onAddFriendClick}
              >
                See all ({friendsCount})
              </button>
            )}
          </>
        )}
      </div>
    );
  }

  // Full mode
  return (
    <div
      style={{
        background: '#21213e',
        borderRadius: 12,
        border: '1px solid #555578',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '16px 16px 12px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <h3
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#e5e3ff',
              margin: 0,
            }}
          >
            Friends
          </h3>
          {friendsCount > 0 && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                minWidth: 22,
                height: 22,
                borderRadius: 11,
                background: '#2d2d52',
                color: '#aaa8c8',
                fontSize: 12,
                fontWeight: 600,
                padding: '0 6px',
              }}
            >
              {friendsCount}
            </span>
          )}
        </div>
        <button
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            background: 'none',
            border: 'none',
            color: hoveredAddFriend ? '#c4abff' : '#ae89ff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            padding: '4px 8px',
            borderRadius: 8,
            transition: TRANSITION,
          }}
          onMouseEnter={() => setHoveredAddFriend(true)}
          onMouseLeave={() => setHoveredAddFriend(false)}
          onClick={onAddFriendClick}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            person_add
          </span>
          Find Friends
        </button>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <div
          style={{
            borderTop: '1px solid #555578',
            borderBottom: '1px solid #555578',
          }}
        >
          <button
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              background: 'none',
              border: 'none',
              padding: '10px 16px',
              cursor: 'pointer',
              color: '#e5e3ff',
            }}
            onClick={() => setPendingExpanded((prev) => !prev)}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: '#aaa8c8' }}>
                Pending Requests
              </span>
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  minWidth: 20,
                  height: 20,
                  borderRadius: 10,
                  background: '#ae89ff',
                  color: '#fff',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '0 5px',
                }}
              >
                {pendingRequests.length}
              </span>
            </div>
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 18,
                color: '#8888a8',
                transition: TRANSITION,
                transform: pendingExpanded ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            >
              expand_more
            </span>
          </button>

          <div
            style={{
              maxHeight: pendingExpanded ? 300 : 0,
              overflow: 'hidden',
              transition: 'max-height 0.3s cubic-bezier(0.22,1,0.36,1)',
            }}
          >
            <div style={{ padding: '0 16px 12px' }}>
              {pendingRequests.map((request) => (
                <div
                  key={request.friendshipId}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    padding: '8px 0',
                  }}
                >
                  <Avatar user={request.user} size={32} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <UserName
                      as="div"
                      user={request.user}
                      preferUsername
                      style={{
                        fontSize: 14,
                        fontWeight: 700,
                        color: '#e5e3ff',
                        maxWidth: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    />
                    {request.user.name && (
                      <div
                        style={{
                          fontSize: 12,
                          color: '#aaa8c8',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {request.user.name}
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        border: 'none',
                        background:
                          hoveredAccept === request.friendshipId
                            ? 'rgba(74, 222, 128, 0.2)'
                            : 'rgba(74, 222, 128, 0.1)',
                        color: '#4ade80',
                        cursor: respondingTo === request.friendshipId ? 'not-allowed' : 'pointer',
                        transition: TRANSITION,
                        opacity: respondingTo === request.friendshipId ? 0.5 : 1,
                      }}
                      disabled={respondingTo === request.friendshipId}
                      onMouseEnter={() => setHoveredAccept(request.friendshipId)}
                      onMouseLeave={() => setHoveredAccept(null)}
                      onClick={() => handleRequestAction(request.friendshipId, 'accept')}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                        check
                      </span>
                    </button>
                    <button
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: 30,
                        height: 30,
                        borderRadius: 8,
                        border: 'none',
                        background:
                          hoveredDecline === request.friendshipId
                            ? 'rgba(253, 111, 133, 0.2)'
                            : 'rgba(253, 111, 133, 0.1)',
                        color: '#fd6f85',
                        cursor: respondingTo === request.friendshipId ? 'not-allowed' : 'pointer',
                        transition: TRANSITION,
                        opacity: respondingTo === request.friendshipId ? 0.5 : 1,
                      }}
                      disabled={respondingTo === request.friendshipId}
                      onMouseEnter={() => setHoveredDecline(request.friendshipId)}
                      onMouseLeave={() => setHoveredDecline(null)}
                      onClick={() => handleRequestAction(request.friendshipId, 'decline')}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                        close
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Friends List */}
      {loading ? (
        <div style={{ padding: '8px 4px' }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonRow key={i} compact={false} />
          ))}
        </div>
      ) : error ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: '32px 16px',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 32, color: '#fd6f85' }}>
            error
          </span>
          <span style={{ fontSize: 14, color: '#fd6f85' }}>{error}</span>
          <button
            style={{
              background: 'none',
              border: '1px solid #555578',
              borderRadius: 8,
              color: '#ae89ff',
              fontSize: 13,
              fontWeight: 600,
              padding: '6px 14px',
              cursor: 'pointer',
              transition: TRANSITION,
            }}
            onClick={() => {
              setLoading(true);
              fetchData();
            }}
          >
            Retry
          </button>
        </div>
      ) : friends.length === 0 ? (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
            padding: '40px 16px',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#8888a8' }}>
            group
          </span>
          <span
            style={{
              fontSize: 15,
              fontWeight: 600,
              color: '#e5e3ff',
            }}
          >
            No friends yet
          </span>
          <span
            style={{
              fontSize: 13,
              color: '#8888a8',
            }}
          >
            Find people to study with
          </span>
        </div>
      ) : (
        <div
          style={{
            maxHeight: 400,
            overflowY: 'auto',
            padding: '4px 0',
          }}
        >
          {friends.map((friend) => (
            <div
              key={friend.friendshipId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px',
                background: hoveredFriendId === friend.friendshipId ? '#2d2d52' : 'transparent',
                transition: TRANSITION,
                cursor: 'pointer',
                position: 'relative',
              }}
              onMouseEnter={() => setHoveredFriendId(friend.friendshipId)}
              onMouseLeave={() => setHoveredFriendId(null)}
            >
              <Avatar user={friend} size={32} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <UserName
                  as="div"
                  user={friend}
                  preferUsername
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: '#e5e3ff',
                    maxWidth: '100%',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                />
                {friend.name && (
                  <div
                    style={{
                      fontSize: 12,
                      color: '#aaa8c8',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {friend.name}
                  </div>
                )}
              </div>
              {hoveredFriendId === friend.friendshipId && (
                <button
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: 28,
                    height: 28,
                    borderRadius: 6,
                    border: 'none',
                    background: '#35355c',
                    color: '#8888a8',
                    cursor: 'pointer',
                    flexShrink: 0,
                    transition: TRANSITION,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    more_horiz
                  </span>
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
