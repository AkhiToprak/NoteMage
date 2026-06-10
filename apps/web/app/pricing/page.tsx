import { freeTierAiPathsDisabled } from '@/lib/feature-flags';
import PricingPageClient from './PricingPageClient';

// The FREE-tier study-path allowance depends on FREE_TIER_AI_PATHS_DISABLED,
// which is read at request time (Coolify sets env at runtime, and the Phase 12
// switchover must reflect a container restart without a rebuild). Resolve it on
// the server and hand it to the client tree so the pricing copy can never drift
// from what the server actually enforces. force-dynamic keeps this out of the
// static cache so a flag flip + restart takes effect immediately.
export const dynamic = 'force-dynamic';

export default function PricingPage() {
  return <PricingPageClient freeAiPathsDisabled={freeTierAiPathsDisabled()} />;
}
