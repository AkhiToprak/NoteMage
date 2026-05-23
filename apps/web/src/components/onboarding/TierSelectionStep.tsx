'use client';

import PricingCard from '@/components/pricing/PricingCard';
import { TIERS, type TierKey } from '@/lib/tiers';
import { useCurrency } from '@/hooks/useCurrency';

interface TierSelectionStepProps {
  selectedTier: TierKey;
  onSelect: (tier: TierKey) => void;
  /**
   * Phase 12 switchover flag. Must be resolved server-side and passed in (the
   * env var is stripped from the client bundle). NOTE: this component is not
   * mounted anywhere right now — when the onboarding wizard re-adds a tier step,
   * its route should read freeTierAiPathsDisabled() and pass it through, the
   * same way app/pricing/page.tsx does.
   */
  freeAiPathsDisabled?: boolean;
}

export default function TierSelectionStep({
  selectedTier,
  onSelect,
  freeAiPathsDisabled = false,
}: TierSelectionStepProps) {
  const { formatPrice } = useCurrency();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', alignItems: 'stretch' }}>
        {(['FREE', 'PRO'] as TierKey[]).map((tier) => (
          <PricingCard
            key={tier}
            tier={tier}
            selected={selectedTier === tier}
            onSelect={onSelect}
            formattedPrice={formatPrice(TIERS[tier].priceCHF)}
            freeAiPathsDisabled={freeAiPathsDisabled}
            compact
          />
        ))}
      </div>
      <p style={{ color: 'var(--on-surface-variant)', fontSize: '12px', margin: 0, textAlign: 'center' }}>
        You can change your plan anytime.
      </p>
    </div>
  );
}
