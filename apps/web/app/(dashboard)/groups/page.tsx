'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import StudyGroupCard from '@/components/social/StudyGroupCard';
import CreateGroupModal from '@/components/social/CreateGroupModal';
import GroupInvitationCard from '@/components/groups/GroupInvitationCard';
import DMCard from '@/components/groups/DMCard';
import StartDMModal from '@/components/groups/StartDMModal';

interface GroupMember {
  userId: string;
  id: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
  // Cosmetic fields — forwarded by /api/groups so DMCard can paint the
  // peer's equipped frame / title / name font in the list.
  nameStyle?: { fontId?: string; colorId?: string } | null;
  equippedTitleId?: string | null;
  equippedFrameId?: string | null;
}

interface Group {
  id: string;
  name: string;
  description: string | null;
  _count: { members: number; notebooks: number };
  owner: { name: string };
  hasUnread?: boolean;
}

const COLORS = {
  pageBg: '#1a1a36',
  cardBg: '#21213e',
  elevated: '#2d2d52',
  primary: '#ae89ff',
  deepPurple: '#884efb',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

function SkeletonCard() {
  return (
    <div
      style={{
        background: COLORS.cardBg,
        borderRadius: 16,
        padding: 24,
        border: `1px solid ${COLORS.border}`,
        minHeight: 140,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div className="groups-skeleton" style={{ width: '70%', height: 18, borderRadius: 8 }} />
      <div className="groups-skeleton" style={{ width: '90%', height: 14, borderRadius: 6 }} />
      <div className="groups-skeleton" style={{ width: '50%', height: 14, borderRadius: 6 }} />
      <div style={{ marginTop: 'auto', display: 'flex', gap: 16 }}>
        <div className="groups-skeleton" style={{ width: 50, height: 14, borderRadius: 6 }} />
        <div className="groups-skeleton" style={{ width: 50, height: 14, borderRadius: 6 }} />
      </div>
    </div>
  );
}

type CoWorkTab = 'groups' | 'classes' | 'dms';

const TABS: { key: CoWorkTab; label: string; icon: string }[] = [
  { key: 'groups', label: 'Study Groups', icon: 'groups' },
  { key: 'classes', label: 'Classes', icon: 'school' },
  { key: 'dms', label: 'Direct Messages', icon: 'chat' },
];

function ComingSoon({
  icon,
  title,
  description,
}: {
  icon: string;
  title: string;
  description: string;
}) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 12,
        padding: '100px 16px',
      }}
    >
      <span
        className="material-symbols-outlined"
        style={{ fontSize: 56, color: COLORS.textMuted, opacity: 0.5 }}
      >
        {icon}
      </span>
      <span style={{ fontSize: 20, fontWeight: 700, color: COLORS.textPrimary }}>{title}</span>
      <span
        style={{ fontSize: 14, color: COLORS.textSecondary, textAlign: 'center', maxWidth: 360 }}
      >
        {description}
      </span>
      <span
        style={{
          marginTop: 8,
          padding: '6px 16px',
          borderRadius: 9999,
          background: `${COLORS.primary}1a`,
          color: COLORS.primary,
          fontSize: 12,
          fontWeight: 700,
          letterSpacing: '0.05em',
        }}
      >
        COMING SOON
      </span>
    </div>
  );
}

