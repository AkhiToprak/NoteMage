import crypto from 'crypto';

// ── Microsoft OAuth token encryption (at rest) ──
//
// `MicrosoftConnection.accessToken` / `refreshToken` are persisted as base64
// ciphertext, never plaintext. We use AES-256-GCM with a fresh random 12-byte
// IV per encryption; the IV and 16-byte auth tag are stored alongside the
// ciphertext in a single base64 string laid out as:
//
//   base64( iv[12] || authTag[16] || ciphertext[…] )
//
// The key comes from a dedicated `MS_TOKEN_ENCRYPTION_KEY` env var — NOT
// `NEXTAUTH_SECRET`, which signs the OAuth state and must stay separable from
// the data-at-rest key. As with `getMsalClient()`, a missing key throws a
// clear error rather than silently degrading.

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit nonce — the size AES-GCM is specified for
const AUTH_TAG_LENGTH = 16; // 128-bit GCM tag
const KEY_LENGTH = 32; // AES-256

/**
 * Thrown when a stored value cannot be decrypted — malformed payload, a failed
 * auth tag, or legacy plaintext. Kept distinct from a configuration error (such
 * as a missing key) so callers can drop a bad row and prompt a reconnect
 * without masking an operator misconfiguration.
 */
export class TokenCryptoError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TokenCryptoError';
  }
}

/**
 * Decode and validate `MS_TOKEN_ENCRYPTION_KEY` into a 32-byte key. Accepts a
 * hex (64 chars) or base64 (e.g. `openssl rand -base64 32`) encoded value.
 * Throws when the var is unset or does not decode to exactly 32 bytes — this
 * is cheap, so we re-read each call rather than cache (env is fixed at runtime,
 * and re-reading keeps the unit tests free of cache-reset hooks).
 */
function getKey(): Buffer {
  const raw = (process.env.MS_TOKEN_ENCRYPTION_KEY || '').trim();
  if (!raw) {
    throw new Error(
      'MS_TOKEN_ENCRYPTION_KEY is not configured. Set a 32-byte key (e.g. `openssl rand -base64 32`).'
    );
  }
  const key = /^[0-9a-fA-F]{64}$/.test(raw)
    ? Buffer.from(raw, 'hex')
    : Buffer.from(raw, 'base64');
  if (key.length !== KEY_LENGTH) {
    throw new Error(
      `MS_TOKEN_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length}). Generate one with \`openssl rand -base64 32\`.`
    );
  }
  return key;
}

/**
 * Encrypt a Microsoft OAuth token for storage. Returns base64 ciphertext that
 * decryptToken() reverses. A fresh IV is generated per call, so encrypting the
 * same token twice yields different ciphertext.
 */
export function encryptToken(plaintext: string): string {
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
}

/**
 * Decrypt a value produced by encryptToken(). Throws if the payload is
 * malformed, the auth tag fails (tampering), or the value is legacy plaintext
 * — callers treat any throw as "needs reconnect" rather than crashing.
 */
export function decryptToken(encoded: string): string {
  const key = getKey();
  const data = Buffer.from(encoded, 'base64');
  if (data.length < IV_LENGTH + AUTH_TAG_LENGTH) {
    throw new TokenCryptoError('Invalid encrypted token payload');
  }
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  } catch {
    throw new TokenCryptoError('Failed to decrypt token');
  }
}
