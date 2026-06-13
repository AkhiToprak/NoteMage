'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import ResetPasswordForm from '@/components/auth/ResetPasswordForm';
import TurnstileWidget, { turnstileEnabled } from '@/components/auth/TurnstileWidget';

export default function ForgotPasswordPage() {
  // The auth experience is always-dark (the (auth) layout paints a fixed
  // #0c0a1a frame). Scope a dark token island so the subtree — including the
  // shared ResetPasswordForm — resolves to its dark values in light mode.
  return (
    <div data-theme="dark" style={{ display: 'contents' }}>
      <ForgotPasswordFlow />
    </div>
  );
}

function ForgotPasswordFlow() {
  const router = useRouter();
  const [phase, setPhase] = useState<'request' | 'reset'>('request');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');

  const handleRequest = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (turnstileEnabled && !turnstileToken) {
      setError('Please complete the verification challenge.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, turnstileToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        // Always advance — the endpoint returns the same generic success
        // whether or not the email is registered (anti-enumeration).
        setPhase('reset');
      } else if (res.status === 429) {
        setError(data.error || 'Please wait a moment before requesting another code.');
      } else {
        setError(data.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    router.push('/auth/login?reset=1');
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '16px 16px 16px 44px',
    background: '#23233c',
    border: 'none',
    borderRadius: '16px',
    color: 'var(--on-surface)',
    fontSize: '15px',
    fontFamily: 'inherit',
    fontWeight: 600,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
  };

  return (
    <>
      {/* Logo + heading */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '40px',
        }}
      >
        <Link
          href="/"
          aria-label="Notemage home"
          style={{ position: 'relative', display: 'inline-flex', marginBottom: '24px' }}
        >
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(174,137,255,0.2)',
              filter: 'blur(24px)',
              borderRadius: '50%',
            }}
          />
          <Image
            src="/logo_trimmed.png"
            alt="Notemage"
            width={96}
            height={96}
            style={{ objectFit: 'contain', position: 'relative' }}
            priority
          />
        </Link>
        <h1
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: '40px',
            fontWeight: 400,
            color: 'var(--brand-purple)',
            margin: 0,
            letterSpacing: '-0.02em',
            textAlign: 'center',
          }}
        >
          {phase === 'request' ? 'Reset your password' : 'Check your email'}
        </h1>
      </div>

      {/* Card */}
      <div
        style={{
          background: '#121222',
          borderRadius: '32px',
          padding: '40px',
          boxShadow: '0 32px 64px -12px rgba(0,0,0,0.5)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {phase === 'request' ? (
          <>
            {error && (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: '12px',
                  background: 'rgba(253,111,133,0.12)',
                  color: '#fd6f85',
                  fontSize: '14px',
                  marginBottom: '24px',
                }}
              >
                {error}
              </div>
            )}

            <p
              style={{
                margin: '0 0 24px',
                textAlign: 'center',
                fontSize: '14px',
                lineHeight: 1.6,
                color: 'var(--on-surface-variant)',
              }}
            >
              Enter your email and we&apos;ll send a 6-digit reset code.
            </p>

            <form onSubmit={handleRequest} style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <label
                  style={{
                    display: 'block',
                    fontSize: '14px',
                    fontWeight: 700,
                    color: 'var(--on-surface-variant)',
                    marginBottom: '8px',
                    paddingLeft: '4px',
                  }}
                >
                  Email Address
                </label>
                <div style={{ position: 'relative' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: 0,
                      bottom: 0,
                      paddingLeft: '14px',
                      display: 'flex',
                      alignItems: 'center',
                      pointerEvents: 'none',
                      color: 'var(--outline)',
                    }}
                  >
                    <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                      mail
                    </span>
                  </div>
                  <input
                    type="email"
                    placeholder="mage@notemage.app"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading}
                    autoComplete="email"
                    style={inputStyle}
                    onFocus={(e) => {
                      e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
                    }}
                    onBlur={(e) => {
                      e.target.style.boxShadow = 'none';
                    }}
                  />
                </div>
              </div>

              <TurnstileWidget onToken={setTurnstileToken} />

              <button
                type="submit"
                disabled={loading}
                style={{
                  width: '100%',
                  padding: '16px',
                  background: loading ? '#464560' : 'var(--brand-purple)',
                  border: 'none',
                  borderRadius: '16px',
                  color: loading ? '#aaa8c8' : '#2a0066',
                  fontSize: '17px',
                  fontWeight: 800,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  boxShadow: loading ? 'none' : '0 8px 24px rgba(174,137,255,0.25)',
                  transition:
                    'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
                }}
                onMouseEnter={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = 'scale(1.02)';
                    e.currentTarget.style.boxShadow = '0 12px 32px rgba(174,137,255,0.35)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!loading) {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 8px 24px rgba(174,137,255,0.25)';
                  }
                }}
                onMouseDown={(e) => {
                  if (!loading) e.currentTarget.style.transform = 'scale(0.98)';
                }}
                onMouseUp={(e) => {
                  if (!loading) e.currentTarget.style.transform = 'scale(1.02)';
                }}
              >
                {loading ? 'Sending…' : 'Send reset code'}
              </button>
            </form>
          </>
        ) : (
          <ResetPasswordForm email={email} onReset={handleReset} />
        )}
      </div>

      {/* Back to login */}
      <p
        style={{
          marginTop: '32px',
          textAlign: 'center',
          color: 'var(--on-surface-variant)',
          fontSize: '15px',
        }}
      >
        Remembered it?{' '}
        <Link
          href="/auth/login"
          style={{ color: 'var(--brand-gold)', fontWeight: 900, textDecoration: 'none' }}
        >
          Back to log in
        </Link>
      </p>
    </>
  );
}
