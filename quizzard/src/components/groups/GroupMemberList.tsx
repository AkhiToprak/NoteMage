'use client';

import React, { useState, useEffect, useCallback } from 'react';

const COLORS = {
  pageBg: '#111126',
  cardBg: '#161630',
  elevated: '#232342',
  inputBg: '#2a2a4c',
  primary: '#ae89ff',
  deepPurple: '#884efb',
  deepPurple2: '#8348f6',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  error: '#fd6f85',
  success: '#4ade80',
  yellow: '#ffde59',
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

interface PendingInvite {
  id: string;
  invitee: { id: string; name: string | null; username: string; avatarUrl: string | null };
  createdAt: string;
}

interface Props {
  groupId: string;
  currentUserId: string;
  userRole: string;
  members: Member[];
  onRefresh: () => void;
  onInviteClick: () => void;
}

const ROLE_BADGES: Record<string, { label: string; bg: string; color: string }> = {
  owner: { label: 'Owner', bg: `${COLORS.primary}33`, color: COLORS.primary },
  admin: { label: 'Admin', bg: '#be99ff33', color: '#be99ff' },
};

export default function GroupMemberList({ groupId, currentUserId, userRole, members, onRefresh, onInviteClick }: Props) {
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([]);
  const [menuOpen, setMenuOpen] = useState<string | null>(null);

  const isAdminOrOwner = userRole === 'owner' || userRole === 'admin';

  // Fetch pending invitations
  useEffect(() => {
    if (!isAdminOrOwner) return;
    (async () => {
      try {
        const res = await fetch(`/api/groups/${groupId}/invitations`);
        if (res.ok) {
          const json = await res.json();
          setPendingInvites(json.data || []);
        }
      } catch { /* ignore */ }
    })();
  }, [groupId, isAdminOrOwner]);

  const handleRoleChange = useCallback(async (targetUserId: string, role: string) => {
    setMenuOpen(null);
    try {
      await fetch(`/api/groups/${groupId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: targetUserId, role }),
      });
      onRefresh();
    } catch { /* ignore */ }
  }, [groupId, onRefresh]);

  const handleKick = useCallback(async (targetUserId: string) => {
    setMenuOpen(null);
    if (!window.confirm('Remove this member from the group?')) return;
    try {
      await fetch(`/api/groups/${groupId}/members/${targetUserId}`, { method: 'DELETE' });
      onRefresh();
    } catch { /* ignore */ }
  }, [groupId, onRefresh]);

  const acceptedMembers = members.filter(m => m.role !== undefined);
  const activeCount = acceptedMembers.length;

  return (
    <div style={{ padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-end', gap: 16, marginBottom: 32 }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800, color: COLORS.textPrimary, letterSpacing: '-0.02em' }}>Members</h2>
          <p style={{ fontSize: 14, color: COLORS.textSecondary, marginTop: 4, fontWeight: 500 }}>
            Manage study group access, roles, and pending invitations.
          </p>
        </div>
        {isAdminOrOwner && (
          <button
            onClick={onInviteClick}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              background: COLORS.yellow, color: '#5f4f00', border: 'none',
              borderRadius: 12, padding: '12px 24px', fontWeight: 700, fontSize: 14,
              cursor: 'pointer', fontFamily: 'inherit',
              boxShadow: `0 8px 24px rgba(255,222,89,0.15)`,
              transition: `transform 0.2s ${EASING}`,
            }}
            onMouseEnter={(e) => { (e.currentTarget).style.transform = 'scale(1.03)'; }}
            onMouseLeave={(e) => { (e.currentTarget).style.transform = 'scale(1)'; }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>person_add</span>
            Invite Member
          </button>
        )}
      </div>

      {/* Member list */}
      <div style={{
        background: COLORS.cardBg, borderRadius: 16, overflow: 'hidden',
        border: `1px solid ${COLORS.border}1a`,
      }}>
        {/* List header */}
        <div style={{
          padding: '16px 24px',
          borderBottom: `1px solid ${COLORS.border}1a`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: COLORS.deepPurple }}>All Members</span>
          <span style={{ fontSize: 12, fontWeight: 700, color: COLORS.textMuted }}>{activeCount} Active</span>
        </div>

        {/* Rows */}
        {acceptedMembers.map((member, idx) => {
          const badge = ROLE_BADGES[member.role];
          const isMenuOpen = menuOpen === member.userId;
          const canManage = userRole === 'owner' && member.userId !== currentUserId && member.role !== 'owner';

          return (
            <div
              key={member.userId}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '20px 24px',
                borderBottom: idx < acceptedMembers.length - 1 ? `1px solid ${COLORS.border}1a` : 'none',
                transition: `background 0.15s ${EASING}`,
              }}
              onMouseEnter={(e) => { (e.currentTarget).style.background = `${COLORS.elevated}80`; }}
              onMouseLeave={(e) => { (e.currentTarget).style.background = 'transparent'; setMenuOpen(null); }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                {member.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={member.avatarUrl} alt="" style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover' }} />
                ) : (
                  <div style={{
                    width: 48, height: 48, borderRadius: 12,
                    background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple2})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 18, fontWeight: 700, color: '#fff',
                  }}>
                    {(member.name?.[0] || member.username[0] || '?').toUpperCase()}
                  </div>
                )}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <h4 style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary }}>{member.name || member.username}</h4>
                  {badge && (
                    <span style={{
                      fontSize: 10, fontWeight: 700, padding: '2px 10px',
                      background: badge.bg, color: badge.color, borderRadius: 9999,
                      textTransform: 'uppercase', letterSpacing: '0.08em',
                    }}>
                      {badge.label}
                    </span>
                  )}
                </div>
              </div>

              {/* Actions menu */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={() => setMenuOpen(isMenuOpen ? null : member.userId)}
                  style={{
                    background: 'none', border: 'none', padding: 8, cursor: 'pointer',
                    color: COLORS.textMuted, borderRadius: 8,
                    transition: `color 0.15s ${EASING}`,
                  }}
                  onMouseEnter={(e) => { (e.currentTarget).style.color = COLORS.textPrimary; }}
                  onMouseLeave={(e) => { (e.currentTarget).style.color = COLORS.textMuted; }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 20 }}>more_vert</span>
                </button>

                {isMenuOpen && canManage && (
                  <div style={{
                    position: 'absolute', right: 0, top: '100%', zIndex: 50,
                    background: COLORS.elevated, borderRadius: 12, padding: 8,
                    minWidth: 180, boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
                    border: `1px solid ${COLORS.border}33`,
                  }}>
                    {member.role === 'member' && (
                      <button onClick={() => handleRoleChange(member.userId, 'admin')} style={menuItemStyle}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>shield</span>
                        Promote to Admin
                      </button>
                    )}
                    {member.role === 'admin' && (
                      <button onClick={() => handleRoleChange(member.userId, 'member')} style={menuItemStyle}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person</span>
                        Demote to Member
                      </button>
                    )}
                    <button onClick={() => handleKick(member.userId)} style={{ ...menuItemStyle, color: COLORS.error }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_remove</span>
                      Remove from Group
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Pending invitations */}
      {isAdminOrOwner && pendingInvites.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: COLORS.textMuted, marginBottom: 16 }}>
            Pending Invitations ({pendingInvites.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {pendingInvites.map((inv) => (
              <div key={inv.id} style={{
                display: 'flex', alignItems: 'center', gap: 16,
                padding: '16px 24px', background: COLORS.cardBg, borderRadius: 12,
                border: `1px dashed ${COLORS.border}33`,
              }}>
                {inv.invitee.avatarUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={inv.invitee.avatarUrl} alt="" style={{ width: 36, height: 36, borderRadius: 10, objectFit: 'cover' }} />
                ) : (
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple2})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, color: '#fff',
                  }}>
                    {(inv.invitee.name?.[0] || inv.invitee.username[0] || '?').toUpperCase()}
                  </div>
                )}
                <div>
                  <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.textPrimary }}>{inv.invitee.name || inv.invitee.username}</span>
                  <span style={{ fontSize: 12, color: COLORS.textMuted, marginLeft: 8 }}>Pending...</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const menuItemStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 10, width: '100%',
  padding: '10px 12px', background: 'none', border: 'none',
  color: '#e5e3ff', fontSize: 13, fontWeight: 600, cursor: 'pointer',
  borderRadius: 8, fontFamily: 'inherit', textAlign: 'left',
};
