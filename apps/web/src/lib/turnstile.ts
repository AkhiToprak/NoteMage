const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

/** True when Turnstile is configured server-side. */
export function turnstileConfigured(): boolean {
  return !!process.env.TURNSTILE_SECRET_KEY && !!process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
}

/**
 * Verify a Cloudflare Turnstile token server-side.
 *
 * Returns true without a provider call only in development/test when the key
 * pair is absent. Production requires BOTH keys and fails closed if either is
 * missing.
 *
 * When Turnstile IS configured it fails CLOSED: a missing/invalid token, or a
 * verification-endpoint outage, blocks the request — matching the fail-closed
 * posture of the auth rate limiters.
 */
export async function verifyTurnstile(token: unknown, remoteIp?: string): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret || !process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
    return process.env.NODE_ENV !== 'production';
  }
  if (typeof token !== 'string' || token.length === 0) return false;

  try {
    const form = new URLSearchParams({ secret, response: token });
    if (remoteIp) form.set('remoteip', remoteIp);
    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch (err) {
    console.error('[turnstile] verification request failed:', err);
    return false; // configured but unreachable → fail closed
  }
}
