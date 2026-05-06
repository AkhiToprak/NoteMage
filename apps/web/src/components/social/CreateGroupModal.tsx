'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';

interface CreateGroupModalProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

interface Friend {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  nameStyle?: { fontId?: string; colorId?: string } | null;
  equippedFrameId?: string | null;
  equippedTitleId?: string | null;
}

const COLORS = {
  cardBg: '#21213e',
  elevated: '#2d2d52',
  inputBg: '#35355c',
  primary: '#ae89ff',
  deepPurple: '#884efb',
  deepPurple2: '#8348f6',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  success: '#4ade80',
  error: '#fd6f85',
  border: '#555578',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

export default function CreateGroupModal({ open, onClose, onCreated }: CreateGroupModalProps) {
  const { isPhone } = useBreakpoint();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [groupType, setGroupType] = useState<'study_group' | 'class'>('study_group');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hoveredClose, setHoveredClose] = useState(false);
  const [hoveredSubmit, setHoveredSubmit] = useState(false);

  // Invite step state
  const [step, setStep] = useState<'create' | 'invite'>('create');
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [friendSearch, setFriendSearch] = useState('');
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [invitedIds, setInvitedIds] = useState<Set<string>>(new Set());

  const inputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      setName('');
      setDescription('');
      setGroupType('study_group');
      setError(null);
      setLoading(false);
      setStep('create');
      setCreatedGroupId(null);
      setFriends([]);
      setFriendSearch('');
      setInvitedIds(new Set());
    }
  }, [open]);

  // Fetch friends when entering invite step
  useEffect(() => {
    if (step !== 'invite') return;
    setFriendsLoading(true);
    (async () => {
      try {
        const res = await fetch('/api/friends');
        if (res.ok) {
          const json = await res.json();
          setFriends(
            (json.data?.friends || []).map(
              (f: {
                id: string;
                username: string;
                name?: string | null;
                avatarUrl?: string | null;
                nameStyle?: { fontId?: string; colorId?: string } | null;
                equippedFrameId?: string | null;
                equippedTitleId?: string | null;
              }) => ({
                id: f.id,
                username: f.username,
                name: f.name || null,
                avatarUrl: f.avatarUrl || null,
                nameStyle: f.nameStyle ?? null,
                equippedFrameId: f.equippedFrameId ?? null,
                equippedTitleId: f.equippedTitleId ?? null,
              })
            )
          );
        }
      } catch {
        /* ignore */
      }
      setFriendsLoading(false);
    })();
  }, [step]);

  const handleInvite = useCallback(
    async (friendId: string) => {
      if (!createdGroupId) return;
      try {
        const res = await fetch(`/api/groups/${createdGroupId}/invitations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: friendId }),
        });
        if (res.ok) {
          setInvitedIds((prev) => new Set(prev).add(friendId));
        }
      } catch {
        /* ignore */
      }
    },
    [createdGroupId]
  );

  const handleFinish = () => {
    onCreated();
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          type: groupType,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => null);
        throw new Error(data?.error || 'Failed to create group');
      }

      const result = await res.json().catch(() => null);
      const groupId = result?.data?.id;
      setCreatedGroupId(groupId || null);
      onCreated();
      setStep('invite');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab' || !modalRef.current) return;
    const focusableEls = modalRef.current.querySelectorAll<HTMLElement>(
      'button, input, textarea, [tabindex]:not([tabindex="-1"])'
    );
    if (focusableEls.length === 0) return;
    const firstEl = focusableEls[0];
    const lastEl = focusableEls[focusableEls.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      }
    } else {
      if (document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }
  };

  if (!open) return null;

  const inputStyle = (focused: boolean): React.CSSProperties => ({
    width: '100%',
    background: COLORS.inputBg,
    border: `1px solid ${focused ? COLORS.primary : COLORS.border}`,
    borderRadius: 12,
    padding: '12px 14px',
    fontSize: 14,
    color: COLORS.textPrimary,
    outline: 'none',
    transition: `border-color 0.2s ${EASING}, box-shadow 0.2s ${EASING}`,
    boxShadow: focused ? `0 0 0 3px rgba(174, 137, 255, 0.15)` : 'none',
    boxSizing: 'border-box' as const,
    fontFamily: 'inherit',
    resize: 'none' as const,
  });

  return (
    <>
      <style>{`
        @keyframes cgmFadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes cgmSlideUp {
          from { opacity: 0; transform: translateY(20px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }
      `}</style>

      <div
        onClick={handleBackdropClick}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 100,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          animation: 'cgmFadeIn 0.2s ease-out',
        }}
      >
        <div
          ref={modalRef}
          role="dialog"
          aria-modal="true"
          aria-label="Create Study Group"
          onKeyDown={handleKeyDown}
          style={{
            maxWidth: isPhone ? 'none' : 480,
            width: isPhone ? '100vw' : 'calc(100% - 32px)',
            height: isPhone ? '100dvh' : undefined,
            maxHeight: isPhone ? 'none' : undefined,
            background: COLORS.cardBg,
            borderRadius: isPhone ? 0 : 24,
            padding: isPhone ? 20 : 32,
            boxShadow: isPhone ? 'none' : '0 32px 64px rgba(0, 0, 0, 0.5)',
            animation: isPhone ? undefined : `cgmSlideUp 0.3s ${EASING}`,
            display: 'flex',
            flexDirection: 'column',
            gap: isPhone ? 20 : 24,
            margin: isPhone ? 0 : undefined,
            overflow: isPhone ? 'auto' : undefined,
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                color: COLORS.textPrimary,
                margin: 0,
                letterSpacing: '-0.01em',
              }}
            >
              {step === 'create' ? 'Create Study Group' : 'Invite Members'}
            </h2>
            <button
              onClick={step === 'invite' ? handleFinish : onClose}
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

          {step === 'create' ? (
            /* Create Form */
            <form
              onSubmit={handleSubmit}
              style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
            >
              {/* Type selector */}
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { key: 'study_group' as const, label: 'Study Group', icon: 'groups' },
                  { key: 'class' as const, label: 'Class', icon: 'school' },
                ].map((opt) => {
                  const active = groupType === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setGroupType(opt.key)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 8,
                        padding: '12px 16px',
                        borderRadius: 12,
                        border: 'none',
                        background: active ? `${COLORS.primary}22` : COLORS.inputBg,
                        color: active ? COLORS.primary : COLORS.textMuted,
                        fontWeight: active ? 700 : 500,
                        fontSize: 13,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                        outline: active ? `2px solid ${COLORS.primary}55` : '2px solid transparent',
                        transition: `all 0.2s ${EASING}`,
                      }}
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                        {opt.icon}
                      </span>
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              {groupType === 'class' && (
                <div
                  style={{
                    padding: '10px 14px',
                    borderRadius: 10,
                    background: '#ffde5912',
                    border: '1px solid #ffde5933',
                    fontSize: 12,
                    color: '#ffde59',
                    lineHeight: 1.5,
                  }}
                >
                  <span
                    className="material-symbols-outlined"
                    style={{ fontSize: 14, verticalAlign: 'middle', marginRight: 6 }}
                  >
                    info
                  </span>
                  You&apos;ll be the teacher. Students can&apos;t share or chat unless you enable it
                  in settings.
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>
                  {groupType === 'class' ? 'Class Name *' : 'Group Name *'}
                </label>
                <input
                  ref={inputRef}
                  type="text"
                  placeholder="e.g. Calculus Study Group"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  maxLength={100}
                  style={inputStyle(false)}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = COLORS.primary;
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(174, 137, 255, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = COLORS.border;
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 600, color: COLORS.textSecondary }}>
                  Description
                </label>
                <textarea
                  placeholder="What will your group study together?"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={500}
                  style={inputStyle(false)}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = COLORS.primary;
                    e.currentTarget.style.boxShadow = '0 0 0 3px rgba(174, 137, 255, 0.15)';
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = COLORS.border;
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                />
              </div>

              {error && (
                <div
                  style={{
                    fontSize: 13,
                    color: COLORS.error,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                    error
                  </span>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !name.trim()}
                onMouseEnter={() => setHoveredSubmit(true)}
                onMouseLeave={() => setHoveredSubmit(false)}
                style={{
                  background:
                    loading || !name.trim()
                      ? COLORS.elevated
                      : hoveredSubmit
                        ? COLORS.deepPurple
                        : COLORS.primary,
                  color: loading || !name.trim() ? COLORS.textMuted : '#1a0040',
                  fontSize: 14,
                  fontWeight: 700,
                  borderRadius: 12,
                  padding: '14px 24px',
                  border: 'none',
                  cursor: loading || !name.trim() ? 'not-allowed' : 'pointer',
                  transition: `background 0.2s ${EASING}, color 0.2s ${EASING}, transform 0.15s ${EASING}`,
                  transform: hoveredSubmit && !loading && name.trim() ? 'scale(1.01)' : 'scale(1)',
                  letterSpacing: '-0.01em',
                }}
              >
                {loading ? 'Creating...' : 'Create Group'}
              </button>
            </form>
          ) : (
            /* Invite Step */
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, color: COLORS.textSecondary, margin: 0 }}>
                Invite friends to{' '}
                <span style={{ color: COLORS.textPrimary, fontWeight: 600 }}>{name}</span>
              </p>

              <input
                value={friendSearch}
                onChange={(e) => setFriendSearch(e.target.value)}
                placeholder="Search friends..."
                style={{
                  width: '100%',
                  padding: '12px 16px',
                  background: COLORS.inputBg,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 12,
                  color: COLORS.textPrimary,
                  fontSize: 14,
                  fontFamily: 'inherit',
                  outline: 'none',
                  boxSizing: 'border-box' as const,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = COLORS.primary;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = COLORS.border;
                }}
              />

              <div
                style={{
                  maxHeight: 260,
                  overflowY: 'auto',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
                className="custom-scrollbar"
              >
                {friendsLoading ? (
                  <p
                    style={{
                      textAlign: 'center',
                      color: COLORS.textMuted,
                      padding: 24,
                      fontSize: 14,
                    }}
                  >
                    Loading friends...
                  </p>
                ) : friends.filter((f) => {
                    if (!friendSearch) return true;
                    const s = friendSearch.toLowerCase();
                    return (
                      f.username.toLowerCase().includes(s) ||
                      (f.name || '').toLowerCase().includes(s)
                    );
                  }).length === 0 ? (
                  <p
                    style={{
                      textAlign: 'center',
                      color: COLORS.textMuted,
                      padding: 24,
                      fontSize: 14,
                    }}
                  >
                    {friendSearch ? 'No friends match your search' : 'No friends to invite yet'}
                  </p>
                ) : (
                  friends
                    .filter((f) => {
                      if (!friendSearch) return true;
                      const s = friendSearch.toLowerCase();
                      return (
                        f.username.toLowerCase().includes(s) ||
                        (f.name || '').toLowerCase().includes(s)
                      );
                    })
                    .map((friend) => {
                      const isInvited = invitedIds.has(friend.id);
                      return (
                        <div
                          key={friend.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 12,
                            padding: '10px 12px',
                            borderRadius: 12,
                            background: COLORS.elevated,
                          }}
                        >
                          <UserAvatar user={friend} size={32} radius={8} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <UserName
                              user={friend}
                              as="p"
                              style={{
                                fontSize: 13,
                                fontWeight: 600,
                                color: COLORS.textPrimary,
                                margin: 0,
                              }}
                            />
                            <p style={{ fontSize: 11, color: COLORS.textMuted, margin: 0 }}>
                              @{friend.username}
                            </p>
                          </div>
                          {isInvited ? (
                            <span
                              style={{
                                fontSize: 12,
                                color: COLORS.success,
                                fontWeight: 700,
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4,
                              }}
                            >
                              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                                check_circle
                              </span>
                              Invited
                            </span>
                          ) : (
                            <button
                              onClick={() => handleInvite(friend.id)}
                              style={{
                                padding: '5px 14px',
                                borderRadius: 8,
                                border: 'none',
                                background: `${COLORS.primary}33`,
                                color: COLORS.primary,
                                fontWeight: 700,
                                fontSize: 12,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                                transition: `background 0.2s ${EASING}`,
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = COLORS.primary;
                                e.currentTarget.style.color = '#fff';
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = `${COLORS.primary}33`;
                                e.currentTarget.style.color = COLORS.primary;
                              }}
                            >
                              Invite
                            </button>
                          )}
                        </div>
                      );
                    })
                )}
              </div>

              <button
                onClick={handleFinish}
                style={{
                  background: COLORS.primary,
                  color: '#1a0040',
                  fontSize: 14,
                  fontWeight: 700,
                  borderRadius: 12,
                  padding: '14px 24px',
                  border: 'none',
                  cursor: 'pointer',
                  transition: `background 0.2s ${EASING}, transform 0.15s ${EASING}`,
                  letterSpacing: '-0.01em',
                }}
              >
                {invitedIds.size > 0 ? 'Done' : 'Skip'}
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
