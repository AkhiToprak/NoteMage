/**
 * Client-side telemetry helper. Fires structured events at `/api/telemetry`
 * which logs them via `console.info` server-side (visible in Coolify logs).
 *
 * Fire-and-forget by design: never awaited, never throws, never blocks UI.
 * `keepalive: true` lets the request survive page unloads so end-of-session
 * events (e.g. `quiz.perfect`) still land when the user navigates away.
 *
 * Event names are dot-namespaced. Phase 7 emits:
 *   - `quiz.streak_hit`        — milestone consecutive-correct (3/5/7/10/…)
 *   - `quiz.perfect`           — 100% on a ≥5-question quiz
 *   - `path.phase_completed`   — emitted server-side, not from this helper
 *   - `path.checkpoint_passed` — emitted server-side, not from this helper
 */
export function trackEvent(event: string, props?: Record<string, unknown>): void {
  if (typeof window === 'undefined') return;
  try {
    fetch('/api/telemetry', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event, props }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    /* swallow — telemetry must never break the UX */
  }
}
