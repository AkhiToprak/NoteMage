'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CoworkInvitePayload } from '@/lib/cowork-join';
import { joinCoworkSession, coworkPageUrl } from '@/lib/cowork-join';

/**
 * Rich "Join co-work session" message card rendered inside group / class /
 * DM chat threads. Mounted by `GroupChatMessage.tsx` when
 * `message.type === 'cowork_invite'`.
 *
 * Visual vocabulary is copied from the landing-page `CoworkSpotlight`:
 * layered purple/blue gradient, pulsing LIVE pill, notebook color accent,
 * yellow primary CTA for "Join session".
 *
 * On mount the card calls the session-state API to determine whether the
 * session is still live. If the host has already ended the session, the
 * CTA flips to a disabled "Session ended" pill so stale messages don't
 * show a dead button.
 */

interface CoworkInviteCardProps {
  payload: CoworkInvitePayload;
  /** StudyGroup id where this invite was posted — required for the join gate. */
  groupId: string;
  /** Current user id — used to detect "own invite" so we show Resume instead of Join. */
  currentUserId: string;
  /** Display name of the host, surfaced in the "Started by …" row. */
  hostName: string;
}

type SessionState = 'loading' | 'live' | 'ended';

const DEFAULT_NOTEBOOK_COLOR = '#ae89ff';

