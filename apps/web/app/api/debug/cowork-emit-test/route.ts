import { NextRequest, NextResponse } from 'next/server';
import { getAuthUserId } from '@/lib/auth';
import { unauthorizedResponse } from '@/lib/api-response';

/**
 * GET /api/debug/cowork-emit-test
 *   ?session=<sessionId>   → broadcasts to `session:<sessionId>`
 *   ?room=<room>           → broadcasts to the literal room name
 * Defaults to `session:debug-test` if neither is passed.
 *
 * Hits the ws-server's `/emit` webhook with a synthetic debug:ping
 * event and returns the complete response (status, text body, timing,
 * env-var check, listener count from the ws-server's perspective).
 *
 * Use it to verify whether a broadcast aimed at a specific session
 * actually reaches anyone. If you pass the session id of a currently-
 * running cowork session and the `listeners` field in the ws-server
 * response is 0, then nobody's socket is actually in that room.
 *
 * Auth: any authenticated user.
 */
export async function GET(request: NextRequest) {
  const userId = await getAuthUserId(request);
  if (!userId) return unauthorizedResponse();

  const sessionIdParam = request.nextUrl.searchParams.get('session');
  const roomParam = request.nextUrl.searchParams.get('room');
  const room = sessionIdParam ? `session:${sessionIdParam}` : roomParam || 'session:debug-test';

  const WS_INTERNAL_URL = process.env.WS_INTERNAL_URL || 'http://localhost:3002';
  const WS_INTERNAL_SECRET = process.env.WS_INTERNAL_SECRET || '';

  const normalizedUrl = WS_INTERNAL_URL.replace(/\/+$/, ''); // strip trailing slashes
  const emitUrl = `${normalizedUrl}/emit`;

  const envCheck = {
    WS_INTERNAL_URL_set: !!process.env.WS_INTERNAL_URL,
    WS_INTERNAL_URL_value: WS_INTERNAL_URL,
    WS_INTERNAL_URL_normalized: normalizedUrl,
    WS_INTERNAL_URL_had_trailing_slash: WS_INTERNAL_URL !== normalizedUrl,
    WS_INTERNAL_SECRET_set: !!WS_INTERNAL_SECRET,
    WS_INTERNAL_SECRET_length: WS_INTERNAL_SECRET.length,
    WS_INTERNAL_SECRET_first4: WS_INTERNAL_SECRET.slice(0, 4),
    NEXT_PUBLIC_WS_URL_set: !!process.env.NEXT_PUBLIC_WS_URL,
    NEXT_PUBLIC_WS_URL_value: process.env.NEXT_PUBLIC_WS_URL || null,
  };

  if (!WS_INTERNAL_SECRET) {
    return NextResponse.json({
      ok: false,
      stage: 'env',
      error:
        'WS_INTERNAL_SECRET is not set on this Vercel environment. The REST→WS broadcast chain cannot work until it is set to the same value as on the ws-server.',
      envCheck,
    });
  }

  const payload = {
    room,
    event: 'debug:ping',
    data: {
      from: 'cowork-emit-test',
      userId,
      ts: new Date().toISOString(),
    },
  };

  const started = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(emitUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ws-internal-secret': WS_INTERNAL_SECRET,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    const elapsed = Date.now() - started;
    const bodyText = await res.text();

    // Parse the listener count out of the ws-server's JSON response
    // so we can report it at the top level without the caller having to
    // parse `bodyText`.
    let listeners: number | null = null;
    try {
      const parsed = JSON.parse(bodyText);
      if (typeof parsed?.listeners === 'number') listeners = parsed.listeners;
    } catch {
      // ignore
    }

    const probingRealSession = !!sessionIdParam;

    return NextResponse.json({
      ok: res.ok,
      stage: 'fetch',
      request: {
        url: emitUrl,
        method: 'POST',
        payload,
      },
      response: {
        status: res.status,
        statusText: res.statusText,
        listeners,
        headers: Object.fromEntries(res.headers.entries()),
        bodyText,
        elapsedMs: elapsed,
      },
      hint:
        res.status === 401
          ? 'WS_INTERNAL_SECRET does not match the value configured on the ws-server. Regenerate and set identically on both sides.'
          : res.status === 404
            ? 'The ws-server is reachable but has no POST /emit handler. Redeploy ws-server on DigitalOcean.'
            : !res.ok
              ? `Unexpected status ${res.status}. Check the ws-server runtime logs.`
              : probingRealSession && listeners === 0
                ? "Broadcast delivered BUT 0 listeners in the room. This means nobody's socket is currently in that session room on the ws-server. The host's `cowork:join` emit is either not reaching the server or the server is not adding the socket to the room. Check the host's browser console for a `[cowork-socket] emitting cowork:join for session ...` log and the ws-server Runtime Logs for the matching join event."
                : probingRealSession && listeners && listeners > 0
                  ? `Broadcast delivered to ${listeners} listener(s). If the host is one of those listeners, they should now see a \`recv debug:ping\` line in their browser console. If they do NOT, there is a client-side subscription bug (unlikely). If they DO, the real-time chain works end-to-end and the original bug is elsewhere.`
                  : 'Broadcast delivered. 0 listeners is expected for the fake "session:debug-test" room.',
      envCheck,
    });
  } catch (err) {
    const elapsed = Date.now() - started;
    const name = (err as Error).name;
    const message = (err as Error).message;

    return NextResponse.json({
      ok: false,
      stage: 'fetch',
      request: { url: emitUrl, method: 'POST', payload },
      error: {
        name,
        message,
        elapsedMs: elapsed,
      },
      hint:
        name === 'AbortError'
          ? 'Fetch timed out after 5 seconds. The ws-server is not responding at that URL. Double-check WS_INTERNAL_URL matches your DigitalOcean App URL and that the service is running.'
          : message.toLowerCase().includes('enotfound')
            ? 'DNS resolution failed. WS_INTERNAL_URL is pointing at a hostname that does not exist.'
            : message.toLowerCase().includes('econnrefused')
              ? 'Connection refused. ws-server is not listening on that URL or port.'
              : `Unknown network error: ${message}`,
      envCheck,
    });
  }
}
