import * as msal from '@azure/msal-node';
import crypto from 'crypto';
import { db } from '@/lib/db';

// ── MSAL Configuration ──

const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID || '';
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET || '';
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID || 'common';
const NEXTAUTH_URL = process.env.NEXTAUTH_URL || 'http://localhost:3001';
const NEXTAUTH_SECRET = process.env.NEXTAUTH_SECRET || '';

const REDIRECT_URI = `${NEXTAUTH_URL}/api/import/onenote/callback`;
const SCOPES = ['Notes.Read', 'Notes.Read.All', 'User.Read', 'offline_access'];

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
): Promise<{ userId: string; accessToken: string; refreshToken: string; expiresAt: Date; scope: string }> {
  const userId = verifyState(state);
  if (!userId) {
    throw new Error('Invalid or expired state parameter');
  }

  const result = await getMsalClient().acquireTokenByCode({
    code,
    scopes: SCOPES,
    redirectUri: REDIRECT_URI,
  });

  if (!result) {
    throw new Error('Failed to acquire token');
  }

  // MSAL caches tokens internally; extract what we need
  const expiresAt = result.expiresOn ? new Date(result.expiresOn) : new Date(Date.now() + 3600 * 1000);

  // Get the refresh token from the MSAL cache
  const tokenCache = getMsalClient().getTokenCache().serialize();
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

  // If token is still valid (with 5-minute buffer), return it
  if (connection.expiresAt > new Date(Date.now() + 5 * 60 * 1000)) {
    return connection.accessToken;
  }

  // Refresh the token
  if (!connection.refreshToken) {
    throw new Error('No refresh token available. Please reconnect your Microsoft account.');
  }

  try {
    const result = await getMsalClient().acquireTokenByRefreshToken({
      refreshToken: connection.refreshToken,
      scopes: SCOPES,
    });

    if (!result) {
      throw new Error('Token refresh failed');
    }

    const expiresAt = result.expiresOn ? new Date(result.expiresOn) : new Date(Date.now() + 3600 * 1000);

    // Check for updated refresh token in cache
    const tokenCache = getMsalClient().getTokenCache().serialize();
    const cacheData = JSON.parse(tokenCache);
    const refreshTokens = cacheData.RefreshToken || {};
    const refreshTokenEntry = Object.values(refreshTokens)[0] as { secret?: string } | undefined;
    const newRefreshToken = refreshTokenEntry?.secret || connection.refreshToken;

    await db.microsoftConnection.update({
      where: { userId },
      data: {
        accessToken: result.accessToken,
        refreshToken: newRefreshToken,
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
  await db.microsoftConnection.deleteMany({ where: { userId } });
}
