'use client';

import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbMobileFrame, Sparkle } from './shell';

/**
 * 12 Signup — mobile (Figma 1:39). 393-wide cream frame.
 *
 * Layout (top → bottom):
 *   • Lavender halo + mascot (graduation pose) + sparkles
 *   • Bold headline + subtitle
 *   • Study-path preview card (SQL Databases mock)
 *   • Three social provider buttons: Apple (dark) · Google (white) · Email (white)
 *   • Legal copy (Terms + Privacy Policy in purple)
 *
 * Interaction: the three provider buttons are controlled-state stubs; pressing
 * any of them routes to /figma (end of onboarding flow). No real auth.
 */

/** Inline Apple mark — a simple  symbol in white. */
function AppleMark() {
  return (
    <svg width="17" height="20" viewBox="0 0 17 20" fill="none" aria-hidden>
      <path
        d="M14.19 10.56c-.02-2.11 1.72-3.13 1.8-3.18-.98-1.44-2.51-1.63-3.06-1.65-1.3-.13-2.55.76-3.21.76-.67 0-1.7-.74-2.79-.72-1.43.02-2.76.83-3.49 2.1-1.49 2.59-.38 6.42 1.07 8.52.71 1.03 1.56 2.18 2.67 2.14 1.07-.04 1.48-.69 2.77-.69 1.29 0 1.66.69 2.79.67 1.15-.02 1.88-1.05 2.58-2.09.82-1.19 1.15-2.35 1.17-2.41-.03-.01-2.28-.88-2.3-3.45z"
        fill="white"
      />
      <path
        d="M12.06 4.48c.59-.72 .99-1.71 .88-2.71-.85.04-1.88.57-2.49 1.27-.55.63-.1.69-1.6 1.55-.87.52-.84 1.44-.81 1.57.09.01 2.43-.49 3.02-1.68z"
        fill="white"
      />
    </svg>
  );
}

/** Inline Google "G" mark. */
function GoogleMark() {
  return (
    <span
      style={{
        fontFamily: ONB.font,
        fontWeight: 700,
        fontSize: 18,
        color: '#4285f4',
        lineHeight: 1,
        letterSpacing: 0,
        display: 'block',
      }}
    >
      G
    </span>
  );
}

