import type { Metadata } from 'next';
import OnboardingBridge from '@/components/onboarding/OnboardingBridge';

export const metadata: Metadata = {
  title: 'Build your path from a link — NoteMage',
  description: 'NoteMage detected your video. Pick a goal and session length, then build your study path.',
  robots: { index: false, follow: false },
};

export default function LinkBridgePage() {
  return <OnboardingBridge kind="link" />;
}
