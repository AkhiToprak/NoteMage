'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';

interface Invitation {
  id: string;
  groupId: string;
  status: string;
  createdAt: string;
  group: {
    id: string;
    name: string;
    description: string | null;
    avatarUrl: string | null;
    memberCount: number;
  };
  inviter: {
    id: string;
    name: string | null;
    username: string;
    avatarUrl: string | null;
  };
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

export default function GroupInvitePage() {
  const params = useParams();
  const router = useRouter();
  const groupId = params.groupId as string;

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [acting, setActing] = useState(false);
  const [hoveredAccept, setHoveredAccept] = useState(false);
  const [hoveredDecline, setHoveredDecline] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/groups/invitations');
        if (!res.ok) {
          setNotFound(true);
          return;
        }
        const json = await res.json();
        const invitations: Invitation[] = json.data || [];
        const match = invitations.find((inv) => inv.groupId === groupId);
        if (match) {
          setInvitation(match);
        } else {
          setNotFound(true);
        }
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    })();
  }, [groupId]);

  const handleAction = async (action: 'accept' | 'decline') => {
    if (!invitation || acting) return;
    setActing(true);
    try {
      const res = await fetch(`/api/groups/${invitation.groupId}/invitations/${invitation.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error();

      if (action === 'accept') {
        router.push(`/groups/${invitation.groupId}`);
      } else {
        router.push('/groups');
      }
    } catch {
      setActing(false);
    }
  };

  if (loading) {
    return (
      <div
        style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 48, color: '#ae89ff', animation: 'spin 1s linear infinite' }}
        >
          progress_activity
        </span>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  if (notFound || !invitation) {
    return (
      <div style={{ textAlign: 'center', padding: '64px 24px', color: '#aaa8c8' }}>
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 64, display: 'block', marginBottom: 16, opacity: 0.4 }}
        >
          mail_off
        </span>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#e5e3ff', margin: '0 0 8px' }}>
          No Invitation Found
        </h2>
        <p style={{ fontSize: 14, margin: '0 0 24px' }}>
          This invitation may have already been accepted or expired.
        </p>
        <button
          onClick={() => router.push('/groups')}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 24px',
            background: 'rgba(174,137,255,0.15)',
            color: '#ae89ff',
            borderRadius: 12,
            border: '1px solid rgba(174,137,255,0.25)',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
            arrow_back
          </span>
          Back to Groups
        </button>
      </div>
    );
  }

  const { group, inviter } = invitation;
  const initial = group.name[0]?.toUpperCase() || '?';

  return (
    <div style={{ maxWidth: 480, margin: '0 auto', padding: '40px 16px' }}>
      <div
        style={{
          background: '#21213e',
          borderRadius: 24,
          padding: '40px 32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: 20,
        }}
      >
        {/* Group avatar */}
        {group.avatarUrl ? (
          <img
            src={group.avatarUrl}
            alt={group.name}
            style={{ width: 80, height: 80, borderRadius: 20, objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: 20,
              background: 'linear-gradient(135deg, #ae89ff 0%, #8348f6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 32,
              fontWeight: 700,
              color: '#fff',
            }}
          >
            {initial}
          </div>
        )}

        {/* Group name */}
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#e5e3ff', margin: 0 }}>{group.name}</h1>

        {/* Description */}
        {group.description && (
          <p style={{ fontSize: 14, color: '#aaa8c8', margin: 0, lineHeight: 1.6 }}>
            {group.description}
          </p>
        )}

        {/* Meta info */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: 16, color: '#8888a8', fontSize: 13 }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
              group
            </span>
            {group.memberCount} {group.memberCount === 1 ? 'member' : 'members'}
          </span>
        </div>

        {/* Invited by */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            background: '#272746',
            borderRadius: 12,
            fontSize: 13,
            color: '#aaa8c8',
          }}
        >
          {inviter.avatarUrl ? (
            <img
              src={inviter.avatarUrl}
              alt=""
              style={{ width: 24, height: 24, borderRadius: '50%', objectFit: 'cover' }}
            />
          ) : (
            <div
              style={{
                width: 24,
                height: 24,
                borderRadius: '50%',
                background: 'linear-gradient(135deg, #ae89ff 0%, #8348f6 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 11,
                fontWeight: 700,
                color: '#fff',
              }}
            >
              {(inviter.username[0] || '?').toUpperCase()}
            </div>
          )}
          <span>
            Invited by{' '}
            <strong style={{ color: '#e5e3ff', fontWeight: 600 }}>
              {inviter.name || inviter.username}
            </strong>
          </span>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 12, width: '100%', marginTop: 8 }}>
          <button
            onClick={() => handleAction('decline')}
            disabled={acting}
            onMouseEnter={() => setHoveredDecline(true)}
            onMouseLeave={() => setHoveredDecline(false)}
            style={{
              flex: 1,
              padding: '14px 0',
              borderRadius: 14,
              border: '1px solid #555578',
              background: hoveredDecline ? 'rgba(253,111,133,0.1)' : 'transparent',
              color: hoveredDecline ? '#fd6f85' : '#aaa8c8',
              fontSize: 15,
              fontWeight: 600,
              cursor: acting ? 'not-allowed' : 'pointer',
              opacity: acting ? 0.5 : 1,
              fontFamily: 'inherit',
              transition: `background 0.2s ${EASING}, color 0.2s ${EASING}, opacity 0.2s ${EASING}`,
            }}
          >
            Decline
          </button>
          <button
            onClick={() => handleAction('accept')}
            disabled={acting}
            onMouseEnter={() => setHoveredAccept(true)}
            onMouseLeave={() => setHoveredAccept(false)}
            style={{
              flex: 1,
              padding: '14px 0',
              borderRadius: 14,
              border: 'none',
              background: hoveredAccept ? '#8348f6' : '#ae89ff',
              color: '#1a0040',
              fontSize: 15,
              fontWeight: 600,
              cursor: acting ? 'not-allowed' : 'pointer',
              opacity: acting ? 0.5 : 1,
              fontFamily: 'inherit',
              transition: `background 0.2s ${EASING}, opacity 0.2s ${EASING}`,
            }}
          >
            {acting ? 'Joining...' : 'Accept & Join'}
          </button>
        </div>
      </div>
    </div>
  );
}
