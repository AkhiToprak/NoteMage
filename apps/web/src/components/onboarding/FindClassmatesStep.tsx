'use client';

import { useCallback, useState } from 'react';
import { UserName } from '@/components/user/UserName';
import { UserAvatar } from '@/components/user/UserAvatar';

export interface ClassmatePeer {
  id: string;
  username: string;
  name: string | null;
  avatarUrl: string | null;
  nameStyle?: { fontId?: string; colorId?: string } | null;
  equippedTitleId?: string | null;
  equippedFrameId?: string | null;
  friendshipStatus: 'none' | 'pending_sent' | 'pending_received' | 'accepted';
}

interface FindClassmatesStepProps {
  /** Peers prefetched by the wizard once the user picked a school. */
  peers: ClassmatePeer[];
  /** School name for the subheading. */
  school: string;
}

/**
 * Onboarding screen 8 — "Mages from your school". Only shown when the school
 * step turned up at least one other user; the wizard skips this screen
 * entirely otherwise. Each row has an inline Add button that fires the
 * existing /api/friends/request endpoint; status updates land in place so
 * the user can scan the list once and pick a few classmates without leaving.
 */
export default function FindClassmatesStep({ peers, school }: FindClassmatesStepProps) {
  const [rows, setRows] = useState<ClassmatePeer[]>(peers);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [hoveredRow, setHoveredRow] = useState<string | null>(null);
  const [hoveredAdd, setHoveredAdd] = useState<Record<string, boolean>>({});

  const sendRequest = useCallback(async (userId: string) => {
    setBusy((b) => ({ ...b, [userId]: true }));
    try {
      const res = await fetch('/api/friends/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!res.ok) {
        // Leave row as 'none' so the user can retry on the next click.
        return;
      }
      const json = await res.json().catch(() => null);
      const autoAccepted = json?.data?.friendship?.autoAccepted === true;
      setRows((prev) =>
        prev.map((r) =>
          r.id === userId
            ? { ...r, friendshipStatus: autoAccepted ? 'accepted' : 'pending_sent' }
            : r,
        ),
      );
    } finally {
      setBusy((b) => ({ ...b, [userId]: false }));
    }
  }, []);

  return (
    <div>
      <p style={{ fontSize: '13px', color: 'var(--on-surface-variant)', margin: '0 0 14px' }}>
        Other mages from{' '}
        <strong style={{ color: 'var(--on-surface)' }}>{school}</strong>. Add anyone you know.
      </p>
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          maxHeight: '320px',
          overflowY: 'auto',
        }}
      >
        {rows.map((peer) => {
          const isBusy = busy[peer.id] === true;
          return (
            <li
              key={peer.id}
              onMouseEnter={() => setHoveredRow(peer.id)}
              onMouseLeave={() => setHoveredRow(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background:
                  hoveredRow === peer.id ? 'var(--surface-container-high)' : 'transparent',
                transition: 'background 0.15s cubic-bezier(0.22,1,0.36,1)',
              }}
            >
              <UserAvatar user={peer} size={40} radius="50%" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <UserName
                  as="div"
                  user={peer}
                  preferUsername
                  style={{
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--on-surface)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                />
                {peer.name && (
                  <div
                    style={{
                      fontSize: '12px',
                      color: 'var(--on-surface-variant)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {peer.name}
                  </div>
                )}
              </div>
              <ActionButton
                peer={peer}
                isBusy={isBusy}
                hovered={hoveredAdd[peer.id] === true}
                setHovered={(v) => setHoveredAdd((p) => ({ ...p, [peer.id]: v }))}
                onAdd={() => sendRequest(peer.id)}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface ActionButtonProps {
  peer: ClassmatePeer;
  isBusy: boolean;
  hovered: boolean;
  setHovered: (v: boolean) => void;
  onAdd: () => void;
}

function ActionButton({ peer, isBusy, hovered, setHovered, onAdd }: ActionButtonProps) {
  const buttonBase: React.CSSProperties = {
    fontSize: '12px',
    fontWeight: 600,
    borderRadius: '8px',
    padding: '6px 14px',
    border: 'none',
    whiteSpace: 'nowrap',
    flexShrink: 0,
    fontFamily: 'inherit',
    transition: 'background 0.2s cubic-bezier(0.22,1,0.36,1)',
  };

  switch (peer.friendshipStatus) {
    case 'none':
      return (
        <button
          type="button"
          onClick={onAdd}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          disabled={isBusy}
          style={{
            ...buttonBase,
            background: isBusy ? '#555578' : hovered ? '#884efb' : '#ae89ff',
            color: isBusy ? '#aaa8c8' : '#2a0066',
            cursor: isBusy ? 'wait' : 'pointer',
          }}
        >
          {isBusy ? '…' : 'Add'}
        </button>
      );
    case 'pending_sent':
      return (
        <span
          style={{
            fontSize: '12px',
            color: 'var(--outline)',
            fontStyle: 'italic',
            flexShrink: 0,
          }}
        >
          Pending
        </span>
      );
    case 'pending_received':
      return (
        <button
          type="button"
          onClick={onAdd}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          disabled={isBusy}
          style={{
            ...buttonBase,
            background: isBusy ? '#555578' : hovered ? '#38c96e' : '#4dff91',
            color: '#0c2a14',
            cursor: isBusy ? 'wait' : 'pointer',
          }}
        >
          Accept
        </button>
      );
    case 'accepted':
      return (
        <span
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            fontSize: '12px',
            color: '#4dff91',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{ fontSize: '16px', fontVariationSettings: "'FILL' 1" }}
          >
            check_circle
          </span>
          Added
        </span>
      );
    default:
      return null;
  }
}
