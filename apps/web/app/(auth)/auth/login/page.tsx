/* eslint-disable @next/next/no-img-element */
'use client';

import { signIn } from 'next-auth/react';
import { FormEvent, useState, useEffect, useSyncExternalStore, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import VerifyCodeForm from '@/components/auth/VerifyCodeForm';
import TurnstileWidget, { turnstileEnabled } from '@/components/auth/TurnstileWidget';
import { nativeBridge, isInsideNativeShell } from '@/lib/native-bridge';
import styles from './Login.module.css';

// native-shell snapshot (SSR-safe): false on server, real value on client. Drives
// the Apple button, which only works through the iOS bridge (web OAuth is Google-only).
const subscribeNoop = () => () => {};
const getNativeClient = () => isInsideNativeShell();
const getNativeServer = () => false;

const SparkGold = (
  <svg viewBox="0 0 29 29" fill="none" aria-hidden focusable="false">
    <path
      d="M10.6066 0L17.1889 9.81239L28.9778 10.6066L19.1654 17.1889L18.3712 28.9778L11.7889 19.1655L0 18.3712L9.81237 11.7889L10.6066 0Z"
      fill="#FFC83D"
    />
  </svg>
);
const SparkPurple = (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden focusable="false">
    <path
      d="M9 0L11.291 6.70897L18 9L11.291 11.291L9 18L6.70897 11.291L0 9L6.70897 6.70897L9 0Z"
      fill="#7C5CFF"
    />
  </svg>
);

const GoogleIcon = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden xmlns="http://www.w3.org/2000/svg">
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
      d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
    />
  </svg>
);
const AppleIcon = (
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden xmlns="http://www.w3.org/2000/svg">
    <path
      fill="#18202f"
      d="M17.05 12.536c-.028-2.812 2.295-4.162 2.4-4.228-1.308-1.912-3.342-2.173-4.063-2.202-1.731-.175-3.38 1.018-4.258 1.018-.88 0-2.23-.993-3.668-.966-1.889.027-3.631 1.099-4.603 2.791-1.962 3.4-.501 8.424 1.411 11.184.934 1.35 2.05 2.867 3.513 2.812 1.411-.056 1.944-.912 3.651-.912s2.187.912 3.68.884c1.52-.027 2.486-1.377 3.421-2.73 1.078-1.571 1.523-3.098 1.551-3.175-.034-.017-2.978-1.144-3.035-4.476zm-2.788-8.21c.78-.944 1.308-2.257 1.163-3.562-1.128.045-2.49.75-3.299 1.694-.72.834-1.362 2.175-1.189 3.452 1.262.098 2.545-.64 3.325-1.584z"
    />
  </svg>
);

