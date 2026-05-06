'use client';

/**
 * Single remote-cursor overlay rendered absolute-positioned inside its parent.
 *
 * The parent supplies the cursor's container-relative coordinates as `{x, y}`
 * (in pixels). The arrow svg points up-left and the name pill sits below it.
 * Color is derived from the user id so each cowork participant gets a stable,
 * distinct hue without any extra round-trip.
 *
 * Used by `PageEditor` (via the cowork-socket cursor channel) and could be
 * reused on the canvas later. Pure rendering — no event listeners.
 */

import { UserName, type UserNameUser } from '@/components/user/UserName';

interface RemoteCursorProps {
  /** User-id for color hashing. */
  userId: string;
  /** User shape for the name pill — carries cosmetic styling. */
  user: UserNameUser;
  /** X coordinate in pixels, relative to the positioned ancestor. */
  x: number;
  /** Y coordinate in pixels, relative to the positioned ancestor. */
  y: number;
}

const COLORS = [
  '#ae89ff',
  '#ffde59',
  '#5170ff',
  '#fd6f85',
  '#8ce5a7',
  '#ff9566',
  '#b9c3ff',
  '#c9a6ff',
];

function colorForUser(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

export default function RemoteCursor({ userId, user, x, y }: RemoteCursorProps) {
  const color = colorForUser(userId);

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        left: x,
        top: y,
        pointerEvents: 'none',
        zIndex: 80,
        // Smooth movement between cursor updates (which arrive ~every 60ms)
        transition: 'transform 0.08s linear, left 0.08s linear, top 0.08s linear',
        willChange: 'transform, left, top',
      }}
    >
      {/* Arrow */}
      <svg
        width="18"
        height="22"
        viewBox="0 0 18 22"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{
          filter: `drop-shadow(0 2px 4px ${color}55)`,
        }}
      >
        <path
          d="M2 2L16 11L9 13L7 20L2 2Z"
          fill={color}
          stroke="rgba(0, 0, 0, 0.4)"
          strokeWidth="1"
          strokeLinejoin="round"
        />
      </svg>

      {/* Name pill — pill background is the cursor color; the label itself
          renders via <UserName> so any equipped font/color cosmetic shines
          through on top of the pill. */}
      <div
        style={{
          position: 'absolute',
          left: 14,
          top: 18,
          background: color,
          padding: '3px 8px 3px 8px',
          borderRadius: 6,
          whiteSpace: 'nowrap',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.4)',
        }}
      >
        <UserName
          user={user}
          fallback="Anon"
          preferUsername
          style={{
            color: '#181732',
            fontSize: 11,
            fontWeight: 700,
            fontFamily: 'var(--font-brand)',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
            lineHeight: 1,
          }}
        />
      </div>
    </div>
  );
}
