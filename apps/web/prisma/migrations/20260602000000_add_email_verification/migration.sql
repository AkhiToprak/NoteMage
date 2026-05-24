-- AlterTable
ALTER TABLE "users" ADD COLUMN     "emailVerified" TIMESTAMP(3);

-- Grandfather every existing account so the hard email-confirmation block only
-- ever applies to NEW signups. Without this, every current user would be
-- locked out on their next login. We stamp createdAt (their real join time)
-- rather than now() so the column stays truthful.
UPDATE "users" SET "emailVerified" = "createdAt" WHERE "emailVerified" IS NULL;

-- CreateTable
CREATE TABLE "email_verification_codes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_verification_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_verification_codes_userId_idx" ON "email_verification_codes"("userId");

-- AddForeignKey
ALTER TABLE "email_verification_codes" ADD CONSTRAINT "email_verification_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
