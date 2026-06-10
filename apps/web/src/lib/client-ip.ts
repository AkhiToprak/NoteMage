/**
 * Real-client-IP resolution shared by the rate limiters (src/lib/rate-limit.ts)
 * and the OAuth account-creation cap (src/lib/registration.ts).
 *
 * Kept dependency-free — no Next.js request primitives, no Redis — so it can be
 * imported from the NextAuth signIn callback context as well as route handlers.
 */

/**
 * Number of reverse proxies WE run in front of the app — i.e. how many entries
 * to count in from the RIGHT of X-Forwarded-For to reach the real client.
 *
 * Default 1 = a single trusted edge proxy (the Coolify/Traefik that fronts
 * notemage.app), which makes the rightmost XFF entry the real client. Put a CDN
 * (e.g. Cloudflare) in front of Traefik and you MUST set TRUSTED_PROXY_HOPS=2,
 * or every request keys on the CDN's shared egress IP and collapses into one
 * rate-limit bucket — which both lets an attacker spend a victim's budget and
 * lets ordinary traffic self-DoS the login limiter.
 */
function trustedProxyHops(): number {
  const n = Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '', 10);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Resolve the client IP from forwarded headers.
 *
 * X-Forwarded-For is "client, proxy1, proxy2, …": each proxy APPENDS the peer it
 * received the request from, so the spoofable client-supplied portion is on the
 * LEFT and the trustworthy proxy-stamped portion is on the RIGHT. We index
 * `trustedProxyHops()` entries in from the right. Falls back to x-real-ip (set by
 * the same trusted proxy) when no forwarded chain is present.
 */
export function clientIpFromHeaders(forwarded: string | null, realIp: string | null): string {
  if (forwarded) {
    const ips = forwarded
      .split(',')
      .map((ip) => ip.trim())
      .filter(Boolean);
    if (ips.length > 0) {
      // Clamp so a chain shorter than the configured hop count (a misconfig, or
      // a direct hit that skipped a proxy) falls back to the leftmost entry
      // rather than indexing off the front of the array.
      const idx = Math.max(0, ips.length - trustedProxyHops());
      return ips[idx] || 'unknown';
    }
  }
  return realIp || 'unknown';
}
