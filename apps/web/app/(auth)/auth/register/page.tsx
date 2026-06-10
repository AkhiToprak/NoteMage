import { Suspense } from 'react';
import OnboardingWizard from '@/components/onboarding/OnboardingWizard';
import { freeTierAiPathsDisabled } from '@/lib/feature-flags';

// The onboarding plan step shows FREE-tier copy that depends on
// FREE_TIER_AI_PATHS_DISABLED (read at request time on Coolify). Resolve it on
// the server and hand it to the client wizard, exactly as app/pricing/page.tsx
// does, so the tier card can't drift from what the server enforces.
export const dynamic = 'force-dynamic';

export default function RegisterPage() {
  return (
    <Suspense>
      <OnboardingWizard freeAiPathsDisabled={freeTierAiPathsDisabled()} />
    </Suspense>
  );
}
