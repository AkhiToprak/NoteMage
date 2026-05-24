import { NextRequest, NextResponse } from 'next/server';

// Legacy pre-launch invite short-link (was the signup-bypass handshake).
// Signups are open now, so any /i/<token> link just lands on the sign-up page.
export async function GET(request: NextRequest) {
  return NextResponse.redirect(new URL('/auth/register', request.url));
}
