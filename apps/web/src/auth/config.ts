import type { NextAuthOptions, Profile } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import AppleProvider from 'next-auth/providers/apple';
import bcrypt from 'bcryptjs';
import { headers } from 'next/headers';
import { db } from '@/lib/db';
import { getIpFromHeaders } from '@/lib/registration';
import { findOrCreateOAuthUser } from '@/auth/oauth-user';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hour

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
      username: true,
      avatarUrl: true,
      role: true,
      tier: true,
      scholarName: true,
      nameStyle: true,
      equippedTitleId: true,
      equippedFrameId: true,
      equippedBackgroundId: true,
    },
  });
  if (!freshUser) return;
  token.onboardingComplete = freshUser.onboardingComplete;
  token.username = freshUser.username;
  token.avatarUrl = freshUser.avatarUrl ?? undefined;
  token.role = freshUser.role;
  token.tier = freshUser.tier;
  token.scholarName = freshUser.scholarName ?? undefined;
  token.nameStyle =
    (freshUser.nameStyle as { fontId?: string; colorId?: string } | null) ?? undefined;
  token.equippedTitleId = freshUser.equippedTitleId ?? undefined;
  token.equippedFrameId = freshUser.equippedFrameId ?? undefined;
  token.equippedBackgroundId = freshUser.equippedBackgroundId ?? undefined;
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
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await db.user.findUnique({
          where: { email: credentials.email },
          select: {
            id: true,
            email: true,
            name: true,
            password: true,
            username: true,
            avatarUrl: true,
            onboardingComplete: true,
            role: true,
            tier: true,
            scholarName: true,
            nameStyle: true,
            equippedTitleId: true,
            equippedFrameId: true,
            equippedBackgroundId: true,
            banned: true,
            banReason: true,
            failedLoginAttempts: true,
            lockedAt: true,
          },
        });

        // Check if account is locked (before password check, but after user lookup)
        if (user?.lockedAt) {
          const unlockAt = user.lockedAt.getTime() + LOCKOUT_DURATION_MS;
          if (unlockAt > Date.now()) {
            // Lock is still active — include unlock time in error for the frontend
            throw new Error(`ACCOUNT_LOCKED:${new Date(unlockAt).toISOString()}`);
          }
          // Lock has expired — auto-clear and let login proceed
          await db.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedAt: null },
          });
        }

        // Always run bcrypt to prevent timing-based user enumeration
        // AND to prevent leaking "this email is an OAuth-only account" via
        // response-time side channel. If `user.password` is null (OAuth
        // account with no credentials set), we compare against the
        // invalid-hash placeholder, which bcrypt will reject with the same
        // wall-clock time as a normal wrong-password attempt.
        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user?.password ?? '$2a$12$invalidhashplaceholdervalue1234'
        );

        // OAuth-only accounts (password === null) must never authenticate
        // via the credentials form, even if the bcrypt compare somehow
        // returned true. This is the explicit guard backing the nullable
        // password column migration.
        const isOauthOnly = user !== null && user.password === null;

        if (!user || !passwordMatch || isOauthOnly) {
          // Track failed attempts only for accounts that actually have a
          // password to guess. OAuth-only accounts (`isOauthOnly`) are
          // skipped so an attacker can't lock them out by spamming the
          // credentials form with a known email.
          if (user && !isOauthOnly) {
            await db.$executeRaw`UPDATE users SET "failedLoginAttempts" = "failedLoginAttempts" + 1 WHERE id = ${user.id}`;

            // Re-read to get the new count
            const freshUser = await db.user.findUnique({
              where: { id: user.id },
              select: { failedLoginAttempts: true },
            });

            if (freshUser && freshUser.failedLoginAttempts >= MAX_FAILED_ATTEMPTS) {
              const now = new Date();
              await db.user.update({
                where: { id: user.id },
                data: { lockedAt: now },
              });
              const unlockAt = new Date(now.getTime() + LOCKOUT_DURATION_MS);
              throw new Error(`ACCOUNT_LOCKED:${unlockAt.toISOString()}`);
            }
          }
          return null;
        }

        // Block banned users from logging in
        if (user.banned) {
          throw new Error(
            user.banReason ? `Account banned: ${user.banReason}` : 'Your account has been banned.'
          );
        }

        // Successful login — reset failed attempt counter
        if (user.failedLoginAttempts > 0) {
          await db.user.update({
            where: { id: user.id },
            data: { failedLoginAttempts: 0, lockedAt: null },
          });
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          username: user.username,
          avatarUrl: user.avatarUrl ?? undefined,
          onboardingComplete: user.onboardingComplete,
          role: user.role,
          tier: user.tier,
          scholarName: user.scholarName ?? undefined,
          nameStyle: (user.nameStyle as { fontId?: string; colorId?: string } | null) ?? undefined,
          equippedTitleId: user.equippedTitleId ?? undefined,
          equippedFrameId: user.equippedFrameId ?? undefined,
          equippedBackgroundId: user.equippedBackgroundId ?? undefined,
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
      if (provider !== 'google' && provider !== 'apple') return false;

      // Both providers set email_verified on the profile (Apple only ever
      // returns verified emails; Google sends a real boolean/string claim).
      // Require it before we trust the email for lookup or linking.
      const p = (profile ?? {}) as Profile & {
        email_verified?: boolean | string;
        picture?: string;
      };
      const emailVerified = p.email_verified === true || p.email_verified === 'true';
      if (!emailVerified) return false;

      const email = (user.email ?? p.email ?? '').toLowerCase();
      if (!email) return false;

      const providerAccountId = account.providerAccountId;
      if (!providerAccountId) return false;

      // headers() can throw outside a request context — fail open and
      // skip the IP cap. Provider email verification is our fallback.
      let ip = 'unknown';
      try {
        const h = headers();
        ip = getIpFromHeaders(h as unknown as Headers);
      } catch {
        // ignore
      }

      const resolution = await findOrCreateOAuthUser({
        provider,
        providerAccountId,
        email,
        name: (user.name ?? p.name ?? null) as string | null,
        avatarUrl: (user.image ?? p.picture ?? null) as string | null,
        ip,
      });

      if (!resolution.ok) {
        // Surface OAuthAccountExists as a redirect to the error page on the
        // login surface; banned/ip_cap stay opaque (return false).
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
          role?: string;
          tier?: string;
          scholarName?: string;
          nameStyle?: { fontId?: string; colorId?: string };
          equippedTitleId?: string;
          equippedFrameId?: string;
          equippedBackgroundId?: string;
        };
        token.id = user.id;
        token.username = u.username;
        token.avatarUrl = u.avatarUrl;
        token.onboardingComplete = u.onboardingComplete;
        token.role = u.role;
        token.tier = u.tier;
        token.scholarName = u.scholarName;
        token.nameStyle = u.nameStyle;
        token.equippedTitleId = u.equippedTitleId;
        token.equippedFrameId = u.equippedFrameId;
        token.equippedBackgroundId = u.equippedBackgroundId;
      }

      // OAuth sign-in: user.id was set by the signIn callback (either
      // to an existing/linked userId or to the newly-created cuid). Hydrate
      // the token from DB using the same shape as authorize().
      if (isOauthSignIn && user?.id) {
        token.id = user.id;
        await hydrateTokenFromDb(token, user.id);
      }

      // Re-read from DB when session is explicitly updated (e.g. after
      // onboarding or after the user equips a new cosmetic).
      if (trigger === 'update' && token.id) {
        await hydrateTokenFromDb(token, token.id as string);
      }
      return token;
    },
    async session({ session, token }) {
      if (token) {
        session.user.id = token.id as string;
        session.user.username = token.username as string;
        session.user.avatarUrl = token.avatarUrl as string | undefined;
        session.user.onboardingComplete = token.onboardingComplete as boolean;
        session.user.role = (token.role as string) ?? 'user';
        session.user.tier = (token.tier as string) ?? 'FREE';
        session.user.scholarName = token.scholarName as string | undefined;
        session.user.nameStyle = token.nameStyle;
        session.user.equippedTitleId = token.equippedTitleId;
        session.user.equippedFrameId = token.equippedFrameId;
        session.user.equippedBackgroundId = token.equippedBackgroundId;
      }
      return session;
    },
  },
};
