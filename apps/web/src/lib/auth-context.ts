import type { JWT } from 'next-auth/jwt';
import { db } from '@/lib/db';
import { logSecurityEvent } from '@/lib/security-events';

export interface AuthenticatedContext {
  userId: string;
  role: string;
  tier: string;
  scholarName: string | null;
}

function validAuthVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 1;
}

/**
 * Validate a decoded NextAuth JWT against the current user row.
 *
 * The JWT proves cookie integrity; this lookup proves that the account still
 * exists, is allowed to sign in, and belongs to the current auth generation.
 * Role and tier always come from the database so authorization never trusts a
 * stale client session claim.
 */
export async function validateAuthToken(token: JWT | null): Promise<AuthenticatedContext | null> {
  const userId = typeof token?.id === 'string' && token.id.length > 0 ? token.id : null;
  if (!userId) {
    if (token)
      logSecurityEvent({ type: 'session.rejected', detail: { reason: 'missing_user_id' } });
    return null;
  }

  const authVersion = token?.authVersion;
  if (!validAuthVersion(authVersion)) {
    logSecurityEvent({
      userId,
      type: 'session.rejected',
      detail: { reason: 'invalid_auth_version_claim' },
    });
    return null;
  }

  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      tier: true,
      scholarName: true,
      banned: true,
      authVersion: true,
    },
  });

  if (!user) {
    logSecurityEvent({ userId, type: 'session.rejected', detail: { reason: 'user_not_found' } });
    return null;
  }

  if (user.banned) {
    logSecurityEvent({ userId, type: 'session.banned' });
    return null;
  }

  if (user.authVersion !== authVersion) {
    logSecurityEvent({ userId, type: 'session.version_mismatch' });
    return null;
  }

  return {
    userId: user.id,
    role: user.role,
    tier: user.tier,
    scholarName: user.scholarName,
  };
}
