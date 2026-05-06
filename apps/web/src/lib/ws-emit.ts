/**
 * Server-side helper for broadcasting events to the standalone ws-server.
 *
 * The ws-server (apps/web/ws-server.ts) exposes an internal `POST /emit`
 * endpoint protected by a shared secret (`WS_INTERNAL_SECRET`). Next.js API
 * routes call this helper after they've successfully written to Postgres,
 * and the ws-server fans out the event to all sockets in the matching room.
 *
 * Why HTTP instead of giving ws-server its own Prisma client?
 * - Single Postgres writer (Next.js routes) — no double-write race
 * - ws-server stays small and dumb (just a relay)
 * - No second Prisma client memory bloat
 * - Easier to deploy ws-server independently
 *
 * Failures are logged but never thrown — a transient ws-server outage
 * should never break a REST endpoint that already succeeded in Postgres.
 * Worst case: clients miss a real-time event but get it on next refresh.
 */

// Strip trailing slashes so `${WS_INTERNAL_URL}/emit` never becomes `//emit`.
const WS_INTERNAL_URL = (process.env.WS_INTERNAL_URL || 'http://localhost:3002').replace(
  /\/+$/,
  ''
);
const WS_INTERNAL_SECRET = process.env.WS_INTERNAL_SECRET || '';

// Log the resolved env state exactly once per cold start so Vercel logs
// show us the values the function is actually using.
let envLogged = false;
function logEnvOnce() {
  if (envLogged) return;
  envLogged = true;
  console.log(
    `[ws-emit] env on cold start: WS_INTERNAL_URL=${WS_INTERNAL_URL} ` +
      `WS_INTERNAL_SECRET_set=${!!WS_INTERNAL_SECRET} ` +
      `WS_INTERNAL_SECRET_len=${WS_INTERNAL_SECRET.length}`
  );
}

export interface WsEmitPayload {
  /** Socket.IO room to broadcast to. For cowork: `session:<sessionId>`. */
  room: string;
  /** Event name, e.g. `cowork:message`, `cowork:page_locked`. */
  event: string;
  /** Arbitrary serializable payload. */
  data: unknown;
}

/**
 * Fire-and-forget emit. Returns void; never throws.
 * Uses a 2 second timeout so a hung ws-server doesn't tie up an API route.
 *
 * Verbose logging is enabled so Vercel function logs reveal whether the
 * REST→WS broadcast chain is actually reaching the ws-server.
 */
export async function wsEmit(payload: WsEmitPayload): Promise<void> {
  logEnvOnce();
  console.log(`[ws-emit] → ${payload.event} to ${payload.room} via ${WS_INTERNAL_URL}/emit`);

  if (!WS_INTERNAL_SECRET) {
    console.warn(
      '[ws-emit] WS_INTERNAL_SECRET is not set on this environment. ' +
        'Real-time broadcasts (participant joined/left, chat messages, ' +
        'page locks, session ended) will not fan out. Set the env var ' +
        'to the same value as on the ws-server.'
    );
    return;
  }
  if (!process.env.WS_INTERNAL_URL && process.env.NODE_ENV === 'production') {
    console.warn(
      '[ws-emit] WS_INTERNAL_URL is not set. Defaulting to http://localhost:3002 ' +
        'which will NOT work from Vercel. Set WS_INTERNAL_URL to your ws-server ' +
        'public URL (e.g. https://<your-app>.ondigitalocean.app).'
    );
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2000);

  try {
    const res = await fetch(`${WS_INTERNAL_URL}/emit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ws-internal-secret': WS_INTERNAL_SECRET,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (res.ok) {
      console.log(`[ws-emit] ✓ ${payload.event} delivered (status ${res.status})`);
    } else if (res.status === 401) {
      console.warn(
        `[ws-emit] ✗ ${payload.event} rejected with 401. ` +
          `WS_INTERNAL_SECRET does NOT match the value configured on ws-server.`
      );
    } else {
      console.warn(`[ws-emit] ✗ ${payload.event} failed with status ${res.status}`);
    }
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      console.warn(`[ws-emit] ✗ ${payload.event} timed out after 2s. ws-server is unreachable.`);
    } else {
      console.warn(`[ws-emit] ✗ ${payload.event} network error:`, (err as Error).message);
    }
  } finally {
    clearTimeout(timeout);
  }
}
