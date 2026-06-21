'use client';

import { useRouter } from 'next/navigation';
import { Mage } from '@/figma/kit';
import { ONB, OnbWebFrame, Sparkle } from './shell';

/**
 * 12 Signup — web (Figma 48:26). 1440-designed cream canvas.
 *
 * Layout:
 *   • Top nav: NoteMage logo (left)
 *   • Centered two-column hero:
 *       Left:  headline + subtitle + three auth provider buttons + legal copy
 *       Right: lavender halo + graduation Mage + sparkles
 *
 * Interaction: any of the three provider buttons ends the onboarding → /figma.
 */

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

function GoogleMark() {
  return (
    <span
      style={{
        fontFamily: ONB.font,
        fontWeight: 700,
        fontSize: 18,
        color: '#4285f4',
        lineHeight: 1,
        display: 'block',
      }}
    >
      G
    </span>
  );
}

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

export default function SignupWeb() {
  const router = useRouter();

  function finish() {
    router.push('/figma');
  }

  return (
    <OnbWebFrame>
      {/* ── Top nav ───────────────────────────────────────────────── */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '46px 64px 0',
          maxWidth: 1440,
          marginInline: 'auto',
        }}
      >
        <Mage pose="logo-color" size={150} alt="NoteMage" priority />
      </header>

      {/* ── Hero ──────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 80,
          maxWidth: 1200,
          marginInline: 'auto',
          padding: '80px 64px 100px',
        }}
      >
        {/* ── Left: copy + auth actions ─────────────────────────── */}
        <div style={{ flex: '0 1 500px', maxWidth: 500 }}>
          <h1
            style={{
              margin: 0,
              color: ONB.ink,
              fontFamily: ONB.font,
              fontWeight: 700,
              fontSize: 30,
              lineHeight: 1.16,
              letterSpacing: '-0.45px',
              maxWidth: 520,
            }}
          >
            Save your path and keep studying.
          </h1>
          <p
            style={{
              margin: '18px 0 0',
              maxWidth: 440,
              color: ONB.muted,
              fontFamily: ONB.font,
              fontSize: 16,
              fontWeight: 400,
              lineHeight: 1.44,
            }}
          >
            Save your generated path, answers, weak points, and progress.
          </p>

          {/* Preview card */}
          <div
            style={{
              marginTop: 32,
              background: ONB.white,
              border: `1.2px solid ${ONB.line}`,
              borderRadius: 22,
              overflow: 'hidden',
              boxShadow: '0px 8px 24px 0px rgba(58,46,102,0.08)',
              position: 'relative',
              height: 150,
            }}
          >
            {/* icon tile */}
            <div
              style={{
                position: 'absolute',
                left: 22.8,
                top: 18.8,
                width: 48,
                height: 48,
                borderRadius: 14,
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
                left: 82.8,
                top: 20.8,
                margin: 0,
                color: ONB.ink,
                fontFamily: ONB.font,
                fontSize: 18,
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
                left: 82.8,
                top: 45.8,
                margin: 0,
                color: ONB.muted,
                fontFamily: ONB.font,
                fontSize: 13,
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
                left: 22.8,
                top: 78.8,
                right: 22.8,
                height: 1,
                background: '#e3dccd',
              }}
            />

            {/* chips */}
            <div
              style={{
                position: 'absolute',
                left: 22.8,
                top: 92.8,
                display: 'flex',
                gap: 8,
              }}
            >
              <span
                style={{
                  height: 28,
                  padding: '0 10px',
                  borderRadius: 14,
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
                  height: 28,
                  padding: '0 10px',
                  borderRadius: 14,
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
                  height: 28,
                  padding: '0 10px',
                  borderRadius: 14,
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
          </div>

          {/* Auth buttons */}
          <div style={{ marginTop: 28, display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Apple */}
            <button
              type="button"
              onClick={finish}
              style={{
                width: '100%',
                height: 56,
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
                height: 56,
                borderRadius: 16,
                border: `1.6px solid ${ONB.paperLine}`,
                background: ONB.white,
                boxShadow: '0px 5px 14px 0px rgba(58,46,102,0.06)',
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
                height: 56,
                borderRadius: 16,
                border: `1.6px solid ${ONB.paperLine}`,
                background: ONB.white,
                boxShadow: '0px 5px 14px 0px rgba(58,46,102,0.06)',
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

          {/* Legal */}
          <p
            style={{
              marginTop: 20,
              textAlign: 'center',
              color: ONB.muted,
              fontFamily: ONB.font,
              fontSize: 13,
              fontWeight: 500,
              lineHeight: 1.4,
            }}
          >
            By continuing, you agree to the{' '}
            <span style={{ color: ONB.primary, fontWeight: 600, cursor: 'pointer' }}>Terms</span>
            {' '}and{' '}
            <span style={{ color: ONB.primary, fontWeight: 600, cursor: 'pointer' }}>Privacy Policy</span>.
          </p>
        </div>

        {/* ── Right: mascot illustration ────────────────────────── */}
        <div
          style={{
            position: 'relative',
            flex: '0 0 380px',
            width: 380,
            height: 400,
          }}
        >
          {/* lavender halo */}
          <div
            style={{
              position: 'absolute',
              left: 65,
              top: 10,
              width: 250,
              height: 250,
              borderRadius: 72,
              background: ONB.lavender,
            }}
          />
          {/* mascot */}
          <div style={{ position: 'absolute', left: 75, top: 20 }}>
            <Mage pose="graduation" size={230} alt="Mage" priority />
          </div>
          {/* sparkles */}
          <Sparkle
            size={19}
            color={ONB.gold}
            rotate={-12}
            style={{ position: 'absolute', left: 330, top: 30 }}
          />
          <Sparkle
            size={12}
            color={ONB.gold}
            style={{ position: 'absolute', left: 45, top: 50 }}
          />
          <Sparkle
            size={14}
            color={ONB.primary}
            style={{ position: 'absolute', left: 20, top: 180 }}
          />
          <Sparkle
            size={10}
            color={ONB.primary}
            style={{ position: 'absolute', left: 240, top: 290 }}
          />
        </div>
      </div>
    </OnbWebFrame>
  );
}
