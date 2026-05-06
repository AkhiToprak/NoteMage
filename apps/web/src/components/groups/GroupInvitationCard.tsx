'use client';

import React, { useState } from 'react';

const COLORS = {
  cardBg: '#21213e',
  elevated: '#2d2d52',
  primary: '#ae89ff',
  deepPurple2: '#8348f6',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  error: '#fd6f85',
  success: '#4ade80',
  border: '#555578',
} as const;

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

interface Invitation {
  id: string;
  groupId: string;
  group: { id: string; name: string; avatarUrl: string | null; memberCount: number };
  inviter: { id: string; name: string | null; username: string; avatarUrl: string | null };
}

interface Props {
  invitation: Invitation;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
}

export default function GroupInvitationCard({ invitation, onAccept, onDecline }: Props) {
  const [acting, setActing] = useState(false);

  const handleAccept = async () => {
    setActing(true);
    onAccept(invitation.id);
  };

  const handleDecline = async () => {
    setActing(true);
    onDecline(invitation.id);
  };

  return (
    <div
      style={{
        background: COLORS.cardBg,
        borderRadius: 16,
        padding: 20,
        border: `1px dashed ${COLORS.primary}33`,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        opacity: acting ? 0.5 : 1,
        transition: `opacity 0.2s ${EASING}`,
      }}
    >
      {/* Group avatar */}
      {invitation.group.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={invitation.group.avatarUrl}
          alt=""
          style={{ width: 48, height: 48, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
        />
      ) : (
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 12,
            background: `linear-gradient(135deg, ${COLORS.primary}, ${COLORS.deepPurple2})`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 24, color: '#fff' }}>
            groups
          </span>
        </div>
      )}

      {/* Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <h4 style={{ fontSize: 15, fontWeight: 700, color: COLORS.textPrimary, marginBottom: 4 }}>
          {invitation.group.name}
        </h4>
        <p style={{ fontSize: 12, color: COLORS.textMuted }}>
          Invited by{' '}
          <span style={{ color: COLORS.primary, fontWeight: 600 }}>
            {invitation.inviter.name || invitation.inviter.username}
          </span>
          {' · '}
          {invitation.group.memberCount} member{invitation.group.memberCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={handleAccept}
          disabled={acting}
          style={{
            padding: '8px 20px',
            borderRadius: 10,
            border: 'none',
            background: `${COLORS.success}22`,
            color: COLORS.success,
            fontWeight: 700,
            fontSize: 13,
            cursor: acting ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            transition: `background 0.2s ${EASING}`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${COLORS.success}33`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `${COLORS.success}22`;
          }}
        >
          Accept
        </button>
        <button
          onClick={handleDecline}
          disabled={acting}
          style={{
            padding: '8px 20px',
            borderRadius: 10,
            border: 'none',
            background: `${COLORS.error}22`,
            color: COLORS.error,
            fontWeight: 700,
            fontSize: 13,
            cursor: acting ? 'wait' : 'pointer',
            fontFamily: 'inherit',
            transition: `background 0.2s ${EASING}`,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = `${COLORS.error}33`;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = `${COLORS.error}22`;
          }}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