export default function GroupsPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const { isPhone, isTablet } = useBreakpoint();
  const currentUserId = session?.user?.id || '';
  const [activeTab, setActiveTab] = useState<CoWorkTab>('groups');
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [hoveredCreate, setHoveredCreate] = useState(false);
  const [showDMModal, setShowDMModal] = useState(false);
  const [dms, setDms] = useState<
    Array<{ id: string; members: GroupMember[]; hasUnread?: boolean }>
  >([]);
  const [dmsLoading, setDmsLoading] = useState(false);
  const [invitations, setInvitations] = useState<
    Array<{
      id: string;
      groupId: string;
      group: { id: string; name: string; avatarUrl: string | null; memberCount: number };
      inviter: { id: string; name: string | null; username: string; avatarUrl: string | null };
    }>
  >([]);

  const fetchInvitations = useCallback(async () => {
    try {
      const res = await fetch('/api/groups/invitations');
      if (res.ok) {
        const json = await res.json();
        setInvitations(json.data || []);
      }
    } catch {
      /* ignore */
    }
  }, []);

  const handleAcceptInvite = useCallback(
    async (invitationId: string) => {
      const inv = invitations.find((i) => i.id === invitationId);
      if (!inv) return;
      try {
        const res = await fetch(`/api/groups/${inv.groupId}/invitations/${invitationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'accept' }),
        });
        if (res.ok) {
          setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
          fetchGroups();
        }
      } catch {
        /* ignore */
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [invitations]
  );

  const handleDeclineInvite = useCallback(
    async (invitationId: string) => {
      const inv = invitations.find((i) => i.id === invitationId);
      if (!inv) return;
      try {
        const res = await fetch(`/api/groups/${inv.groupId}/invitations/${invitationId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'decline' }),
        });
        if (res.ok) {
          setInvitations((prev) => prev.filter((i) => i.id !== invitationId));
        }
      } catch {
        /* ignore */
      }
    },
    [invitations]
  );

  const fetchDMs = useCallback(async () => {
    setDmsLoading(true);
    try {
      const res = await fetch('/api/groups?type=direct');
      if (res.ok) {
        const json = await res.json();
        const raw = json.data?.groups ?? [];
        type RawDm = { id: string; members?: GroupMember[]; hasUnread?: boolean };
        setDms(
          Array.isArray(raw)
            ? (raw as RawDm[]).map((g) => ({
                id: g.id,
                members: g.members || [],
                hasUnread: g.hasUnread,
              }))
            : []
        );
      }
    } catch {
      /* ignore */
    }
    setDmsLoading(false);
  }, []);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const typeParam = activeTab === 'classes' ? 'class' : 'study_group';
      const res = await fetch(`/api/groups?type=${typeParam}`);
      if (!res.ok) throw new Error('Failed to fetch groups');
      const data = await res.json();
      const raw = data.data?.groups ?? data.data ?? [];
      type RawGroup = Omit<Group, '_count'> & {
        _count?: Group['_count'];
        memberCount?: number;
        notebookCount?: number;
      };
      setGroups(
        Array.isArray(raw)
          ? (raw as RawGroup[]).map((g) => ({
              ...g,
              _count: g._count ?? {
                members: g.memberCount ?? 0,
                notebooks: g.notebookCount ?? 0,
              },
            }))
          : []
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'dms') {
      fetchDMs();
    } else {
      fetchGroups();
      fetchInvitations();
    }
  }, [activeTab, fetchGroups, fetchInvitations, fetchDMs]);

  return (
    <>
      <style>{`
        @keyframes groupsSkeleton {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .groups-skeleton {
          background: linear-gradient(
            90deg,
            ${COLORS.elevated} 25%,
            ${COLORS.cardBg} 50%,
            ${COLORS.elevated} 75%
          );
          background-size: 200% 100%;
          animation: groupsSkeleton 1.5s ease-in-out infinite;
        }
      `}</style>

      <div
        style={{
          padding: isPhone ? '16px' : isTablet ? '20px' : '32px 40px',
          maxWidth: 1200,
          margin: '0 auto',
          fontFamily: 'inherit',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: isPhone ? 'flex-start' : 'center',
            justifyContent: 'space-between',
            marginBottom: isPhone ? 16 : 24,
            flexDirection: isPhone ? 'column' : 'row',
            gap: isPhone ? 12 : 0,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: isPhone ? 22 : 28,
                fontWeight: 700,
                color: COLORS.textPrimary,
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              Co-Work
            </h1>
            <p
              style={{
                fontSize: 14,
                color: COLORS.textSecondary,
                margin: '6px 0 0',
              }}
            >
              Study groups, classes, and direct messages
            </p>
          </div>

          {(activeTab === 'groups' || activeTab === 'classes') && (
            <button
              onClick={() => setShowCreateModal(true)}
              onMouseEnter={() => setHoveredCreate(true)}
              onMouseLeave={() => setHoveredCreate(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                background: hoveredCreate ? COLORS.deepPurple : COLORS.primary,
                color: '#1a0040',
                fontSize: isPhone ? 13 : 14,
                fontWeight: 700,
                borderRadius: 12,
                padding: isPhone ? '10px 16px' : '12px 20px',
                border: 'none',
                cursor: 'pointer',
                transition: `background 0.2s ${EASING}, transform 0.15s ${EASING}`,
                transform: hoveredCreate ? 'scale(1.02)' : 'scale(1)',
                letterSpacing: '-0.01em',
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                add
              </span>
              {activeTab === 'classes' ? 'Create Class' : 'Create Group'}
            </button>
          )}
        </div>

        {/* Tab bar */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: isPhone ? 20 : 32,
            borderBottom: `1px solid ${COLORS.border}1a`,
            paddingBottom: 0,
            overflowX: isPhone ? 'auto' : undefined,
            WebkitOverflowScrolling: isPhone ? 'touch' : undefined,
            scrollbarWidth: isPhone ? 'none' : undefined,
          }}
        >
          {TABS.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  position: 'relative',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: isPhone ? '10px 14px' : '12px 20px',
                  paddingBottom: isPhone ? 12 : 14,
                  background: 'none',
                  border: 'none',
                  fontSize: isPhone ? 13 : 14,
                  fontWeight: active ? 700 : 500,
                  color: active ? COLORS.primary : COLORS.textMuted,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: `color 0.2s ${EASING}`,
                  whiteSpace: isPhone ? 'nowrap' : undefined,
                  flexShrink: isPhone ? 0 : undefined,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                  {tab.icon}
                </span>
                {tab.label}
                {active && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: -1,
                      left: 0,
                      width: '100%',
                      height: 2,
                      background: COLORS.primary,
                      borderRadius: 1,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* Tab content */}
        {activeTab === 'dms' && (
          <div>
            {/* DM Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 24,
              }}
            >
              <h3 style={{ fontSize: 16, fontWeight: 700, color: COLORS.textPrimary, margin: 0 }}>
                Your Conversations
              </h3>
              <button
                onClick={() => setShowDMModal(true)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  background: COLORS.primary,
                  color: '#1a0040',
                  border: 'none',
                  borderRadius: 12,
                  padding: '10px 20px',
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  transition: `transform 0.2s ${EASING}`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform = 'scale(1.03)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'scale(1)';
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  add
                </span>
                New Message
              </button>
            </div>

            {dmsLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {[1, 2, 3].map((i) => (
                  <div
                    key={i}
                    className="groups-skeleton"
                    style={{ height: 72, borderRadius: 14 }}
                  />
                ))}
              </div>
            ) : dms.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  padding: '80px 16px',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 56, color: COLORS.textMuted, opacity: 0.5 }}
                >
                  chat_bubble_outline
                </span>
                <span style={{ fontSize: 18, fontWeight: 600, color: COLORS.textPrimary }}>
                  No conversations yet
                </span>
                <span
                  style={{
                    fontSize: 14,
                    color: COLORS.textSecondary,
                    textAlign: 'center',
                    maxWidth: 320,
                  }}
                >
                  Start a message with a friend to begin collaborating
                </span>
                <button
                  onClick={() => setShowDMModal(true)}
                  style={{
                    marginTop: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: COLORS.primary,
                    color: '#1a0040',
                    fontSize: 14,
                    fontWeight: 700,
                    borderRadius: 12,
                    padding: '12px 20px',
                    border: 'none',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    chat
                  </span>
                  Start a Conversation
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {dms.map((dm) => {
                  const otherUser =
                    dm.members.find((m) => m.userId !== currentUserId) || dm.members[0];
                  if (!otherUser) return null;
                  return (
                    <DMCard
                      key={dm.id}
                      otherUser={otherUser}
                      hasUnread={dm.hasUnread}
                      onClick={() => router.push(`/groups/${dm.id}`)}
                    />
                  );
                })}
              </div>
            )}
          </div>
        )}

        {(activeTab === 'groups' || activeTab === 'classes') && (
          <>
            {/* Pending Invitations */}
            {invitations.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <h3
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    color: COLORS.primary,
                    marginBottom: 16,
                  }}
                >
                  Pending Invitations ({invitations.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {invitations.map((inv) => (
                    <GroupInvitationCard
                      key={inv.id}
                      invitation={inv}
                      onAccept={handleAcceptInvite}
                      onDecline={handleDeclineInvite}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Content */}
            {loading ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: isPhone ? 14 : 20,
                }}
              >
                {Array.from({ length: 6 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            ) : error ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  padding: '80px 16px',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 48, color: '#fd6f85' }}
                >
                  error
                </span>
                <span style={{ fontSize: 15, color: '#fd6f85' }}>{error}</span>
                <button
                  onClick={fetchGroups}
                  style={{
                    background: 'none',
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    color: COLORS.primary,
                    fontSize: 13,
                    fontWeight: 600,
                    padding: '8px 16px',
                    cursor: 'pointer',
                    transition: `border-color 0.2s ${EASING}`,
                  }}
                >
                  Retry
                </button>
              </div>
            ) : groups.length === 0 ? (
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 12,
                  padding: '80px 16px',
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: 56, color: COLORS.textMuted }}
                >
                  groups
                </span>
                <span
                  style={{
                    fontSize: 18,
                    fontWeight: 600,
                    color: COLORS.textPrimary,
                  }}
                >
                  {activeTab === 'classes' ? 'No classes yet' : 'No study groups yet'}
                </span>
                <span
                  style={{
                    fontSize: 14,
                    color: COLORS.textSecondary,
                    textAlign: 'center',
                    maxWidth: 320,
                  }}
                >
                  Create a group to start studying with friends
                </span>
                <button
                  onClick={() => setShowCreateModal(true)}
                  style={{
                    marginTop: 8,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    background: COLORS.primary,
                    color: '#1a0040',
                    fontSize: 14,
                    fontWeight: 700,
                    borderRadius: 12,
                    padding: '12px 20px',
                    border: 'none',
                    cursor: 'pointer',
                    transition: `background 0.2s ${EASING}`,
                  }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    add
                  </span>
                  {activeTab === 'classes' ? 'Create Your First Class' : 'Create Your First Group'}
                </button>
              </div>
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: isPhone ? '1fr' : 'repeat(auto-fill, minmax(240px, 1fr))',
                  gap: isPhone ? 14 : 20,
                }}
              >
                {groups.map((group) => (
                  <StudyGroupCard
                    key={group.id}
                    group={group}
                    hasUnread={group.hasUnread}
                    onClick={() => router.push(`/groups/${group.id}`)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <CreateGroupModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchGroups}
      />

      <StartDMModal open={showDMModal} onClose={() => setShowDMModal(false)} />
    </>
  );
}
