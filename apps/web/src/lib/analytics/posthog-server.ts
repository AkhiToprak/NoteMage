import { PostHog } from 'posthog-node';

let client: PostHog | null = null;

// Server-side PostHog client (lazy singleton). Returns null when
// NEXT_PUBLIC_POSTHOG_KEY is unset, so analytics stays fully optional.
function getClient(): PostHog | null {
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  if (!key) return null;
  if (!client) {
    client = new PostHog(key, { host: 'https://eu.i.posthog.com' });
  }
  return client;
}

// Emit a server-side event. `distinctId` must be the NextAuth user id so
// server events land on the same person profile as the browser SDK.
export function captureServerEvent(params: {
  distinctId: string;
  event: string;
  properties?: Record<string, unknown>;
}): void {
  const ph = getClient();
  if (!ph) return;
  ph.capture({
    distinctId: params.distinctId,
    event: params.event,
    properties: params.properties,
  });
}
