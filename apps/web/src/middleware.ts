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

// The native shells (iOS + Windows/Electron) append a `NotemageShell/<plat>`
// token to their default Chromium UA string before loading any URL. We use
// that to gate the marketing experience out of the shell: landing, pricing,
// about, contact, waitlist, legal, and /docs are web-only surfaces. Any
// shell request for one of them is rewritten to /auth/login (which itself
// redirects to /dashboard if the user already has a session cookie).
//
// Keep this list in sync with the `SHELL_MARKETING_ROUTES` matcher below.
// If you add a new public/marketing route, add it to BOTH places or the
// shell will happily render it the next time someone clicks a stray link.
const SHELL_MARKETING_PREFIXES = ['/pricing', '/about', '/contact', '/waitlist', '/legal', '/docs'];

function isNativeShell(request: NextRequest): boolean {
  const ua = request.headers.get('user-agent') ?? '';
  return ua.includes('NotemageShell/');
}

function isMarketingRoute(pathname: string): boolean {
  if (pathname === '/') return true;
  return SHELL_MARKETING_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

export async function middleware(request: NextRequest) {
  const token = await getToken({ req: request });
  const { pathname } = request.nextUrl;

  // Native shell hitting a marketing/landing route → bounce to /auth/login.
  // This runs before the token check because the redirect target is the
  // same whether or not the user is authenticated: /auth/login is the one
  // route that's smart enough to send authed users onward to /dashboard.
  if (isNativeShell(request) && isMarketingRoute(pathname)) {
    return withSecurityHeaders(NextResponse.redirect(new URL('/auth/login', request.url)));
  }

  // Signups are paused: hard-redirect register route to waitlist.
  if (pathname.startsWith('/auth/register')) {
    return withSecurityHeaders(NextResponse.redirect(new URL('/waitlist', request.url)));
  }

  // Already-authed users hitting /auth/login (e.g. the iPad shell boots
  // straight into this path) should bypass the form entirely.
  if (pathname.startsWith('/auth/login') && token) {
    const target = token.onboardingComplete ? '/dashboard' : '/auth/register';
    return withSecurityHeaders(NextResponse.redirect(new URL(target, request.url)));
  }

  // Authenticated users hitting "/" → redirect to /dashboard
  if (pathname === '/' && token) {
    return withSecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)));
  }

  // Public marketing pages stay accessible on the web, including /waitlist.
  // Native shell requests for these routes are already handled above.
  if (isMarketingRoute(pathname)) {
    return withSecurityHeaders(NextResponse.next());
  }

  // Unauthenticated users hitting protected routes → redirect to login.
  //
  // CRITICAL: exclude `/auth/*` from this branch. The earlier auth-page
  // handlers already decided what to do for logged-in users hitting
  // /auth/login or /auth/register; if we fall through here with no token,
  // the user is on a login/register page WITHOUT a session — which is
  // exactly the case where the form should render normally. If we
  // redirect `/auth/login` → `/auth/login?callbackUrl=/auth/login`, the
  // next request re-enters this branch and loops forever. That loop is
  // invisible to normal web visitors (who start at `/`) but the Electron
  // shell hits it head-on because it has its own cookie jar and boots
  // directly into /auth/login with no session.
  if (pathname !== '/' && !pathname.startsWith('/auth/') && !token) {
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
    '/auth/login',
    '/auth/register',
    '/dashboard',
    '/dashboard/:path*',
    '/notebooks/:path*',
    '/settings',
    '/settings/:path*',
    // Marketing surfaces — the middleware reroutes these to /auth/login
    // when the request comes from a native shell (see isNativeShell above).
    // Unauthed web visitors still see them unchanged.
    '/pricing',
    '/about',
    '/contact',
    '/waitlist',
    '/legal',
    '/legal/:path*',
    '/docs',
    '/docs/:path*',
  ],
};
