'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mage } from '@/figma/kit';
import { ONB, MktWebFrame, Sparkle, mkt } from './shell';

/**
 * Login — web (Figma 72:8 / 77:*). 1440×1024 split: lavender welcome panel (left,
 * 560px) with the Mage + sparkle cluster, and a cream auth column (right) with
 * social buttons, email/password, and the primary CTA. Mock only — every action
 * routes to the gallery; nothing submits.
 */
export default function LoginWeb() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const finish = () => router.push('/figma');

  return (
    <MktWebFrame style={{ minHeight: 1024 }}>
      <div style={{ display: 'flex', minHeight: 1024 }}>
        {/* ── Left: lavender welcome panel ─────────────────────────── */}
        <div style={{ position: 'relative', flex: '0 0 560px', background: '#f1ecfb', overflow: 'hidden' }}>
          {/* logo */}
          <Link
            href="/figma/marketing/landing"
            aria-label="NoteMage home"
            style={{ position: 'absolute', left: 48, top: 40, display: 'inline-flex', lineHeight: 0 }}
          >
            <Mage pose="logo-color" size={140} alt="NoteMage" priority />
          </Link>

          {/* centered mascot + headline cluster */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              paddingBottom: 40,
            }}
          >
            <div style={{ position: 'relative', width: 320, height: 300 }}>
              <div style={{ position: 'absolute', left: 40, top: 30 }}>
                <Mage pose="default" size={240} alt="Mage" priority />
              </div>
              <Sparkle size={26} color={ONB.gold} rotate={-15} style={{ position: 'absolute', left: 270, top: -12 }} />
              <Sparkle size={16} color={ONB.primary} style={{ position: 'absolute', left: -40, top: -30 }} />
              <Sparkle size={20} color={ONB.gold} rotate={-20} style={{ position: 'absolute', left: 280, top: 250 }} />
              <Sparkle size={14} color={ONB.primary} style={{ position: 'absolute', left: -50, top: 256 }} />
            </div>
            <h2
              style={{
                margin: '4px 0 0',
                color: ONB.ink,
                fontFamily: ONB.font,
                fontWeight: 700,
                fontSize: 36,
                letterSpacing: '-0.72px',
                lineHeight: 1.3,
              }}
            >
              Welcome back.
            </h2>
            <p
              style={{
                margin: '8px 0 0',
                maxWidth: 380,
                textAlign: 'center',
                color: ONB.muted,
                fontFamily: ONB.font,
                fontSize: 17,
                lineHeight: 1.5,
              }}
            >
              Your paths, weak points, and progress are right where you left them.
            </p>
          </div>
        </div>

        {/* ── Right: auth column ───────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'flex-start' }}>
          <form
            onSubmit={(e) => { e.preventDefault(); finish(); }}
            style={{ width: 400, marginLeft: 240, display: 'flex', flexDirection: 'column' }}
          >
            <h1
              style={{
                margin: 0,
                color: ONB.ink,
                fontFamily: ONB.font,
                fontWeight: 700,
                fontSize: 32,
                letterSpacing: '-0.48px',
                lineHeight: 1.3,
              }}
            >
              Log in
            </h1>
            <p style={{ margin: '10px 0 0', color: ONB.muted, fontFamily: ONB.font, fontSize: 16, lineHeight: 1.3 }}>
              Welcome back — let&apos;s keep studying.
            </p>

            {/* Social buttons */}
            <div style={{ marginTop: 26, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <SocialButton onClick={finish}>
                <GoogleG />
                Continue with Google
              </SocialButton>
              <SocialButton onClick={finish}>
                <AppleGlyph />
                Continue with Apple
              </SocialButton>
            </div>

            {/* or */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, margin: '21px 0' }}>
              <span style={{ flex: 1, height: 1.4, background: ONB.paperLine }} />
              <span style={{ color: ONB.muted2, fontFamily: ONB.font, fontSize: 13, fontWeight: 500 }}>or</span>
              <span style={{ flex: 1, height: 1.4, background: ONB.paperLine }} />
            </div>

            {/* Email */}
            <label style={fieldLabel}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu"
              style={fieldInput}
              onFocus={focusRing}
              onBlur={blurRing}
            />

            {/* Password */}
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 18 }}>
              <label style={{ ...fieldLabel, marginTop: 0 }}>Password</label>
              <button type="button" className={mkt.navLink} style={forgotLink}>
                Forgot password?
              </button>
            </div>
            <div style={{ position: 'relative' }}>
              <input
                type={show ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                style={{ ...fieldInput, marginTop: 8, paddingRight: 48 }}
                onFocus={focusRing}
                onBlur={blurRing}
              />
              <button
                type="button"
                aria-label={show ? 'Hide password' : 'Show password'}
                onClick={() => setShow((s) => !s)}
                className={mkt.tapPill}
                style={{
                  position: 'absolute',
                  right: 14,
                  top: 8,
                  height: 54,
                  display: 'inline-flex',
                  alignItems: 'center',
                  border: 'none',
                  background: 'transparent',
                  color: ONB.muted2,
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
                  {show ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>

            {/* CTA */}
            <button
              type="submit"
              className={mkt.tapPill}
              style={{
                marginTop: 24,
                height: 56,
                borderRadius: 16,
                border: 'none',
                background: ONB.primary,
                color: ONB.white,
                fontFamily: ONB.font,
                fontSize: 17,
                fontWeight: 600,
                boxShadow: ONB.btnShadow,
                cursor: 'pointer',
              }}
            >
              Log in
            </button>

            <p style={{ margin: '20px 0 0', textAlign: 'center', color: ONB.muted, fontFamily: ONB.font, fontSize: 15, fontWeight: 500 }}>
              New to Notemage?{' '}
              <Link href="/figma/onboarding/12-signup" style={{ color: ONB.primary, fontWeight: 600, textDecoration: 'none' }}>
                Create an account
              </Link>
            </p>
          </form>
        </div>
      </div>
    </MktWebFrame>
  );
}

/* ── shared field styles ─────────────────────────────────────────────── */
const fieldLabel: React.CSSProperties = {
  marginTop: 0,
  marginBottom: 8,
  display: 'block',
  color: ONB.muted,
  fontFamily: ONB.font,
  fontSize: 13.5,
  fontWeight: 600,
};
const fieldInput: React.CSSProperties = {
  width: '100%',
  height: 54,
  padding: '0 16px',
  borderRadius: 14,
  border: `1.4px solid ${ONB.line}`,
  background: ONB.white,
  color: ONB.ink,
  fontFamily: ONB.font,
  fontSize: 15.5,
  outline: 'none',
  boxSizing: 'border-box',
};
const forgotLink: React.CSSProperties = {
  color: ONB.primary,
  fontFamily: ONB.font,
  fontSize: 13.5,
  fontWeight: 600,
  cursor: 'pointer',
  padding: 0,
};
function focusRing(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = ONB.primary;
  e.currentTarget.style.boxShadow = '0 0 0 3px rgba(124,92,255,0.16)';
}
function blurRing(e: React.FocusEvent<HTMLInputElement>) {
  e.currentTarget.style.borderColor = ONB.line;
  e.currentTarget.style.boxShadow = 'none';
}

/* ── auth button + brand glyphs ──────────────────────────────────────── */
function SocialButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={mkt.tapPill}
      style={{
        height: 54,
        borderRadius: 15,
        border: `1.6px solid ${ONB.paperLine}`,
        background: ONB.white,
        boxShadow: '0px 5px 14px 0px rgba(58,46,102,0.06)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        cursor: 'pointer',
        color: ONB.ink,
        fontFamily: ONB.font,
        fontSize: 16,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}

function GoogleG() {
  return (
    <span style={{ fontFamily: ONB.font, fontWeight: 700, fontSize: 18, color: '#4285f4', lineHeight: 1 }}>G</span>
  );
}

function AppleGlyph() {
  return (
    <svg width="16" height="19" viewBox="0 0 17 20" fill="none" aria-hidden>
      <path
        d="M14.19 10.56c-.02-2.11 1.72-3.13 1.8-3.18-.98-1.44-2.51-1.63-3.06-1.65-1.3-.13-2.55.76-3.21.76-.67 0-1.7-.74-2.79-.72-1.43.02-2.76.83-3.49 2.1-1.49 2.59-.38 6.42 1.07 8.52.71 1.03 1.56 2.18 2.67 2.14 1.07-.04 1.48-.69 2.77-.69 1.29 0 1.66.69 2.79.67 1.15-.02 1.88-1.05 2.58-2.09.82-1.19 1.15-2.35 1.17-2.41-.03-.01-2.28-.88-2.3-3.45z"
        fill="#18202f"
      />
      <path
        d="M12.06 4.48c.59-.72.99-1.71.88-2.71-.85.04-1.88.57-2.49 1.27-.55.63-1.04 1.65-.91 2.62.95.07 1.93-.49 2.52-1.18z"
        fill="#18202f"
      />
    </svg>
  );
}
