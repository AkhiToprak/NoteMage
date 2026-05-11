/**
 * Server-side telemetry sink. v1: structured `console.info`. Coolify
 * captures stdout so events show up in the container log; future iterations
 * can swap the body for a real analytics writer without touching call sites.
 *
 * Kept separate from `telemetry.ts` (the browser helper) so server-only
 * call sites can emit synchronously without an HTTP self-call.
 */
export function logTelemetry(
  userId: string | null,
  event: string,
  props?: Record<string, unknown>
): void {
  try {
    console.info(
      '[telemetry]',
      JSON.stringify({
        ts: new Date().toISOString(),
        userId,
        event,
        props: props ?? null,
      })
    );
  } catch {
    /* never throw out of telemetry */
  }
}
