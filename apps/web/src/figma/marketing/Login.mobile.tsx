'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Mage } from '@/figma/kit';
import { ONB, OnbMobileFrame, Sparkle, mkt } from './shell';

/**
 * Login — mobile (DERIVED reflow; Figma 72:8 is web-only). Lavender welcome hero
 * stacked over the cream auth form. Mock only — every action routes to the
 * gallery; nothing submits.
 */
export default function LoginMobile() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const finish = () => router.push('/figma');

  return (
    <OnbMobileFrame statusBar contentStyle={{ background: ONB.cream }}>
      {/* lavender welcome hero */}
      <div style={{ position: 'relative', background: '#f1ecfb', padding: '18px 24px 26px', overflow: 'hidden' }}>
        <Mage pose="logo-color" size={120} alt="NoteMage" priority />
        <div style={{ position: 'relative', width: '100%', height: 178, marginTop: 6 }}>
          <div style={{ position: 'absolute', left: '50%', top: 6, transform: 'translateX(-50%)' }}>
            <Mage pose="default" size={150} alt="Mage" priority />
          </div>
          <Sparkle size={18} color={ONB.gold} rotate={-15} style={{ position: 'absolute', right: 28, top: 0 }} />
          <Sparkle size={12} color={ONB.primary} style={{ position: 'absolute', left: 24, top: 18 }} />
          <Sparkle size={14} color={ONB.gold} rotate={-20} style={{ position: 'absolute', right: 22, top: 150 }} />
        </div>
        <h2
          style={{
            margin: '4px 0 0',
            textAlign: 'center',
            color: ONB.ink,
            fontFamily: ONB.font,
            fontWeight: 700,
            fontSize: 28,
            letterSpacing: '-0.56px',
          }}
        >
          Welcome back.
        </h2>
        <p style={{ margin: '8px auto 0', maxWidth: 300, textAlign: 'center', color: ONB.muted, fontFamily: ONB.font, fontSize: 15, lineHeight: 1.45 }}>
          Your paths, weak points, and progress are right where you left them.
        </p>
      </div>

      {/* form */}
      <form onSubmit={(e) => { e.preventDefault(); finish(); }} style={{ padding: '24px 24px 8px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <SocialButton onClick={finish}>
            <span style={{ fontWeight: 700, fontSize: 17, color: '#4285f4' }}>G</span>
            Continue with Google
          </SocialButton>
          <SocialButton onClick={finish}>
            <svg width="15" height="18" viewBox="0 0 17 20" fill="none" aria-hidden>
              <path d="M14.19 10.56c-.02-2.11 1.72-3.13 1.8-3.18-.98-1.44-2.51-1.63-3.06-1.65-1.3-.13-2.55.76-3.21.76-.67 0-1.7-.74-2.79-.72-1.43.02-2.76.83-3.49 2.1-1.49 2.59-.38 6.42 1.07 8.52.71 1.03 1.56 2.18 2.67 2.14 1.07-.04 1.48-.69 2.77-.69 1.29 0 1.66.69 2.79.67 1.15-.02 1.88-1.05 2.58-2.09.82-1.19 1.15-2.35 1.17-2.41-.03-.01-2.28-.88-2.3-3.45z" fill="#18202f" />
              <path d="M12.06 4.48c.59-.72.99-1.71.88-2.71-.85.04-1.88.57-2.49 1.27-.55.63-1.04 1.65-.91 2.62.95.07 1.93-.49 2.52-1.18z" fill="#18202f" />
            </svg>
            Continue with Apple
          </SocialButton>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '18px 0' }}>
          <span style={{ flex: 1, height: 1.4, background: ONB.paperLine }} />
          <span style={{ color: ONB.muted2, fontFamily: ONB.font, fontSize: 13, fontWeight: 500 }}>or</span>
          <span style={{ flex: 1, height: 1.4, background: ONB.paperLine }} />
        </div>

        <label style={lbl}>Email</label>
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" style={inp} />

        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 16 }}>
          <label style={{ ...lbl, marginBottom: 0 }}>Password</label>
          <button type="button" className={mkt.navLink} style={{ color: ONB.primary, fontFamily: ONB.font, fontSize: 13, fontWeight: 600, padding: 0 }}>
            Forgot password?
          </button>
        </div>
        <div style={{ position: 'relative', marginTop: 8 }}>
          <input
            type={show ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            style={{ ...inp, marginTop: 0, paddingRight: 46 }}
          />
          <button
            type="button"
            aria-label={show ? 'Hide password' : 'Show password'}
            onClick={() => setShow((s) => !s)}
            className={mkt.tapPill}
            style={{ position: 'absolute', right: 12, top: 0, height: 52, display: 'inline-flex', alignItems: 'center', border: 'none', background: 'transparent', color: ONB.muted2 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 21 }}>
              {show ? 'visibility_off' : 'visibility'}
            </span>
          </button>
        </div>

        <button
          type="submit"
          className={mkt.tapPill}
          style={{ marginTop: 22, height: 54, borderRadius: 16, border: 'none', background: ONB.primary, color: ONB.white, fontFamily: ONB.font, fontSize: 16.5, fontWeight: 600, boxShadow: ONB.btnShadow, cursor: 'pointer' }}
        >
          Log in
        </button>

        <p style={{ margin: '18px 0 0', textAlign: 'center', color: ONB.muted, fontFamily: ONB.font, fontSize: 14.5, fontWeight: 500 }}>
          New to Notemage?{' '}
          <Link href="/figma/onboarding/12-signup" style={{ color: ONB.primary, fontWeight: 600, textDecoration: 'none' }}>
            Create an account
          </Link>
        </p>
      </form>
    </OnbMobileFrame>
  );
}

const lbl: React.CSSProperties = { display: 'block', marginBottom: 8, color: ONB.muted, fontFamily: ONB.font, fontSize: 13, fontWeight: 600 };
const inp: React.CSSProperties = {
  width: '100%',
  height: 52,
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

function SocialButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={mkt.tapPill}
      style={{
        height: 52,
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
        fontSize: 15.5,
        fontWeight: 600,
      }}
    >
      {children}
    </button>
  );
}
