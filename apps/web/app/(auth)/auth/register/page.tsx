'use client';

import { Suspense } from 'react';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';

export default function RegisterPage() {
  return (
    <Suspense>
      <OnboardingWizard />
    </Suspense>
  );
}
