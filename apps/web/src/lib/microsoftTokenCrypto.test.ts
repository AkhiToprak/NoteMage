import { describe, it, expect, afterEach } from 'vitest';
import crypto from 'crypto';
import { encryptToken, decryptToken, TokenCryptoError } from './microsoftTokenCrypto';

const ORIGINAL_KEY = process.env.MS_TOKEN_ENCRYPTION_KEY;

function withKey(): void {
  process.env.MS_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
}

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.MS_TOKEN_ENCRYPTION_KEY;
  else process.env.MS_TOKEN_ENCRYPTION_KEY = ORIGINAL_KEY;
});

describe('microsoftTokenCrypto', () => {
  it('round-trips a token back to the original plaintext', () => {
    withKey();
    const token = 'EwAoA8l6BAAU.fake-microsoft-access-token.value-1234567890';
    expect(decryptToken(encryptToken(token))).toBe(token);
  });

  it('round-trips an empty string', () => {
    withKey();
    expect(decryptToken(encryptToken(''))).toBe('');
  });

  it('never embeds the plaintext in the stored ciphertext', () => {
    withKey();
    const token = 'super-secret-refresh-token-value';
    const stored = encryptToken(token);
    expect(stored).not.toContain(token);
    expect(Buffer.from(stored, 'base64').toString('utf8')).not.toContain(token);
  });

  it('uses a fresh IV per call — same input yields different ciphertext', () => {
    withKey();
    expect(encryptToken('same-input')).not.toBe(encryptToken('same-input'));
  });

  it('rejects legacy plaintext as a TokenCryptoError (the reconnect signal)', () => {
    withKey();
    // A real plaintext MS refresh token is long; base64-decoding it yields a
    // payload whose GCM auth tag will not validate.
    const legacy = 'M.R3_BAY.' + 'A'.repeat(400);
    expect(() => decryptToken(legacy)).toThrow(TokenCryptoError);
  });

  it('rejects a tampered ciphertext as a TokenCryptoError', () => {
    withKey();
    const buf = Buffer.from(encryptToken('token'), 'base64');
    buf[buf.length - 1] ^= 0xff; // flip a ciphertext byte
    expect(() => decryptToken(buf.toString('base64'))).toThrow(TokenCryptoError);
  });

  it('rejects a too-short payload as a TokenCryptoError', () => {
    withKey();
    expect(() => decryptToken(Buffer.from('short').toString('base64'))).toThrow(TokenCryptoError);
  });

  it('does NOT cross-decrypt under a different key (key is load-bearing)', () => {
    withKey();
    const stored = encryptToken('token');
    process.env.MS_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('base64');
    expect(() => decryptToken(stored)).toThrow(TokenCryptoError);
  });

  it('throws a clear config error (NOT TokenCryptoError) when the key is missing', () => {
    delete process.env.MS_TOKEN_ENCRYPTION_KEY;
    expect(() => encryptToken('x')).toThrow(/MS_TOKEN_ENCRYPTION_KEY/);
    expect(() => encryptToken('x')).not.toThrow(TokenCryptoError);
  });

  it('rejects a key that does not decode to 32 bytes', () => {
    process.env.MS_TOKEN_ENCRYPTION_KEY = Buffer.from('too-short-key').toString('base64');
    expect(() => encryptToken('x')).toThrow(/32 bytes/);
  });

  it('accepts a hex-encoded 32-byte key', () => {
    process.env.MS_TOKEN_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
    expect(decryptToken(encryptToken('hex-keyed'))).toBe('hex-keyed');
  });
});
