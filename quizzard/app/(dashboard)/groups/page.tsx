'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import StudyGroupCard from '@/components/social/StudyGroupCard';
import CreateGroupModal from '@/components/social/CreateGroupModal';
import GroupInvitationCard from '@/components/groups/GroupInvitationCard';

interface Group {
  id: string;
  name: string;
  description: string | null;
  _count: { members: number; notebooks: number };
  owner: { name: string };
}

const COLORS = {
  pageBg: '#111126',
  cardBg: '#161630',
  elevated: '#232342',
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

export default function GroupsPage() {
  const router = useRouter();
  const [groups, setGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [hoveredCreate, setHoveredCreate] = useState(false);
  const [invitations, setInvitations] = useState<Array<{
    id: string;
    groupId: string;
    group: { id: string; name: string; avatarUrl: string | null; memberCount: number };
    inviter: { id: string; name: string | null; username: string; avatarUrl: string | null };
  }>>([]);

  const fetchInvitations = useCallback(async () => {
    try {
      const res = await fetch('/api/groups/invitations');
      if (res.ok) {
        const json = await res.json();
        setInvitations(json.data || []);
      }
    } catch { /* ignore */ }
  }, []);

  const handleAcceptInvite = useCallback(async (invitationId: string) => {
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
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invitations]);

  const handleDeclineInvite = useCallback(async (invitationId: string) => {
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
    } catch { /* ignore */ }
  }, [invitations]);

  const fetchGroups = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/groups');
      if (!res.ok) throw new Error('Failed to fetch groups');
      const data = await res.json();
      setGroups(data.data ?? data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGroups();
    fetchInvitations();
  }, [fetchGroups, fetchInvitations]);

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
          padding: '32px 40px',
          maxWidth: 1200,
          margin: '0 auto',
          fontFamily: 'inherit',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 32,
          }}
        >
          <div>
            <h1
              style={{
                fontSize: 28,
                fontWeight: 700,
                color: COLORS.textPrimary,
                margin: 0,
                letterSpacing: '-0.02em',
              }}
            >
              Study Groups
            </h1>
            <p
              style={{
                fontSize: 14,
                color: COLORS.textSecondary,
                margin: '6px 0 0',
              }}
            >
              Collaborate and learn together
            </p>
          </div>

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
              fontSize: 14,
              fontWeight: 700,
              borderRadius: 12,
              padding: '12px 20px',
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
            Create Group
          </button>
        </div>

        {/* Pending Invitations */}
        {invitations.length > 0 && (
          <div style={{ marginBottom: 32 }}>
            <h3 style={{
              fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.1em', color: COLORS.primary,
              marginBottom: 16,
            }}>
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
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 20,
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
            <span className="material-symbols-outlined" style={{ fontSize: 48, color: '#fd6f85' }}>
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
              No study groups yet
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
              Create Your First Group
            </button>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: 20,
            }}
          >
            {groups.map((group) => (
              <StudyGroupCard
                key={group.id}
                group={group}
                onClick={() => router.push(`/groups/${group.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      <CreateGroupModal
        open={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreated={fetchGroups}
      />
    </>
  );
}
