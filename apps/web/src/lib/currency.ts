const CHF_RATES: Record<string, number> = {
  USD: 1.12,
  EUR: 1.04,
  GBP: 0.89,
  JPY: 168.5,
  CAD: 1.53,
  AUD: 1.72,
  INR: 93.5,
  BRL: 5.62,
  KRW: 1495,
  TRY: 36.2,
  CHF: 1,
};

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: '$',
  EUR: '€',
  GBP: '£',
  JPY: '¥',
  CAD: 'CA$',
  AUD: 'A$',
  INR: '₹',
  BRL: 'R$',
  KRW: '₩',
  TRY: '₺',
  CHF: 'CHF',
};

export function detectCurrency(locale: string): string {
  const mapping: Record<string, string> = {
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

export function formatPrice(amountCHF: number, currencyCode: string): string {
  if (amountCHF === 0) return 'Free';
  const rate = CHF_RATES[currencyCode] ?? 1;
  const converted = amountCHF * rate;
  const symbol = CURRENCY_SYMBOLS[currencyCode] ?? currencyCode;

  if (currencyCode === 'JPY' || currencyCode === 'KRW') {
    return `${symbol}${Math.round(converted)}`;
  }
  return `${symbol}${converted.toFixed(2)}`;
}