/** Inline Email / envelope mark. */
function EmailMark() {
  return (
    <svg width="20" height="15" viewBox="0 0 20 15" fill="none" aria-hidden>
      <rect x="0.9" y="0.9" width="18.2" height="13.2" rx="3" stroke={ONB.muted} strokeWidth="1.8" />
      <polyline
        points="1.5,1.5 10,8 18.5,1.5"
        stroke={ONB.muted}
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export default function SignupMobile() {
  const router = useRouter();

  function finish() {
    router.push('/figma');
  }

  return (
    <OnbMobileFrame>
      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div style={{ position: 'relative', width: '100%', height: 220, marginTop: 6 }}>
        {/* lavender halo */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            top: 0,
            width: 146,
            height: 146,
            borderRadius: 46,
            background: ONB.lavender,
          }}
        />
        {/* mascot */}
        <div
          style={{
            position: 'absolute',
            left: '50%',
            transform: 'translateX(-50%)',
            top: 4,
            width: 112,
            height: 112,
          }}
        >
          <Mage pose="graduation" size={112} alt="Mage" priority />
        </div>
        {/* sparkles */}
        <Sparkle
          size={15}
          color={ONB.gold}
          rotate={-12}
          style={{ position: 'absolute', left: 256, top: 11 }}
        />
        <Sparkle
          size={11}
          color={ONB.gold}
          style={{ position: 'absolute', left: 116, top: 20 }}
        />
      </div>

      {/* ── Headline ──────────────────────────────────────────────── */}
      <h1
        style={{
          margin: '0 auto',
          maxWidth: 330,
          padding: '0 24px',
          textAlign: 'center',
          color: ONB.ink,
          fontFamily: ONB.font,
          fontWeight: 700,
          fontSize: 26,
          lineHeight: 1.16,
          letterSpacing: '-0.39px',
        }}
      >
        Save your path and keep studying.
      </h1>

      {/* ── Subtitle ──────────────────────────────────────────────── */}
      <p
        style={{
          margin: '14px auto 0',
          maxWidth: 316,
          padding: '0 24px',
          textAlign: 'center',
          color: ONB.muted,
          fontFamily: ONB.font,
          fontSize: 15.5,
          fontWeight: 400,
          lineHeight: 1.44,
        }}
      >
        Save your generated path, answers, weak points, and progress.
      </p>

      {/* ── Preview card ──────────────────────────────────────────── */}
      <div
        style={{
          margin: '20px 24px 0',
          background: ONB.white,
          border: `1.2px solid ${ONB.line}`,
          borderRadius: 22,
          overflow: 'hidden',
          boxShadow: '0px 5px 16px 0px rgba(58,46,102,0.07)',
          position: 'relative',
          height: 150,
        }}
      >
        {/* icon tile */}
        <div
          style={{
            position: 'absolute',
            left: 16.8,
            top: 14.8,
            width: 44,
            height: 44,
            borderRadius: 13,
            background: ONB.lavender,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            className="material-symbols-outlined filled"
            style={{ fontSize: 24, color: ONB.primaryInk }}
          >
            database
          </span>
        </div>

        {/* title + subtitle */}
        <p
          style={{
            position: 'absolute',
            left: 72.8,
            top: 15.8,
            margin: 0,
            color: ONB.ink,
            fontFamily: ONB.font,
            fontSize: 17.5,
            fontWeight: 700,
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
          }}
        >
          SQL Databases
        </p>
        <p
          style={{
            position: 'absolute',
            left: 72.8,
            top: 40.8,
            margin: 0,
            color: ONB.muted,
            fontFamily: ONB.font,
            fontSize: 12.5,
            fontWeight: 500,
            lineHeight: 1.3,
            whiteSpace: 'nowrap',
          }}
        >
          Your progress so far
        </p>

        {/* divider */}
        <div
          style={{
            position: 'absolute',
            left: 16.8,
            top: 70.8,
            right: 16.8,
            height: 1,
            background: '#e3dccd',
          }}
        />

        {/* chips */}
        <div
          style={{
            position: 'absolute',
            left: 16.8,
            top: 84.8,
            display: 'flex',
            gap: 8,
          }}
        >
          <span
            style={{
              height: 26,
              padding: '0 10px',
              borderRadius: 13,
              background: ONB.lavender,
              color: ONB.primaryInk,
              fontFamily: ONB.font,
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            6 topics
          </span>
          <span
            style={{
              height: 26,
              padding: '0 10px',
              borderRadius: 13,
              background: '#e2f5eb',
              color: '#0f6b3d',
              fontFamily: ONB.font,
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            3 done
          </span>
          <span
            style={{
              height: 26,
              padding: '0 10px',
              borderRadius: 13,
              background: '#fcefd9',
              color: '#8a5a12',
              fontFamily: ONB.font,
              fontSize: 12,
              fontWeight: 600,
              display: 'inline-flex',
              alignItems: 'center',
              whiteSpace: 'nowrap',
            }}
          >
            1 weak point
          </span>
        </div>

        {/* next-up row */}
        <div
          style={{
            position: 'absolute',
            left: 16.8,
            top: 114.8,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              borderRadius: 12,
              background: ONB.primary,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontFamily: ONB.font,
                fontSize: 10,
                fontWeight: 700,
                color: ONB.white,
                lineHeight: 1,
              }}
            >
              ▶
            </span>
          </div>
          <span
            style={{
              color: ONB.ink,
              fontFamily: ONB.font,
              fontSize: 14,
              fontWeight: 600,
              lineHeight: 1.3,
              whiteSpace: 'nowrap',
            }}
          >
            Next: Tables and keys
          </span>
        </div>
      </div>

      {/* ── Auth buttons ──────────────────────────────────────────── */}
      <div style={{ margin: '20px 24px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Apple */}
        <button
          type="button"
          onClick={finish}
          style={{
            width: '100%',
            height: 54,
            borderRadius: 16,
            border: 'none',
            background: '#15151c',
            boxShadow: '0px 8px 18px 0px rgba(21,21,28,0.22)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            cursor: 'pointer',
            color: ONB.white,
            fontFamily: ONB.font,
            fontSize: 16.5,
            fontWeight: 600,
            transition: 'opacity 0.18s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.88'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        >
          <AppleMark />
          Continue with Apple
        </button>

        {/* Google */}
        <button
          type="button"
          onClick={finish}
          style={{
            width: '100%',
            height: 54,
            borderRadius: 16,
            border: `1.6px solid ${ONB.paperLine}`,
            background: ONB.white,
            boxShadow: '0px 4px 12px 0px rgba(58,46,102,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            cursor: 'pointer',
            color: ONB.ink,
            fontFamily: ONB.font,
            fontSize: 16.5,
            fontWeight: 600,
            transition: 'opacity 0.18s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.82'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        >
          <GoogleMark />
          Continue with Google
        </button>

        {/* Email */}
        <button
          type="button"
          onClick={finish}
          style={{
            width: '100%',
            height: 54,
            borderRadius: 16,
            border: `1.6px solid ${ONB.paperLine}`,
            background: ONB.white,
            boxShadow: '0px 4px 12px 0px rgba(58,46,102,0.06)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            cursor: 'pointer',
            color: ONB.ink,
            fontFamily: ONB.font,
            fontSize: 16.5,
            fontWeight: 600,
            transition: 'opacity 0.18s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.82'; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
        >
          <EmailMark />
          Continue with email
        </button>
      </div>

      {/* ── Legal ─────────────────────────────────────────────────── */}
      <p
        style={{
          margin: '20px auto 0',
          maxWidth: 320,
          padding: '0 24px',
          textAlign: 'center',
          color: ONB.muted,
          fontFamily: ONB.font,
          fontSize: 12.5,
          fontWeight: 500,
          lineHeight: 1.4,
        }}
      >
        By continuing, you agree to the{' '}
        <span style={{ color: ONB.primary, fontWeight: 600, cursor: 'pointer' }}>Terms</span>
        {' '}and{' '}
        <span style={{ color: ONB.primary, fontWeight: 600, cursor: 'pointer' }}>Privacy Policy</span>.
      </p>
    </OnbMobileFrame>
  );
}
