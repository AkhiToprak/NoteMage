'use client';

import { useState, useEffect, useRef } from 'react';
import { signIn, signOut, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import OnboardingScreen from './OnboardingScreen';
import AccountStep from './AccountStep';
import OAuthBirthDateStep from './OAuthBirthDateStep';
import FirstNameStep from './FirstNameStep';
import LastNameStep from './LastNameStep';
import UsernameStep from './UsernameStep';
import ContextStep from './ContextStep';
import FieldOfStudyStep from './FieldOfStudyStep';
import TierSelectionStep from './TierSelectionStep';
import PaymentStep from './PaymentStep';
import AvatarStep from './AvatarStep';
import StudyGoalsStep, { EMPTY_GOAL_VALUES, type GoalValues } from './StudyGoalsStep';
import ScholarNameStep, { MAGE_NAME_REGEX } from './ScholarNameStep';
import { parseBirthDate } from '@/lib/age';
import type { TierKey } from '@/lib/tiers';

type StepId =
  | 'account'
  | 'firstName'
  | 'lastName'
  | 'username'
  | 'context'
  | 'fieldOfStudy'
  | 'plan'
  | 'avatar'
  | 'mageName'
  | 'goals';

/** Ordered flow — drives the progress bar fill. */
const STEP_ORDER: readonly StepId[] = [
  'account',
  'firstName',
  'lastName',
  'username',
  'context',
  'fieldOfStudy',
  'plan',
  'avatar',
  'mageName',
  'goals',
];

/**
 * Back-chevron targets. Only screens that purely mutate local `formData`
 * appear here — there is no way back across account creation (screen 1) or a
 * completed payment, so `account`, `firstName`, `plan` and `avatar` are
 * deliberately absent.
 */
const BACK_TARGETS: Partial<Record<StepId, StepId>> = {
  lastName: 'firstName',
  username: 'lastName',
  context: 'username',
  fieldOfStudy: 'context',
  mageName: 'avatar',
  goals: 'mageName',
};

interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
  birthDate: string;
  agreed: boolean;
  firstName: string;
  lastName: string;
  username: string;
  context: string;
  fieldOfStudy: string;
  selectedTier: TierKey;
  avatarUrl: string | null;
  scholarName: string;
  goals: GoalValues;
}

/** Suggest a starting username by sanitizing the email prefix. */
function suggestUsernameFromEmail(email: string | null | undefined): string {
  if (!email) return '';
  const base = email.split('@')[0] || '';
  // Strip everything outside the allowed [a-zA-Z0-9_] set, clamp to 20.
  const cleaned = base.replace(/[^a-zA-Z0-9_]/g, '').slice(0, 20);
  return cleaned.toLowerCase();
}

