import { randomInt } from 'crypto';
import bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
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

type LockedCodeRow = {
  id: string;
  codeHash: string;
  attempts: number;
  expiresAt: Date;
};

function generateCode(): string {
  // randomInt is uniform over [0, 1_000_000); pad so "42" → "000042".
  return randomInt(0, 1_000_000).toString().padStart(6, '0');
}

/**
 * Mint a fresh 6-digit code for `userId` and return the plaintext (so the
 * caller can email it — only the hash is persisted). Upsert replaces any
 * prior code so one active row remains and attempts reset on every resend.
 */
export async function issueEmailVerificationCode(userId: string): Promise<string> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await db.emailVerificationCode.upsert({
    where: { userId },
    update: { codeHash, expiresAt, attempts: 0, createdAt: new Date() },
    create: { userId, codeHash, expiresAt },
  });

  return code;
}

/**
 * Check a submitted code for `userId`. On success the user's `emailVerified`
 * is stamped and all code rows are cleared (single-use). Failures are
 * granular for server-side logging, but callers should surface a single
 * generic message to avoid leaking which step failed.
 */
export async function verifyEmailCode(userId: string, code: string): Promise<VerifyCodeResult> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<LockedCodeRow[]>(Prisma.sql`
      SELECT "id", "codeHash", "attempts", "expiresAt"
      FROM "email_verification_codes"
      WHERE "userId" = ${userId}
      FOR UPDATE
    `);
    const row = rows[0];
    if (!row) return { ok: false, reason: 'no_code' };

    if (row.expiresAt.getTime() < Date.now()) {
      await tx.emailVerificationCode.delete({ where: { id: row.id } });
      return { ok: false, reason: 'expired' };
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      await tx.emailVerificationCode.delete({ where: { id: row.id } });
      return { ok: false, reason: 'too_many_attempts' };
    }

    const match = await bcrypt.compare(code, row.codeHash);
    if (!match) {
      if (row.attempts + 1 >= MAX_ATTEMPTS) {
        await tx.emailVerificationCode.delete({ where: { id: row.id } });
        return { ok: false, reason: 'too_many_attempts' };
      }
      await tx.emailVerificationCode.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      return { ok: false, reason: 'invalid' };
    }

    await tx.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
    await tx.emailVerificationCode.delete({ where: { id: row.id } });
    return { ok: true };
  });
}

// ── Password reset ─────────────────────────────────────────────────────────
// Same 6-digit code mechanics as the email-confirmation flow above, but stored
// in a separate table so the two never collide. The brute-force defenses are
// identical: MAX_ATTEMPTS wrong guesses kills the code, a 15-minute expiry, and
// IP/email rate limiting on the forgot/reset endpoints.

/**
 * Mint a fresh 6-digit password-reset code for `userId` and return the
 * plaintext (so the caller can email it — only the hash is persisted). Upsert
 * replaces any prior code and resets attempts on every request.
 */
export async function issuePasswordResetCode(userId: string): Promise<string> {
  const code = generateCode();
  const codeHash = await bcrypt.hash(code, BCRYPT_ROUNDS);
  const expiresAt = new Date(Date.now() + CODE_TTL_MS);

  await db.passwordResetCode.upsert({
    where: { userId },
    update: { codeHash, expiresAt, attempts: 0, createdAt: new Date() },
    create: { userId, codeHash, expiresAt },
  });

  return code;
}

/**
 * Consume a reset code and change the password in one row-locking transaction.
 * `hashedPassword` is computed by the caller before the transaction begins.
 */
export async function resetPasswordWithCode(
  userId: string,
  code: string,
  hashedPassword: string,
  currentEmailVerified: Date | null
): Promise<VerifyCodeResult> {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<LockedCodeRow[]>(Prisma.sql`
      SELECT "id", "codeHash", "attempts", "expiresAt"
      FROM "password_reset_codes"
      WHERE "userId" = ${userId}
      FOR UPDATE
    `);
    const row = rows[0];
    if (!row) return { ok: false, reason: 'no_code' };

    if (row.expiresAt.getTime() < Date.now()) {
      await tx.passwordResetCode.delete({ where: { id: row.id } });
      return { ok: false, reason: 'expired' };
    }

    if (row.attempts >= MAX_ATTEMPTS) {
      await tx.passwordResetCode.delete({ where: { id: row.id } });
      return { ok: false, reason: 'too_many_attempts' };
    }

    const match = await bcrypt.compare(code, row.codeHash);
    if (!match) {
      if (row.attempts + 1 >= MAX_ATTEMPTS) {
        await tx.passwordResetCode.delete({ where: { id: row.id } });
        return { ok: false, reason: 'too_many_attempts' };
      }
      await tx.passwordResetCode.update({
        where: { id: row.id },
        data: { attempts: { increment: 1 } },
      });
      return { ok: false, reason: 'invalid' };
    }

    await tx.user.update({
      where: { id: userId },
      data: {
        password: hashedPassword,
        authVersion: { increment: 1 },
        failedLoginAttempts: 0,
        lockedAt: null,
        emailVerified: currentEmailVerified ?? new Date(),
      },
    });
    await tx.passwordResetCode.delete({ where: { id: row.id } });
    return { ok: true };
  });
}
