'use client';

import { useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { nativeBridge, isInsideNativeShell } from '@/lib/native-bridge';

// useSyncExternalStore plumbing for the native-shell flag — separate server
// and client snapshots make this SSR-safe (false on the server, real value on
// the client) without the setState-in-effect anti-pattern. The native-shell
// result doesn't change after mount, so the subscribe is a no-op.
const subscribeNoop = () => () => {};
const getNativeShellClient = () => isInsideNativeShell();
const getNativeShellServer = () => false;

interface OAuthProviderRowProps {
  /**
   * Where NextAuth lands the user after a successful OAuth round-trip.
   * `/auth/login` on the login page, `/auth/register` inside the onboarding
   * wizard's account step — using `/auth/register` lets a brand-new OAuth
   * user remount the wizard directly and hit the OAuth DOB gate without an
   * extra middleware redirect through `/auth/login`.
   */
  callbackUrl: string;
  /** Disable both buttons while the parent (e.g. credentials form) is busy. */
  disabled?: boolean;
  /**
   * Called when the native Apple bridge fails. The redirect handshake errors
   * (OAuthAccountExists, OAuthSignin, etc.) are surfaced via NextAuth's
   * `?error=` query param on the destination page, not through this prop.
   */
  onError?: (message: string) => void;
}

/**
 * The "or continue with" divider + Google + Apple buttons. Extracted from the
 * original login page so the onboarding wizard's credentials account step can
 * mount the same surface — register/login share the OAuth entry point.
 *
 * Inside the iOS WebView shell, both providers sign in natively because
 * NextAuth's redirect handshake can't complete in an embedded WebView: Apple
 * via `nativeBridge.signInWithApple()` and Google via
 * `nativeBridge.signInWithGoogle()` (system-browser OAuth), each exchanged for
 * a session at `POST /api/auth/native/{apple,google}`. On the web both use the
 * standard NextAuth redirect handshake (Apple is hidden there — see showApple).
 */
export default function OAuthProviderRow({
  callbackUrl,
  disabled = false,
  onError,
}: OAuthProviderRowProps) {
  const router = useRouter();
  const [oauthLoading, setOauthLoading] = useState<'google' | 'apple' | null>(null);
  // Apple Sign In is only surfaced inside the iOS WebView shell — the web
  // redirect handshake needs a working Services ID + domain verification +
  // JWT, which we're not running today. The iOS native bridge below works
  // independently of all that, so iOS users still see the button (and the
  // App Store requires it once the iOS app offers Google).
  const showApple = useSyncExternalStore(
    subscribeNoop,
    getNativeShellClient,
    getNativeShellServer
  );

  const handleOAuth = async (provider: 'google' | 'apple') => {
    setOauthLoading(provider);

    // Inside the iOS WebView shell, OAuth can't use NextAuth's redirect
    // handshake: Apple's ASAuthorization and Google's "disallowed_useragent"
    // policy both refuse an embedded WebView. The shell runs each flow natively
    // (Apple via ASAuthorizationAppleIDProvider, Google via
    // ASWebAuthenticationSession) and hands back an identity token we exchange
    // for a session cookie at the matching /api/auth/native/* endpoint.
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
            onError?.(
              'An account already exists for this email. Please sign in with your password, then link it from settings.'
            );
          } else {
            onError?.(
              `Sign in with ${provider === 'apple' ? 'Apple' : 'Google'} failed. Please try again.`
            );
          }
          setOauthLoading(null);
          return;
        }
        // The session cookie is set on the response; navigate the WebView so
        // middleware can re-evaluate (onboarded → /dashboard, otherwise →
        // /auth/register via the !onboardingComplete gate).
        router.push('/dashboard');
      } catch {
        // User cancelled or the bridge rejected — silently reset.
        setOauthLoading(null);
      }
      return;
    }

    // Web: NextAuth redirect handshake (Apple is hidden on web; Google uses
    // the standard hosted redirect).
    signIn(provider, { callbackUrl });
  };

  const isBusy = disabled || oauthLoading !== null;

  return (
    <div style={{ marginTop: '22px' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '16px',
        }}
      >
        <div style={{ flex: 1, height: '1px', background: 'rgba(174,137,255,0.30)' }} />
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--outline)',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
          }}
        >
          or continue with
        </span>
        <div style={{ flex: 1, height: '1px', background: 'rgba(174,137,255,0.30)' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <button
          type="button"
          onClick={() => handleOAuth('google')}
          disabled={isBusy}
          style={{
            width: '100%',
            padding: '13px 16px',
            background: '#ffffff',
            border: 'none',
            borderRadius: '14px',
            color: '#1f1f1f',
            fontSize: '15px',
            fontWeight: 700,
            cursor: isBusy ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
            opacity: disabled || (oauthLoading && oauthLoading !== 'google') ? 0.5 : 1,
            transition:
              'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
          }}
          onMouseEnter={(e) => {
            if (!isBusy) {
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

        {showApple && (
          <button
            type="button"
            onClick={() => handleOAuth('apple')}
            disabled={isBusy}
            style={{
              width: '100%',
              padding: '13px 16px',
              background: '#000000',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: '14px',
              color: '#ffffff',
              fontSize: '15px',
              fontWeight: 700,
              cursor: isBusy ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '10px',
              opacity: disabled || (oauthLoading && oauthLoading !== 'apple') ? 0.5 : 1,
              transition:
                'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
            }}
            onMouseEnter={(e) => {
              if (!isBusy) {
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
        )}
      </div>
    </div>
  );
}