export default function LoginPage() {
  // useSearchParams in a client page must be wrapped in Suspense for the build.
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
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  // Set when authorize() rejects an unverified credentials account.
  const [needsVerification, setNeedsVerification] = useState(false);
  // Adaptive bot gate: appears after enough failed logins from this IP.
  const [turnstileToken, setTurnstileToken] = useState('');
  const [challengeRequired, setChallengeRequired] = useState(false);
  const [captchaKey, setCaptchaKey] = useState(0);

  // Apple Sign In only works through the iOS native bridge; hidden on web.
  const showApple = useSyncExternalStore(subscribeNoop, getNativeClient, getNativeServer);

  // Success banner after a password reset (redirected from forgot-password with ?reset=1).
  useEffect(() => {
    if (searchParams.get('reset') === '1') {
      setNotice('Your password has been reset. Please log in with your new password.');
    }
  }, [searchParams]);

  // Surface NextAuth redirect errors (OAuthAccountExists is the important one).
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

  // On mount, ask whether this IP already needs the challenge.
  useEffect(() => {
    if (!turnstileEnabled) return;
    let active = true;
    fetch('/api/auth/login-challenge')
      .then((r) => r.json())
      .then((d) => {
        if (active && d?.required) setChallengeRequired(true);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // Re-check the challenge and re-mount the widget (tokens are single-use) after a failure.
  const refreshChallenge = async () => {
    setTurnstileToken('');
    setCaptchaKey((k) => k + 1);
    if (!turnstileEnabled) return;
    try {
      const d = await (await fetch('/api/auth/login-challenge')).json();
      if (d?.required) setChallengeRequired(true);
    } catch {
      /* ignore */
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');

    if (turnstileEnabled && challengeRequired && !turnstileToken) {
      setError('Please complete the verification challenge.');
      return;
    }

    setLoading(true);
    try {
      const result = await signIn('credentials', {
        email,
        password,
        turnstileToken,
        redirect: false,
      });

      if (result?.error) {
        if (result.error === 'EMAIL_NOT_VERIFIED') {
          setNeedsVerification(true);
        } else if (result.error === 'CAPTCHA_REQUIRED') {
          setChallengeRequired(true);
          setError('Please complete the verification challenge below.');
          await refreshChallenge();
        } else {
          setError('Invalid email or password');
          await refreshChallenge();
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

  // After code confirmation, finish the sign-in the user already started.
  const handleVerifiedLogin = async () => {
    const result = await signIn('credentials', { email, password, redirect: false });
    if (result?.ok) {
      router.push('/dashboard');
    } else {
      setNeedsVerification(false);
      setError('Email verified! Please sign in.');
    }
  };

  // OAuth — web uses the NextAuth redirect handshake; the iOS WebView shell can't,
  // so it runs each provider natively and exchanges the token for a session.
  // (Mirrors OAuthProviderRow, restyled inline for the light login.)
  const handleOAuth = async (provider: 'google' | 'apple') => {
    setOauthLoading(provider);
    if (isInsideNativeShell()) {
      try {
        let endpoint: string;
        let payload: unknown;
        if (provider === 'apple') {
          endpoint = '/api/auth/native/apple';
          payload = await nativeBridge.signInWithApple();
        } else {
          endpoint = '/api/auth/native/google';
          payload = await nativeBridge.signInWithGoogle();
        }
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as { error?: string } | null;
          if (data?.error === 'OAuthAccountExists') {
            setError(
              'An account already exists for this email. Please sign in with your password, then link it from settings.'
            );
          } else {
            setError(
              `Sign in with ${provider === 'apple' ? 'Apple' : 'Google'} failed. Please try again.`
            );
          }
          setOauthLoading(null);
          return;
        }
        router.push('/dashboard');
      } catch {
        setOauthLoading(null);
      }
      return;
    }
    signIn(provider, { callbackUrl: '/auth/login' });
  };

  const oauthBusy = loading || oauthLoading !== null;

  // Inline email-confirmation flow — kept on the original dark card (the shared
  // VerifyCodeForm is dark-themed) so the code inputs stay legible.
  if (needsVerification) {
    return (
      <div className={styles.verifyRoot}>
        <div data-theme="dark" className={styles.verifyCard}>
          <img
            src="/landing/notemage-wordmark.png"
            alt="Notemage"
            width={120}
            height={45}
            style={{ height: 36, width: 'auto', margin: '0 auto' }}
          />
          <h1 className={styles.verifyTitle}>Verify your email</h1>
          <VerifyCodeForm email={email} resendOnMount onVerified={handleVerifiedLogin} />
          <button
            type="button"
            className={styles.verifyBack}
            onClick={() => {
              setNeedsVerification(false);
              setError('');
            }}
          >
            Back to login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      {/* ─────────── LEFT PANEL ─────────── */}
      <div className={styles.panel}>
        <Link href="/" className={styles.panelLogo} aria-label="NoteMage — home">
          <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
        </Link>
        <span className={`${styles.star} ${styles.starA}`} aria-hidden>
          {SparkGold}
        </span>
        <span className={`${styles.star} ${styles.starB}`} aria-hidden>
          {SparkPurple}
        </span>
        <span className={`${styles.star} ${styles.starC}`} aria-hidden>
          {SparkPurple}
        </span>
        <span className={`${styles.star} ${styles.starD}`} aria-hidden>
          {SparkGold}
        </span>
        <div className={styles.panelInner}>
          <img className={styles.panelMascot} src="/landing/mage-plain.png" alt="" aria-hidden />
          <h2 className={styles.panelTitle}>Welcome back.</h2>
          <p className={styles.panelSub}>
            Your paths, weak points, and progress are right where you left them.
          </p>
        </div>
      </div>

      {/* ─────────── RIGHT FORM ─────────── */}
      <div className={styles.formCol}>
        <div className={styles.form}>
          <Link href="/" className={styles.formLogo} aria-label="NoteMage — home">
            <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
          </Link>
          <h1 className={styles.formTitle}>Log in</h1>
          <p className={styles.formSub}>Welcome back — let&apos;s keep studying.</p>

          {notice && !error && (
            <div className={`${styles.banner} ${styles.bannerNotice}`}>{notice}</div>
          )}
          {error && <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>}

          <div className={styles.oauthList}>
            <button
              type="button"
              className={styles.oauthBtn}
              onClick={() => handleOAuth('google')}
              disabled={oauthBusy}
            >
              {GoogleIcon}
              {oauthLoading === 'google' ? 'Redirecting…' : 'Continue with Google'}
            </button>
            {showApple && (
              <button
                type="button"
                className={styles.oauthBtn}
                onClick={() => handleOAuth('apple')}
                disabled={oauthBusy}
              >
                {AppleIcon}
                {oauthLoading === 'apple' ? 'Redirecting…' : 'Continue with Apple'}
              </button>
            )}
          </div>

          <div className={styles.or} aria-hidden>
            <span className={styles.orLine} />
            <span>or</span>
            <span className={styles.orLine} />
          </div>

          <form onSubmit={handleSubmit}>
            <div className={styles.field}>
              <label htmlFor="email" className={styles.label}>
                Email
              </label>
              <div className={styles.inputWrap}>
                <input
                  id="email"
                  type="email"
                  className={styles.input}
                  placeholder="you@school.edu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="email"
                />
              </div>
            </div>

            <div className={styles.field}>
              <div className={styles.pwLabelRow}>
                <label htmlFor="password" className={styles.label} style={{ marginBottom: 0 }}>
                  Password
                </label>
                <Link href="/auth/forgot-password" className={styles.forgot}>
                  Forgot password?
                </Link>
              </div>
              <div className={styles.inputWrap}>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  className={`${styles.input} ${styles.inputPw}`}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  disabled={loading}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className={styles.eye}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  <span className="material-symbols-outlined" aria-hidden>
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {challengeRequired && (
              <div className={styles.turnstile}>
                <TurnstileWidget key={captchaKey} theme="light" onToken={setTurnstileToken} />
              </div>
            )}

            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? 'Signing in…' : 'Log in'}
            </button>
          </form>

          <p className={styles.createLink}>
            New to Notemage? <Link href="/auth/register">Create an account</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
