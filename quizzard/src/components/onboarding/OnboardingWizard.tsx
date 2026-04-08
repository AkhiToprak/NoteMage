'use client';

import { useState, useEffect, useRef } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import Image from 'next/image';
import StepIndicator from './StepIndicator';
import AccountStep from './AccountStep';
import TierSelectionStep from './TierSelectionStep';
import PaymentStep from './PaymentStep';
import AvatarStep from './AvatarStep';
import StudyGoalsStep from './StudyGoalsStep';
import ScholarNameStep from './ScholarNameStep';
import type { TierKey } from '@/lib/tiers';

interface FormData {
  username: string;
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
  agreed: boolean;
  selectedTier: TierKey;
  avatarUrl: string | null;
  scholarName: string;
  studyGoals: { type: string; target: number }[];
}

const STEP_LABELS = ['Account', 'Plan', 'Avatar', 'Scholar', 'Goals'];

const INITIAL_FORM: FormData = {
  username: '',
  email: '',
  name: '',
  password: '',
  confirmPassword: '',
  agreed: false,
  selectedTier: 'FREE',
  avatarUrl: null,
  scholarName: '',
  studyGoals: [],
};

export default function OnboardingWizard() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { update: updateSession } = useSession();
  const [step, setStep] = useState<1 | 2 | 3 | 4 | 5>(1);
  const [formData, setFormData] = useState<FormData>(() => {
    const tierParam = searchParams.get('tier')?.toUpperCase();
    const initialTier =
      tierParam === 'PLUS' || tierParam === 'PRO' ? (tierParam as TierKey) : 'FREE';
    return { ...INITIAL_FORM, selectedTier: initialTier };
  });
  const [loading, setLoading] = useState(false);
  const [stepErrors, setStepErrors] = useState<Record<number, string>>({});
  const [showPayment, setShowPayment] = useState(false);
  const paymentHandledRef = useRef(false);

  const setStepError = (s: number, msg: string) => setStepErrors((prev) => ({ ...prev, [s]: msg }));

  const clearStepError = (s: number) => setStepErrors((prev) => ({ ...prev, [s]: '' }));

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
        setStep(3);
      } catch {
        paymentHandledRef.current = false;
      }
    })();
  }, [searchParams, updateSession]);

  const handleFieldChange = (field: string, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  // ── Step 1: Register + auto-login ─────────────────────────────────────────
  const handleAccountNext = async () => {
    clearStepError(1);
    setLoading(true);
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: formData.username,
          email: formData.email,
          name: formData.name,
          password: formData.password,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStepError(1, data.error || 'Failed to create account');
        return;
      }
      // Auto-login
      const signInResult = await signIn('credentials', {
        email: formData.email,
        password: formData.password,
        redirect: false,
      });
      if (signInResult?.error) {
        setStepError(1, 'Account created but auto-login failed. Please log in manually.');
        return;
      }
      // Clear sensitive data from state
      setFormData((prev) => ({ ...prev, password: '', confirmPassword: '' }));
      setStep(2);
    } catch {
      setStepError(1, 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Step 2: Tier Selection ────────────────────────────────────────────────
  const handleTierNext = async () => {
    clearStepError(2);

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
          setStepError(2, data.error || 'Failed to save plan.');
          return;
        }
        await updateSession();
        setStep(3);
      } catch {
        setStepError(2, 'Something went wrong. Please try again.');
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
    setStep(3);
  };

  const handlePaymentBack = () => {
    setShowPayment(false);
  };

  // ── Step 3: Avatar ────────────────────────────────────────────────────────
  const handleAvatarNext = () => {
    setStep(4);
  };

  const handleAvatarSkip = () => {
    setFormData((prev) => ({ ...prev, avatarUrl: null }));
    setStep(4);
  };

  const handleAvatarChange = (url: string) => {
    setFormData((prev) => ({ ...prev, avatarUrl: url }));
  };

  // ── Step 4: Scholar Name ──────────────────────────────────────────────────
  const handleScholarNameNext = () => {
    setStep(5);
  };

  const handleScholarNameSkip = () => {
    setFormData((prev) => ({ ...prev, scholarName: '' }));
    setStep(5);
  };

  // ── Step 5: Goals ─────────────────────────────────────────────────────────
  const submitOnboarding = async (goals: { type: string; target: number }[]) => {
    clearStepError(5);
    setLoading(true);
    try {
      const scholarName = formData.scholarName.trim() || null;
      await fetch('/api/user/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studyGoals: goals, scholarName }),
      });
      // Refresh the JWT token so middleware sees onboardingComplete: true
      await updateSession();
      router.push('/home');
    } catch {
      setStepError(5, 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const handleGoalsFinish = () => submitOnboarding(formData.studyGoals);
  const handleGoalsSkip = () => submitOnboarding([]);

  const stepSubtitle =
    step === 1
      ? 'Join the Neon Scholar society.'
      : step === 2
        ? 'Choose your plan.'
        : step === 3
          ? "Let's set up your profile."
          : step === 4
            ? 'Give your scholar a name.'
            : 'Almost there — personalize your journey.';

  return (
    <div
      style={
        step === 2 && !showPayment
          ? { width: '90vw', maxWidth: '960px', marginLeft: '50%', transform: 'translateX(-50%)' }
          : undefined
      }
    >
      <style>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes stepGlow {
          0%, 100% { box-shadow: 0 0 0 0 rgba(174,137,255,0.3); }
          50%       { box-shadow: 0 0 0 6px rgba(174,137,255,0); }
        }
      `}</style>

      {/* Logo + Title */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          marginBottom: '40px',
        }}
      >
        <div
          style={{
            width: '80px',
            height: '80px',
            marginBottom: '24px',
            background: '#2a2a4c',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 40px rgba(174,137,255,0.15)',
          }}
        >
          <Image
            src="/logo_trimmed.png"
            alt="Quizzard"
            width={56}
            height={56}
            style={{ objectFit: 'contain' }}
            priority
          />
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-brand)',
            fontSize: '44px',
            fontWeight: 400,
            color: '#ae89ff',
            margin: '0 0 8px',
            letterSpacing: '-0.02em',
            textAlign: 'center',
          }}
        >
          Quizzard AI
        </h1>
        <p style={{ color: '#aaa8c8', fontSize: '17px', margin: 0, textAlign: 'center' }}>
          {stepSubtitle}
        </p>
      </div>

      {/* Card */}
      <div
        style={{
          background: '#161630',
          borderRadius: '32px',
          padding: '40px',
          boxShadow: '0 32px 64px rgba(0,0,0,0.4)',
          position: 'relative',
          overflow: 'hidden',
          width: '100%',
        }}
      >
        {/* Top gradient line */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '1px',
            background: 'linear-gradient(90deg, transparent, rgba(174,137,255,0.4), transparent)',
            pointerEvents: 'none',
          }}
        />

        {/* Step Indicator */}
        <StepIndicator currentStep={step} totalSteps={5} labels={STEP_LABELS} />

        {/* Step Content */}
        <div
          key={step}
          style={{
            marginTop: '32px',
            animation: 'fadeSlide 0.35s cubic-bezier(0.22,1,0.36,1)',
          }}
        >
          {step === 1 && (
            <AccountStep
              data={{
                username: formData.username,
                email: formData.email,
                name: formData.name,
                password: formData.password,
                confirmPassword: formData.confirmPassword,
                agreed: formData.agreed,
              }}
              onChange={handleFieldChange}
              onNext={handleAccountNext}
              loading={loading}
              error={stepErrors[1] || ''}
            />
          )}

          {step === 2 && !showPayment && (
            <TierSelectionStep
              selectedTier={formData.selectedTier}
              onSelect={(tier) => setFormData((prev) => ({ ...prev, selectedTier: tier }))}
              onNext={handleTierNext}
              loading={loading}
              error={stepErrors[2] || ''}
            />
          )}

          {step === 2 && showPayment && (
            <PaymentStep
              tier={formData.selectedTier}
              onSuccess={handlePaymentSuccess}
              onBack={handlePaymentBack}
              error={stepErrors[2] || ''}
            />
          )}

          {step === 3 && (
            <AvatarStep
              username={formData.username}
              currentAvatarUrl={formData.avatarUrl}
              onAvatarChange={handleAvatarChange}
              onNext={handleAvatarNext}
              onSkip={handleAvatarSkip}
              loading={loading}
              error={stepErrors[3] || ''}
            />
          )}

          {step === 4 && (
            <ScholarNameStep
              scholarName={formData.scholarName}
              onChange={(name) => setFormData((prev) => ({ ...prev, scholarName: name }))}
              onNext={handleScholarNameNext}
              onSkip={handleScholarNameSkip}
              loading={loading}
              error={stepErrors[4] || ''}
            />
          )}

          {step === 5 && (
            <StudyGoalsStep
              goals={formData.studyGoals}
              onChange={(goals) => setFormData((prev) => ({ ...prev, studyGoals: goals }))}
              onFinish={handleGoalsFinish}
              onSkip={handleGoalsSkip}
              loading={loading}
              error={stepErrors[5] || ''}
            />
          )}
        </div>
      </div>

      {/* Footer links */}
      <div
        style={{
          marginTop: '32px',
          display: 'flex',
          justifyContent: 'center',
          gap: '32px',
        }}
      >
        {['Help Center', 'System Status', 'Contact Support'].map((item) => (
          <a
            key={item}
            href="#"
            style={{
              fontSize: '12px',
              fontWeight: 500,
              color: '#8888a8',
              textDecoration: 'none',
              transition: 'color 0.15s',
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = '#e5e3ff';
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLAnchorElement).style.color = '#8888a8';
            }}
          >
            {item}
          </a>
        ))}
      </div>
    </div>
  );
}
