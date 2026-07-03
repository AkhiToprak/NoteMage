# Login/Auth Security Release — 2026-07-03

Deploy the migration and application image as one release. This rollout is
intentionally session-breaking.

## Before traffic

- Confirm `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are present.
- Confirm both `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (build environment) and
  `TURNSTILE_SECRET_KEY` (runtime environment) are present.
- Confirm `TRUSTED_PROXY_HOPS` matches the production proxy chain.
- Generate and install a new `NEXTAUTH_SECRET`; do not reuse the previous value.
- Apply `20260703000000_login_auth_security_remediation` with the application
  deployment. Do not run the new application against the old schema.

## Expected behavior

- Every existing session is rejected and users must sign in again.
- Password change/reset, bans, and later auth-version increments revoke active
  sessions immediately.
- Login is unavailable if Upstash or production Turnstile configuration is
  missing. This is the intended fail-closed posture.

## Monitor

Watch durable `security_events` counts for:

- `session.rejected`, `session.version_mismatch`, `session.banned`
- `login.failed`, `login.throttled`, `login.banned`
- `password.changed`, `password.reset`
- `oauth.denied`, `oauth.linked`, `oauth.created`

Never attach JWTs, passwords, submitted codes, or raw emails to event details.
An initial burst of `session.rejected` is expected immediately after rotation;
continued growth after users sign in again is not.
