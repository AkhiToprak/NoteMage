// Regression test for POST /api/auth/register: once the user row exists,
// verification-code failures must not surface as a 500. A thrown
// issueEmailVerificationCode (DB blip) or a false sendVerificationCode
// (broken Resend config) still returns 201 requiresVerification:true — the
// verify screen's resend button recovers — and each failure is reported to
// Sentry so a dead email pipeline pages instead of hiding in stdout.
// Strategy: mock every boundary (db, rate-limit, registration caps,
// turnstile, verification libs, Sentry, bcrypt) and drive only the
// post-creation failure paths.

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  dbMock: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    ipRegistration: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  rateLimit: vi.fn(),
  getClientIp: vi.fn(() => '1.2.3.4'),
  enforceIpCap: vi.fn(),
  generatePlaceholderUsername: vi.fn(() => 'mage-placeholder'),
  hashIp: vi.fn(() => 'hashed-ip'),
  normalizeEmail: vi.fn((email: unknown) =>
    typeof email === 'string' ? email.trim().toLowerCase() : ''
  ),
  verifyTurnstile: vi.fn(),
  issueEmailVerificationCode: vi.fn(),
  sendVerificationCode: vi.fn(),
  captureException: vi.fn(),
  captureMessage: vi.fn(),
}));

vi.mock('@/lib/db', () => ({ db: mocks.dbMock }));
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: mocks.rateLimit,
  getClientIp: mocks.getClientIp,
}));
vi.mock('@/lib/registration', () => ({
  enforceIpCap: mocks.enforceIpCap,
  generatePlaceholderUsername: mocks.generatePlaceholderUsername,
  hashIp: mocks.hashIp,
  normalizeEmail: mocks.normalizeEmail,
}));
vi.mock('@/lib/turnstile', () => ({ verifyTurnstile: mocks.verifyTurnstile }));
vi.mock('@/lib/verification', () => ({
  issueEmailVerificationCode: mocks.issueEmailVerificationCode,
}));
vi.mock('@/lib/verification-email', () => ({
  sendVerificationCode: mocks.sendVerificationCode,
}));
vi.mock('@sentry/nextjs', () => ({
  captureException: mocks.captureException,
  captureMessage: mocks.captureMessage,
}));
vi.mock('bcryptjs', () => ({
  default: { hash: vi.fn(async () => 'hashed-password') },
}));

import { POST } from '../../../app/api/auth/register/route';

const USER = { id: 'user-1', email: 'new@example.com' };

function callRegister() {
  return POST(
    new NextRequest('http://localhost/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        email: 'new@example.com',
        password: 'correct-horse-battery',
        birthDate: '2000-01-15',
        turnstileToken: 'token',
      }),
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rateLimit.mockResolvedValue({ success: true });
  mocks.enforceIpCap.mockResolvedValue({ ok: true });
  mocks.verifyTurnstile.mockResolvedValue(true);
  mocks.dbMock.user.findUnique.mockResolvedValue(null);
  mocks.dbMock.$transaction.mockResolvedValue([USER, {}]);
  mocks.issueEmailVerificationCode.mockResolvedValue('123456');
  mocks.sendVerificationCode.mockResolvedValue(true);
});

describe('POST /api/auth/register — post-creation verification failures', () => {
  it('201 requiresVerification:true when issueEmailVerificationCode throws, with Sentry capture', async () => {
    const boom = new Error('db connection lost');
    mocks.issueEmailVerificationCode.mockRejectedValue(boom);

    const res = await callRegister();
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.success).toBe(true);
    expect(json.data).toMatchObject({ id: USER.id, requiresVerification: true });
    expect(mocks.captureException).toHaveBeenCalledWith(boom, expect.anything());
    expect(mocks.sendVerificationCode).not.toHaveBeenCalled();
  });

  it('201 requiresVerification:true when sendVerificationCode returns false, with Sentry message', async () => {
    mocks.sendVerificationCode.mockResolvedValue(false);

    const res = await callRegister();
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toMatchObject({ id: USER.id, requiresVerification: true });
    expect(mocks.captureMessage).toHaveBeenCalledWith(
      expect.stringMatching(/verification email/i),
      expect.objectContaining({ level: 'error' })
    );
    expect(mocks.captureException).not.toHaveBeenCalled();
  });

  it('201 with no Sentry noise on the happy path', async () => {
    const res = await callRegister();
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.data).toMatchObject({ id: USER.id, requiresVerification: true });
    expect(mocks.sendVerificationCode).toHaveBeenCalledWith(USER.email, '123456');
    expect(mocks.captureException).not.toHaveBeenCalled();
    expect(mocks.captureMessage).not.toHaveBeenCalled();
  });
});
