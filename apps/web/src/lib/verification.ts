import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { db } from '@/lib/db';

// Email-confirmation codes for the credentials-signup hard block. Codes are
// 6 numeric digits, stored bcrypt-hashed. Because a 6-digit space is only 1M
// wide, brute force is held off by three things, not the hash alone:
//   1. MAX_ATTEMPTS wrong guesses kills the code (forces a resend),
//   2. a 15-minute expiry, and
//   3. IP/email rate limiting on the verify + resend endpoints.

export const CODE_TTL_MS = 15 * 60 * 1000; // 15 minutes
export const CODE_TTL_MINUTES = 15;
export const MAX_ATTEMPTS = 5;
const BCRYPT_ROUNDS = 10;

export type VerifyCodeResult =
  | { ok: true }
  | { ok: false; reason: 'no_code' | 'expired' | 'too_many_attempts' | 'invalid' };

function generateCode(): string {
  // randomInt is uniform over [0, 1_000_000); pad so "42" → "000042".
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Mint a fresh 6-digit code for `userId` and return the plaintext (so the
 * caller can email it — only the hash is persisted). Any prior code for the
 * user is deleted first, so there is exactly one active code at a time and
 * the attempt counter resets on every resend.
 */
export async function issueEmailVerificationCode(userId: string): Promise<string> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await db.$transaction([
    db.emailVerificationCode.deleteMany({ where: { userId } }),
    db.emailVerificationCode.create({ data: { userId, codeHash, expiresAt } }),
  ]);

  return code;
}

/**
 * Check a submitted code for `userId`. On success the user's `emailVerified`
 * is stamped and all code rows are cleared (single-use). Failures are
 * granular for server-side logging, but callers should surface a single
 * generic message to avoid leaking which step failed.
 */
export async function verifyEmailCode(userId: string, code: string): Promise<VerifyCodeResult> {
  const row = await db.emailVerificationCode.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  if (!row) return { ok: false, reason: 'no_code' };

  if (row.expiresAt.getTime() < Date.now()) {
    await db.emailVerificationCode.deleteMany({ where: { userId } });
    return { ok: false, reason: 'expired' };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    // Spent — make the user request a new code rather than keep guessing.
    await db.emailVerificationCode.deleteMany({ where: { userId } });
    return { ok: false, reason: 'too_many_attempts' };
  }

  const match = await bcrypt.compare(code, row.codeHash);
  if (!match) {
    await db.emailVerificationCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: 'invalid' };
  }

  // Success — verify the account and burn every outstanding code.
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { emailVerified: new Date() } }),
    db.emailVerificationCode.deleteMany({ where: { userId } }),
  ]);

  return { ok: true };
}
