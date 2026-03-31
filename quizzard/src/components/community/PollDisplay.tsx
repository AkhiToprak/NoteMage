'use client';

import { useState } from 'react';

interface PollOption {
  id: string;
  text: string;
  sortOrder: number;
  voteCount: number;
  userVoted: boolean;
}

interface PollDisplayProps {
  postId: string;
  poll: {
    id: string;
    question: string;
    options: PollOption[];
  };
  onVote?: (updatedPoll: PollDisplayProps['poll']) => void;
}

const EASING = 'cubic-bezier(0.22,1,0.36,1)';

const COLORS = {
  elevated: '#232342',
  inputBg: '#2a2a4c',
  primary: '#ae89ff',
  deepPurple: '#884efb',
  textPrimary: '#e5e3ff',
  textSecondary: '#aaa8c8',
  textMuted: '#8888a8',
  border: '#555578',
} as const;

export default function PollDisplay({ postId, poll, onVote }: PollDisplayProps) {
  const [hoveredOption, setHoveredOption] = useState<string | null>(null);
  const [voting, setVoting] = useState(false);

  const hasVoted = poll.options.some((o) => o.userVoted);
  const totalVotes = poll.options.reduce((sum, o) => sum + o.voteCount, 0);

  const handleVote = async (optionId: string) => {
    if (voting) return;
    setVoting(true);
    try {
      const res = await fetch(`/api/posts/${postId}/poll/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ optionId }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success) {
          onVote?.(json.data.poll);
        }
      }
    } catch {
      // silently fail
    } finally {
      setVoting(false);
    }
  };

  return (
    <div
      style={{
        background: COLORS.elevated,
        borderRadius: 14,
        border: `1px solid ${COLORS.border}`,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      {/* Question */}
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: COLORS.textPrimary,
          lineHeight: 1.4,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
        }}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 18, color: COLORS.primary }}>
          ballot
        </span>
        {poll.question}
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {poll.options.map((opt) => {
          const percentage = totalVotes > 0 ? Math.round((opt.voteCount / totalVotes) * 100) : 0;
          const isHovered = hoveredOption === opt.id;

          if (hasVoted) {
            // Results view
            return (
              <div
                key={opt.id}
                style={{
                  position: 'relative',
                  borderRadius: 10,
                  overflow: 'hidden',
                  border: `1.5px solid ${opt.userVoted ? COLORS.primary : COLORS.border}`,
                  background: COLORS.inputBg,
                }}
              >
                {/* Progress bar */}
                <div
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    bottom: 0,
                    width: `${percentage}%`,
                    background: opt.userVoted
                      ? 'rgba(174,137,255,0.15)'
                      : 'rgba(255,255,255,0.07)',
                    transition: `width 0.5s ${EASING}`,
                  }}
                />
                <div
                  style={{
                    position: 'relative',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 14px',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {opt.userVoted && (
                      <span
                        className="material-symbols-outlined"
                        style={{ fontSize: 16, color: COLORS.primary }}
                      >
                        check_circle
                      </span>
                    )}
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: opt.userVoted ? 600 : 400,
                        color: opt.userVoted ? COLORS.textPrimary : COLORS.textSecondary,
                      }}
                    >
                      {opt.text}
                    </span>
                  </div>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      color: opt.userVoted ? COLORS.primary : COLORS.textMuted,
                      flexShrink: 0,
                      marginLeft: 12,
                    }}
                  >
                    {percentage}%
                  </span>
                </div>
              </div>
            );
          }

          // Voting view
          return (
            <button
              key={opt.id}
              onClick={() => handleVote(opt.id)}
              disabled={voting}
              onMouseEnter={() => setHoveredOption(opt.id)}
              onMouseLeave={() => setHoveredOption(null)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                borderRadius: 10,
                border: `1.5px solid ${isHovered ? COLORS.primary : COLORS.border}`,
                background: isHovered ? 'rgba(174,137,255,0.06)' : COLORS.inputBg,
                color: isHovered ? COLORS.textPrimary : COLORS.textSecondary,
                fontSize: 13,
                cursor: voting ? 'wait' : 'pointer',
                transition: `all 0.15s ${EASING}`,
                width: '100%',
                textAlign: 'left',
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  borderRadius: '50%',
                  border: `2px solid ${isHovered ? COLORS.primary : COLORS.border}`,
                  flexShrink: 0,
                  transition: `border-color 0.15s ${EASING}`,
                }}
              />
              {opt.text}
            </button>
          );
        })}
      </div>

      {/* Total votes */}
      <div style={{ fontSize: 11, color: COLORS.textMuted, marginTop: 2 }}>
        {totalVotes} vote{totalVotes !== 1 ? 's' : ''}
      </div>
    </div>
  );
}
