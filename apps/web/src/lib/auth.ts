import { getToken } from 'next-auth/jwt';
import type { NextRequest } from 'next/server';

/**
 * Extracts the authenticated user ID from the JWT token in the request.
 * Works reliably across Next.js 15+ (where getServerSession is broken with next-auth v4).
 */
export async function getAuthUserId(request: NextRequest): Promise<string | null> {
  const token = await getToken({ req: request });
  if (!token?.id) return null;
  return token.id as string;
}

/**
 * Checks if the authenticated user has admin role.
 * Returns the user ID if admin, null otherwise.
 */
export async function getAdminUserId(request: NextRequest): Promise<string | null> {
  const token = await getToken({ req: request });
  if (!token?.id || token.role !== 'admin') return null;
  return token.id as string;
}
