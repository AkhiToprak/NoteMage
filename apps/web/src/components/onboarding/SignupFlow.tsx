/* eslint-disable @next/next/no-img-element */
'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import VerifyCodeForm from '@/components/auth/VerifyCodeForm';
import TurnstileWidget, { turnstileEnabled } from '@/components/auth/TurnstileWidget';
import { computeAge, parseBirthDate, MIN_AGE } from '@/lib/age';
import { getOnboardingDraft } from '@/lib/onboarding-handoff';
import styles from './SignupFlow.module.css';

/* ─────────── shared SVG glyphs (mirrors Login / start-signup) ─────────── */
const SparkGold = (
  <svg viewBox="0 0 29 29" fill="none" aria-hidden focusable="false">
    <path d="M10.6066 0L17.1889 9.81239L28.9778 10.6066L19.1654 17.1889L18.3712 28.9778L11.7889 19.1655L0 18.3712L9.81237 11.7889L10.6066 0Z" fill="#FFC83D" />
  </svg>
);
const SparkPurple = (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden focusable="false">
    <path d="M9 0L11.291 6.70897L18 9L11.291 11.291L9 18L6.70897 11.291L0 9L6.70897 6.70897L9 0Z" fill="#7C5CFF" />
  </svg>
);
const GoogleIcon = (
  <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden xmlns="http://www.w3.org/2000/svg">
    <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
    <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
    <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
    <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
  </svg>
);

type StepId = 'account' | 'verify' | 'name' | 'username' | 'plan';

const STEP_LABEL: Record<Exclude<StepId, 'verify'>, string> = {
  account: 'STEP 1 OF 4',
  name: 'STEP 2 OF 4',
  username: 'STEP 3 OF 4',
  plan: 'STEP 4 OF 4',
};

/* Left-panel copy per step. */
const PANEL_COPY: Record<Exclude<StepId, 'verify'>, { title: string; sub: string }> = {
  account: { title: 'Almost there.', sub: 'Create your account to save your path, answers, and progress.' },
  name: { title: 'Nice to meet you.', sub: 'What should I call you, mage?' },
  username: { title: 'Almost done.', sub: 'Pick a name other mages will see.' },
  plan: { title: "You're in.", sub: 'Your 7-day free trial starts now — full access, no card.' },
};

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const scoreLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'];
const scoreColor = ['#e7e0d2', '#d9344f', '#c98a12', '#7c5cff', '#1a7f4b'];

function getPasswordScore(password: string): number {
  let score = 0;
  if (password.length >= 8) score++;
  if (/[A-Z]/.test(password)) score++;
  if (/[0-9]/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  return score;
}

/** Suggest a starting username by sanitizing the email prefix. */
function suggestUsernameFromEmail(email: string | null | undefined): string {
  if (!email) return '';
  const base = email.split('@')[0] || '';
  return base.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20).toLowerCase();
}

/** Split a display name into a first token and the remainder. */
function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

function daysInMonth(month: number, year: number): number {
  if (!month) return 31;
  return new Date(Date.UTC(year || 2000, month, 0)).getUTCDate();
}

interface FormData {
  email: string;
  password: string;
  birthDate: string;
  agreed: boolean;
  firstName: string;
  lastName: string;
  username: string;
}

const INITIAL_FORM: FormData = {
  email: '',
  password: '',
  birthDate: '',
  agreed: false,
  firstName: '',
  lastName: '',
  username: '',
};

type UsernameStatus = 'idle' | 'typing' | 'checking' | 'available' | 'taken' | 'invalid';

