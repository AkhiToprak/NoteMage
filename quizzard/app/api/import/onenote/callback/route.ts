import { NextRequest, NextResponse } from 'next/server';
import { acquireTokenByCode } from '@/lib/microsoftAuth';
import { db } from '@/lib/db';

/**
 * GET – OAuth callback from Microsoft. Exchanges code for tokens and stores them.
 * Returns an HTML page that notifies the opener window and closes itself.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');
  const errorDescription = searchParams.get('error_description');

  // Handle error from Microsoft (e.g., user denied consent)
  if (error) {
    const message = errorDescription || error;
    return new NextResponse(
      buildCallbackHtml('error', message),
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  }

  if (!code || !state) {
    return new NextResponse(
      buildCallbackHtml('error', 'Missing authorization code or state parameter.'),
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  }

  try {
    const result = await acquireTokenByCode(code, state);

    // Upsert the Microsoft connection
    await db.microsoftConnection.upsert({
      where: { userId: result.userId },
      create: {
        userId: result.userId,
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
        scope: result.scope,
      },
      update: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresAt: result.expiresAt,
        scope: result.scope,
      },
    });

    return new NextResponse(
      buildCallbackHtml('success', 'Connected successfully!'),
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  } catch (err) {
    console.error('[OneNote Callback] Error:', err);
    const message = err instanceof Error ? err.message : 'Authentication failed.';
    return new NextResponse(
      buildCallbackHtml('error', message),
      { status: 200, headers: { 'Content-Type': 'text/html' } }
    );
  }
}

function buildCallbackHtml(type: 'success' | 'error', message: string): string {
  return `<!DOCTYPE html>
<html>
<head><title>OneNote Connection</title></head>
<body style="font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0d0c20; color: #ede9ff;">
  <div style="text-align: center;">
    <p>${type === 'success' ? '&#10003;' : '&#10007;'} ${escapeHtml(message)}</p>
    <p style="color: rgba(196,169,255,0.5); font-size: 14px;">This window will close automatically.</p>
  </div>
  <script>
    if (window.opener) {
      window.opener.postMessage({ type: 'onenote-auth-${type}', message: ${JSON.stringify(message)} }, window.location.origin);
    }
    setTimeout(() => window.close(), 1500);
  </script>
</body>
</html>`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
