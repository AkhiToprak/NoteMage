'use client';

import { useState } from 'react';
import { signIn, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import StepIndicator from './StepIndicator';
import AccountStep from './AccountStep';
import AvatarStep from './AvatarStep';
import StudyGoalsStep from './StudyGoalsStep';

interface FormData {
  username: string;
  email: string;
  name: string;
  password: string;
  confirmPassword: string;
  agreed: boolean;
  avatarUrl: string | null;
  studyGoals: { type: string; target: number }[];
}

const STEP_LABELS = ['Account', 'Avatar', 'Goals'];

const INITIAL_FORM: FormData = {
  username: '',
  email: '',
  name: '',
  password: '',
  confirmPassword: '',
  agreed: false,
  avatarUrl: null,
  studyGoals: [],
};

export default function OnboardingWizard() {
  const router = useRouter();
  const { update: updateSession } = useSession();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [formData, setFormData] = useState<FormData>(INITIAL_FORM);
  const [loading, setLoading] = useState(false);
  const [stepErrors, setStepErrors] = useState<Record<number, string>>({});

  const setStepError = (s: number, msg: string) =>
    setStepErrors((prev) => ({ ...prev, [s]: msg }));

  const clearStepError = (s: number) =>
    setStepErrors((prev) => ({ ...prev, [s]: '' }));

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

  // ── Step 2: Avatar ────────────────────────────────────────────────────────
  const handleAvatarNext = () => {
    setStep(3);
  };

  const handleAvatarSkip = () => {
    setFormData((prev) => ({ ...prev, avatarUrl: null }));
    setStep(3);
  };

  const handleAvatarChange = (url: string) => {
    setFormData((prev) => ({ ...prev, avatarUrl: url }));
  };

  // ── Step 3: Goals ─────────────────────────────────────────────────────────
  const submitOnboarding = async (goals: { type: string; target: number }[]) => {
    clearStepError(3);
    setLoading(true);
    try {
      await fetch('/api/user/onboarding', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studyGoals: goals }),
      });
      // Refresh the JWT token so middleware sees onboardingComplete: true
      await updateSession();
      router.push('/home');
    } catch {
      setStepError(3, 'Something went wrong. Please try again.');
      setLoading(false);
    }
  };

  const handleGoalsFinish = () => submitOnboarding(formData.studyGoals);
  const handleGoalsSkip = () => submitOnboarding([]);

  return (
    <>
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
            fontFamily: '"Shrikhand", serif',
            fontStyle: 'italic',
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
          {step === 1
            ? "Join the Neon Scholar society."
            : step === 2
            ? "Let's set up your profile."
            : "Almost there — personalize your journey."}
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
        <StepIndicator
          currentStep={step}
          totalSteps={3}
          labels={STEP_LABELS}
        />

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

          {step === 2 && (
            <AvatarStep
              username={formData.username}
              currentAvatarUrl={formData.avatarUrl}
              onAvatarChange={handleAvatarChange}
              onNext={handleAvatarNext}
              onSkip={handleAvatarSkip}
              loading={loading}
              error={stepErrors[2] || ''}
            />
          )}

          {step === 3 && (
            <StudyGoalsStep
              goals={formData.studyGoals}
              onChange={(goals) => setFormData((prev) => ({ ...prev, studyGoals: goals }))}
              onFinish={handleGoalsFinish}
              onSkip={handleGoalsSkip}
              loading={loading}
              error={stepErrors[3] || ''}
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
    </>
  );
}
