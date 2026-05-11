import { NextRequest, NextResponse } from 'next/server';
import {
  SIGNUP_BYPASS_COOKIE,
  SIGNUP_BYPASS_COOKIE_MAX_AGE,
  isValidBypassToken,
} from '@/lib/signup-bypass';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  if (!isValidBypassToken(token)) {
    return NextResponse.redirect(new URL('/waitlist', request.url));
  }
  const response = NextResponse.redirect(new URL('/auth/register', request.url));
  response.cookies.set(SIGNUP_BYPASS_COOKIE, token, {
    httpOnly: true,
    secure: request.nextUrl.protocol === 'https:',
    sameSite: 'lax',
    path: '/',
    maxAge: SIGNUP_BYPASS_COOKIE_MAX_AGE,
  });
  return response;
}
