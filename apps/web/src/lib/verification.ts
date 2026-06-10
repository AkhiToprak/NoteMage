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
    db.emailVerificationCode.deleteMany({ where: { userId: { equals: userId } } }),
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
    await db.emailVerificationCode.deleteMany({ where: { userId: { equals: userId } } });
    return { ok: false, reason: 'expired' };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    // Spent — make the user request a new code rather than keep guessing.
    await db.emailVerificationCode.deleteMany({ where: { userId: { equals: userId } } });
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
    db.emailVerificationCode.deleteMany({ where: { userId: { equals: userId } } }),
  ]);

  return { ok: true };
}

// ── Password reset ─────────────────────────────────────────────────────────
// Same 6-digit code mechanics as the email-confirmation flow above, but stored
// in a separate table so the two never collide. The brute-force defenses are
// identical: MAX_ATTEMPTS wrong guesses kills the code, a 15-minute expiry, and
// IP/email rate limiting on the forgot/reset endpoints.

/**
 * Mint a fresh 6-digit password-reset code for `userId` and return the
 * plaintext (so the caller can email it — only the hash is persisted). Any
 * prior reset code for the user is deleted first, so there is exactly one
 * active code at a time and the attempt counter resets on every request.
 */
export async function issuePasswordResetCode(userId: string): Promise<string> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await db.$transaction([
    db.passwordResetCode.deleteMany({ where: { userId: { equals: userId } } }),
    db.passwordResetCode.create({ data: { userId, codeHash, expiresAt } }),
  ]);

  return code;
}

/**
 * Check a submitted password-reset code for `userId`. On success the reset
 * code rows are cleared (single-use) — but, unlike `verifyEmailCode`, this does
 * NOT touch the user row: the reset route owns the password write so the whole
 * change (hash + lockout reset + emailVerified + code burn) lands in one
 * transaction. Failures are granular for server logging; callers must surface a
 * single generic message.
 */
export async function verifyPasswordResetCode(
  userId: string,
  code: string
): Promise<VerifyCodeResult> {
  const row = await db.passwordResetCode.findFirst({
    where: { userId },
    orderBy: { createdAt: 'desc' },
  });

  if (!row) return { ok: false, reason: 'no_code' };

  if (row.expiresAt.getTime() < Date.now()) {
    await db.passwordResetCode.deleteMany({ where: { userId: { equals: userId } } });
    return { ok: false, reason: 'expired' };
  }

  if (row.attempts >= MAX_ATTEMPTS) {
    // Spent — make the user request a new code rather than keep guessing.
    await db.passwordResetCode.deleteMany({ where: { userId: { equals: userId } } });
    return { ok: false, reason: 'too_many_attempts' };
  }

  const match = await bcrypt.compare(code, row.codeHash);
  if (!match) {
    await db.passwordResetCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, reason: 'invalid' };
  }

  return { ok: true };
}
