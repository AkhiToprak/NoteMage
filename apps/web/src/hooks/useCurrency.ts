'use client';

import { useCallback, useEffect, useState } from 'react';
import { detectCurrency, formatPrice, FALLBACK_RATES, type CurrencyCode } from '@/lib/currency';

interface CurrencyResponse {
  currency: CurrencyCode;
  rates: Record<string, number>;
}

// v3: canonical currency is CHF again (LS store can't leave CHF). Each bump
// orphans caches whose rates are based on the previous canonical currency —
// v2 briefly held USD-based rates that would misprice CHF amounts by ~24%.
const STORAGE_KEY = 'nm_currency_v3';

/** Last resolved currency + rates, if a previous visit cached them. Client-only. */
function readCached(): CurrencyResponse | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CurrencyResponse;
    return parsed?.currency && parsed?.rates ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Resolves the visitor's display currency + live exchange rates.
 *
 * Initial value is an instant guess — a prior cached result, else the browser
 * language + static fallback rates. It then refines from /api/currency (IP-based
 * currency + live ECB rates) and re-caches. All amounts are CHF-denominated;
 * non-CHF output is approximate (formatPrice: CHF is exact, else prefixed "≈").
 */
export function useCurrency() {
  const [data, setData] = useState<CurrencyResponse>(() => {
    const cached = readCached();
    if (cached) return cached;
    const currency: CurrencyCode =
      typeof navigator === 'undefined' ? 'CHF' : detectCurrency(navigator.language);
    return { currency, rates: FALLBACK_RATES };
  });

  useEffect(() => {
    let cancelled = false;

    fetch('/api/currency')
      .then((r) => (r.ok ? (r.json() as Promise<CurrencyResponse>) : null))
      .then((fresh) => {
        if (cancelled || !fresh?.currency || !fresh?.rates) return;
        setData(fresh);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
        } catch {
          // storage unavailable (e.g. private mode) — fine, just no caching
        }
      })
      .catch(() => {
        // network failure — keep the instant guess + fallback rates
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const format = useCallback(
    (amountCHF: number) => formatPrice(amountCHF, data.currency, data.rates),
    [data]
  );

  return { currency: data.currency, rates: data.rates, formatPrice: format };
}
