import * as msal from '@azure/msal-node';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { encryptToken, decryptToken, TokenCryptoError } from '@/lib/microsoftTokenCrypto';

// ── MSAL Configuration ──

const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID || '';
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || '';
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID || 'common';
const NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'http://localhost:3001';
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || '';

const REDIRECT_URI = `${NEXTAUTH_URL}/api/import/onenote/callback`;
// Least-privilege scopes. The flow only ever reads the signed-in user's own
// OneNote (the `/me/onenote/...` endpoints), which `Notes.Read` covers — so the
// broad `Notes.Read.All` (every notebook the user can access, incl. shared/org
// notebooks) was dropped. `User.Read` = basic account identity for display;
// `offline_access` = refresh tokens for silent renewal.
const SCOPES = ['Notes.Read', 'User.Read', 'offline_access'];

const msalConfig: msal.Configuration = {
  auth: {
    clientId: AZURE_CLIENT_ID,
    authority: `https://login.microsoftonline.com/${AZURE_TENANT_ID}`,
    clientSecret: AZURE_CLIENT_SECRET,
  },
};

let _msalClient: msal.ConfidentialClientApplication | null = null;
function getMsalClient() {
  if (!AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
    throw new Error('Microsoft Azure credentials are not configured');
  }
  if (!_msalClient) {
    _msalClient = new msal.ConfidentialClientApplication(msalConfig);
  }
  return _msalClient;
}

/**
 * A client with an isolated, empty in-memory token cache. Use this for token
 * ACQUISITION so the cache only ever holds the tokens from THIS request. The
 * shared singleton's cache, in a warm serverless instance, can accumulate
 * multiple users' refresh tokens — and `Object.values(cache.RefreshToken)[0]`
 * would then pick an arbitrary (possibly another user's) token, cross-wiring
 * accounts. We persist tokens in our own DB, so we don't need MSAL's cache to
 * survive across requests.
 */
function freshMsalClient(): msal.ConfidentialClientApplication {
  if (!AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
    throw new Error('Microsoft Azure credentials are not configured');
  }
  return new msal.ConfidentialClientApplication(msalConfig);
}

// ── State parameter signing (CSRF prevention) ──

function signState(userId: string): string {
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = JSON.stringify({ userId, nonce, ts: Date.now() });
  const hmac = crypto.createHmac('sha256', NEXTAUTH_SECRET).update(payload).digest('hex');
  const encoded = Buffer.from(payload).toString('base64url');
  return `${encoded}.${hmac}`;
}

function verifyState(state: string): string | null {
  const [encoded, hmac] = state.split('.');
  if (!encoded || !hmac) return null;

  const payload = Buffer.from(encoded, 'base64url').toString('utf-8');
  const expectedHmac = crypto.createHmac('sha256', NEXTAUTH_SECRET).update(payload).digest('hex');

  if (!crypto.timingSafeEqual(Buffer.from(hmac), Buffer.from(expectedHmac))) {
    return null;
  }

  try {
    const parsed = JSON.parse(payload);
    // Reject states older than 10 minutes
    if (Date.now() - parsed.ts > 10 * 60 * 1000) return null;
    return parsed.userId;
  } catch {
    return null;
  }
}

// ── Exported functions ──

/**
 * Generate the Microsoft OAuth authorization URL.
 */
export async function getAuthCodeUrl(userId: string): Promise<string> {
  const state = signState(userId);
  const url = await getMsalClient().getAuthCodeUrl({
    scopes: SCOPES,
    redirectUri: REDIRECT_URI,
    state,
    prompt: 'consent',
  });
  return url;
}

/**
 * Exchange an authorization code for tokens and return the userId from state.
 */
