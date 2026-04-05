import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  return response;
}

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });
  const { pathname } = request.nextUrl;

  // Auth pages (login/register) handling
  if (pathname.startsWith('/auth/register')) {
    if (!token) return withSecurityHeaders(NextResponse.redirect(new URL('/', request.url))); // Not logged in — block registration, send to waitlist
    if (token.onboardingComplete) {
      // Completed onboarding — block re-registration
      return withSecurityHeaders(NextResponse.redirect(new URL('/home', request.url)));
    }
    return withSecurityHeaders(NextResponse.next()); // Incomplete onboarding — allow access to finish
  }

  // Authenticated users hitting "/" → redirect to /home
  if (pathname === '/' && token) {
    return withSecurityHeaders(NextResponse.redirect(new URL('/home', request.url)));
  }

  // Public pricing page — allow unauthenticated access
  if (pathname === '/pricing') {
    if (token && token.onboardingComplete) {
      // Logged-in users can also view pricing
      return withSecurityHeaders(NextResponse.next());
    }
    return withSecurityHeaders(NextResponse.next());
  }

  // Unauthenticated users hitting protected routes → redirect to login
  if (pathname !== '/' && !token) {
    const signInUrl = new URL('/auth/login', request.url);
    signInUrl.searchParams.set('callbackUrl', pathname);
    return withSecurityHeaders(NextResponse.redirect(signInUrl));
  }

  // Logged in but onboarding incomplete → force to register
  if (token && !token.onboardingComplete && !pathname.startsWith('/auth/')) {
    return withSecurityHeaders(NextResponse.redirect(new URL('/auth/register', request.url)));
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: [
    '/',
    '/auth/register',
    '/dashboard/:path*',
    '/notebooks/:path*',
    '/settings/:path*',
    '/settings',
'/home/:path*',
    '/home',
    '/pricing',
  ],
};
