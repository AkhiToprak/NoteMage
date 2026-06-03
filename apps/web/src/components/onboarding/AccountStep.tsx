'use client';

import { useState } from 'react';
import { Mascot } from '@/components/mascot';
import { computeAge, parseBirthDate, MIN_AGE } from '@/lib/age';
import DateOfBirthField from './DateOfBirthField';

interface AccountStepData {
  email: string;
  password: string;
  confirmPassword: string;
  birthDate: string;
  agreed: boolean;
}

interface AccountStepProps {
  data: AccountStepData;
  onChange: (field: string, value: string | boolean) => void;
  onNext: () => void;
  loading: boolean;
  error: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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

/**
 * Onboarding screen 1 (credentials path): the real sign-up form — email,
 * password, date of birth, terms. No username or name (those become their
 * own onboarding screens). The 13+ gate is checked here, before `onNext`
 * triggers account creation, so an under-13 user never gets a row.
 */
export default function AccountStep({ data, onChange, onNext, loading, error }: AccountStepProps) {
  const [confirmBlurred, setConfirmBlurred] = useState(false);
  const [localError, setLocalError] = useState('');

  const passwordScore = getPasswordScore(data.password);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError('');

    if (!data.email) {
      setLocalError('Email is required');
      return;
    }
    if (!EMAIL_REGEX.test(data.email)) {
      setLocalError('Please enter a valid email address');
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
    const birth = parseBirthDate(data.birthDate);
    if (!birth) {
      setLocalError('Please enter a valid date of birth');
      return;
    }
    if (computeAge(birth) < MIN_AGE) {
      setLocalError(`You must be at least ${MIN_AGE} years old to use NoteMage.`);
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
    padding: '12px 16px 12px 48px',
    background: 'var(--surface-container-highest)',
    border: 'none',
    borderRadius: '14px',
    color: 'var(--on-surface)',
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
    color: 'var(--on-surface-variant)',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 600,
    color: 'var(--on-surface-variant)',
    marginBottom: '6px',
    paddingLeft: '4px',
  };

  const displayError = error || localError;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '8px' }}>
        <Mascot pose="wave" size="md" idle="float" />
      </div>
      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: '22px',
          fontWeight: 800,
          letterSpacing: '-0.02em',
          color: 'var(--on-surface)',
          margin: '0 0 14px',
        }}
      >
        Create your account
      </h2>

      {displayError && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: '12px',
            background: 'rgba(253,111,133,0.12)',
            color: '#fd6f85',
            fontSize: '13px',
            marginBottom: '14px',
          }}
        >
          {displayError}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {/* Email */}
        <div>
          <label style={labelStyle}>Email Address</label>
          <div style={{ position: 'relative' }}>
            <div style={iconWrapStyle}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                mail
              </span>
            </div>
            <input
              type="email"
              placeholder="alex@notemage.ai"
              value={data.email}
              onChange={(e) => onChange('email', e.target.value)}
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
          <label style={labelStyle}>Password</label>
          <div style={{ position: 'relative' }}>
            <div style={iconWrapStyle}>
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                lock
              </span>
            </div>
            <input
              type="password"
              placeholder="••••••••"
              value={data.password}
              onChange={(e) => onChange('password', e.target.value)}
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
                <p
                  style={{
                    margin: 0,
                    fontSize: '12px',
                    color: scoreColor[passwordScore],
                    fontWeight: 600,
                  }}
                >
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
              <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
                lock_person
              </span>
            </div>
            <input
              type="password"
              placeholder="••••••••"
              value={data.confirmPassword}
              onChange={(e) => onChange('confirmPassword', e.target.value)}
              required
              disabled={loading}
              style={inputStyle}
              onFocus={(e) => {
                e.target.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
              }}
              onBlur={() => setConfirmBlurred(true)}
            />
          </div>
          {confirmBlurred && data.confirmPassword && data.password !== data.confirmPassword && (
            <p style={{ margin: '6px 0 0 4px', fontSize: '12px', color: '#fd6f85' }}>
              Passwords do not match
            </p>
          )}
        </div>

        {/* Date of birth */}
        <div>
          <label style={labelStyle}>Date of Birth</label>
          <DateOfBirthField
            value={data.birthDate}
            onChange={(value) => onChange('birthDate', value)}
            disabled={loading}
          />
          <p style={{ margin: '8px 0 0 4px', fontSize: '12px', color: 'var(--outline)' }}>
            You must be at least {MIN_AGE} to use NoteMage.
          </p>
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
              background: 'var(--surface-container-highest)',
              border: 'none',
              accentColor: '#ae89ff',
              flexShrink: 0,
              cursor: 'pointer',
            }}
          />
          <label
            htmlFor="terms-onboarding"
            style={{
              fontSize: '13px',
              color: 'var(--on-surface-variant)',
              lineHeight: '1.6',
              cursor: 'pointer',
            }}
          >
            I have read and accept the{' '}
            <a
              href="/terms"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--brand-purple-strong)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
            >
              Terms of Service
            </a>{' '}
            and{' '}
            <a
              href="/privacy"
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--brand-purple-strong)', textDecoration: 'underline', textUnderlineOffset: '2px' }}
            >
              Privacy Policy
            </a>
            .
          </label>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={loading}
          style={{
            width: '100%',
            padding: '13px',
            background: loading ? '#555578' : '#ae89ff',
            border: 'none',
            borderRadius: '14px',
            color: loading ? '#aaa8c8' : '#2a0066',
            fontSize: '16px',
            fontWeight: 700,
            cursor: loading ? 'not-allowed' : 'pointer',
            fontFamily: 'inherit',
            boxShadow: loading ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
            transition:
              'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            marginTop: '4px',
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
