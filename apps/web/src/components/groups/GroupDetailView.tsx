'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import GroupChat from './GroupChat';
import GroupSharedContent from './GroupSharedContent';
import GroupMemberList from './GroupMemberList';
import GroupSettings from './GroupSettings';
import InviteMemberModal from './InviteMemberModal';
import TimerWidget from '@/components/layout/TimerWidget';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';

const COLORS = {
  pageBg: 'var(--background)',
  cardBg: 'var(--surface-container)',
  elevated: 'var(--surface-container-high)',
  primary: '#ae89ff',
  deepPurple2: '#8348f6',
  textPrimary: 'var(--on-surface)',
  textSecondary: 'var(--on-surface-variant)',
  textMuted: 'var(--outline)',
  border: 'var(--outline-variant)',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

interface Member {
  id: string;
  userId: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
  role: string;
  joinedAt: string;
  nameStyle?: { fontId?: string; colorId?: string } | null;
  equippedFrameId?: string | null;
  equippedTitleId?: string | null;
}

interface BasicUser {
  id: string;
  name: string | null;
  username: string;
  avatarUrl: string | null;
  nameStyle?: { fontId?: string; colorId?: string } | null;
  equippedFrameId?: string | null;
  equippedTitleId?: string | null;
}

interface GroupData {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  ownerId: string;
  owner: BasicUser;
  type: string;
  allowMemberChat: boolean;
  allowMemberSharing: boolean;
  allowMemberInvites: boolean;
  members: Member[];
  pendingInvites?: { id: string; invitee: BasicUser; createdAt: string }[];
  createdAt: string;
  updatedAt: string;
}

type TabKey = 'chat' | 'shared' | 'members' | 'settings';

const TABS: { key: TabKey; label: string; icon?: string; align: 'left' | 'right' }[] = [
  { key: 'chat', label: 'Chat', align: 'left' },
  { key: 'shared', label: 'Shared', align: 'left' },
  { key: 'members', label: 'Members', icon: 'group', align: 'right' },
  { key: 'settings', label: 'Settings', icon: 'settings', align: 'right' },
];

interface Props {
  groupId: string;
}

export default function GroupDetailView({ groupId }: Props) {
  const router = useRouter();
  const { data: session } = useSession();
  const { isPhone } = useBreakpoint();
  const [group, setGroup] = useState<GroupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('chat');
  const [inviteOpen, setInviteOpen] = useState(false);

  const currentUserId = session?.user?.id || '';

  const fetchGroup = useCallback(async () => {
    try {
      const res = await fetch(`/api/groups/${groupId}`);
      if (res.ok) {
        const json = await res.json();
        setGroup(json.data);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [groupId]);

  // Defer fetchGroup() into a microtask so its leading setLoading state
  // updates don't fire synchronously inside the effect body
  // (react-hooks/set-state-in-effect). fetchGroup itself is still needed
  // as a callable below — children call it to refresh after edits.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void fetchGroup();
    });
    return () => {
      cancelled = true;
    };
  }, [fetchGroup]);

  // Mark group as read when opened
  useEffect(() => {
    if (!groupId) return;
    fetch(`/api/groups/${groupId}/read`, { method: 'POST' }).catch(() => {});
  }, [groupId]);

  if (loading) {
    return (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: COLORS.textMuted,
        }}
      >
        <p style={{ fontSize: 14, fontWeight: 500 }}>Loading group...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          height: '100%',
          color: COLORS.textMuted,
          gap: 12,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.4 }}>
          error_outline
        </span>
        <p style={{ fontSize: 14, fontWeight: 500 }}>Group not found or access denied</p>
      </div>
    );
  }

  const currentMember = group.members.find((m) => m.userId === currentUserId);
  const userRole = currentMember?.role || 'member';
  const isAdminOrOwner = userRole === 'owner' || userRole === 'admin' || userRole === 'teacher';

  // Compute permissions — teachers/owners/admins always bypass
  const isPrivileged = ['owner', 'admin', 'teacher'].includes(userRole);
  const canChat = isPrivileged || group.type !== 'class' || group.allowMemberChat;
  const canShare = isPrivileged || group.type !== 'class' || group.allowMemberSharing;
  const canInvite = isPrivileged || group.type !== 'class' || group.allowMemberInvites;

  const isDM = group.type === 'direct';
  const otherUser = isDM ? group.members.find((m) => m.userId !== currentUserId) : null;

  // Filter tabs for DMs (Chat + Shared only) and hide Settings from non-admins
  // up front so the phone equal-width flex weighting matches what actually renders.
  const visibleTabs = (
    isDM ? TABS.filter((t) => t.key === 'chat' || t.key === 'shared') : TABS
  ).filter((t) => t.key !== 'settings' || isAdminOrOwner);
  const leftTabs = visibleTabs.filter((t) => t.align === 'left');
  const rightTabs = visibleTabs.filter((t) => t.align === 'right');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Group header */}
      <div
        style={{
          padding: isPhone ? '8px 12px' : '8px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: isPhone ? 8 : 10,
          borderBottom: `1px solid color-mix(in srgb, ${COLORS.border} 10%, transparent)`,
          background: `color-mix(in srgb, ${COLORS.pageBg} 80%, transparent)`,
          backdropFilter: 'blur(20px)',
          flexShrink: 0,
          position: 'relative',
          zIndex: 10,
        }}
      >
        <button
          onClick={() => router.push('/groups')}
          style={{
            width: 28,
            height: 28,
            borderRadius: 8,
            background: 'transparent',
            border: 'none',
            color: COLORS.textMuted,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: `color 0.2s ${EASING}`,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.textPrimary)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textMuted)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
            arrow_back
          </span>
        </button>
        {/* Avatar + title block: for DMs the whole identity row is clickable */}
        {isDM && otherUser ? (
          <button
            type="button"
            onClick={() => router.push(`/profile/${encodeURIComponent(otherUser.username)}`)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: isPhone ? 8 : 10,
              flex: 1,
              minWidth: 0,
              background: 'transparent',
              border: 'none',
              padding: 0,
              margin: 0,
              textAlign: 'left',
              cursor: 'pointer',
            }}
            title={`Open @${otherUser.username} profile`}
          >
            <UserAvatar user={otherUser} size={32} radius="50%" />
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.textPrimary,
                  letterSpacing: '-0.02em',
                  margin: 0,
                }}
              >
                <UserName
                  user={otherUser}
                  as="span"
                  style={{
                    fontSize: 14,
                    fontWeight: 700,
                    color: COLORS.textPrimary,
                    letterSpacing: '-0.02em',
                  }}
                />
              </h1>
            </div>
          </button>
        ) : (
          <>
            {group.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={group.avatarUrl}
                alt=""
                style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 8,
                  background: COLORS.primary,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>
                  groups
                </span>
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h1
                style={{
                  fontSize: 14,
                  fontWeight: 700,
                  color: COLORS.textPrimary,
                  letterSpacing: '-0.02em',
                  margin: 0,
                }}
              >
                {group.name}
              </h1>
              <p style={{ fontSize: 11, color: COLORS.textMuted, margin: 0 }}>
                {group.members.length} member{group.members.length !== 1 ? 's' : ''}
              </p>
            </div>
          </>
        )}
        <TimerWidget />
      </div>

      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 0,
          padding: isPhone ? '0 12px' : '0 24px',
          background: `color-mix(in srgb, ${COLORS.cardBg} 50%, transparent)`,
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid color-mix(in srgb, ${COLORS.border} 10%, transparent)`,
          flexShrink: 0,
        }}
      >
        {/* Left tabs — on phone every tab is equal-width so the bar never scrolls sideways */}
        <div
          style={{
            display: 'flex',
            gap: isPhone ? 0 : 32,
            flex: isPhone ? leftTabs.length : undefined,
          }}
        >
          {leftTabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  position: 'relative',
                  padding: isPhone ? '14px 0' : '18px 0',
                  background: 'none',
                  border: 'none',
                  fontSize: isPhone ? 13 : 15,
                  fontWeight: active ? 700 : 600,
                  color: active ? COLORS.primary : COLORS.textMuted,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: isPhone ? 1 : undefined,
                  minWidth: 0,
                  gap: isPhone ? 4 : 8,
                  transition: `color 0.2s ${EASING}`,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {tab.icon && (
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    {tab.icon}
                  </span>
                )}
                {tab.label}
                {active && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 0,
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

        {/* Spacer pushes the right tabs to the edge on desktop; on phone the tabs
            fill the bar evenly instead, so it's hidden. */}
        <div style={{ flex: isPhone ? undefined : 1, display: isPhone ? 'none' : 'block' }} />

        {/* Right tabs */}
        <div
          style={{
            display: 'flex',
            gap: isPhone ? 0 : 32,
            flex: isPhone ? rightTabs.length : undefined,
          }}
        >
          {rightTabs.map((tab) => {
            // Hide settings from non-admin
            if (tab.key === 'settings' && !isAdminOrOwner) return null;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  position: 'relative',
                  padding: isPhone ? '14px 0' : '18px 0',
                  background: 'none',
                  border: 'none',
                  fontSize: isPhone ? 13 : 15,
                  fontWeight: active ? 700 : 600,
                  color: active ? COLORS.primary : COLORS.textMuted,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flex: isPhone ? 1 : undefined,
                  minWidth: 0,
                  gap: isPhone ? 4 : 8,
                  transition: `color 0.2s ${EASING}`,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                {tab.icon && (
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                    {tab.icon}
                  </span>
                )}
                {tab.label}
                {active && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 0,
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
      </div>

      {/* Tab content */}
      <div
        style={{ flex: 1, minHeight: 0, overflow: activeTab === 'chat' ? 'hidden' : 'auto' }}
        className="custom-scrollbar"
      >
        {activeTab === 'chat' && (
          <GroupChat
            groupId={groupId}
            groupName={group?.name || ''}
            currentUserId={currentUserId}
            canChat={canChat}
            isDirectMessage={isDM}
          />
        )}
        {activeTab === 'shared' && (
          <GroupSharedContent
            groupId={groupId}
            groupName={group?.name || ''}
            currentUserId={currentUserId}
            userRole={userRole}
            canShare={canShare}
          />
        )}
        {activeTab === 'members' && (
          <GroupMemberList
            groupId={groupId}
            currentUserId={currentUserId}
            userRole={userRole}
            members={group.members}
            pendingInvites={group.pendingInvites || []}
            onRefresh={fetchGroup}
            onInviteClick={() => setInviteOpen(true)}
            canInvite={canInvite}
          />
        )}
        {activeTab === 'settings' && isAdminOrOwner && (
          <GroupSettings
            groupId={groupId}
            group={group}
            currentUserId={currentUserId}
            userRole={userRole}
            onUpdated={fetchGroup}
          />
        )}
      </div>

      {/* Invite modal (not for DMs) */}
      {!isDM && (
        <InviteMemberModal
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          groupId={groupId}
          existingMemberIds={group.members.map((m) => m.userId)}
        />
      )}
    </div>
  );
}
