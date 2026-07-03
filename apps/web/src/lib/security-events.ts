import { db } from '@/lib/db';

export type SecurityEventType =
  | 'login.success'
  | 'login.failed'
  | 'login.throttled'
  | 'login.banned'
  | 'account.locked'
  | 'session.rejected'
  | 'session.version_mismatch'
  | 'session.banned'
  | 'password.changed'
  | 'password.reset'
  | 'oauth.denied'
  | 'oauth.created'
  | 'oauth.linked';

/**
 * Append a security-relevant authentication event to the durable
 * `security_events` log (NM3-20). Fire-and-forget: a logging failure must never
 * block or fail the auth flow, so this returns void and swallows errors.
 */
export function logSecurityEvent(event: {
  userId?: string | null;
  type: SecurityEventType;
  ip?: string | null;
  detail?: Record<string, unknown>;
}): void {
  db.securityEvent
    .create({
      data: {
        userId: event.userId ?? null,
        type: event.type,
        ip: event.ip ?? null,
        detail: event.detail ? JSON.stringify(event.detail) : null,
      },
    })
    .catch((err) => console.error('[security-event] log failed', err));
}
