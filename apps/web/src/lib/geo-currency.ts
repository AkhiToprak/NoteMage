import 'server-only';
import { isSupportedCurrency, type CurrencyCode } from '@/lib/currency';

/**
 * Resolve a display currency from a client IP using the bundled MaxMind
 * GeoLite2 country database (geoip-lite — a local lookup; the IP never leaves
 * our server). Server-only. Unknown / private / unmapped IPs fall back to CHF.
 *
 * geoip-lite is imported lazily inside a try/catch: it loads its .dat data
 * files from disk at init, so if the standalone build ever ships without them
 * we degrade to CHF rather than throwing and 500-ing the route.
 *
 * Attribution: this product includes GeoLite2 data created by MaxMind,
 * available from https://www.maxmind.com.
 */

// ISO-3166-1 alpha-2 country → display currency, limited to SUPPORTED_CURRENCIES.
// Countries not listed fall back to CHF (our canonical, exact currency).
const COUNTRY_TO_CURRENCY: Record<string, CurrencyCode> = {
  CH: 'CHF',
  LI: 'CHF',
  US: 'USD',
  GB: 'GBP',
  JP: 'JPY',
  CA: 'CAD',
  AU: 'AUD',
  IN: 'INR',
  BR: 'BRL',
  KR: 'KRW',
  TR: 'TRY',
  // Eurozone
  AT: 'EUR',
  BE: 'EUR',
  HR: 'EUR',
  CY: 'EUR',
  EE: 'EUR',
  FI: 'EUR',
  FR: 'EUR',
  DE: 'EUR',
  GR: 'EUR',
  IE: 'EUR',
  IT: 'EUR',
  LV: 'EUR',
  LT: 'EUR',
  LU: 'EUR',
  MT: 'EUR',
  NL: 'EUR',
  PT: 'EUR',
  SK: 'EUR',
  SI: 'EUR',
  ES: 'EUR',
};

export async function currencyFromIp(ip: string | null | undefined): Promise<CurrencyCode> {
  if (!ip || ip === 'unknown') return 'CHF';

  try {
    const { default: geoip } = await import('geoip-lite');
    // Defensive: take the first IP, drop any IPv4-mapped IPv6 prefix.
    const clean = ip.split(',')[0].trim().replace(/^::ffff:/, '');
    const geo = geoip.lookup(clean);
    const country = geo?.country;
    if (!country) return 'CHF';

    const currency = COUNTRY_TO_CURRENCY[country];
    return currency && isSupportedCurrency(currency) ? currency : 'CHF';
  } catch {
    // geoip-lite data unavailable — degrade to the canonical currency.
    return 'CHF';
  }
}
