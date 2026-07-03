import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';
import { validateAuthToken, type AuthenticatedContext } from '@/lib/auth-context';

/** Resolve the current database-validated authentication context. */
export async function getAuthContext(request: NextRequest): Promise<AuthenticatedContext | null> {
  const token = await getToken({ req: request });
  return validateAuthToken(token);
}

/**
 * Returns the authenticated user ID only after database revocation checks.
 */
export async function getAuthUserId(request: NextRequest): Promise<string | null> {
  return (await getAuthContext(request))?.userId ?? null;
}

/**
 * Checks the current database role after session revocation validation.
 * Returns the user ID if admin, null otherwise.
 */
export async function getAdminUserId(request: NextRequest): Promise<string | null> {
  const auth = await getAuthContext(request);
  return auth?.role === 'admin' ? auth.userId : null;
}