export async function acquireTokenByCode(
  code: string,
  state: string
): Promise<{
  userId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope: string;
}> {
  const userId = verifyState(state);
  if (!userId) {
    throw new Error('Invalid or expired state parameter');
  }

  // Isolated cache: this client only holds the tokens from this exchange, so
  // the RefreshToken read below can't pick up another concurrent user's token.
  const client = freshMsalClient();
  const result = await client.acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri: REDIRECT_URI,
  });

  if (!result) {
    throw new Error('Failed to acquire token');
  }

  // MSAL caches tokens internally; extract what we need
  const expiresAt = result.expiresOn
    ? new Date(result.expiresOn)
    : new Date(Date.now() + 3600 * 1000);

  // Get the refresh token from this client's isolated cache
  const tokenCache = client.getTokenCache().serialize();
  const cacheData = JSON.parse(tokenCache);
  const refreshTokens = cacheData.RefreshToken || {};
  const refreshTokenEntry = Object.values(refreshTokens)[0] as { secret?: string } | undefined;
  const refreshToken = refreshTokenEntry?.secret || '';

  return {
    userId,
    accessToken: result.accessToken,
    refreshToken,
    expiresAt,
    scope: result.scopes.join(' '),
  };
}

/**
 * Get a valid access token for the user, refreshing if expired.
 */
export async function getValidAccessToken(userId: string): Promise<string> {
  const connection = await db.microsoftConnection.findUnique({ where: { userId } });
  if (!connection) {
    throw new Error('No Microsoft connection found. Please connect your account first.');
  }

  // Tokens are stored encrypted at rest — decrypt before use. A TokenCryptoError
  // means the row is corrupt or legacy plaintext: drop it and ask the user to
  // reconnect, exactly like an expired session. A non-crypto error (e.g. a
  // missing MS_TOKEN_ENCRYPTION_KEY) is an operator misconfig — let it surface
  // rather than silently destroying the connection.
  let accessToken: string;
  let refreshToken: string;
  try {
    accessToken = decryptToken(connection.accessToken);
    refreshToken = connection.refreshToken ? decryptToken(connection.refreshToken) : '';
  } catch (err) {
    if (err instanceof TokenCryptoError) {
      await db.microsoftConnection.delete({ where: { userId } }).catch(() => {});
      throw new Error('Microsoft session expired. Please reconnect your account.');
    }
    throw err;
  }

  // If token is still valid (with 5-minute buffer), return it
  if (connection.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return accessToken;
  }

  // Refresh the token
  if (!refreshToken) {
    throw new Error('No refresh token available. Please reconnect your Microsoft account.');
  }

  try {
    // Isolated cache (see freshMsalClient): prevents reading another user's
    // refresh token out of a shared warm-instance cache. The refresh token
    // passed in is the decrypted plaintext (see decrypt block above), not the
    // at-rest ciphertext stored on `connection`.
    const client = freshMsalClient();
    const result = await client.acquireTokenByRefreshToken({
      refreshToken,
      scopes: SCOPES,
    });

    if (!result) {
      throw new Error('Token refresh failed');
    }

    const expiresAt = result.expiresOn
      ? new Date(result.expiresOn)
      : new Date(Date.now() + 3600 * 1000);

    // Check for updated refresh token in this client's isolated cache
    const tokenCache = client.getTokenCache().serialize();
    const cacheData = JSON.parse(tokenCache);
    const refreshTokens = cacheData.RefreshToken || {};
    const refreshTokenEntry = Object.values(refreshTokens)[0] as { secret?: string } | undefined;
    const newRefreshToken = refreshTokenEntry?.secret || refreshToken;

    await db.microsoftConnection.update({
      where: { userId },
      data: {
        accessToken: encryptToken(result.accessToken),
        refreshToken: encryptToken(newRefreshToken),
        expiresAt,
        scope: result.scopes.join(' '),
      },
    });

    return result.accessToken;
  } catch {
    // If refresh fails, user needs to reconnect
    await db.microsoftConnection.delete({ where: { userId } });
    throw new Error('Microsoft session expired. Please reconnect your account.');
  }
}

/**
 * Check if a user has a Microsoft connection.
 */
export async function isConnected(userId: string): Promise<boolean> {
  const connection = await db.microsoftConnection.findUnique({
    where: { userId },
    select: { id: true },
  });
  return !!connection;
}

/**
 * Remove a user's Microsoft connection.
 */
export async function disconnectMicrosoft(userId: string): Promise<void> {
  await db.microsoftConnection.deleteMany({ where: { userId: { equals: userId } } });
}
