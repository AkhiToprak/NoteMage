'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface ResetPasswordFormProps {
  /** The address the reset code was sent to — shown back to the user. */
  email: string;
  /** Called after the password is successfully reset (parent owns what's next). */
  onReset: () => void | Promise<void>;
}

const LENGTH = 6;
const RESEND_COOLDOWN_S = 60; // must be ≥ the server-side per-email cooldown
const MIN_PW = 8;
const MAX_PW = 128;

/**
 * Phase-2 of the forgot-password flow: 6-digit code entry + a new password.
 * Shares VerifyCodeForm's segmented-input styling and key handlers (auto-
 * advance, backspace-to-previous, paste) but — unlike VerifyCodeForm — does
 * NOT auto-submit on the sixth digit, because a password is still required.
 * Submission is gated on a complete code AND a valid, matching password, and
 * verifies the code + rewrites the password in a single request.
 */
export default function ResetPasswordForm({ email, onReset }: ResetPasswordFormProps) {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [resending, setResending] = useState(false);
  // The page already sent a code when advancing to this step, so start the
  // cooldown without re-sending.
  const [cooldown, setCooldown] = useState(RESEND_COOLDOWN_S);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const submittingRef = useRef(false);

  const code = digits.join('');
  const codeComplete = code.length === LENGTH && !digits.includes('');
  const pwTooShort = password.length > 0 && password.length < MIN_PW;
  const pwMismatch = confirm.length > 0 && password !== confirm;
  const canSubmit =
    codeComplete &&
    password.length >= MIN_PW &&
    password.length <= MAX_PW &&
    password === confirm &&
    !submitting;

  const submit = useCallback(async () => {
    if (submittingRef.current) return;
    if (!codeComplete) {
      setError('Enter the 6-digit code from your email.');
      return;
    }
    if (password.length < MIN_PW || password.length > MAX_PW) {
      setError('Password must be 8–128 characters.');
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
    setError('');
    setInfo('');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'That code is invalid or has expired.');
        setDigits(Array(LENGTH).fill(''));
        requestAnimationFrame(() => inputsRef.current[0]?.focus());
        return;
      }
      await onReset();
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }, [codeComplete, password, confirm, email, code, onReset]);

  const handleChange = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = digit;
    setDigits(next);
    if (error) setError('');
    if (digit && i < LENGTH - 1) {
      requestAnimationFrame(() => inputsRef.current[i + 1]?.focus());
    }
  };

  const handleKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      e.preventDefault();
      const next = [...digits];
      next[i - 1] = '';
      setDigits(next);
      requestAnimationFrame(() => inputsRef.current[i - 1]?.focus());
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, LENGTH);
    if (!text) return;
    e.preventDefault();
    const next = Array(LENGTH).fill('');
    text.split('').forEach((c, idx) => (next[idx] = c));
    setDigits(next);
    if (error) setError('');
    const focusIdx = Math.min(text.length, LENGTH - 1);
    requestAnimationFrame(() => inputsRef.current[focusIdx]?.focus());
  };

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError('');
    setInfo('');
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      setCooldown(RESEND_COOLDOWN_S);
      setInfo('A new code is on its way.');
    } catch {
      // Best-effort — the user can try again once the cooldown clears.
    } finally {
      setResending(false);
    }
  }, [cooldown, resending, email]);

  // Cooldown tick.
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => (c > 0 ? c - 1 : 0)), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  // Focus the first box on mount.
  useEffect(() => {
    inputsRef.current[0]?.focus();
  }, []);

  const ringColor = error ? '#fd6f85' : '#ae89ff';

  const boxStyle: React.CSSProperties = {
    flex: '1 1 0',
    minWidth: 0,
    height: '56px',
    textAlign: 'center',
    fontSize: '22px',
    fontWeight: 700,
    background: 'var(--surface-container-highest)',
    border: error ? '1px solid #fd6f85' : '1px solid transparent',
    borderRadius: '14px',
    color: 'var(--on-surface)',
    outline: 'none',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
    transition: 'box-shadow 0.2s cubic-bezier(0.22,1,0.36,1), border-color 0.2s',
  };

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontSize: '13px',
    fontWeight: 700,
    color: 'var(--on-surface-variant)',
    margin: '0 0 8px',
    paddingLeft: '4px',
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '14px 48px 14px 44px',
    background: 'var(--surface-container-highest)',
    border: '1px solid transparent',
    borderRadius: '14px',
    color: 'var(--on-surface)',
    fontSize: '15px',
    fontFamily: 'inherit',
    fontWeight: 600,
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
  };

  return (
    <div>
      <p
        style={{
          margin: '0 0 18px',
          textAlign: 'center',
          fontSize: '14px',
          lineHeight: 1.6,
          color: 'var(--on-surface-variant)',
        }}
      >
        Enter the 6-digit code we sent to{' '}
        <strong style={{ color: 'var(--on-surface)', fontWeight: 700, wordBreak: 'break-word' }}>
          {email}
        </strong>{' '}
        and choose a new password.
      </p>

      <div style={{ display: 'flex', gap: '8px', width: '100%' }} onPaste={handlePaste}>
        {digits.map((d, i) => (
          <input
            key={i}
            ref={(el) => {
              inputsRef.current[i] = el;
            }}
            type="text"
            inputMode="numeric"
            autoComplete={i === 0 ? 'one-time-code' : 'off'}
            pattern="\d*"
            maxLength={1}
            value={d}
            disabled={submitting}
            aria-label={`Digit ${i + 1}`}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            style={boxStyle}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = `0 0 0 2px ${ringColor}66`;
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        ))}
      </div>

      {/* New password */}
      <div style={{ marginTop: '20px' }}>
        <label style={labelStyle}>New password</label>
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
            placeholder="At least 8 characters"
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (error) setError('');
            }}
            autoComplete="new-password"
            disabled={submitting}
            style={inputStyle}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
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
      </div>

      {/* Confirm password */}
      <div style={{ marginTop: '16px' }}>
        <label style={labelStyle}>Confirm new password</label>
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
            placeholder="Re-enter password"
            value={confirm}
            onChange={(e) => {
              setConfirm(e.target.value);
              if (error) setError('');
            }}
            autoComplete="new-password"
            disabled={submitting}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canSubmit) submit();
            }}
            style={{ ...inputStyle, paddingRight: '16px' }}
            onFocus={(e) => {
              e.currentTarget.style.boxShadow = '0 0 0 2px rgba(174,137,255,0.4)';
            }}
            onBlur={(e) => {
              e.currentTarget.style.boxShadow = 'none';
            }}
          />
        </div>
      </div>

      {error && (
        <p style={{ margin: '14px 0 0', textAlign: 'center', fontSize: '13px', color: '#fd6f85' }}>
          {error}
        </p>
      )}
      {!error && (pwTooShort || pwMismatch) && (
        <p style={{ margin: '14px 0 0', textAlign: 'center', fontSize: '13px', color: '#fd6f85' }}>
          {pwTooShort ? 'Use at least 8 characters.' : "Passwords don't match."}
        </p>
      )}
      {!error && !pwTooShort && !pwMismatch && info && (
        <p style={{ margin: '14px 0 0', textAlign: 'center', fontSize: '13px', color: '#4dff91' }}>
          {info}
        </p>
      )}

      <button
        type="button"
        onClick={submit}
        disabled={!canSubmit}
        style={{
          width: '100%',
          marginTop: '20px',
          padding: '14px',
          background: !canSubmit ? '#555578' : '#ae89ff',
          border: 'none',
          borderRadius: '14px',
          color: !canSubmit ? '#aaa8c8' : '#2a0066',
          fontSize: '16px',
          fontWeight: 700,
          fontFamily: 'inherit',
          cursor: !canSubmit ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          boxShadow: !canSubmit ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
          transition:
            'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
        }}
        onMouseEnter={(e) => {
          if (canSubmit) {
            e.currentTarget.style.transform = 'scale(1.02)';
            e.currentTarget.style.boxShadow = '0 12px 32px rgba(174,137,255,0.4)';
          }
        }}
        onMouseLeave={(e) => {
          if (canSubmit) {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(174,137,255,0.3)';
          }
        }}
        onMouseDown={(e) => {
          if (canSubmit) e.currentTarget.style.transform = 'scale(0.98)';
        }}
        onMouseUp={(e) => {
          if (canSubmit) e.currentTarget.style.transform = 'scale(1.02)';
        }}
      >
        {submitting ? (
          'Resetting…'
        ) : (
          <>
            Reset password
            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>
              check
            </span>
          </>
        )}
      </button>

      <div
        style={{
          marginTop: '16px',
          textAlign: 'center',
          fontSize: '13px',
          color: 'var(--on-surface-variant)',
        }}
      >
        Didn&apos;t get it?{' '}
        {cooldown > 0 ? (
          <span style={{ color: 'var(--outline)' }}>Resend in {cooldown}s</span>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resending}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              font: 'inherit',
              color: '#c1a4ff',
              fontWeight: 700,
              cursor: resending ? 'wait' : 'pointer',
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
            }}
          >
            {resending ? 'Sending…' : 'Resend code'}
          </button>
        )}
      </div>
    </div>
  );
}
