'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * OAuth onboarding step 1: pick a real username to replace the `oauth_*`
 * placeholder that was generated when the User row was created in the
 * NextAuth signIn callback. Mirrors the username field in AccountStep so
 * the two paths look and feel identical.
 */
interface UsernameStepProps {
  /** Suggested starting value (usually derived from the OAuth email prefix). */
  suggested: string;
  /** OAuth provider avatar URL (if any) — shown as a small confirmation chip. */
  avatarUrl?: string | null;
  /** Display name from the OAuth profile (if any) — shown in the same chip. */
  displayName?: string | null;
  /** Called with the accepted username once /api/user/username succeeds. */
  onSaved: (username: string) => void;
  error: string;
}

type UsernameStatus = 'idle' | 'typing' | 'checking' | 'available' | 'taken' | 'invalid';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export default function UsernameStep({
  suggested,
  avatarUrl,
  displayName,
  onSaved,
  error,
}: UsernameStepProps) {
  const [username, setUsername] = useState(suggested);
  const [status, setStatus] = useState<UsernameStatus>('idle');
  const [statusMessage, setStatusMessage] = useState('');
  const [localError, setLocalError] = useState('');
  const [saving, setSaving] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkUsername = useCallback(async (candidate: string) => {
    if (!USERNAME_REGEX.test(candidate)) {
      setStatus('invalid');
      setStatusMessage('3–20 chars, letters, numbers, underscores');
      return;
    }
    setStatus('checking');
    setStatusMessage('');
    try {
      const res = await fetch(`/api/user/check-username?username=${encodeURIComponent(candidate)}`);
      const json = await res.json();
      if (json.data?.available) {
        setStatus('available');
        setStatusMessage('Available');
      } else {
        setStatus('taken');
        setStatusMessage('Taken');
      }
    } catch {
      setStatus('idle');
      setStatusMessage('');
    }
  }, []);

  // Run an availability check on the initial suggestion so the user sees
  // a green check (or a warning) the instant the step mounts. Deferred via
  // Promise.resolve().then() so the leading setStatus calls inside
  // checkUsername don't fire synchronously inside the effect body
  // (react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!suggested || !USERNAME_REGEX.test(suggested)) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void checkUsername(suggested);
    });
    return () => {
      cancelled = true;
    };
  }, [suggested, checkUsername]);

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const handleChange = (value: string) => {
    setUsername(value);
    setStatus('typing');
    setStatusMessage('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length === 0) {
      setStatus('idle');
      return;
    }
    debounceRef.current = setTimeout(() => checkUsername(value), 500);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!username) {
      setLocalError('Username is required');
      return;
    }
    if (!USERNAME_REGEX.test(username)) {
      setLocalError('Username must be 3–20 chars, letters, numbers, underscores only');
      return;
    }
    if (status === 'taken') {
      setLocalError('That username is already taken');
      return;
    }
    if (status === 'checking') {
      setLocalError('Please wait while we check username availability');
      return;
    }

    setSaving(true);
    try {
      const res = await fetch('/api/user/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setLocalError(json?.error || 'Failed to save username');
        setSaving(false);
        return;
      }
      onSaved(username.toLowerCase());
    } catch {
      setLocalError('Something went wrong. Please try again.');
      setSaving(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '16px 44px 16px 48px',
    background: '#35355c',
    border: 'none',
    borderRadius: '16px',
    color: '#e5e3ff',
    fontSize: '15px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
  };

  const iconWrapStyle: React.CSSProperties = {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    paddingLeft: '14px',
    display: 'flex',
    alignItems: 'center',
    pointerEvents: 'none',
    color: '#aaa8c8',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '14px',
    fontWeight: 600,
    color: '#b9c3ff',
    marginBottom: '8px',
    paddingLeft: '4px',
  };

  const displayError = error || localError;

  return (
    <>
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 8px' }}>
        Pick a username
      </h2>
      <p style={{ fontSize: '14px', color: '#aaa8c8', margin: '0 0 24px' }}>
        This is how other mages will find you. You can change it later from settings.
      </p>

      {(avatarUrl || displayName) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            padding: '12px 16px',
            marginBottom: '24px',
            background: 'rgba(174,137,255,0.08)',
            border: '1px solid rgba(174,137,255,0.2)',
            borderRadius: '14px',
          }}
        >
          {avatarUrl && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt=""
              style={{
                width: '40px',
                height: '40px',
                borderRadius: '50%',
                objectFit: 'cover',
              }}
            />
          )}
          <div style={{ fontSize: '13px', color: '#c0bed8', lineHeight: 1.4 }}>
            <div style={{ color: '#e5e3ff', fontWeight: 600 }}>{displayName || 'Signed in'}</div>
            <div>We brought these over from your account. Just pick a handle.</div>
          </div>
        </div>
      )}

      {displayError && (
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
          {displayError}
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}
      >
        <div>
          <label style={labelStyle}>Username</label>
          <div style={{ position: 'relative' }}>
            <div style={iconWrapStyle}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                alternate_email
              </span>
            </div>
            <input
              type="text"
              placeholder="coolmage42"
              value={username}
              onChange={(e) => handleChange(e.target.value)}
              disabled={saving}
              autoFocus
              style={inputStyle}
              onFocus={(e) => {
                e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
              }}
              onBlur={(e) => {
                e.target.style.boxShadow = 'none';
              }}
            />
            <div
              style={{
                position: 'absolute',
                right: '14px',
                top: 0,
                bottom: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {status === 'checking' && (
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '18px',
                    color: '#ae89ff',
                    animation: 'spin 1s linear infinite',
                  }}
                >
                  progress_activity
                </span>
              )}
              {status === 'available' && (
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '18px',
                    color: '#4dff91',
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  check_circle
                </span>
              )}
              {(status === 'taken' || status === 'invalid') && (
                <span
                  className="material-symbols-outlined"
                  style={{
                    fontSize: '18px',
                    color: '#fd6f85',
                    fontVariationSettings: "'FILL' 1",
                  }}
                >
                  cancel
                </span>
              )}
            </div>
          </div>
          {status === 'available' && (
            <p style={{ margin: '6px 0 0 4px', fontSize: '12px', color: '#4dff91' }}>
              {statusMessage}
            </p>
          )}
          {(status === 'taken' || status === 'invalid') && (
            <p style={{ margin: '6px 0 0 4px', fontSize: '12px', color: '#fd6f85' }}>
              {statusMessage}
            </p>
          )}
          {(status === 'idle' || status === 'typing') && (
            <p style={{ margin: '6px 0 0 4px', fontSize: '12px', color: '#8888a8' }}>
              3–20 chars, letters, numbers, underscores
            </p>
          )}
        </div>

        <button
          type="submit"
          disabled={saving}
          style={{
            width: '100%',
            padding: '16px',
            background: saving ? '#555578' : 'linear-gradient(135deg, #ae89ff 0%, #884efb 100%)',
            border: 'none',
            borderRadius: '16px',
            color: saving ? '#aaa8c8' : '#2a0066',
            fontSize: '16px',
            fontWeight: 700,
            cursor: saving ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: saving ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
            transition:
              'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          onMouseEnter={(e) => {
            if (!saving) {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 12px 32px rgba(174,137,255,0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!saving) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(174,137,255,0.3)';
            }
          }}
          onMouseDown={(e) => {
            if (!saving) e.currentTarget.style.transform = 'scale(0.98)';
          }}
          onMouseUp={(e) => {
            if (!saving) e.currentTarget.style.transform = 'scale(1.02)';
          }}
        >
          {saving ? (
            'Saving…'
          ) : (
            <>
              Continue
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                arrow_forward
              </span>
            </>
          )}
        </button>
      </form>
    </>
  );
}
