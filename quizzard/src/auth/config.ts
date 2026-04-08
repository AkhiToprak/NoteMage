import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 60 * 60 * 1000; // 1 hour

export const authOptions: NextAuthOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  },
  pages: {
    signIn: '/auth/login',
  },
  providers: [
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
        const passwordMatch = await bcrypt.compare(
          credentials.password,
          user?.password ?? '$2a$12$invalidhashplaceholdervalue1234'
        );

        if (!user || !passwordMatch) {
          // Track failed attempts for existing users only
          if (user) {
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
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      if (user) {
        const u = user as typeof user & {
          username?: string;
          avatarUrl?: string;
          onboardingComplete?: boolean;
          role?: string;
          tier?: string;
          scholarName?: string;
        };
        token.id = user.id;
        token.username = u.username;
        token.avatarUrl = u.avatarUrl;
        token.onboardingComplete = u.onboardingComplete;
        token.role = u.role;
        token.tier = u.tier;
        token.scholarName = u.scholarName;
      }
      // Re-read from DB when session is explicitly updated (e.g. after onboarding)
      if (trigger === 'update' && token.id) {
        const freshUser = await db.user.findUnique({
          where: { id: token.id as string },
          select: {
            onboardingComplete: true,
            username: true,
            avatarUrl: true,
            role: true,
            tier: true,
            scholarName: true,
          },
        });
        if (freshUser) {
          token.onboardingComplete = freshUser.onboardingComplete;
          token.username = freshUser.username;
          token.avatarUrl = freshUser.avatarUrl ?? undefined;
          token.role = freshUser.role;
          token.tier = freshUser.tier;
          token.scholarName = freshUser.scholarName ?? undefined;
        }
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
      }
      return session;
    },
  },
};
