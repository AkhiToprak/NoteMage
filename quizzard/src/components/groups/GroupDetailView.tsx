'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import GroupChat from './GroupChat';
import GroupSharedContent from './GroupSharedContent';
import GroupMemberList from './GroupMemberList';
import GroupSettings from './GroupSettings';
import InviteMemberModal from './InviteMemberModal';

const COLORS = {
  pageBg: '#111126',
  cardBg: '#161630',
  elevated: '#232342',
  primary: '#ae89ff',
  deepPurple2: '#8348f6',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
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
}

interface GroupData {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  ownerId: string;
  owner: { id: string; name: string | null; username: string; avatarUrl: string | null };
  type: string;
  allowMemberChat: boolean;
  allowMemberSharing: boolean;
  allowMemberInvites: boolean;
  members: Member[];
  pendingInvites?: { id: string; invitee: { id: string; name: string | null; username: string; avatarUrl: string | null }; createdAt: string }[];
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
    } catch { /* ignore */ }
    setLoading(false);
  }, [groupId]);

  useEffect(() => { fetchGroup(); }, [fetchGroup]);

  // Mark group as read when opened
  useEffect(() => {
    if (!groupId) return;
    fetch(`/api/groups/${groupId}/read`, { method: 'POST' }).catch(() => {});
  }, [groupId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: COLORS.textMuted }}>
        <p style={{ fontSize: 14, fontWeight: 500 }}>Loading group...</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: COLORS.textMuted, gap: 12 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.4 }}>error_outline</span>
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

  // Filter tabs for DMs — only Chat and Shared
  const visibleTabs = isDM
    ? TABS.filter((t) => t.key === 'chat' || t.key === 'shared')
    : TABS;
  const leftTabs = visibleTabs.filter((t) => t.align === 'left');
  const rightTabs = visibleTabs.filter((t) => t.align === 'right');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Group header */}
      <div style={{
        padding: '8px 24px',
        display: 'flex', alignItems: 'center', gap: 10,
        borderBottom: `1px solid ${COLORS.border}1a`,
        background: `${COLORS.pageBg}cc`,
        backdropFilter: 'blur(20px)',
        flexShrink: 0,
      }}>
        <button
          onClick={() => router.push('/groups')}
          style={{
            width: 28, height: 28, borderRadius: 8,
            background: 'transparent', border: 'none',
            color: COLORS.textMuted, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
            transition: `color 0.2s ${EASING}`,
          }}
          onMouseEnter={(e) => (e.currentTarget.style.color = COLORS.textPrimary)}
          onMouseLeave={(e) => (e.currentTarget.style.color = COLORS.textMuted)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>arrow_back</span>
        </button>
        {/* Avatar: DM shows other user's pic (circular), groups show group icon */}
        {isDM && otherUser ? (
          otherUser.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={otherUser.avatarUrl} alt="" style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple2})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 14, fontWeight: 700, color: '#fff',
            }}>
              {(otherUser.name?.[0] || otherUser.username[0] || '?').toUpperCase()}
            </div>
          )
        ) : (
          group.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={group.avatarUrl} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple2})`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: '#fff' }}>groups</span>
            </div>
          )
        )}
        <div>
          <h1 style={{ fontSize: 14, fontWeight: 700, color: COLORS.textPrimary, letterSpacing: '-0.02em', margin: 0 }}>
            {isDM && otherUser ? (otherUser.name || otherUser.username) : group.name}
          </h1>
          {!isDM && (
            <p style={{ fontSize: 11, color: COLORS.textMuted, margin: 0 }}>{group.members.length} member{group.members.length !== 1 ? 's' : ''}</p>
          )}
        </div>
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 0,
        padding: '0 24px',
        background: `${COLORS.cardBg}80`,
        backdropFilter: 'blur(12px)',
        borderBottom: `1px solid ${COLORS.border}1a`,
        flexShrink: 0,
      }}>
        {/* Left tabs */}
        <div style={{ display: 'flex', gap: 32 }}>
          {leftTabs.map((tab) => {
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  position: 'relative', padding: '18px 0',
                  background: 'none', border: 'none',
                  fontSize: 15, fontWeight: active ? 700 : 600,
                  color: active ? COLORS.primary : COLORS.textMuted,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: `color 0.2s ${EASING}`,
                }}
              >
                {tab.icon && <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{tab.icon}</span>}
                {tab.label}
                {active && (
                  <span style={{
                    position: 'absolute', bottom: 0, left: 0, width: '100%', height: 2,
                    background: COLORS.primary, borderRadius: 1,
                  }} />
                )}
              </button>
            );
          })}
        </div>

        <div style={{ flex: 1 }} />

        {/* Right tabs */}
        <div style={{ display: 'flex', gap: 32 }}>
          {rightTabs.map((tab) => {
            // Hide settings from non-admin
            if (tab.key === 'settings' && !isAdminOrOwner) return null;
            const active = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                style={{
                  position: 'relative', padding: '18px 0',
                  background: 'none', border: 'none',
                  fontSize: 15, fontWeight: active ? 700 : 600,
                  color: active ? COLORS.primary : COLORS.textMuted,
                  cursor: 'pointer', fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', gap: 8,
                  transition: `color 0.2s ${EASING}`,
                }}
              >
                {tab.icon && <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{tab.icon}</span>}
                {tab.label}
                {active && (
                  <span style={{
                    position: 'absolute', bottom: 0, left: 0, width: '100%', height: 2,
                    background: COLORS.primary, borderRadius: 1,
                  }} />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, minHeight: 0, overflow: activeTab === 'chat' ? 'hidden' : 'auto' }} className="custom-scrollbar">
        {activeTab === 'chat' && (
          <GroupChat groupId={groupId} groupName={group?.name || ''} currentUserId={currentUserId} canChat={canChat} />
        )}
        {activeTab === 'shared' && (
          <GroupSharedContent groupId={groupId} groupName={group?.name || ''} currentUserId={currentUserId} userRole={userRole} canShare={canShare} />
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
