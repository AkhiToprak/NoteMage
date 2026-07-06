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
import { logSecurityEvent } from '@/lib/security-events';
import { trialGrant } from '@/lib/entitlement';

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
    select: { userId: true, user: { select: { banned: true } } },
  });
  if (existingLink) {
    if (existingLink.user.banned) {
      logSecurityEvent({
        userId: existingLink.userId,
        type: 'oauth.denied',
        detail: { provider, reason: 'banned' },
      });
      return { ok: false, reason: 'banned' };
    }
    return { ok: true, userId: existingLink.userId };
  }

  // 2. Email collision? Link the provider identity to the existing account.
  //    Our callers only reach this helper after the provider verified email
  //    ownership (Google `email_verified` / Apple JWKS), so whoever is signing
  //    in provably controls this mailbox — and any account registered to it.
  //    That makes silent linking safe: the OAuth user and the existing-account
  //    owner are the same mailbox owner, so there's no takeover to defend
  //    against. We sign them straight into their existing account (keeping any
  //    password they set) instead of forcing a separate password-then-link
  //    detour. The only refusal here is a banned account.
  const existingByEmail = await db.user.findUnique({
    where: { email },
    select: { id: true, banned: true },
  });

  if (existingByEmail) {
    if (existingByEmail.banned) {
      logSecurityEvent({
        userId: existingByEmail.id,
        type: 'oauth.denied',
        detail: { provider, reason: 'banned' },
      });
      return { ok: false, reason: 'banned' };
    }
    await db.oAuthAccount.create({
      data: { userId: existingByEmail.id, provider, providerAccountId },
    });
    logSecurityEvent({
      userId: existingByEmail.id,
      type: 'oauth.linked',
      detail: { provider },
    });
    return { ok: true, userId: existingByEmail.id };
  }

  // 3. New user — pre-launch gate, IP cap, then create User + OAuthAccount.
  if (!allowNewUser) {
    logSecurityEvent({ type: 'oauth.denied', detail: { provider, reason: 'signup_disabled' } });
    return { ok: false, reason: 'signup_disabled' };
  }
  const cap = await enforceIpCap(ip);
  if (!cap.ok) {
    logSecurityEvent({ type: 'oauth.denied', detail: { provider, reason: 'ip_cap' } });
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
        // New accounts start their 7-day free trial (PRO on weekly caps, no card).
        ...trialGrant(),
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

  logSecurityEvent({ userId: created.id, type: 'oauth.created', detail: { provider } });
  return { ok: true, userId: created.id };
}
