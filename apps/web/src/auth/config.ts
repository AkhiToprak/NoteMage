import type { NextAuthOptions, Profile } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import AppleProvider from 'next-auth/providers/apple';
import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { getIpFromHeaders, normalizeEmail } from '@/lib/registration';
import { findOrCreateOAuthUser } from '@/auth/oauth-user';
import { logSecurityEvent } from '@/lib/security-events';
import { verifyTurnstile } from '@/lib/turnstile';
import {
  loginChallengeRequired,
  recordLoginFailure,
  clearLoginChallenge,
} from '@/lib/login-challenge';
import {
  checkLoginThrottle,
  clearLoginThrottle,
  recordLoginFailureForEmail,
} from '@/lib/login-throttle';
import { validateAuthToken } from '@/lib/auth-context';

const INVALID_PASSWORD_HASH = '$2b$12$qiHZV66WfI1ZOumi6NZ2r.HPQoBOmCfrIsLX3KTw0ctD.JE4rXejO';

function logOAuthDenial(provider: string, reason: string): void {
  logSecurityEvent({ type: 'oauth.denied', detail: { provider, reason } });
}

/**
 * Read the canonical user shape from the DB and stamp it onto the JWT.
 * Used by both the OAuth first-sign-in path (where `user` is the raw
 * provider profile) and the `trigger === 'update'` refresh path (after
 * onboarding / cosmetic changes). Keep this select list aligned with
 * what CredentialsProvider.authorize() returns so token shape is
 * identical across auth methods.
 */
export async function hydrateTokenFromDb(
  token: Record<string, unknown>,
  userId: string
): Promise<void> {
  const freshUser = await db.user.findUnique({
    where: { id: userId },
    select: {
      onboardingComplete: true,
      birthDate: true,
      username: true,
      avatarUrl: true,
      role: true,
      tier: true,
      authVersion: true,
      scholarName: true,
      nameStyle: true,
      equippedTitleId: true,
      equippedFrameId: true,
      equippedBackgroundId: true,
      tutorialState: true,
    },
  });
  if (!freshUser) return;
  token.onboardingComplete = freshUser.onboardingComplete;
  token.hasBirthDate = freshUser.birthDate != null;
  token.username = freshUser.username;
  token.avatarUrl = freshUser.avatarUrl ?? undefined;
  token.role = freshUser.role;
  token.tier = freshUser.tier;
  token.authVersion = freshUser.authVersion;
  token.scholarName = freshUser.scholarName ?? undefined;
  token.nameStyle =
    (freshUser.nameStyle as { fontId?: string; colorId?: string } | null) ?? undefined;
  token.equippedTitleId = freshUser.equippedTitleId ?? undefined;
  token.equippedFrameId = freshUser.equippedFrameId ?? undefined;
  token.equippedBackgroundId = freshUser.equippedBackgroundId ?? undefined;
  token.tutorialState =
    (freshUser.tutorialState as {
      step?: string;
      completedAt?: string;
      dismissedAt?: string;
    } | null) ?? undefined;
}

// Providers are constructed conditionally so the app still boots in dev
// environments where only some OAuth credentials are configured. Missing
// env vars → that provider simply isn't wired up.
const oauthProviders = [] as NextAuthOptions['providers'];

if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  oauthProviders.push(
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // We never ask for scopes beyond basic profile + email — avatar comes
      // from the standard `picture` claim. No Drive/Gmail access.
    })
  );
}

