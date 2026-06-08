'use client';

import { signIn } from 'next-auth/react';
import { FormEvent, useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import VerifyCodeForm from '@/components/auth/VerifyCodeForm';
import OAuthProviderRow from '@/components/auth/OAuthProviderRow';

export default function LoginPage() {
  // useSearchParams in a client page must be wrapped in Suspense for the
  // Next.js 14 build to succeed — the inner form owns the hook.
  return (
    <Suspense fallback={null}>
      {/* The auth experience is always-dark (the (auth) layout paints a fixed
          #0c0a1a frame). Scope a dark token island here so flipping tokens in
          the login subtree — including the shared OAuthProviderRow /
          VerifyCodeForm, which ALSO render on the light-flipping onboarding
          surface — resolve to their dark values and stay legible in light mode. */}
      <div data-theme="dark" style={{ display: 'contents' }}>
        <LoginForm />
      </div>
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  // Set when authorize() rejects an unverified credentials account. Swaps the
  // login card for the inline code-entry flow (the password is still in state,
  // so we can finish signing in once the email is confirmed).
  const [needsVerification, setNeedsVerification] = useState(false);

  // Surface errors redirected here by the NextAuth signIn callback —
  // the most important one is OAuthAccountExists, which fires when an
  // OAuth sign-in collides with an existing password account and we
  // refused to silently link it.
  useEffect(() => {
    const err = searchParams.get('error');
    if (!err) return;
    if (err === 'OAuthAccountExists') {
      setError(
        'An account already exists for this email. Please sign in with your password, then link Google or Apple from settings.'
      );
    } else if (err === 'OAuthSignin' || err === 'OAuthCallback' || err === 'Callback') {
      setError('Something went wrong during sign-in. Please try again.');
    } else if (err === 'AccessDenied') {
      setError('Sign-in was denied. If you think this is a mistake, contact support.');
    }
  }, [searchParams]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const result = await signIn('credentials', {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        if (result.error.includes('ACCOUNT_LOCKED:')) {
          const unlockAt = new Date(result.error.split('ACCOUNT_LOCKED:')[1]);
          const timeStr = unlockAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          setError(
            `Your account has been locked due to too many failed login attempts. It will be unlocked at ${timeStr}.`
          );
        } else if (result.error === 'EMAIL_NOT_VERIFIED') {
          // Correct password, but the email was never confirmed — swap to the
          // inline verify flow instead of showing a wrong-password error.
          setNeedsVerification(true);
        } else {
          setError('Invalid email or password');
        }
      } else if (result?.ok) {
        router.push('/dashboard');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // After the code is confirmed, finish the sign-in the user already started
  // (email + password are still in state). The account is now verified, so the
  // same credentials sail through authorize().
  const handleVerifiedLogin = async () => {
    const result = await signIn('credentials', { email, password, redirect: false });
    if (result?.ok) {
      router.push('/dashboard');
    } else {
      setNeedsVerification(false);
      setError('Email verified! Please sign in.');
    }
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

  // Inline email-confirmation flow — shown when a correct-password login is
  // blocked because the account's email is unverified.
  if (needsVerification) {
    return (
      <>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            marginBottom: '40px',
          }}
        >
          <div style={{ position: 'relative', marginBottom: '24px' }}>
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
          </div>
          <h1
            style={{
              fontFamily: 'var(--font-brand)',
              fontSize: '40px',
              fontWeight: 400,
              color: 'var(--brand-purple)',
              margin: '0 0 8px',
              letterSpacing: '-0.02em',
            }}
          >
            Verify your email
          </h1>
        </div>

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
          <VerifyCodeForm email={email} resendOnMount onVerified={handleVerifiedLogin} />
          <button
            type="button"
            onClick={() => {
              setNeedsVerification(false);
              setError('');
            }}
            style={{
              width: '100%',
              marginTop: '18px',
              padding: '12px',
              background: 'transparent',
              border: 'none',
              color: 'var(--outline)',
              fontSize: '14px',
              fontWeight: 600,
              fontFamily: 'inherit',
              cursor: 'pointer',
            }}
          >
            Back to login
          </button>
        </div>
      </>
    );
  }

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
          style={{ position: 'relative', display: 'inline-flex' }}
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
            width={144}
            height={144}
            style={{ objectFit: 'contain', position: 'relative' }}
            priority
          />
        </Link>
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

        <form
          onSubmit={handleSubmit}
          style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}
        >
          {/* Email */}
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

          {/* Password */}
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
              Password
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
                  lock
                </span>
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                style={{ ...inputStyle, paddingRight: '48px' }}
                onFocus={(e) => {
                  e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
                }}
                onBlur={(e) => {
                  e.target.style.boxShadow = 'none';
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{
                  position: 'absolute',
                  right: 0,
                  top: 0,
                  bottom: 0,
                  paddingRight: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  background: 'transparent',
                  border: 'none',
                  color: 'var(--outline)',
                  cursor: 'pointer',
                }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                  {showPassword ? 'visibility_off' : 'visibility'}
                </span>
              </button>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
              <a
                href="#"
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: '#c1a4ff',
                  textDecoration: 'none',
                  transition: 'color 0.15s',
                }}
              >
                Forgot Password?
              </a>
            </div>
          </div>

          {/* Submit */}
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
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  '0 12px 32px rgba(174,137,255,0.35)';
              }
            }}
            onMouseLeave={(e) => {
              if (!loading) {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  '0 8px 24px rgba(174,137,255,0.25)';
              }
            }}
            onMouseDown={(e) => {
              if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(0.98)';
            }}
            onMouseUp={(e) => {
              if (!loading) (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.02)';
            }}
          >
            {loading ? 'Signing in…' : 'Log In'}
          </button>
        </form>

        <OAuthProviderRow
          callbackUrl="/auth/login"
          disabled={loading}
          onError={setError}
        />
      </div>

      {/* Sign-up link */}
      <p
        style={{
          marginTop: '32px',
          textAlign: 'center',
          color: 'var(--on-surface-variant)',
          fontSize: '15px',
        }}
      >
        Don&apos;t have an account?{' '}
        <Link
          href="/auth/register"
          style={{ color: 'var(--brand-gold)', fontWeight: 900, textDecoration: 'none' }}
        >
          Sign Up
        </Link>
      </p>

      {/* Footer */}
      <div
        style={{
          marginTop: '48px',
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: '12px 24px',
        }}
      >
        {[
          { label: 'Privacy Policy', href: '/privacy' },
          { label: 'Terms of Service', href: '/terms' },
          { label: 'Help Center', href: '/docs' },
        ].map((item) => (
          <a
            key={item.label}
            href={item.href}
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'var(--outline)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              textDecoration: 'none',
              whiteSpace: 'nowrap',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--on-surface)';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = 'var(--outline)';
            }}
          >
            {item.label}
          </a>
        ))}
      </div>
    </>
  );
}
