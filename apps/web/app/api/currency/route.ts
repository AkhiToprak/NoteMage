import { NextResponse, type NextRequest } from 'next/server';
import { getClientIp } from '@/lib/rate-limit';
import { currencyFromIp } from '@/lib/geo-currency';
import { getExchangeRates } from '@/lib/exchange-rates';

/**
 * Resolves the visitor's approximate display currency (from IP, via the local
 * GeoLite2 DB) plus the latest CHF-based exchange rates. Consumed by the
 * useCurrency hook. Node runtime (geoip-lite needs `fs`); per-request because
 * the result depends on the caller's IP.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const currency = await currencyFromIp(getClientIp(request));
  const rates = await getExchangeRates();

  return NextResponse.json(
    { currency, rates },
    { headers: { 'Cache-Control': 'private, max-age=3600' } }
  );
}