if (process.env.APPLE_ID && process.env.APPLE_CLIENT_SECRET) {
  oauthProviders.push(
    AppleProvider({
      clientId: process.env.APPLE_ID,
      // APPLE_CLIENT_SECRET is a pre-generated JWT signed with the .p8 key.
      // Apple JWTs last at most 6 months — rotate via a CI/script step.
      // See .env.example for the openssl/jwt generation recipe.
      clientSecret: process.env.APPLE_CLIENT_SECRET,
    })
  );
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: '/auth/login',
    error: '/auth/login',
  },
  providers: [
    ...oauthProviders,
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        turnstileToken: { label: 'Turnstile Token', type: 'text' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const email = normalizeEmail(credentials.email);

        // Check the account-independent delay before looking up the user. The
        // key contains only an HMAC of the normalized email, and a Redis error
        // blocks authentication rather than silently dropping the defense.
        const throttle = await checkLoginThrottle(email);
        if (!throttle.allowed) {
          logSecurityEvent({
            type: 'login.throttled',
            detail: {
              reason: throttle.unavailable ? 'redis_unavailable' : 'progressive_delay',
              retryAfterMs: throttle.retryAfterMs,
            },
          });
          throw new Error('LOGIN_THROTTLED');
        }

        // Adaptive bot gate: after repeated failed logins from this IP, require
        // a solved Turnstile challenge before we even check the password.
        // Production requires the complete Turnstile key pair; missing config
        // makes this branch fail closed.
        let ip = 'unknown';
        try {
          ip = getIpFromHeaders(await headers());
        } catch {
          // headers() can throw outside a request context — skip the gate.
        }
        if (await loginChallengeRequired(ip)) {
          if (!(await verifyTurnstile(credentials.turnstileToken, ip))) {
            throw new Error('CAPTCHA_REQUIRED');
          }
        }

        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            emailVerified: true,
            birthDate: true,
            username: true,
            avatarUrl: true,
            onboardingComplete: true,
            role: true,
            tier: true,
            authVersion: true,
            scholarName: true,
            nameStyle: true,
            equippedTitleId: true,
            equippedFrameId: true,
            equippedBackgroundId: true,
            tutorialState: true,
            banned: true,
          },
        });

        // Always run bcrypt to prevent timing-based user enumeration
        // AND to prevent leaking "this email is an OAuth-only account" via
        // response-time side channel. If `user.password` is null (OAuth
        // account with no credentials set), we compare against the
        // invalid-hash placeholder, which bcrypt will reject with the same
        // wall-clock time as a normal wrong-password attempt.
        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user?.password ?? INVALID_PASSWORD_HASH
        );

        // OAuth-only accounts (password === null) must never authenticate
        // via the credentials form, even if the bcrypt compare somehow
        // returned true. This is the explicit guard backing the nullable
        // password column migration.
        const isOauthOnly = user !== null && user.password === null;

        if (!user || !passwordMatch || isOauthOnly) {
          // Every account state consumes the same HMAC-keyed counter: real,
          // unknown, and OAuth-only addresses are indistinguishable here.
          const failure = await recordLoginFailureForEmail(email);
          await recordLoginFailure(ip);
          logSecurityEvent({ userId: user?.id ?? null, type: 'login.failed' });
          if (!failure.recorded || (failure.delayMs ?? 0) > 0) {
            logSecurityEvent({
              userId: user?.id ?? null,
              type: 'login.throttled',
              detail: {
                reason: failure.recorded ? 'progressive_delay_armed' : 'redis_unavailable',
                failureCount: failure.count,
                delayMs: failure.delayMs,
              },
            });
          }
          return null;
        }

        // Block banned users from logging in
        if (user.banned) {
          await Promise.all([recordLoginFailureForEmail(email), recordLoginFailure(ip)]);
          logSecurityEvent({ userId: user.id, type: 'login.banned' });
          return null;
        }

        // Email-confirmation hard gate. A correct password on an account whose
        // `emailVerified` is null means the user registered but never confirmed
        // their email — refuse login with a distinct error string the login UI
        // maps to the code-entry screen. OAuth accounts never reach this branch
        // (they're created provider-verified), and pre-existing accounts were
        // grandfathered in the add_email_verification migration.
        if (!user.emailVerified) {
          if (!(await clearLoginThrottle(email))) throw new Error('LOGIN_THROTTLED');
          throw new Error('EMAIL_NOT_VERIFIED');
        }

        // A Redis outage must not let a correct login bypass throttle cleanup.
        if (!(await clearLoginThrottle(email))) throw new Error('LOGIN_THROTTLED');
        await clearLoginChallenge(ip);

        logSecurityEvent({ userId: user.id, type: 'login.success' });
        return {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          avatarUrl: user.avatarUrl ?? undefined,
          onboardingComplete: user.onboardingComplete,
          hasBirthDate: user.birthDate != null,
          role: user.role,
          tier: user.tier,
          authVersion: user.authVersion,
          scholarName: user.scholarName ?? undefined,
          nameStyle: (user.nameStyle as { fontId?: string; colorId?: string } | null) ?? undefined,
          equippedTitleId: user.equippedTitleId ?? undefined,
          equippedFrameId: user.equippedFrameId ?? undefined,
          equippedBackgroundId: user.equippedBackgroundId ?? undefined,
          tutorialState:
            (user.tutorialState as {
              step?: string;
              completedAt?: string;
              dismissedAt?: string;
            } | null) ?? undefined,
        };
      },
    }),
  ],
  callbacks: {
    /**
     * signIn — the only place new OAuth users are created. Runs on every
     * sign-in attempt. Credentials returns true immediately (authorize()
     * already did the work). OAuth providers do the full lookup/link/create
     * dance here so we own the User table shape end-to-end.
     */
    async signIn({ user, account, profile }) {
      if (!account || account.provider === 'credentials') return true;
      const provider = account.provider;
      if (provider !== 'google' && provider !== 'apple') {
        logOAuthDenial(provider, 'unsupported_provider');
        return false;
      }

      // Both providers set email_verified on the profile (Apple only ever
      // returns verified emails; Google sends a real boolean/string claim).
      // Require it before we trust the email for lookup or linking.
      const p = (profile ?? {}) as Profile & {
        email_verified?: boolean | string;
        picture?: string;
      };
      const emailVerified = p.email_verified === true || p.email_verified === 'true';
      if (!emailVerified) {
        logOAuthDenial(provider, 'email_unverified');
        return false;
      }

      const email = normalizeEmail(user.email ?? p.email);
      if (!email) {
        logOAuthDenial(provider, 'email_missing');
        return false;
      }

      const providerAccountId = account.providerAccountId;
      if (!providerAccountId) {
        logOAuthDenial(provider, 'provider_account_id_missing');
        return false;
      }

      // headers() can throw outside a request context — fail open and
      // skip the IP cap. Provider email verification is our fallback.
      let ip = 'unknown';
      try {
        const h = await headers();
        ip = getIpFromHeaders(h);
      } catch {
        // ignore
      }

      const allowNewUser = true; // signups are open

      const resolution = await findOrCreateOAuthUser({
        provider,
        providerAccountId,
        email,
        name: (user.name ?? p.name ?? null) as string | null,
        avatarUrl: (user.image ?? p.picture ?? null) as string | null,
        ip,
        allowNewUser,
      });

      if (!resolution.ok) {
        // Surface OAuthAccountExists as a redirect to the error page on the
        // login surface; banned/ip_cap/signup_disabled stay opaque.
        if (resolution.reason === 'account_exists') {
          return '/auth/login?error=OAuthAccountExists';
        }
        return false;
      }

      // Hydrate `user.id` so the jwt callback can re-read from DB.
      user.id = resolution.userId;
      return true;
    },

    async jwt({ token, user, trigger, account }) {
      // CredentialsProvider's authorize() already populates the full shape
      // on `user`. OAuth providers only populate {id,name,email,image},
      // so in that case we re-read the DB to hydrate the custom fields.
      const isOauthSignIn = !!account && account.provider !== 'credentials' && !!user;

      if (user && !isOauthSignIn) {
        const u = user as typeof user & {
          username?: string;
          avatarUrl?: string;
          onboardingComplete?: boolean;
          hasBirthDate?: boolean;
          role?: string;
          tier?: string;
          authVersion: number;
          scholarName?: string;
          nameStyle?: { fontId?: string; colorId?: string };
          equippedTitleId?: string;
          equippedFrameId?: string;
          equippedBackgroundId?: string;
          tutorialState?: {
            step?: string;
            completedAt?: string;
            dismissedAt?: string;
            seenShowcases?: string[];
          };
        };
        token.id = user.id;
        token.username = u.username;
        token.avatarUrl = u.avatarUrl;
        token.onboardingComplete = u.onboardingComplete;
        token.hasBirthDate = u.hasBirthDate;
        token.role = u.role;
        token.tier = u.tier;
        token.authVersion = u.authVersion;
        token.scholarName = u.scholarName;
        token.nameStyle = u.nameStyle;
        token.equippedTitleId = u.equippedTitleId;
        token.equippedFrameId = u.equippedFrameId;
        token.equippedBackgroundId = u.equippedBackgroundId;
        token.tutorialState = u.tutorialState;
      }

      // OAuth sign-in: user.id was set by the signIn callback (either
      // to an existing/linked userId or to the newly-created cuid). Hydrate
      // the token from DB using the same shape as authorize().
      if (isOauthSignIn && user?.id) {
        token.id = user.id;
        await hydrateTokenFromDb(token, user.id);
      }

      // Re-read from DB when session is explicitly updated (e.g. after
      // onboarding or after the user equips a new cosmetic). Validate first:
      // a revoked token must never copy the new authVersion into itself and
      // thereby become valid again.
      if (trigger === 'update' && token.id) {
        const auth = await validateAuthToken(token);
        if (auth) await hydrateTokenFromDb(token, auth.userId);
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.avatarUrl = token.avatarUrl as string | undefined;
        session.user.onboardingComplete = token.onboardingComplete as boolean;
        session.user.hasBirthDate = (token.hasBirthDate as boolean) ?? false;
        session.user.role = (token.role as string) ?? 'user';
        session.user.tier = (token.tier as string) ?? 'FREE';
        session.user.scholarName = token.scholarName as string | undefined;
        session.user.nameStyle = token.nameStyle;
        session.user.equippedTitleId = token.equippedTitleId;
        session.user.equippedFrameId = token.equippedFrameId;
        session.user.equippedBackgroundId = token.equippedBackgroundId;
        session.user.tutorialState = token.tutorialState;
      }
      return session;
    },
  },
};