export default function SignupFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus, update: updateSession } = useSession();

  const [step, setStep] = useState<StepId>('account');
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState('');

  // Username availability.
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const usernameDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── DOB parts (light native selects, matching the cream form) ──
  const [dobParts, setDobParts] = useState<{ month: string; day: string; year: string }>({
    month: '',
    day: '',
    year: '',
  });
  const years = useMemo(() => {
    const currentYear = new Date().getUTCFullYear();
    return Array.from({ length: 121 }, (_, i) => currentYear - i);
  }, []);
  const dobDays = useMemo(() => {
    const count = daysInMonth(Number(dobParts.month), Number(dobParts.year));
    return Array.from({ length: count }, (_, i) => i + 1);
  }, [dobParts.month, dobParts.year]);

  const emitDob = useCallback((next: { month: string; day: string; year: string }) => {
    setDobParts(next);
    if (next.year && next.month && next.day) {
      setFormData((prev) => ({
        ...prev,
        birthDate: `${next.year}-${next.month.padStart(2, '0')}-${next.day.padStart(2, '0')}`,
      }));
    } else {
      setFormData((prev) => ({ ...prev, birthDate: '' }));
    }
  }, []);

  const handleDobPart = (key: 'month' | 'day' | 'year', raw: string) => {
    const next = { ...dobParts, [key]: raw };
    const limit = daysInMonth(Number(next.month), Number(next.year));
    if (next.day && Number(next.day) > limit) next.day = String(limit);
    emitDob(next);
  };

  // ── Path detection (credentials vs oauth) — captured once, like the wizard ──
  const decidedPathRef = useRef<'credentials' | 'oauth' | null>(null);
  if (decidedPathRef.current === null && sessionStatus !== 'loading') {
    decidedPathRef.current = sessionStatus === 'authenticated' ? 'oauth' : 'credentials';
  }
  const authPath = decidedPathRef.current;
  const isOauthPath = authPath === 'oauth';

  // Surface NextAuth OAuth errors redirected back to /auth/register.
  const oauthErrorAppliedRef = useRef(false);
  useEffect(() => {
    if (oauthErrorAppliedRef.current) return;
    const err = searchParams?.get('error');
    if (!err) return;
    oauthErrorAppliedRef.current = true;
    let msg: string | null = null;
    if (err === 'OAuthSignin' || err === 'OAuthCallback' || err === 'Callback') {
      msg = 'Something went wrong during sign-in. Please try again.';
    } else if (err === 'AccessDenied') {
      msg = 'Sign-in was denied. If you think this is a mistake, contact support.';
    } else if (err === 'OAuthAccountExists') {
      msg = 'An account already exists for this email. Please sign in with your password, then link Google or Apple from settings.';
    }
    if (msg) setError(msg);
  }, [searchParams]);

  // OAuth users: pre-fill name from the OAuth profile, exactly once.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (authPath !== 'oauth' || prefilledRef.current) return;
    prefilledRef.current = true;
    const { first, last } = splitName(session?.user?.name);
    setFormData((prev) => ({
      ...prev,
      firstName: prev.firstName || first,
      lastName: prev.lastName || last,
    }));
  }, [authPath, session?.user?.name]);

  // Remount guard: an authenticated OAuth user with a birth date already on file
  // skips the DOB gate (the account step in oauth-mode) straight to 'name'.
  useEffect(() => {
    if (isOauthPath && step === 'account' && session?.user?.hasBirthDate) {
      setStep('name');
    }
  }, [isOauthPath, step, session?.user?.hasBirthDate]);

  // ── Username availability check (debounced, /api/user/check-username) ──
  const checkUsername = useCallback(async (candidate: string) => {
    if (!USERNAME_REGEX.test(candidate)) {
      setUsernameStatus('invalid');
      return;
    }
    setUsernameStatus('checking');
    try {
      const res = await fetch(`/api/user/check-username?username=${encodeURIComponent(candidate)}`);
      const json = await res.json();
      setUsernameStatus(json.data?.available ? 'available' : 'taken');
    } catch {
      setUsernameStatus('idle');
    }
  }, []);

  // Seed the username when the step is first reached (email prefix / oauth name).
  const usernameSeededRef = useRef(false);
  useEffect(() => {
    if (step !== 'username' || usernameSeededRef.current) return;
    usernameSeededRef.current = true;
    const seed =
      formData.username ||
      suggestUsernameFromEmail(formData.email || session?.user?.email) ||
      suggestUsernameFromEmail(session?.user?.name?.replace(/\s+/g, ''));
    if (seed) {
      setFormData((prev) => ({ ...prev, username: prev.username || seed }));
      if (USERNAME_REGEX.test(seed)) {
        void Promise.resolve().then(() => void checkUsername(seed));
      }
    }
  }, [step, formData.username, formData.email, session?.user?.email, session?.user?.name, checkUsername]);

  useEffect(() => {
    return () => {
      if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    };
  }, []);

  const handleUsernameChange = (value: string) => {
    setFormData((prev) => ({ ...prev, username: value }));
    setUsernameStatus('typing');
    if (usernameDebounceRef.current) clearTimeout(usernameDebounceRef.current);
    if (value.length === 0) {
      setUsernameStatus('idle');
      return;
    }
    usernameDebounceRef.current = setTimeout(() => checkUsername(value), 500);
  };

  // Pro upgrade (plan step). On a completed purchase the session flips to PRO
  // and finalize() runs instead of the default refresh.
  const finalize = useCallback(
    async () => {
      setError('');
      setLoading(true);
      try {
        const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim();
        await fetch('/api/user/onboarding', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: fullName || null, goals: {} }),
        });
        // Refresh the JWT so middleware sees onboardingComplete: true.
        await updateSession();
        // A visitor who generated a real preview in /start claims it now.
        const claimable = getOnboardingDraft().previewId;
        router.push(claimable ? '/start/claiming?next=/dashboard' : '/dashboard');
      } catch {
        setError('Something went wrong. Please try again.');
        setLoading(false);
      }
    },
    [formData.firstName, formData.lastName, router, updateSession]
  );

  // ── account (credentials): register → verify ──
  const handleAccountNext = async () => {
    setError('');
    if (!formData.email) return setError('Email is required.');
    if (!EMAIL_REGEX.test(formData.email)) return setError('Please enter a valid email address.');
    if (formData.password.length < 8) return setError('Password must be at least 8 characters.');
    const birth = parseBirthDate(formData.birthDate);
    if (!birth) return setError('Please enter a valid date of birth.');
    if (computeAge(birth) < MIN_AGE) return setError(`You must be at least ${MIN_AGE} years old to use NoteMage.`);
    if (!formData.agreed) return setError('Please agree to the Terms of Service and Privacy Policy.');
    if (turnstileEnabled && !turnstileToken) return setError('Please complete the verification challenge below.');

    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          birthDate: formData.birthDate,
          turnstileToken,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create account');
        return;
      }
      // Account created but unverified — credentials login is hard-blocked until
      // the email is confirmed. Advance to verify; the 6-digit code was emailed.
      setStep('verify');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── verify (credentials): confirm email, then sign in ──
  const handleVerified = async () => {
    setLoading(true);
    try {
      const signInResult = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });
      if (signInResult?.error) {
        setError('Email verified! Please log in to continue.');
        return;
      }
      setFormData((prev) => ({ ...prev, password: '' }));
      setStep('name');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── account (oauth): date-of-birth age gate ──
  const handleOAuthDobNext = async () => {
    setError('');
    if (!parseBirthDate(formData.birthDate)) return setError('Please enter a valid date of birth.');
    if (!formData.agreed) return setError('Please agree to the Terms of Service and Privacy Policy.');

    setLoading(true);
    try {
      const res = await fetch('/api/user/birth-date', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ birthDate: formData.birthDate }),
      });
      if (res.status === 403) {
        // Under 13 — the account row was removed server-side. Sign out.
        await signOut({ callbackUrl: '/auth/login?error=AgeRestricted' });
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Something went wrong. Please try again.');
        return;
      }
      try {
        await updateSession();
      } catch {
        /* persisted server-side already */
      }
      setStep('name');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── name → username ──
  const handleNameNext = () => {
    if (!formData.firstName.trim()) return setError('Please enter your first name.');
    if (!formData.lastName.trim()) return setError('Please enter your last name.');
    setError('');
    setStep('username');
  };

  // ── username: save → plan ──
  const handleUsernameNext = async () => {
    setError('');
    const username = formData.username.trim();
    if (!username) return setError('Username is required.');
    if (!USERNAME_REGEX.test(username)) return setError('Username must be 3–20 chars: letters, numbers, underscores.');
    if (usernameStatus === 'taken') return setError('That username is already taken.');
    if (usernameStatus === 'checking') return setError('Please wait while we check availability.');

    setLoading(true);
    try {
      const res = await fetch('/api/user/username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json?.error || 'Failed to save username');
        setLoading(false);
        return;
      }
      setFormData((prev) => ({ ...prev, username: username.toLowerCase() }));
      // Refresh the JWT so session.user.username reflects the real handle.
      try {
        await updateSession();
      } catch {
        /* persisted server-side already */
      }
      setStep('plan');
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
      return;
    }
    setLoading(false);
  };

  const goBack = (to: StepId) => {
    setError('');
    setStep(to);
  };

  /* ─────────── render helpers ─────────── */
  const passwordScore = getPasswordScore(formData.password);

  const renderDob = (idPrefix: string) => (
    <div className={styles.dobRow}>
      <div className={`${styles.dobCol} ${styles.dobColMonth}`}>
        <select
          id={`${idPrefix}-month`}
          aria-label="Birth month"
          className={styles.dobSelect}
          value={dobParts.month}
          disabled={loading}
          onChange={(e) => handleDobPart('month', e.target.value)}
          style={{ color: dobParts.month ? '#18202f' : '#a1a7b3' }}
        >
          <option value="" disabled>MM</option>
          {MONTHS.map((name, i) => (
            <option key={name} value={String(i + 1)} style={{ color: '#18202f' }}>{name}</option>
          ))}
        </select>
        <span className={styles.dobChevron} aria-hidden>
          <span className="material-symbols-outlined">expand_more</span>
        </span>
      </div>
      <div className={styles.dobCol}>
        <select
          id={`${idPrefix}-day`}
          aria-label="Birth day"
          className={styles.dobSelect}
          value={dobParts.day}
          disabled={loading}
          onChange={(e) => handleDobPart('day', e.target.value)}
          style={{ color: dobParts.day ? '#18202f' : '#a1a7b3' }}
        >
          <option value="" disabled>DD</option>
          {dobDays.map((d) => (
            <option key={d} value={String(d)} style={{ color: '#18202f' }}>{d}</option>
          ))}
        </select>
        <span className={styles.dobChevron} aria-hidden>
          <span className="material-symbols-outlined">expand_more</span>
        </span>
      </div>
      <div className={`${styles.dobCol} ${styles.dobColYear}`}>
        <select
          id={`${idPrefix}-year`}
          aria-label="Birth year"
          className={styles.dobSelect}
          value={dobParts.year}
          disabled={loading}
          onChange={(e) => handleDobPart('year', e.target.value)}
          style={{ color: dobParts.year ? '#18202f' : '#a1a7b3' }}
        >
          <option value="" disabled>YYYY</option>
          {years.map((y) => (
            <option key={y} value={String(y)} style={{ color: '#18202f' }}>{y}</option>
          ))}
        </select>
        <span className={styles.dobChevron} aria-hidden>
          <span className="material-symbols-outlined">expand_more</span>
        </span>
      </div>
    </div>
  );

  const termsRow = (id: string) => (
    <div className={styles.terms}>
      <input
        type="checkbox"
        id={id}
        className={styles.termsBox}
        checked={formData.agreed}
        disabled={loading}
        onChange={(e) => setFormData((prev) => ({ ...prev, agreed: e.target.checked }))}
      />
      <label htmlFor={id} className={styles.termsLabel}>
        I have read and accept the{' '}
        <a href="/terms" target="_blank" rel="noopener noreferrer">Terms of Service</a> and{' '}
        <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
      </label>
    </div>
  );

  /* ─────────── verify step (dark card, like login) ─────────── */
  if (step === 'verify') {
    return (
      <div className={styles.verifyRoot}>
        <div data-theme="dark" className={styles.verifyCard}>
          <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={120} height={45} style={{ height: 36, width: 'auto', margin: '0 auto' }} />
          <h1 className={styles.verifyTitle}>Check your inbox</h1>
          <p className={styles.verifySub}>Confirm your email to keep going.</p>
          {error && <div className={`${styles.banner} ${styles.bannerError}`} style={{ marginBottom: 18 }}>{error}</div>}
          <VerifyCodeForm email={formData.email} onVerified={handleVerified} />
          <button
            type="button"
            className={styles.verifyBack}
            onClick={() => {
              setError('');
              setStep('account');
            }}
          >
            Back
          </button>
        </div>
      </div>
    );
  }

  /* ─────────── account/oauth path still resolving ─────────── */
  const renderBody = () => {
    if (step === 'account' && authPath === null) {
      return (
        <div className={styles.loadingWrap}>
          <span className="material-symbols-outlined" aria-hidden>progress_activity</span>
        </div>
      );
    }

    /* ── account, OAuth mode → DOB + terms gate ── */
    if (step === 'account' && isOauthPath) {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleOAuthDobNext();
          }}
        >
          <span className={styles.eyebrow}>{STEP_LABEL.account}</span>
          <h1 className={styles.formTitle}>First, your date of birth</h1>
          <p className={styles.formSub}>NoteMage is for ages 13 and up.</p>

          {error && <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>}

          <div className={styles.field}>
            <span className={styles.label}>Date of birth</span>
            {renderDob('oauth-dob')}
            <p className={styles.helper}>You must be at least {MIN_AGE} to use NoteMage.</p>
          </div>

          {termsRow('terms-oauth')}

          <button type="submit" className={styles.submit} disabled={loading || !formData.birthDate || !formData.agreed}>
            {loading ? 'Saving…' : 'Continue'}
            {!loading && <span className="material-symbols-outlined" aria-hidden>arrow_forward</span>}
          </button>
        </form>
      );
    }

    /* ── account, credentials mode → full sign-up ── */
    if (step === 'account') {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAccountNext();
          }}
        >
          <span className={styles.eyebrow}>{STEP_LABEL.account}</span>
          <h1 className={styles.formTitle}>Create your account</h1>
          <p className={styles.formSub}>Save your path, answers, and progress.</p>

          {error && <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>}

          <div className={styles.oauthList}>
            <button
              type="button"
              className={styles.oauthBtn}
              disabled={loading}
              onClick={() => signIn('google', { callbackUrl: '/auth/register' })}
            >
              {GoogleIcon}
              Continue with Google
            </button>
          </div>

          <div className={styles.or} aria-hidden>
            <span className={styles.orLine} />
            <span>or</span>
            <span className={styles.orLine} />
          </div>

          <div className={styles.field}>
            <label htmlFor="su-email" className={styles.label}>Email</label>
            <div className={styles.inputWrap}>
              <input
                id="su-email"
                type="email"
                className={styles.input}
                placeholder="you@school.edu"
                value={formData.email}
                onChange={(e) => setFormData((prev) => ({ ...prev, email: e.target.value }))}
                autoComplete="email"
                disabled={loading}
                required
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="su-password" className={styles.label}>Password</label>
            <div className={styles.inputWrap}>
              <input
                id="su-password"
                type={showPassword ? 'text' : 'password'}
                className={`${styles.input} ${styles.inputPw}`}
                placeholder="••••••••"
                value={formData.password}
                onChange={(e) => setFormData((prev) => ({ ...prev, password: e.target.value }))}
                autoComplete="new-password"
                disabled={loading}
                required
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
            {formData.password.length > 0 && (
              <>
                <div className={styles.strengthRow}>
                  {[1, 2, 3, 4].map((seg) => (
                    <span
                      key={seg}
                      className={styles.strengthSeg}
                      style={passwordScore >= seg ? { background: scoreColor[passwordScore] } : undefined}
                    />
                  ))}
                </div>
                {passwordScore > 0 && (
                  <p className={styles.strengthLabel} style={{ color: scoreColor[passwordScore] }}>
                    {scoreLabel[passwordScore]}
                  </p>
                )}
              </>
            )}
          </div>

          <div className={styles.field}>
            <span className={styles.label}>
              Date of birth
              <span className={styles.infoWrap}>
                <button type="button" className={styles.infoBtn} aria-label="Why we ask for your age">
                  <span className="material-symbols-outlined" aria-hidden>info</span>
                </button>
                <span className={styles.tooltip} role="tooltip">
                  We ask your age to keep NoteMage safe and to meet legal age rules. You must be 13+.
                </span>
              </span>
            </span>
            {renderDob('cred-dob')}
            <p className={styles.helper}>You must be at least {MIN_AGE} to use NoteMage.</p>
          </div>

          {termsRow('terms-cred')}

          {turnstileEnabled && (
            <div className={styles.turnstile}>
              <TurnstileWidget theme="light" onToken={setTurnstileToken} />
            </div>
          )}

          <button type="submit" className={styles.submit} disabled={loading}>
            {loading ? 'Creating account…' : 'Continue'}
            {!loading && <span className="material-symbols-outlined" aria-hidden>arrow_forward</span>}
          </button>

          <p className={styles.legal}>
            By continuing, you agree to the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer">Terms</a> and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
          </p>
          <p className={styles.footerLink}>
            Already have an account? <Link href="/auth/login">Log in</Link>
          </p>
        </form>
      );
    }

    /* ── name ── */
    if (step === 'name') {
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleNameNext();
          }}
        >
          <span className={styles.eyebrow}>{STEP_LABEL.name}</span>
          <h1 className={styles.formTitle}>What&apos;s your name?</h1>
          <p className={styles.formSub}>This is how you&apos;ll show up on NoteMage.</p>

          {error && <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>}

          <div className={styles.field}>
            <label htmlFor="su-first" className={styles.label}>First name</label>
            <div className={styles.inputWrap}>
              <input
                id="su-first"
                type="text"
                className={styles.input}
                placeholder="Alex"
                value={formData.firstName}
                onChange={(e) => setFormData((prev) => ({ ...prev, firstName: e.target.value }))}
                autoComplete="given-name"
                autoFocus
              />
            </div>
          </div>

          <div className={styles.field}>
            <label htmlFor="su-last" className={styles.label}>Last name</label>
            <div className={styles.inputWrap}>
              <input
                id="su-last"
                type="text"
                className={styles.input}
                placeholder="Rivera"
                value={formData.lastName}
                onChange={(e) => setFormData((prev) => ({ ...prev, lastName: e.target.value }))}
                autoComplete="family-name"
              />
            </div>
          </div>

          <div className={styles.actions}>
            <button type="submit" className={styles.submit}>Continue</button>
            <button type="button" className={styles.back} onClick={() => goBack('account')}>
              <span className="material-symbols-outlined" aria-hidden>arrow_back</span>
              Back
            </button>
          </div>
        </form>
      );
    }

    /* ── username ── */
    if (step === 'username') {
      const showOk = usernameStatus === 'available';
      const showBad = usernameStatus === 'taken' || usernameStatus === 'invalid';
      return (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleUsernameNext();
          }}
        >
          <span className={styles.eyebrow}>{STEP_LABEL.username}</span>
          <h1 className={styles.formTitle}>Pick a username</h1>
          <p className={styles.formSub}>Your public handle — you can change it anytime.</p>

          {error && <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>}

          <div className={styles.field}>
            <label htmlFor="su-username" className={styles.label}>Username</label>
            <div className={styles.inputWrap}>
              <input
                id="su-username"
                type="text"
                className={`${styles.input} ${styles.inputUser} ${showBad ? styles.inputError : ''}`}
                placeholder="@yourname"
                value={formData.username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                disabled={loading}
                autoFocus
              />
              <span className={styles.fieldStatusIcon} aria-hidden>
                {usernameStatus === 'checking' && (
                  <span className="material-symbols-outlined" style={{ color: '#7c5cff', animation: 'sfSpin 1s linear infinite' }}>progress_activity</span>
                )}
                {showOk && (
                  <span className="material-symbols-outlined" style={{ color: '#1a7f4b', fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                )}
                {showBad && (
                  <span className="material-symbols-outlined" style={{ color: '#d9344f', fontVariationSettings: "'FILL' 1" }}>cancel</span>
                )}
              </span>
            </div>
            {showOk ? (
              <p className={`${styles.helper} ${styles.helperOk}`}>Username available</p>
            ) : usernameStatus === 'taken' ? (
              <p className={`${styles.helper} ${styles.helperBad}`}>That username is taken</p>
            ) : usernameStatus === 'invalid' ? (
              <p className={`${styles.helper} ${styles.helperBad}`}>3–20 chars: letters, numbers, underscores</p>
            ) : (
              <p className={styles.helper}>3–20 chars: letters, numbers, underscores</p>
            )}
          </div>

          <div className={styles.actions}>
            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? 'Saving…' : 'Continue'}
            </button>
            <button type="button" className={styles.back} onClick={() => goBack('name')}>
              <span className="material-symbols-outlined" aria-hidden>arrow_back</span>
              Back
            </button>
          </div>
        </form>
      );
    }

    /* ── trial start (P1) — the 7-day trial already began at account creation
       (trialGrant), so this screen only confirms it and finalizes onboarding.
       No plan picker, no payment here: the user chooses subscribe-or-pause later
       at the trial-ended gate. Matches Figma 504:3. ── */
    const trialFeatures = [
      'Create learning paths',
      'Practice with AI quizzes',
      'Ask Mage for help',
      'Track your progress',
    ];

    return (
      <div>
        <span className={styles.trialBadge}>7 DAYS FREE</span>
        <h1 className={styles.formTitle}>Start your 7-day free trial</h1>
        <p className={styles.formSub}>Full access to everything NoteMage can do.</p>

        {error && <div className={`${styles.banner} ${styles.bannerError}`}>{error}</div>}

        <ul className={`${styles.planList} ${styles.trialCard}`}>
          {trialFeatures.map((b) => (
            <li key={b} className={styles.planItem}>
              <span className={styles.planCheck}><span className="material-symbols-outlined" aria-hidden>check</span></span>
              {b}
            </li>
          ))}
        </ul>

        <button type="button" className={styles.submit} onClick={() => void finalize()} disabled={loading}>
          {loading ? 'Starting…' : 'Start free trial'}
        </button>
        <p className={styles.trialFine}>No card required. You choose what happens after the trial.</p>

        <div className={styles.actions} style={{ marginTop: 4 }}>
          <button type="button" className={styles.back} onClick={() => goBack('username')}>
            <span className="material-symbols-outlined" aria-hidden>arrow_back</span>
            Back
          </button>
        </div>
      </div>
    );
  };

  const panelCopy = PANEL_COPY[step as Exclude<StepId, 'verify'>] ?? PANEL_COPY.account;

  return (
    <div className={styles.root}>
      {/* ─────────── LEFT PANEL ─────────── */}
      <div className={styles.panel}>
        <Link href="/" className={styles.panelLogo} aria-label="NoteMage — home">
          <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
        </Link>
        <span className={`${styles.star} ${styles.starA}`} aria-hidden>{SparkGold}</span>
        <span className={`${styles.star} ${styles.starB}`} aria-hidden>{SparkPurple}</span>
        <span className={`${styles.star} ${styles.starC}`} aria-hidden>{SparkPurple}</span>
        <span className={`${styles.star} ${styles.starD}`} aria-hidden>{SparkGold}</span>
        <div className={styles.panelInner}>
          <img className={styles.panelMascot} src="/landing/mage-plain.png" alt="" aria-hidden />
          <h2 className={styles.panelTitle}>{panelCopy.title}</h2>
          <p className={styles.panelSub}>{panelCopy.sub}</p>
        </div>
      </div>

      {/* ─────────── RIGHT FORM ─────────── */}
      <div className={styles.formCol}>
        <div className={styles.form}>
          <Link href="/" className={styles.formLogo} aria-label="NoteMage — home">
            <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
          </Link>
          {renderBody()}
        </div>
      </div>
    </div>
  );
}
