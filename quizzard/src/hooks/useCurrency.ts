'use client';

import { useMemo } from 'react';
import { detectCurrency, formatPrice } from '@/lib/currency';

export function useCurrency() {
  const currency = useMemo(() => {
    if (typeof navigator === 'undefined') return 'CHF';
    return detectCurrency(navigator.language);
  }, []);

  return {
    currency,
    formatPrice: (amountCHF: number) => formatPrice(amountCHF, currency),
  };
}
