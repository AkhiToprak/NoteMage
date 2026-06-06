import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getToken } from 'next-auth/jwt';

// Content-Security-Policy. Shipped in Report-Only first so it CANNOT break the
// app while the allowlist is tuned — violations only log to the browser console
// (and Sentry), nothing is blocked. Once a representative session reports zero
// violations, rename the header below to 'Content-Security-Policy' to enforce.
//
// Sources reflect current integrations: Supabase (REST + storage images +
// realtime websocket), PostHog (reverse-proxied through same-origin /ingest, so
// 'self' already covers it), Sentry ingest, Google Fonts / Material Symbols, and
// the Google/Apple OAuth redirect targets. 'unsafe-inline' on script/style is
// required by Next's inline bootstrap script and this project's inline style
// objects; tightening to per-request nonces is a deliberate later step.
// NOTE: if presence uses a custom NEXT_PUBLIC_WS_URL host (not *.supabase.co),
// add its wss:// origin to connect-src — Report-Only will surface it.
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com https://appleid.apple.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' https://fonts.gstatic.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "script-src 'self' 'unsafe-inline'",
  "worker-src 'self' blob:",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://*.sentry.io https://*.ingest.sentry.io https://*.ingest.de.sentry.io",
].join('; ');

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('X-DNS-Prefetch-Control', 'off');
  // HSTS is only honored by browsers over HTTPS, so setting it globally is safe.
  // If the Coolify/Traefik proxy already emits this header, remove this line to
  // avoid a duplicate (browsers honor the first one regardless).
  response.headers.set(
    'Strict-Transport-Security',
    'max-age=31536000; includeSubDomains; preload'
  );
  // Report-Only for now — see CONTENT_SECURITY_POLICY note above before enforcing.
  response.headers.set('Content-Security-Policy-Report-Only', CONTENT_SECURITY_POLICY);
  return response;
}

// Always-allowed paths during maintenance. The AASA file MUST keep returning
// 200/JSON or every iOS install loses its Universal Link binding for ~24h.
// _next assets and the favicon are needed for the maintenance page itself
// to render.
function isMaintenanceAllowlisted(pathname: string): boolean {
  return (
    pathname === '/.well-known/apple-app-site-association' ||
    pathname.startsWith('/_next/') ||
    pathname === '/favicon.png' ||
    pathname === '/favicon.ico'
  );
}

function handleMaintenance(request: NextRequest, pathname: string): NextResponse {
  if (isMaintenanceAllowlisted(pathname)) {
    return withSecurityHeaders(NextResponse.next());
  }
  // API callers (the iOS shell, fetch from the SPA) get JSON, not HTML —
  // otherwise they try to parse the maintenance page and crash.
  if (pathname.startsWith('/api/')) {
    return withSecurityHeaders(
      new NextResponse(
        JSON.stringify({ error: 'maintenance', message: 'Service temporarily unavailable' }),
        {
          status: 503,
          headers: {
            'Content-Type': 'application/json',
            'Retry-After': '300',
          },
        }
      )
    );
  }
  // Everything else: render the maintenance page with a 503 status.
  // Rewriting /maintenance → /maintenance is intentional and non-recursive.
  return withSecurityHeaders(
    NextResponse.rewrite(new URL('/maintenance', request.url), { status: 503 })
  );
}

// Paths the existing auth/redirect logic owns. Anything outside this set
// passes through with just security headers — preserves pre-maintenance
// behavior exactly when MAINTENANCE_MODE is off, even though the matcher
// below is broad enough to cover the maintenance interception.
const AUTH_LOGIC_PATTERNS: RegExp[] = [
  /^\/$/,
  /^\/auth\/(login|register)(\/|$)/,
  /^\/dashboard(\/|$)/,
  /^\/notebooks\//,
  /^\/settings(\/|$)/,
  /^\/(pricing|about|contact|waitlist)$/,
  /^\/legal(\/|$)/,
  /^\/docs(\/|$)/,
];

function isAuthLogicRoute(pathname: string): boolean {
  return AUTH_LOGIC_PATTERNS.some((p) => p.test(pathname));
}

// Public /api routes that intentionally serve unauthenticated requests:
// next-auth + the credential signup/verify flow, the provider billing webhooks
// (verified by signature, not session), the OAuth callback, currency/geo lookup,
// the signup username-availability check, and the waitlist. Everything else under
// /api requires a session token (the defense-in-depth gate in middleware()).
const PUBLIC_API_ROUTES: RegExp[] = [
  /^\/api\/auth(\/|$)/,
  /^\/api\/billing\/[^/]+\/webhook(\/|$)/,
  /^\/api\/currency(\/|$)/,
  /^\/api\/import\/onenote\/callback(\/|$)/,
  /^\/api\/user\/check-username(\/|$)/,
  /^\/api\/waitlist(\/|$)/,
];

function isPublicApiRoute(pathname: string): boolean {
  return PUBLIC_API_ROUTES.some((p) => p.test(pathname));
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
  const { pathname } = request.nextUrl;

  // Maintenance mode — handled before any auth/token work so a flipped env
  // var takes the whole app offline regardless of the user's auth state.
  if (process.env.MAINTENANCE_MODE === 'true') {
    return handleMaintenance(request, pathname);
  }

  // Defense-in-depth for the API surface: every /api route except an explicit
  // public allowlist requires a valid session token. Handlers still do their own
  // object-level (ownership) authorization — this is a uniform FIRST gate so a
  // route that forgets to authenticate can't ship reachable while anonymous.
  if (pathname.startsWith('/api/')) {
    if (!isPublicApiRoute(pathname)) {
      const apiToken = await getToken({ req: request });
      if (!apiToken) {
        return withSecurityHeaders(
          NextResponse.json({ error: 'Authentication required' }, { status: 401 })
        );
      }
    }
    return withSecurityHeaders(NextResponse.next());
  }

  // Outside maintenance, only the routes the existing logic was designed for
  // get the full auth pipeline. Everything else (.well-known, /maintenance
  // itself when accessed directly, anything not in the list) gets security
  // headers and falls through. This preserves pre-maintenance behavior exactly
  // even though the matcher below is now broad.
  if (!isAuthLogicRoute(pathname)) {
    return withSecurityHeaders(NextResponse.next());
  }

  const token = await getToken({ req: request });

  // Native shell hitting a marketing/landing route → bounce to /auth/login.
  // This runs before the token check because the redirect target is the
  // same whether or not the user is authenticated: /auth/login is the one
  // route that's smart enough to send authed users onward to /dashboard.
  if (isNativeShell(request) && isMarketingRoute(pathname)) {
    return withSecurityHeaders(NextResponse.redirect(new URL('/auth/login', request.url)));
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
  // Broadened so MAINTENANCE_MODE can intercept every request. When the
  // env var is OFF, isAuthLogicRoute() above gates everything else through
  // a fast pass with just security headers — so the auth pipeline still
  // only runs on the original list of routes.
  matcher: ['/((?!_next/static|_next/image).*)'],
};