/** Split a display name into a first token and the remainder. */
function splitName(full: string | null | undefined): { first: string; last: string } {
  const parts = (full ?? '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { first: '', last: '' };
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

const INITIAL_FORM: FormData = {
  email: '',
  password: '',
  confirmPassword: '',
  birthDate: '',
  agreed: false,
  firstName: '',
  lastName: '',
  username: '',
  context: '',
  fieldOfStudy: '',
  selectedTier: 'FREE',
  avatarUrl: null,
  scholarName: '',
  goals: { ...EMPTY_GOAL_VALUES },
};

export default function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: sessionStatus, update: updateSession } = useSession();
  const [step, setStep] = useState<StepId>('account');
  const [formData, setFormData] = useState<FormData>(() => {
    const tierParam = searchParams.get('tier')?.toUpperCase();
    const initialTier =
      tierParam === 'PLUS' || tierParam === 'PRO' ? (tierParam as TierKey) : 'FREE';
    return { ...INITIAL_FORM, selectedTier: initialTier };
  });
  const [loading, setLoading] = useState(false);
  const [stepErrors, setStepErrors] = useState<Partial<Record<StepId, string>>>({});
  const [showPayment, setShowPayment] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const paymentHandledRef = useRef(false);

  /**
   * Path detection. A credentials user starts unauthenticated and creates a
   * session in AccountStep; an OAuth user arrives already authenticated. The
   * decision is captured once — after the credentials user submits the form
   * they are authenticated too, so re-deriving it later would misclassify
   * them. `null` until the session status first resolves.
   */
  const decidedPathRef = useRef<'credentials' | 'oauth' | null>(null);
  if (decidedPathRef.current === null && sessionStatus !== 'loading') {
    decidedPathRef.current = sessionStatus === 'authenticated' ? 'oauth' : 'credentials';
  }
  const authPath = decidedPathRef.current;
  const isOauthPath = authPath === 'oauth';

  // OAuth users: pre-fill name + avatar from the OAuth profile, exactly once.
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (authPath !== 'oauth' || prefilledRef.current) return;
    prefilledRef.current = true;
    const { first, last } = splitName(session?.user?.name);
    setFormData((prev) => ({
      ...prev,
      firstName: prev.firstName || first,
      lastName: prev.lastName || last,
      avatarUrl: prev.avatarUrl || session?.user?.avatarUrl || null,
    }));
  }, [authPath, session?.user?.name, session?.user?.avatarUrl]);

  const setStepError = (s: StepId, msg: string) =>
    setStepErrors((prev) => ({ ...prev, [s]: msg }));

  const clearStepError = (s: StepId) => setStepErrors((prev) => ({ ...prev, [s]: '' }));

  // Handle return from Stripe Embedded Checkout (redirect-based flow)
  useEffect(() => {
    const paymentSuccess = searchParams.get('payment_success');
    const sessionId = searchParams.get('session_id');

    if (paymentSuccess !== 'true' || !sessionId || paymentHandledRef.current) {
      return;
    }

    // Mark as handled immediately to prevent re-entry from dependency changes
    paymentHandledRef.current = true;

    // Clear URL params so this effect cannot re-trigger on remount
    const url = new URL(window.location.href);
    url.searchParams.delete('payment_success');
    url.searchParams.delete('session_id');
    window.history.replaceState({}, '', url.pathname + url.search);

    (async () => {
      try {
        const statusRes = await fetch(`/api/stripe/checkout/status?session_id=${sessionId}`);
        const statusData = await statusRes.json();

        if (statusData.data?.status !== 'complete') return;

        // Verify and fulfill tier directly with Stripe (fallback if webhook is delayed)
        await fetch('/api/stripe/checkout/verify', { method: 'POST' });

        await updateSession();
        setStep('avatar');
      } catch {
        paymentHandledRef.current = false;
      }
    })();
  }, [searchParams, updateSession]);

  const handleFieldChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // ── Screen 1 (credentials path): register + auto-login ───────────────────
  const handleAccountNext = async () => {
    clearStepError('account');
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: formData.email,
          password: formData.password,
          birthDate: formData.birthDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStepError('account', data.error || 'Failed to create account');
        return;
      }
      // Auto-login
      const signInResult = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });
      if (signInResult?.error) {
        setStepError('account', 'Account created but auto-login failed. Please log in manually.');
        return;
      }
      // Clear sensitive data from state
      setFormData((prev) => ({ ...prev, password: '', confirmPassword: '' }));
      setStep('firstName');
    } catch {
      setStepError('account', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Screen 1 (OAuth path): date-of-birth age gate ────────────────────────
  const handleOAuthDobNext = async () => {
    clearStepError('account');
    if (!parseBirthDate(formData.birthDate)) {
      setStepError('account', 'Please enter a valid date of birth.');
      return;
    }
    if (!formData.agreed) {
      setStepError('account', 'Please agree to the Terms of Service and Privacy Policy.');
      return;
    }
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
        setStepError('account', data.error || 'Something went wrong. Please try again.');
        return;
      }
      setStep('firstName');
    } catch {
      setStepError('account', 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Screen 4: Username saved ─────────────────────────────────────────────
  const handleUsernameSaved = async (username: string) => {
    // Refresh the JWT so session.user.username reflects the real handle
    // instead of the oauth_* placeholder before any later navigation.
    setFormData((prev) => ({ ...prev, username }));
    try {
      await updateSession();
    } catch {
      // Non-fatal — the value is persisted server-side already.
    }
    setStep('context');
  };

  // ── Screen 7: Tier selection ─────────────────────────────────────────────
  const handleTierNext = async () => {
    clearStepError('plan');

    if (formData.selectedTier === 'FREE') {
      // Free tier: save directly and advance
      setLoading(true);
      try {
        const res = await fetch('/api/user/tier', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tier: 'FREE' }),
        });
        if (!res.ok) {
          const data = await res.json();
          setStepError('plan', data.error || 'Failed to save plan.');
          return;
        }
        await updateSession();
        setStep('avatar');
      } catch {
        setStepError('plan', 'Something went wrong. Please try again.');
      } finally {
        setLoading(false);
      }
    } else {
      // Paid tier: show embedded Stripe checkout
      setShowPayment(true);
    }
  };

  // ── Payment success handler ──────────────────────────────────────────────
  const handlePaymentSuccess = async () => {
    // Verify and fulfill tier directly with Stripe (fallback if webhook is delayed)
    try {
      await fetch('/api/stripe/checkout/verify', { method: 'POST' });
    } catch {
      // Verification failed — tier may still be updated by webhook later
    }
    await updateSession();
    setShowPayment(false);
    setStep('avatar');
  };

  const handlePaymentBack = () => {
    setShowPayment(false);
  };

  // ── Screen 8: Avatar ─────────────────────────────────────────────────────
  const handleAvatarNext = () => {
    setStep('mageName');
  };

  const handleAvatarSkip = () => {
    setFormData((prev) => ({ ...prev, avatarUrl: null }));
    setStep('mageName');
  };

  const handleAvatarChange = (url: string) => {
    setFormData((prev) => ({ ...prev, avatarUrl: url }));
  };

  // ── Screen 9: Mage name ──────────────────────────────────────────────────
  const handleMageNameNext = () => {
    const trimmed = formData.scholarName.trim();
    if (trimmed && !MAGE_NAME_REGEX.test(trimmed)) {
      setStepError(
        'mageName',
        'Name can only contain letters, numbers, spaces, hyphens, and apostrophes.'
      );
      return;
    }
    clearStepError('mageName');
    setStep('goals');
  };

  const handleMageNameSkip = () => {
    setFormData((prev) => ({ ...prev, scholarName: '' }));
    clearStepError('mageName');
    setStep('goals');
  };

  // ── Screen 10: Goals → complete onboarding ───────────────────────────────
  const submitOnboarding = async (goals: GoalValues) => {
    clearStepError('goals');
    setLoading(true);
    try {
      const scholarName = formData.scholarName.trim() || null;
      const fullName = `${formData.firstName.trim()} ${formData.lastName.trim()}`.trim();
      await fetch('/api/user/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          goals,
          scholarName,
          name: fullName || null,
          lineOfWork: formData.context || null,
          fieldOfStudy: formData.fieldOfStudy.trim() || null,
        }),
      });
      // Refresh the JWT token so middleware sees onboardingComplete: true
      await updateSession();
      router.push('/dashboard');
    } catch {
      setStepError('goals', 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const handleGoalsFinish = () => submitOnboarding(formData.goals);
  const handleGoalsSkip = () => submitOnboarding({ ...EMPTY_GOAL_VALUES });

  const handleBack = () => {
    const target = BACK_TARGETS[step];
    if (target) setStep(target);
  };

  const progress = (STEP_ORDER.indexOf(step) + 1) / STEP_ORDER.length;
  const isWide = step === 'plan' && !showPayment;
  const goalCount = Object.values(formData.goals).filter((v) => v !== null).length;

  const goalsBadge =
    goalCount > 0 ? (
      <span
        style={{
          width: '24px',
          height: '24px',
          borderRadius: '9999px',
          background: '#4dff91',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 12px rgba(77,255,145,0.35), 0 0 0 3px var(--surface-container-low)',
        }}
      >
        <span
          className="material-symbols-outlined"
          style={{ fontSize: '15px', color: '#0c2a14', fontVariationSettings: "'FILL' 1, 'wght' 700" }}
        >
          check
        </span>
      </span>
    ) : undefined;

  const renderScreen = () => {
    // ── Screen 1: identity — sign-up form (credentials) or DOB gate (OAuth) ──
    if (step === 'account') {
      if (authPath === null) {
        return (
          <OnboardingScreen screenKey="account" progress={progress}>
            <div
              style={{
                minHeight: '360px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '24px', color: '#ae89ff', animation: 'spin 1s linear infinite' }}
              >
                progress_activity
              </span>
            </div>
          </OnboardingScreen>
        );
      }

      if (isOauthPath) {
        return (
          <OnboardingScreen
            screenKey="account"
            progress={progress}
            mascotPose="wave"
            mascotIdle="float"
            heading="First, your date of birth"
            subheading="NoteMage is for ages 13 and up."
            error={stepErrors.account || ''}
            primaryLabel={loading ? 'Saving…' : 'Continue'}
            onPrimary={handleOAuthDobNext}
            primaryDisabled={loading || !formData.birthDate || !formData.agreed}
            primaryLoading={loading}
          >
            <OAuthBirthDateStep
              birthDate={formData.birthDate}
              agreed={formData.agreed}
              onChange={handleFieldChange}
              disabled={loading}
            />
          </OnboardingScreen>
        );
      }

      return (
        <OnboardingScreen screenKey="account" progress={progress}>
          <AccountStep
            data={{
              email: formData.email,
              password: formData.password,
              confirmPassword: formData.confirmPassword,
              birthDate: formData.birthDate,
              agreed: formData.agreed,
            }}
            onChange={handleFieldChange}
            onNext={handleAccountNext}
            loading={loading}
            error={stepErrors.account || ''}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 2: First name ─────────────────────────────────────────────────
    if (step === 'firstName') {
      return (
        <OnboardingScreen
          screenKey="firstName"
          progress={progress}
          mascotPose="holding-pen"
          mascotIdle="bounce"
          heading="What's your first name?"
          primaryLabel="Continue"
          onPrimary={() => setStep('lastName')}
          primaryDisabled={!formData.firstName.trim()}
        >
          <FirstNameStep
            value={formData.firstName}
            onChange={(value) => setFormData((prev) => ({ ...prev, firstName: value }))}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 3: Last name ──────────────────────────────────────────────────
    if (step === 'lastName') {
      return (
        <OnboardingScreen
          screenKey="lastName"
          progress={progress}
          onBack={handleBack}
          mascotPose="holding-pen"
          mascotIdle="bounce"
          heading="And your last name?"
          primaryLabel="Continue"
          onPrimary={() => setStep('username')}
          primaryDisabled={!formData.lastName.trim()}
        >
          <LastNameStep
            value={formData.lastName}
            onChange={(value) => setFormData((prev) => ({ ...prev, lastName: value }))}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 4: Username ───────────────────────────────────────────────────
    if (step === 'username') {
      return (
        <OnboardingScreen screenKey="username" progress={progress} onBack={handleBack}>
          <UsernameStep
            suggested={
              formData.username ||
              suggestUsernameFromEmail(formData.email || session?.user?.email)
            }
            avatarUrl={isOauthPath ? (session?.user?.avatarUrl ?? null) : null}
            displayName={isOauthPath ? (session?.user?.name ?? null) : null}
            onSaved={handleUsernameSaved}
            error={stepErrors.username || ''}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 5: Context ────────────────────────────────────────────────────
    if (step === 'context') {
      return (
        <OnboardingScreen
          screenKey="context"
          progress={progress}
          onBack={handleBack}
          mascotPose="thinking"
          mascotIdle="sway"
          heading="What brings you to NoteMage?"
          primaryLabel="Continue"
          onPrimary={() => setStep('fieldOfStudy')}
          primaryDisabled={!formData.context}
        >
          <ContextStep
            value={formData.context}
            onChange={(value) => setFormData((prev) => ({ ...prev, context: value }))}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 6: Field of study ─────────────────────────────────────────────
    if (step === 'fieldOfStudy') {
      return (
        <OnboardingScreen
          screenKey="fieldOfStudy"
          progress={progress}
          onBack={handleBack}
          mascotPose="thinking"
          mascotIdle="sway"
          heading="What are you studying?"
          subheading="This helps NoteMage tailor your study material."
          primaryLabel="Continue"
          onPrimary={() => setStep('plan')}
          primaryDisabled={!formData.fieldOfStudy.trim()}
          secondaryLabel="Skip for now"
          onSecondary={() => {
            setFormData((prev) => ({ ...prev, fieldOfStudy: '' }));
            setStep('plan');
          }}
        >
          <FieldOfStudyStep
            value={formData.fieldOfStudy}
            onChange={(value) => setFormData((prev) => ({ ...prev, fieldOfStudy: value }))}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 7a: Payment (embedded Stripe sub-screen of Plan) ──────────────
    if (step === 'plan' && showPayment) {
      return (
        <OnboardingScreen screenKey="payment" progress={progress}>
          <PaymentStep
            tier={formData.selectedTier}
            onSuccess={handlePaymentSuccess}
            onBack={handlePaymentBack}
            error={stepErrors.plan || ''}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 7: Plan ───────────────────────────────────────────────────────
    if (step === 'plan') {
      return (
        <OnboardingScreen
          screenKey="plan"
          progress={progress}
          mascotPose="thinking"
          mascotIdle="sway"
          heading="Choose your plan"
          error={stepErrors.plan || ''}
          primaryLabel={
            loading
              ? 'Saving…'
              : formData.selectedTier === 'FREE'
                ? 'Continue'
                : 'Continue to Payment'
          }
          onPrimary={handleTierNext}
          primaryDisabled={loading}
          primaryLoading={loading}
          compactFooter
        >
          <TierSelectionStep
            selectedTier={formData.selectedTier}
            onSelect={(tier) => setFormData((prev) => ({ ...prev, selectedTier: tier }))}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 8: Avatar ─────────────────────────────────────────────────────
    if (step === 'avatar') {
      return (
        <OnboardingScreen
          screenKey="avatar"
          progress={progress}
          mascotPose="default"
          mascotIdle="bounce"
          heading="Choose your avatar"
          subheading="This is how the community will see you."
          primaryLabel="Continue"
          onPrimary={handleAvatarNext}
          primaryDisabled={loading || avatarBusy}
          secondaryLabel="Skip for now"
          onSecondary={handleAvatarSkip}
          secondaryDisabled={loading || avatarBusy}
        >
          <AvatarStep
            username={formData.username}
            currentAvatarUrl={formData.avatarUrl}
            onAvatarChange={handleAvatarChange}
            onUploadingChange={setAvatarBusy}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 9: Mage name ──────────────────────────────────────────────────
    if (step === 'mageName') {
      return (
        <OnboardingScreen
          screenKey="mageName"
          progress={progress}
          onBack={handleBack}
          mascotPose="default"
          mascotIdle="bounce"
          heading="Name your Mage"
          subheading="Give your AI study assistant a name."
          error={stepErrors.mageName || ''}
          primaryLabel="Continue"
          onPrimary={handleMageNameNext}
          secondaryLabel="Skip for now"
          onSecondary={handleMageNameSkip}
        >
          <ScholarNameStep
            scholarName={formData.scholarName}
            onChange={(name) => setFormData((prev) => ({ ...prev, scholarName: name }))}
          />
        </OnboardingScreen>
      );
    }

    // ── Screen 10: Goals ─────────────────────────────────────────────────────
    return (
      <OnboardingScreen
        screenKey="goals"
        progress={progress}
        onBack={handleBack}
        mascotPose="holding-scroll"
        mascotIdle="sway"
        mascotBadge={goalsBadge}
        heading="Set your goals"
        subheading="Pick what matters to you. You can change these anytime."
        error={stepErrors.goals || ''}
        primaryLabel={
          loading ? (
            'Saving…'
          ) : (
            <>
              Get Started
              <span
                className="material-symbols-outlined"
                style={{ fontSize: '20px', fontVariationSettings: "'FILL' 1" }}
              >
                rocket_launch
              </span>
            </>
          )
        }
        onPrimary={handleGoalsFinish}
        primaryDisabled={loading}
        primaryLoading={loading}
        secondaryLabel="Skip for now"
        onSecondary={handleGoalsSkip}
        secondaryDisabled={loading}
      >
        <StudyGoalsStep
          goals={formData.goals}
          mageName={formData.scholarName.trim()}
          onChange={(goals) => setFormData((prev) => ({ ...prev, goals }))}
        />
      </OnboardingScreen>
    );
  };

  return (
    <div
      style={
        isWide
          ? { width: '90vw', maxWidth: '960px', marginLeft: '50%', transform: 'translateX(-50%)' }
          : undefined
      }
    >
      {renderScreen()}

      {/* Footer links */}
      <div
        style={{
          marginTop: '16px',
          display: 'flex',
          justifyContent: 'center',
          gap: '32px',
        }}
      >
        {['Help Center', 'System Status', 'Contact Support'].map((item) => (
          <a
            key={item}
            href="#"
            className="ob-footer-link"
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: 'var(--outline)',
              textDecoration: 'none',
            }}
          >
            {item}
          </a>
        ))}
      </div>

      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to   { transform: rotate(360deg); }
        }
        .ob-footer-link:hover { color: #e5e3ff; }
        .ob-footer-link:focus-visible { outline: 2px solid #ae89ff; outline-offset: 3px; border-radius: 4px; }
      `}</style>
    </div>
  );
}
