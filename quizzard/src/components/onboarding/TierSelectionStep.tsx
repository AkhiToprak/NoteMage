'use client';

import PricingCard from '@/components/pricing/PricingCard';
import { TIERS, type TierKey } from '@/lib/tiers';
import { useCurrency } from '@/hooks/useCurrency';

interface TierSelectionStepProps {
  selectedTier: TierKey;
  onSelect: (tier: TierKey) => void;
  onNext: () => void;
  loading: boolean;
  error: string;
}

export default function TierSelectionStep({
  selectedTier,
  onSelect,
  onNext,
  loading,
  error,
}: TierSelectionStepProps) {
  const { formatPrice } = useCurrency();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      <p style={{ color: '#aaa8c8', fontSize: '14px', margin: 0, textAlign: 'center' }}>
        Choose a plan to get started. You can change this anytime.
      </p>

      <div
        style={{
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        {(['FREE', 'PLUS', 'PRO'] as TierKey[]).map((tier) => (
          <PricingCard
            key={tier}
            tier={tier}
            selected={selectedTier === tier}
            onSelect={onSelect}
            formattedPrice={formatPrice(TIERS[tier].priceCHF)}
          />
        ))}
      </div>

      {error && (
        <p style={{ color: '#ff6b6b', fontSize: '13px', margin: 0, textAlign: 'center' }}>
          {error}
        </p>
      )}

      <button
        onClick={onNext}
        disabled={loading}
        style={{
          alignSelf: 'center',
          padding: '14px 48px',
          borderRadius: '14px',
          border: 'none',
          fontWeight: 700,
          fontSize: '15px',
          cursor: loading ? 'wait' : 'pointer',
          background: 'linear-gradient(135deg, #ae89ff, #8b5cf6)',
          color: '#fff',
          opacity: loading ? 0.6 : 1,
          transition: 'opacity 0.2s',
        }}
      >
        {loading ? 'Saving…' : 'Continue'}
      </button>
    </div>
  );
}
