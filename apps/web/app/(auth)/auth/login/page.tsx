'use client';

import { signIn } from 'next-auth/react';
import { FormEvent, useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { nativeBridge, isInsideNativeShell } from '@/lib/native-bridge';

export default function LoginPage() {
  // useSearchParams in a client page must be wrapped in Suspense for the
  // Next.js 14 build to succeed — the inner form owns the hook.
  return (
    <Suspense fallback={null}>
      <LoginForm />
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
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);

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

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setError('');
    setOauthLoading(provider);

    // Inside the iOS WebView shell, Apple Sign-In has to use the native
    // ASAuthorizationAppleIDProvider flow — NextAuth's redirect handshake
    // doesn't work in an embedded WebView. The shell hands us back an
    // identity token which we exchange for a session cookie.
    if (provider === 'apple' && isInsideNativeShell()) {
      try {
        const result = await nativeBridge.signInWithApple();
        const res = await fetch('/api/auth/native/apple', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(result),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (data?.error === 'OAuthAccountExists') {
            setError(
              'An account already exists for this email. Please sign in with your password, then link Apple from settings.'
            );
          } else {
            setError('Sign in with Apple failed. Please try again.');
          }
          setOauthLoading(null);
          return;
        }
        router.push('/home');
      } catch {
        // User cancelled or the bridge rejected — silently reset.
        setOauthLoading(null);
      }
      return;
    }

    // Web (and Google in any environment): NextAuth redirect handshake.
    // Keep OAuth users on the login surface while signups are paused.
    signIn(provider, { callbackUrl: '/auth/login' });
  };

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
        } else {
          setError('Invalid email or password');
        }
      } else if (result?.ok) {
        router.push('/home');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '16px 16px 16px 44px',
    background: '#23233c',
    border: 'none',
    borderRadius: '16px',
    color: '#e5e3ff',
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
            fontSize: '48px',
            fontWeight: 400,
            color: '#ae89ff',
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
          }}
        >
          Welcome back
        </h1>
        <p style={{ color: '#aaa8c8', fontSize: '17px', margin: 0 }}>
          Continue your quest for knowledge.
        </p>
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
        {/* Top gradient line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '1px',
            background:
              'linear-gradient(90deg, transparent 0%, rgba(174,137,255,0.4) 50%, transparent 100%)',
          }}
        />

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
                color: '#b9c3ff',
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
                  color: '#737390',
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
                color: '#b9c3ff',
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
                  color: '#737390',
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
                  color: '#737390',
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
              background: loading ? '#464560' : 'linear-gradient(135deg, #ae89ff 0%, #884efb 100%)',
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
            {!loading && (
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                auto_awesome
              </span>
            )}
          </button>
        </form>

        {/* OAuth divider + providers */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            margin: '28px 0 20px',
          }}
        >
          <div style={{ flex: 1, height: '1px', background: 'rgba(174,137,255,0.15)' }} />
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: '#737390',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            or continue with
          </span>
          <div style={{ flex: 1, height: '1px', background: 'rgba(174,137,255,0.15)' }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <button
            type="button"
            onClick={() => handleOAuth('google')}
            disabled={loading || oauthLoading !== null}
            style={{
              width: '100%',
              padding: '14px 16px',
              background: '#ffffff',
              border: 'none',
              borderRadius: '16px',
              color: '#1f1f1f',
              fontSize: '15px',
              fontWeight: 700,
              cursor: loading || oauthLoading !== null ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              opacity: loading || (oauthLoading && oauthLoading !== 'google') ? 0.5 : 1,
              transition:
                'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => {
              if (!loading && !oauthLoading) {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.01)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  '0 8px 24px rgba(255,255,255,0.08)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 48 48"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fill="#FFC107"
                d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
              />
              <path
                fill="#FF3D00"
                d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571.001-.001.002-.001.003-.002l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
              />
            </svg>
            {oauthLoading === 'google' ? 'Redirecting…' : 'Continue with Google'}
          </button>

          <button
            type="button"
            onClick={() => handleOAuth('apple')}
            disabled={loading || oauthLoading !== null}
            style={{
              width: '100%',
              padding: '14px 16px',
              background: '#000000',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '16px',
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: 700,
              cursor: loading || oauthLoading !== null ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              opacity: loading || (oauthLoading && oauthLoading !== 'apple') ? 0.5 : 1,
              transition:
                'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => {
              if (!loading && !oauthLoading) {
                (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.01)';
                (e.currentTarget as HTMLButtonElement).style.boxShadow =
                  '0 8px 24px rgba(0,0,0,0.4)';
              }
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
              (e.currentTarget as HTMLButtonElement).style.boxShadow = 'none';
            }}
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              aria-hidden="true"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                fill="currentColor"
                d="M17.05 12.536c-.028-2.812 2.295-4.162 2.4-4.228-1.308-1.912-3.342-2.173-4.063-2.202-1.731-.175-3.38 1.018-4.258 1.018-.88 0-2.23-.993-3.668-.966-1.889.027-3.631 1.099-4.603 2.791-1.962 3.4-.501 8.424 1.411 11.184.934 1.35 2.05 2.867 3.513 2.812 1.411-.056 1.944-.912 3.651-.912s2.187.912 3.68.884c1.52-.027 2.486-1.377 3.421-2.73 1.078-1.571 1.523-3.098 1.551-3.175-.034-.017-2.978-1.144-3.035-4.476zm-2.788-8.21c.78-.944 1.308-2.257 1.163-3.562-1.128.045-2.49.75-3.299 1.694-.72.834-1.362 2.175-1.189 3.452 1.262.098 2.545-.64 3.325-1.584z"
              />
            </svg>
            {oauthLoading === 'apple' ? 'Redirecting…' : 'Continue with Apple'}
          </button>
        </div>
      </div>

      {/* Waitlist link */}
      <p
        style={{
          marginTop: '32px',
          textAlign: 'center',
          color: '#aaa8c8',
          fontSize: '15px',
        }}
      >
        Don&apos;t have an account?{' '}
        <Link
          href="/waitlist"
          style={{ color: '#ffde59', fontWeight: 900, textDecoration: 'none' }}
        >
          Sign Up
        </Link>
      </p>

      {/* Footer */}
      <div
        style={{
          marginTop: '48px',
          display: 'flex',
          justifyContent: 'center',
          gap: '32px',
        }}
      >
        {['Privacy Policy', 'Terms of Service', 'Help Center'].map((item) => (
          <a
            key={item}
            href="#"
            style={{
              fontSize: '11px',
              fontWeight: 700,
              color: 'rgba(115,115,144,0.4)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              textDecoration: 'none',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = '#737390';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = 'rgba(115,115,144,0.4)';
            }}
          >
            {item}
          </a>
        ))}
      </div>
    </>
  );
}
