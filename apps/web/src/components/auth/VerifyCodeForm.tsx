'use client';

import { useState, useRef, useEffect, useCallback } from 'react';

interface VerifyCodeFormProps {
  /** The address the code was sent to — shown back to the user. */
  email: string;
  /** Called after the code is confirmed server-side (parent owns what's next). */
  onVerified: () => void | Promise<void>;
  /**
   * Request a fresh code on mount. Used by the login path, where the original
   * registration code may have expired. The wizard leaves this false because
   * /api/auth/register just sent one.
   */
  resendOnMount?: boolean;
}

const LENGTH = 6;
const RESEND_COOLDOWN_S = 60; // must be ≥ the server-side per-email cooldown

/**
 * Segmented 6-digit code entry for the email-confirmation gate. Handles
 * auto-advance, backspace-to-previous, full-code paste, auto-submit on the
 * final digit, and a cooldown-gated resend. Styled to the Neon Scholar auth
 * surfaces (purple focus ring, surface-container inputs). No mascot/heading —
 * the parent (onboarding screen or login card) provides that chrome.
 */
export default function VerifyCodeForm({
  email,
  onVerified,
  resendOnMount = false,
}: VerifyCodeFormProps) {
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(''));
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(resendOnMount ? 0 : RESEND_COOLDOWN_S);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const submittingRef = useRef(false);

  const code = digits.join('');
  const incomplete = code.length !== LENGTH || digits.includes('');

  const submit = useCallback(
    async (value: string) => {
      if (value.length !== LENGTH || submittingRef.current) return;
      submittingRef.current = true;
      setVerifying(true);
      setError('');
      setInfo('');
      try {
        const res = await fetch('/api/auth/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code: value }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || 'That code is invalid or has expired.');
          setDigits(Array(LENGTH).fill(''));
          requestAnimationFrame(() => inputsRef.current[0]?.focus());
          return;
        }
        await onVerified();
      } catch {
        setError('Something went wrong. Please try again.');
      } finally {
        setVerifying(false);
        submittingRef.current = false;
      }
    },
    [email, onVerified]
  );

  const handleChange = (i: number, raw: string) => {
    const digit = raw.replace(/\D/g, '').slice(-1);
    const next = [...digits];
    next[i] = digit;
    setDigits(next);
    if (error) setError('');
    if (digit && i < LENGTH - 1) {
      requestAnimationFrame(() => inputsRef.current[i + 1]?.focus());
    }
    const joined = next.join('');
    if (joined.length === LENGTH && !next.includes('')) submit(joined);
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
    if (text.length === LENGTH) submit(text);
  };

  const handleResend = useCallback(async () => {
    if (cooldown > 0 || resending) return;
    setResending(true);
    setError('');
    setInfo('');
    try {
      await fetch('/api/auth/resend-code', {
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

  // Optional fresh code on mount (login path), then start the cooldown.
  const didMountResend = useRef(false);
  useEffect(() => {
    if (!resendOnMount || didMountResend.current) return;
    didMountResend.current = true;
    fetch('/api/auth/resend-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setCooldown(RESEND_COOLDOWN_S);
  }, [resendOnMount, email]);

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

  const disabledBtn = verifying || incomplete;

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
        </strong>
        .
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
            disabled={verifying}
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

      {error && (
        <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: '13px', color: '#fd6f85' }}>
          {error}
        </p>
      )}
      {!error && info && (
        <p style={{ margin: '12px 0 0', textAlign: 'center', fontSize: '13px', color: '#4dff91' }}>
          {info}
        </p>
      )}

      <button
        type="button"
        onClick={() => submit(code)}
        disabled={disabledBtn}
        style={{
          width: '100%',
          marginTop: '20px',
          padding: '14px',
          background: disabledBtn ? '#555578' : '#ae89ff',
          border: 'none',
          borderRadius: '14px',
          color: disabledBtn ? '#aaa8c8' : '#2a0066',
          fontSize: '16px',
          fontWeight: 700,
          fontFamily: 'inherit',
          cursor: disabledBtn ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '8px',
          boxShadow: disabledBtn ? 'none' : '0 8px 24px rgba(174,137,255,0.3)',
          transition:
            'transform 0.2s cubic-bezier(0.22,1,0.36,1), box-shadow 0.2s cubic-bezier(0.22,1,0.36,1)',
        }}
        onMouseEnter={(e) => {
          if (!disabledBtn) {
            e.currentTarget.style.transform = 'scale(1.02)';
            e.currentTarget.style.boxShadow = '0 12px 32px rgba(174,137,255,0.4)';
          }
        }}
        onMouseLeave={(e) => {
          if (!disabledBtn) {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(174,137,255,0.3)';
          }
        }}
        onMouseDown={(e) => {
          if (!disabledBtn) e.currentTarget.style.transform = 'scale(0.98)';
        }}
        onMouseUp={(e) => {
          if (!disabledBtn) e.currentTarget.style.transform = 'scale(1.02)';
        }}
      >
        {verifying ? (
          'Verifying…'
        ) : (
          <>
            Verify email
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
