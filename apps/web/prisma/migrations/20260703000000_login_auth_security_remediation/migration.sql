-- Add a per-user session generation. Application authorization rejects JWTs
-- whose claim is missing or differs from this value, so the release
-- intentionally invalidates every pre-migration session.
ALTER TABLE "users"
ADD COLUMN "authVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "users"
SET "authVersion" = 1,
    "failedLoginAttempts" = 0,
    "lockedAt" = NULL;

-- Keep only the newest code per user before enforcing one active code row.
DELETE FROM "email_verification_codes" AS older
USING "email_verification_codes" AS newer
WHERE older."userId" = newer."userId"
  AND (
    older."createdAt" < newer."createdAt"
    OR (older."createdAt" = newer."createdAt" AND older."id" < newer."id")
  );

DELETE FROM "password_reset_codes" AS older
USING "password_reset_codes" AS newer
WHERE older."userId" = newer."userId"
  AND (
    older."createdAt" < newer."createdAt"
    OR (older."createdAt" = newer."createdAt" AND older."id" < newer."id")
  );

DROP INDEX IF EXISTS "email_verification_codes_userId_idx";
DROP INDEX IF EXISTS "password_reset_codes_userId_idx";

CREATE UNIQUE INDEX "email_verification_codes_userId_key"
ON "email_verification_codes"("userId");

CREATE UNIQUE INDEX "password_reset_codes_userId_key"
ON "password_reset_codes"("userId");

-- Role changes are rare and may be performed by operational tooling rather
-- than an application route. Preserve the revocation invariant at the
-- database boundary without double-incrementing writers that already bump the
-- version explicitly.
CREATE FUNCTION "bump_auth_version_on_role_change"()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW."role" IS DISTINCT FROM OLD."role"
     AND NEW."authVersion" = OLD."authVersion" THEN
    NEW."authVersion" := OLD."authVersion" + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "users_bump_auth_version_on_role_change"
BEFORE UPDATE OF "role" ON "users"
FOR EACH ROW
EXECUTE FUNCTION "bump_auth_version_on_role_change"();