export default function CoworkInviteCard({
  payload,
  groupId,
  currentUserId,
  hostName,
}: CoworkInviteCardProps) {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>('loading');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isHost = payload.hostId === currentUserId;
  const accentColor = payload.notebookColor || DEFAULT_NOTEBOOK_COLOR;

  // Probe the session — is it still active?
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/notebooks/${payload.notebookId}/cowork/${payload.sessionId}`
        );
        if (cancelled) return;
        if (res.ok) {
          const json = await res.json();
          if (json?.data?.isActive !== false) {
            setSessionState('live');
          } else {
            setSessionState('ended');
          }
        } else {
          setSessionState('ended');
        }
      } catch {
        if (!cancelled) setSessionState('ended');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [payload.notebookId, payload.sessionId]);

  const handleJoin = async () => {
    if (joining || sessionState !== 'live') return;
    setJoining(true);
    setError(null);
    try {
      await joinCoworkSession(payload, groupId);
      router.push(coworkPageUrl(payload));
    } catch (err) {
      const reason = (err as Error).message;
      if (reason === 'forbidden') {
        setError('You do not have access to this session.');
      } else if (reason === 'not_found') {
        setSessionState('ended');
        setError(null);
      } else {
        setError('Could not join — try again.');
      }
      setJoining(false);
    }
  };

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: 420,
        padding: 18,
        borderRadius: 20,
        background:
          'linear-gradient(135deg, rgba(174,137,255,0.10) 0%, rgba(81,112,255,0.06) 100%), rgba(14, 12, 34, 0.82)',
        border: `1px solid ${accentColor}55`,
        boxShadow:
          '0 16px 48px rgba(81,112,255,0.14), 0 4px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.05)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        fontFamily: 'var(--font-sans)',
        overflow: 'hidden',
      }}
    >
      {/* Decorative accent glow in the top-right */}
      <div
        aria-hidden
        style={{
          position: 'absolute',
          top: -40,
          right: -40,
          width: 160,
          height: 160,
          borderRadius: '50%',
          background: `radial-gradient(circle, ${accentColor}22 0%, transparent 70%)`,
          pointerEvents: 'none',
        }}
      />

      {/* Top row: LIVE pill + notebook swatch */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          marginBottom: 14,
          position: 'relative',
        }}
      >
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 10px',
            borderRadius: 999,
            background:
              sessionState === 'live'
                ? 'rgba(74, 222, 128, 0.12)'
                : 'rgba(136, 136, 168, 0.14)',
            border: `1px solid ${sessionState === 'live' ? 'rgba(74, 222, 128, 0.35)' : 'rgba(136, 136, 168, 0.25)'}`,
            fontFamily: 'var(--font-brand)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: sessionState === 'live' ? '#4ade80' : '#8888a8',
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background:
                sessionState === 'live' ? '#4ade80' : '#8888a8',
              boxShadow:
                sessionState === 'live'
                  ? '0 0 8px rgba(74, 222, 128, 0.7)'
                  : 'none',
              animation:
                sessionState === 'live'
                  ? 'cowork-invite-pulse 2s ease-in-out infinite'
                  : 'none',
            }}
          />
          {sessionState === 'live' ? 'Live · Co-work' : 'Session ended'}
        </span>

        <span
          aria-hidden
          style={{
            width: 14,
            height: 14,
            borderRadius: 4,
            background: accentColor,
            boxShadow: `0 0 10px ${accentColor}66`,
          }}
        />

        <span
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: 11,
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'rgba(237, 233, 255, 0.58)',
            marginLeft: 'auto',
          }}
        >
          {isHost ? 'You started this' : `Started by ${hostName}`}
        </span>
      </div>

      {/* Headline: notebook name */}
      <div
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 22,
          lineHeight: 1.15,
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: '#e5e3ff',
          marginBottom: 6,
        }}
      >
        {payload.notebookName}
      </div>

      {/* Subline: page title + icon */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 18,
          color: 'rgba(237, 233, 255, 0.72)',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: 17, color: accentColor }}
        >
          {payload.pageType === 'canvas' ? 'draw' : 'description'}
        </span>
        <span
          style={{
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
            fontWeight: 500,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {payload.pageTitle}
        </span>
      </div>

      {/* CTA row */}
      {sessionState === 'ended' ? (
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 16px',
            borderRadius: 12,
            background: 'rgba(136, 136, 168, 0.08)',
            border: '1px solid rgba(136, 136, 168, 0.2)',
            color: 'rgba(237, 233, 255, 0.5)',
            fontSize: 12,
            fontWeight: 600,
            fontFamily: 'var(--font-brand)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            event_busy
          </span>
          Session has ended
        </div>
      ) : (
        <button
          type="button"
          onClick={handleJoin}
          disabled={joining || sessionState === 'loading'}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 8,
            padding: '11px 22px',
            border: 'none',
            borderRadius: 12,
            background:
              joining || sessionState === 'loading'
                ? 'rgba(255, 222, 89, 0.35)'
                : 'linear-gradient(135deg, #ffde59 0%, #ffc94a 100%)',
            color: '#2a2200',
            fontSize: 13,
            fontWeight: 800,
            letterSpacing: '0.01em',
            cursor:
              joining || sessionState === 'loading' ? 'wait' : 'pointer',
            boxShadow:
              '0 12px 28px rgba(255, 222, 89, 0.24), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.4)',
            transition:
              'transform 0.25s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.25s cubic-bezier(0.22, 1, 0.36, 1)',
            fontFamily: 'var(--font-sans)',
          }}
          onMouseEnter={(e) => {
            if (joining || sessionState === 'loading') return;
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow =
              '0 18px 40px rgba(255, 222, 89, 0.32), 0 4px 12px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow =
              '0 12px 28px rgba(255, 222, 89, 0.24), 0 2px 8px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.4)';
          }}
        >
          <span
            className="material-symbols-outlined"
            style={{
              fontSize: 18,
              animation: joining ? 'cowork-invite-spin 1s linear infinite' : 'none',
            }}
          >
            {joining ? 'progress_activity' : isHost ? 'play_arrow' : 'login'}
          </span>
          {joining
            ? 'Joining…'
            : isHost
              ? 'Resume session'
              : 'Join session'}
        </button>
      )}

      {error && (
        <div
          role="alert"
          style={{
            marginTop: 10,
            fontSize: 11,
            color: '#fd6f85',
            fontFamily: 'var(--font-sans)',
          }}
        >
          {error}
        </div>
      )}

      <style>{`
        @keyframes cowork-invite-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.45; transform: scale(1.4); }
        }
        @keyframes cowork-invite-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
