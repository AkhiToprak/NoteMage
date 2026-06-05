import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { getAuthUserId } from '@/lib/auth';
import { db } from '@/lib/db';
import {
  successResponse,
  badRequestResponse,
  unauthorizedResponse,
  internalErrorResponse,
} from '@/lib/api-response';
import { rateLimit, getClientIp } from '@/lib/rate-limit';

// Change the signed-in user's password. Verifies the current password against
// the stored bcrypt hash before writing a new one. OAuth-only accounts (no
// stored password) are rejected with a clear message rather than silently
// failing — the settings UI must never claim a change it didn't make.
export async function PUT(request: NextRequest) {
  try {
    const userId = await getAuthUserId(request);
    if (!userId) return unauthorizedResponse();

    // Security-critical: fail closed so a cache outage can't lift the cap.
    const ip = getClientIp(request);
    const rl = await rateLimit(`password-change:${userId}:${ip}`, 5, 60 * 60 * 1000, true);
    if (!rl.success) {
      return NextResponse.json(
        { success: false, error: 'Too many attempts. Please try again later.' },
        { status: 429 }
      );
    }

    const body = await request.json().catch(() => null);
    const currentPassword = body?.currentPassword;
    const newPassword = body?.newPassword;

    if (typeof currentPassword !== 'string' || typeof newPassword !== 'string') {
      return badRequestResponse('Current and new passwords are required');
    }
    if (newPassword.length < 8 || newPassword.length > 128) {
      return badRequestResponse('Password must be 8 to 128 characters');
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { password: true },
    });
    if (!user) return unauthorizedResponse();

    // OAuth-only accounts have no local password to verify or replace.
    if (!user.password) {
      return badRequestResponse(
        'Your account signs in with Google, so there is no password to change.'
      );
    }

    const matches = await bcrypt.compare(currentPassword, user.password);
    if (!matches) {
      return badRequestResponse('Current password is incorrect');
    }
    if (await bcrypt.compare(newPassword, user.password)) {
      return badRequestResponse('New password must be different from the current one');
    }

    const hashed = await bcrypt.hash(newPassword, 12);
    await db.user.update({ where: { id: userId }, data: { password: hashed } });

    return successResponse({ updated: true }, 'Password updated');
  } catch {
    return internalErrorResponse('Failed to update password');
  }
}
