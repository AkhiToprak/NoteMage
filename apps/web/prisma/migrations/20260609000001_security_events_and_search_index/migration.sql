-- NM3-20: durable authentication / security-event log (login success/failure,
-- lockout, password change, OAuth link/create) for incident response + GDPR
-- breach investigation. userId is a plain column (no FK) so events survive
-- account deletion for forensics.
-- CreateTable
CREATE TABLE "security_events" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "type" TEXT NOT NULL,
    "ip" TEXT,
    "detail" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "security_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_events_userId_createdAt_idx" ON "security_events"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "security_events_type_createdAt_idx" ON "security_events"("type", "createdAt");

-- NM3-14: the workspace search does an ILIKE '%term%' over pages.textContent,
-- which can't use a b-tree index. A pg_trgm GIN index makes it index-backed.
-- Maintained as raw SQL (the trigram operator class isn't expressed in the
-- Prisma schema); safe under the migrate-deploy flow used on Coolify.
-- CreateExtension
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "pages_textContent_trgm_idx" ON "pages" USING GIN ("textContent" gin_trgm_ops);
