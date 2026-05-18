'use client';

import OnboardingOptionCard from './OnboardingOptionCard';

/** The four answers to "What brings you to NoteMage?" — stored in `User.lineOfWork`. */
const CONTEXT_OPTIONS: { value: string; icon: string }[] = [
  { value: 'University', icon: 'account_balance' },
  { value: 'School', icon: 'school' },
  { value: 'Work', icon: 'work' },
  { value: 'Other', icon: 'interests' },
];

interface ContextStepProps {
  value: string;
  onChange: (value: string) => void;
}

/** Onboarding screen 5 — single-select context. Persists to `User.lineOfWork`. */
export default function ContextStep({ value, onChange }: ContextStepProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {CONTEXT_OPTIONS.map((opt) => (
        <OnboardingOptionCard
          key={opt.value}
          icon={opt.icon}
          label={opt.value}
          selected={value === opt.value}
          onSelect={() => onChange(opt.value)}
        />
      ))}
    </div>
  );
}
