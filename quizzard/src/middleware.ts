import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });
  const { pathname } = request.nextUrl;

  // Auth pages (login/register) handling
  if (pathname.startsWith('/auth/register')) {
    if (!token) return NextResponse.next(); // Not logged in — allow registration
    if (token.onboardingComplete) {
      // Completed onboarding — block re-registration
      return NextResponse.redirect(new URL('/home', request.url));
    }
    return NextResponse.next(); // Incomplete onboarding — allow access to finish
  }

  // Authenticated users hitting "/" → redirect to /home
  if (pathname === '/' && token) {
    return NextResponse.redirect(new URL('/home', request.url));
  }

  // Unauthenticated users hitting protected routes → redirect to login
  if (pathname !== '/' && !token) {
    const signInUrl = new URL('/auth/login', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return NextResponse.redirect(signInUrl);
  }

  // Logged in but onboarding incomplete → force to register
  if (token && !token.onboardingComplete && !pathname.startsWith('/auth/')) {
    return NextResponse.redirect(new URL('/auth/register', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/auth/register',
    '/dashboard/:path*',
    '/notebooks/:path*',
    '/settings/:path*',
    '/settings',
    '/ai-chat/:path*',
    '/ai-chat',
    '/home/:path*',
    '/home',
  ],
};
