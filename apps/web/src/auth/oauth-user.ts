// Find-or-link-or-create flow for OAuth sign-ins. Shared by:
//   - The NextAuth `signIn` callback in `auth/config.ts` (web redirect flow,
//     Google + Apple).
//   - The native Sign in with Apple endpoint at
//     `app/api/auth/native/apple/route.ts` (iOS WebView shell), which
//     receives an Apple identity token directly instead of going through
//     NextAuth's redirect handshake.
//
// Both callers must verify that the email is verified before invoking this
// helper. We don't re-check that here because the verification mechanism
// differs (Google/Apple JWT claim vs. Apple JWKS verify on the server).

import { db } from '@/lib/db';
import { enforceIpCap, generatePlaceholderUsername, hashIp } from '@/lib/registration';

export type OAuthProvider = 'google' | 'apple';

export type OAuthUserResolution =
  | { ok: true; userId: string }
  | { ok: false; reason: 'banned' | 'account_exists' | 'ip_cap' | 'signup_disabled' };

export interface OAuthUserInput {
  provider: OAuthProvider;
  providerAccountId: string;
  email: string; // already lowercased and verified by the caller
  name: string | null;
  avatarUrl: string | null;
  ip: string; // 'unknown' if the caller can't determine it
  // Pre-launch gate: when false, brand-new account creation is blocked
  // (existing OAuth links and email-based silent links still work).
  allowNewUser: boolean;
}

export async function findOrCreateOAuthUser(input: OAuthUserInput): Promise<OAuthUserResolution> {
  const { provider, providerAccountId, email, name, avatarUrl, ip, allowNewUser } = input;

  // 1. Already linked? Just log in.
  const existingLink = await db.oAuthAccount.findUnique({
    where: { provider_providerAccountId: { provider, providerAccountId } },
    select: { userId: true },
  });
  if (existingLink) {
    return { ok: true, userId: existingLink.userId };
  }

  // 2. Email collision? Safe-link or block.
  const existingByEmail = await db.user.findUnique({
    where: { email },
    select: { id: true, password: true, onboardingComplete: true, banned: true },
  });

  if (existingByEmail) {
    if (existingByEmail.banned) {
      return { ok: false, reason: 'banned' };
    }
    // Safe to silently link only if the existing account either:
    //   (a) has no password set (already an OAuth account), OR
    //   (b) never finished onboarding (no real profile data to hijack).
    // Otherwise we block — the real owner must log in with their password
    // and explicitly link OAuth from settings.
    const safeToLink =
      existingByEmail.password === null || existingByEmail.onboardingComplete === false;
    if (!safeToLink) {
      return { ok: false, reason: 'account_exists' };
    }
    await db.oAuthAccount.create({
      data: { userId: existingByEmail.id, provider, providerAccountId },
    });
    return { ok: true, userId: existingByEmail.id };
  }

  // 3. New user — pre-launch gate, IP cap, then create User + OAuthAccount.
  if (!allowNewUser) {
    return { ok: false, reason: 'signup_disabled' };
  }
  const cap = await enforceIpCap(ip);
  if (!cap.ok) {
    return { ok: false, reason: 'ip_cap' };
  }

  const placeholderUsername = generatePlaceholderUsername();
  const created = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email,
        name,
        avatarUrl,
        password: null,
        username: placeholderUsername,
        onboardingComplete: false,
        // OAuth providers (Google/Apple) only hand us verified emails, so the
        // account is confirmed at creation — it must never hit the credentials
        // email-confirmation gate.
        emailVerified: new Date(),
      },
    });
    await tx.oAuthAccount.create({
      data: { userId: user.id, provider, providerAccountId },
    });
    if (ip && ip !== 'unknown') {
      // Store a salted HMAC, never the raw address (column name is legacy).
      await tx.ipRegistration.create({ data: { ip: hashIp(ip) } });
    }
    return user;
  });

  return { ok: true, userId: created.id };
}
