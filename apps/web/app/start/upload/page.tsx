import type { Metadata } from 'next';
import OnboardingBridge from '@/components/onboarding/OnboardingBridge';

export const metadata: Metadata = {
  title: 'Build your path from your file — NoteMage',
  description: 'NoteMage detected your file. Pick a goal and session length, then build your study path.',
  robots: { index: false, follow: false },
};

export default function UploadBridgePage() {
  return <OnboardingBridge kind="upload" />;
}
