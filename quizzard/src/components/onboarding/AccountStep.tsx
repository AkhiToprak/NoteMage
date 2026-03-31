'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface AccountStepData {
  username: string;
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
  agreed: boolean;
}

interface AccountStepProps {
  data: AccountStepData;
  onChange: (field: string, value: string | boolean) => void;
  onNext: () => void;
  loading: boolean;
  error: string;
}

type UsernameStatus = 'idle' | 'typing' | 'checking' | 'available' | 'taken' | 'invalid';

const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

function getPasswordScore(password: string): number {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return score;
}

const scoreLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const scoreColor = ['#555578', '#fd6f85', '#ffde59', '#ae89ff', '#4dff91'];

export default function AccountStep({ data, onChange, onNext, loading, error }: AccountStepProps) {
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [usernameMessage, setUsernameMessage] = useState('');
  const [confirmBlurred, setConfirmBlurred] = useState(false);
  const [localError, setLocalError] = useState('');

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkUsername = useCallback(async (username: string) => {
    if (!USERNAME_REGEX.test(username)) {
      setUsernameStatus('invalid');
      setUsernameMessage('3–20 chars, letters, numbers, underscores');
      return;
    }
    setUsernameStatus('checking');
    setUsernameMessage('');
    try {
      const res = await fetch(`/api/user/check-username?username=${encodeURIComponent(username)}`);
      const json = await res.json();
      if (json.data?.available) {
        setUsernameStatus('available');
        setUsernameMessage('Available');
      } else {
        setUsernameStatus('taken');
        setUsernameMessage('Taken');
      }
    } catch {
      setUsernameStatus('idle');
      setUsernameMessage('');
    }
  }, []);

  const handleUsernameChange = (value: string) => {
    onChange('username', value);
    setUsernameStatus('typing');
    setUsernameMessage('');
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.length === 0) {
      setUsernameStatus('idle');
      return;
    }
    debounceRef.current = setTimeout(() => checkUsername(value), 500);
  };

  useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const passwordScore = getPasswordScore(data.password);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!data.username) {
      setLocalError('Username is required');
      return;
    }
    if (!USERNAME_REGEX.test(data.username)) {
      setLocalError('Username must be 3–20 chars, letters, numbers, underscores only');
      return;
    }
    if (usernameStatus === 'taken') {
      setLocalError('That username is already taken');
      return;
    }
    if (usernameStatus === 'checking') {
      setLocalError('Please wait while we check username availability');
      return;
    }
    if (!data.email) {
      setLocalError('Email is required');
      return;
    }
    if (data.password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }
    if (data.password !== data.confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }
    if (!data.agreed) {
      setLocalError('Please agree to the Terms of Service and Privacy Policy');
      return;
    }
    onNext();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '16px 16px 16px 48px',
    background: '#2a2a4c',
    border: 'none',
    borderRadius: '16px',
    color: '#e5e3ff',
    fontSize: '15px',
    fontFamily: 'inherit',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
  };

  const inputWithRightStyle: React.CSSProperties = {
    ...inputStyle,
    paddingRight: '44px',
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
      <h2 style={{ fontSize: '22px', fontWeight: 700, color: '#e5e3ff', margin: '0 0 24px' }}>
        Create Account
      </h2>

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

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Username */}
        <div>
          <label style={labelStyle}>Username</label>
          <div style={{ position: 'relative' }}>
            <div style={iconWrapStyle}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>alternate_email</span>
            </div>
            <input
              type="text"
              placeholder="coolscholar42"
              value={data.username}
              onChange={(e) => handleUsernameChange(e.target.value)}
              disabled={loading}
              style={inputWithRightStyle}
              onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)'; }}
              onBlur={(e) => { e.target.style.boxShadow = 'none'; }}
            />
            {/* Right icon / status */}
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
              {usernameStatus === 'checking' && (
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
              {usernameStatus === 'available' && (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '18px', color: '#4dff91', fontVariationSettings: "'FILL' 1" }}
                >
                  check_circle
                </span>
              )}
              {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                <span
                  className="material-symbols-outlined"
                  style={{ fontSize: '18px', color: '#fd6f85', fontVariationSettings: "'FILL' 1" }}
                >
                  cancel
                </span>
              )}
            </div>
          </div>
          {/* Status message */}
          {usernameStatus === 'available' && (
            <p style={{ margin: '6px 0 0 4px', fontSize: '12px', color: '#4dff91' }}>{usernameMessage}</p>
          )}
          {usernameStatus === 'taken' && (
            <p style={{ margin: '6px 0 0 4px', fontSize: '12px', color: '#fd6f85' }}>{usernameMessage}</p>
          )}
          {usernameStatus === 'invalid' && (
            <p style={{ margin: '6px 0 0 4px', fontSize: '12px', color: '#fd6f85' }}>{usernameMessage}</p>
          )}
          {(usernameStatus === 'idle' || usernameStatus === 'typing') && (
            <p style={{ margin: '6px 0 0 4px', fontSize: '12px', color: '#8888a8' }}>
              3–20 chars, letters, numbers, underscores
            </p>
          )}
        </div>

        {/* Full Name */}
        <div>
          <label style={labelStyle}>Full Name <span style={{ color: '#8888a8', fontWeight: 400 }}>(optional)</span></label>
          <div style={{ position: 'relative' }}>
            <div style={iconWrapStyle}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>person</span>
            </div>
            <input
              type="text"
              placeholder="Alex Scholar"
              value={data.name}
              onChange={(e) => onChange('name', e.target.value)}
              disabled={loading}
              style={inputStyle}
              onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)'; }}
              onBlur={(e) => { e.target.style.boxShadow = 'none'; }}
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label style={labelStyle}>Email Address</label>
          <div style={{ position: 'relative' }}>
            <div style={iconWrapStyle}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>mail</span>
            </div>
            <input
              type="email"
              placeholder="alex@quizzard.ai"
              value={data.email}
              onChange={(e) => onChange('email', e.target.value)}
              required
              disabled={loading}
              style={inputStyle}
              onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)'; }}
              onBlur={(e) => { e.target.style.boxShadow = 'none'; }}
            />
          </div>
        </div>

        {/* Password */}
        <div>
          <label style={labelStyle}>Password</label>
          <div style={{ position: 'relative' }}>
            <div style={iconWrapStyle}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>lock</span>
            </div>
            <input
              type="password"
              placeholder="••••••••"
              value={data.password}
              onChange={(e) => onChange('password', e.target.value)}
              required
              disabled={loading}
              style={inputStyle}
              onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)'; }}
              onBlur={(e) => { e.target.style.boxShadow = 'none'; }}
            />
          </div>
          {/* Strength indicator */}
          {data.password.length > 0 && (
            <div style={{ marginTop: '10px' }}>
              <div style={{ display: 'flex', gap: '4px', marginBottom: '6px' }}>
                {[1, 2, 3, 4].map((seg) => (
                  <div
                    key={seg}
                    style={{
                      flex: 1,
                      height: '4px',
                      borderRadius: '2px',
                      background: passwordScore >= seg ? scoreColor[passwordScore] : '#555578',
                      transition: 'background 0.3s cubic-bezier(0.22,1,0.36,1)',
                    }}
                  />
                ))}
              </div>
              {passwordScore > 0 && (
                <p style={{ margin: 0, fontSize: '12px', color: scoreColor[passwordScore], fontWeight: 600 }}>
                  {scoreLabel[passwordScore]}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Confirm Password */}
        <div>
          <label style={labelStyle}>Confirm Password</label>
          <div style={{ position: 'relative' }}>
            <div style={iconWrapStyle}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>lock_person</span>
            </div>
            <input
              type="password"
              placeholder="••••••••"
              value={data.confirmPassword}
              onChange={(e) => onChange('confirmPassword', e.target.value)}
              required
              disabled={loading}
              style={inputStyle}
              onFocus={(e) => { e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)'; }}
              onBlur={() => setConfirmBlurred(true)}
            />
          </div>
          {confirmBlurred && data.confirmPassword && data.password !== data.confirmPassword && (
            <p style={{ margin: '6px 0 0 4px', fontSize: '12px', color: '#fd6f85' }}>
              Passwords do not match
            </p>
          )}
        </div>

        {/* Terms */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '0 4px' }}>
          <input
            type="checkbox"
            id="terms-onboarding"
            checked={data.agreed}
            onChange={(e) => onChange('agreed', e.target.checked)}
            style={{
              marginTop: '2px',
              width: '18px',
              height: '18px',
              borderRadius: '4px',
              background: '#2a2a4c',
              border: 'none',
              accentColor: '#ae89ff',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          />
          <label
            htmlFor="terms-onboarding"
            style={{ fontSize: '13px', color: '#aaa8c8', lineHeight: '1.6', cursor: 'pointer' }}
          >
            I agree to the{' '}
            <a href="#" style={{ color: '#b9c3ff', textDecoration: 'none' }}>Terms of Service</a>
            {' '}and{' '}
            <a href="#" style={{ color: '#b9c3ff', textDecoration: 'none' }}>Privacy Policy</a>.
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '16px',
            background: loading ? '#555578' : 'linear-gradient(135deg, #ae89ff 0%, #884efb 100%)',
            border: 'none',
            borderRadius: '16px',
            color: loading ? '#aaa8c8' : '#2a0066',
            fontSize: '16px',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: loading ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
            transition: 'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
          }}
          onMouseEnter={(e) => {
            if (!loading) {
              e.currentTarget.style.transform = 'scale(1.02)';
              e.currentTarget.style.boxShadow = '0 12px 32px rgba(174,137,255,0.4)';
            }
          }}
          onMouseLeave={(e) => {
            if (!loading) {
              e.currentTarget.style.transform = 'scale(1)';
              e.currentTarget.style.boxShadow = '0 8px 24px rgba(174,137,255,0.3)';
            }
          }}
          onMouseDown={(e) => {
            if (!loading) e.currentTarget.style.transform = 'scale(0.98)';
          }}
          onMouseUp={(e) => {
            if (!loading) e.currentTarget.style.transform = 'scale(1.02)';
          }}
        >
          {loading ? (
            'Creating account…'
          ) : (
            <>
              Continue
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>arrow_forward</span>
            </>
          )}
        </button>
      </form>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
