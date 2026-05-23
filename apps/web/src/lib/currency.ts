/**
 * Currency display helpers for marketing / pricing surfaces.
 *
 * CLIENT-SAFE: this module must NOT import server-only deps (geoip-lite, the
 * rate fetcher). It holds the static fallback rates, the symbol/locale tables,
 * and the pure formatter. Live ECB rates and IP-based currency selection are
 * resolved server-side (src/lib/exchange-rates.ts + src/lib/geo-currency.ts via
 * /api/currency) and passed into formatPrice by the useCurrency hook.
 *
 * CHF is our canonical billing currency, so CHF renders exactly. Every other
 * currency is an on-page *estimate* (converted from CHF) and is prefixed with
 * "≈" — the real charge + conversion happen at the Lemon Squeezy checkout.
 */

export const SUPPORTED_CURRENCIES = [
  'CHF',
  'EUR',
  'USD',
  'GBP',
  'JPY',
  'CAD',
  'AUD',
  'INR',
  'BRL',
  'KRW',
  'TRY',
] as const;

export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

/**
 * Static CHF→X rates, used ONLY as a fallback when the live ECB feed is
 * unavailable (see exchange-rates.ts). Approximate by design — the live rates
 * override these on every request that reaches /api/currency.
 */
export const FALLBACK_RATES: Record<CurrencyCode, number> = {
  CHF: 1,
  EUR: 1.04,
  USD: 1.12,
  GBP: 0.89,
  JPY: 168.5,
  CAD: 1.53,
  AUD: 1.72,
  INR: 93.5,
  BRL: 5.62,
  KRW: 1495,
  TRY: 36.2,
};

const CURRENCY_SYMBOLS: Record<CurrencyCode, string> = {
  CHF: 'CHF',
  EUR: '€',
  USD: '$',
  GBP: '£',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$',
  INR: '₹',
  BRL: 'R$',
  KRW: '₩',
  TRY: '₺',
};

/** Currencies conventionally shown without minor units. */
const ZERO_DECIMAL: ReadonlySet<string> = new Set(['JPY', 'KRW']);

export function isSupportedCurrency(code: string): code is CurrencyCode {
  return (SUPPORTED_CURRENCIES as readonly string[]).includes(code);
}

/**
 * Best-effort currency from a BCP-47 locale (e.g. navigator.language). Language
 * is not country, so this is only the client's instant first guess before
 * /api/currency refines it from IP. Falls back to CHF.
 */
export function detectCurrency(locale: string): CurrencyCode {
  const mapping: Record<string, CurrencyCode> = {
    en_US: 'USD',
    en_GB: 'GBP',
    de: 'EUR',
    fr: 'EUR',
    it: 'EUR',
    es: 'EUR',
    pt_BR: 'BRL',
    ja: 'JPY',
    ko: 'KRW',
    tr: 'TRY',
    hi: 'INR',
    en_CA: 'CAD',
    en_AU: 'AUD',
    de_CH: 'CHF',
    fr_CH: 'CHF',
    it_CH: 'CHF',
  };
  const normalized = locale.replace('-', '_');
  return mapping[normalized] ?? mapping[normalized.split('_')[0]] ?? 'CHF';
}

/**
 * Format a CHF-denominated amount for display. CHF is exact; every other
 * currency is an approximate conversion and is prefixed with "≈". `rates`
 * defaults to the static fallback table — callers with live rates (the
 * useCurrency hook) pass them in.
 */
export function formatPrice(
  amountCHF: number,
  currencyCode: string,
  rates: Record<string, number> = FALLBACK_RATES
): string {
  if (amountCHF === 0) return 'Free';

  const code = isSupportedCurrency(currencyCode) ? currencyCode : 'CHF';
  const rate = rates[code] ?? FALLBACK_RATES[code] ?? 1;
  const converted = amountCHF * rate;
  const symbol = CURRENCY_SYMBOLS[code];
  const sep = symbol.length > 1 ? ' ' : '';
  const num = ZERO_DECIMAL.has(code) ? String(Math.round(converted)) : converted.toFixed(2);
  const body = `${symbol}${sep}${num}`;

  return code === 'CHF' ? body : `≈ ${body}`;
}
