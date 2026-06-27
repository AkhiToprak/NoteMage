import { Suspense } from 'react';
import SignupFlow from '@/components/onboarding/SignupFlow';

export default function RegisterPage() {
  // SignupFlow reads useSearchParams (OAuth ?error=) — wrap in Suspense so the
  // build doesn't bail out of static analysis (only `next build` catches this).
  return (
    <Suspense>
      <SignupFlow />
    </Suspense>
  );
}
