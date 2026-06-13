import { NextRequest, NextResponse } from 'next/server';
import { getClientIp } from '@/lib/rate-limit';
import { loginChallengeRequired } from '@/lib/login-challenge';

// Pre-login, intentionally anonymous: tells the login form whether THIS IP
// must solve a Turnstile challenge (because of recent failed logins). Returns
// only a boolean — no account data, no enumeration surface. Always false when
// Turnstile is not configured.
export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const required = await loginChallengeRequired(ip);
  return NextResponse.json({ required });
}
