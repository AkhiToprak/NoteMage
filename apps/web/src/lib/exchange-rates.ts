import 'server-only';
import { FALLBACK_RATES, SUPPORTED_CURRENCIES, type CurrencyCode } from '@/lib/currency';

/**
 * Live CHF-based exchange rates from the European Central Bank, via the free,
 * key-less Frankfurter API. Cached in-process for 24h (ECB publishes ~once per
 * working day) and falls back to the static table on any failure so pricing
 * never breaks. Server-only — never import from a client component.
 */

const FRANKFURTER_URL = 'https://api.frankfurter.app/latest?from=CHF';
const TTL_MS = 24 * 60 * 60 * 1000;

let cache: { rates: Record<CurrencyCode, number>; fetchedAt: number } | null = null;

export async function getExchangeRates(): Promise<Record<CurrencyCode, number>> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache.rates;

  try {
    const res = await fetch(FRANKFURTER_URL, { next: { revalidate: 86400 } });
    if (!res.ok) throw new Error(`Frankfurter responded ${res.status}`);

    const json = (await res.json()) as { rates?: Record<string, number> };
    const live = json.rates ?? {};

    const rates: Record<CurrencyCode, number> = { ...FALLBACK_RATES };
    for (const code of SUPPORTED_CURRENCIES) {
      if (code === 'CHF') continue;
      const value = live[code];
      // Keep the static fallback for any currency the ECB feed omits.
      if (typeof value === 'number' && value > 0) rates[code] = value;
    }

    cache = { rates, fetchedAt: Date.now() };
    return rates;
  } catch {
    return FALLBACK_RATES;
  }
}
