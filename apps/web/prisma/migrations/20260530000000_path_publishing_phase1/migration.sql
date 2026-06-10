-- Path-publishing & community-library — Phase 1 schema.
-- See plans/path-publishing-community-library.md (P1 build) and
--     plans/path-publishing-community-library-p0-spec.md (data model spec).
--
-- All adds are additive: new tables + new nullable/defaulted columns on
-- existing tables. No drops, no retypes. `language` on study_plans is
-- NOT NULL with `DEFAULT 'en'`, so existing rows backfill in place
-- without an application-level script.

-- AlterTable
ALTER TABLE "study_plans" ADD COLUMN     "clonedFromSharedPathId" TEXT,
ADD COLUMN     "language" TEXT NOT NULL DEFAULT 'en';

-- CreateTable
CREATE TABLE "shared_paths" (
    "id" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "sharedById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "coverImageUrl" TEXT,
    "language" TEXT NOT NULL,
    "subjects" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "phaseCount" INTEGER NOT NULL DEFAULT 0,
    "slotCount" INTEGER NOT NULL DEFAULT 0,
    "moderationStatus" TEXT NOT NULL DEFAULT 'pending',
    "rejectionReason" TEXT,
    "seeded" BOOLEAN NOT NULL DEFAULT false,
    "downloadCount" INTEGER NOT NULL DEFAULT 0,
    "viewCount" INTEGER NOT NULL DEFAULT 0,
    "ratingAverage" DOUBLE PRECISION,
    "ratingCount" INTEGER NOT NULL DEFAULT 0,
    "approvedAt" TIMESTAMP(3),
    "popularityTriggeredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shared_paths_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "path_translations" (
    "id" TEXT NOT NULL,
    "sharedPathId" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'translating',
    "title" TEXT,
    "description" TEXT,
    "payload" JSONB,
    "error" TEXT,
    "provider" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "path_translations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "moderation_audits" (
    "id" TEXT NOT NULL,
    "sharedPathId" TEXT NOT NULL,
    "layer" INTEGER NOT NULL,
    "verdict" TEXT NOT NULL,
    "reasonCode" TEXT,
    "reasoning" TEXT,
    "actorId" TEXT,
    "model" TEXT,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheWriteTokens" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "moderation_audits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "path_ratings" (
    "id" TEXT NOT NULL,
    "sharedPathId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "value" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "path_ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tickets" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "refType" TEXT NOT NULL,
    "refId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "assigneeId" TEXT,
    "resolvedById" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tickets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shared_paths_sharedById_idx" ON "shared_paths"("sharedById");

-- CreateIndex
CREATE INDEX "shared_paths_moderationStatus_createdAt_idx" ON "shared_paths"("moderationStatus", "createdAt");

-- CreateIndex
CREATE INDEX "shared_paths_moderationStatus_language_downloadCount_idx" ON "shared_paths"("moderationStatus", "language", "downloadCount" DESC);

-- CreateIndex
CREATE INDEX "shared_paths_approvedAt_idx" ON "shared_paths"("approvedAt" DESC);

-- CreateIndex
CREATE INDEX "shared_paths_moderationStatus_ratingAverage_idx" ON "shared_paths"("moderationStatus", "ratingAverage" DESC);

-- CreateIndex
CREATE INDEX "shared_paths_seeded_moderationStatus_idx" ON "shared_paths"("seeded", "moderationStatus");

-- CreateIndex
CREATE UNIQUE INDEX "shared_paths_planId_key" ON "shared_paths"("planId");

-- CreateIndex
CREATE INDEX "path_translations_sharedPathId_idx" ON "path_translations"("sharedPathId");

-- CreateIndex
CREATE INDEX "path_translations_language_createdAt_idx" ON "path_translations"("language", "createdAt");

-- CreateIndex
CREATE INDEX "path_translations_status_createdAt_idx" ON "path_translations"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "path_translations_sharedPathId_language_key" ON "path_translations"("sharedPathId", "language");

-- CreateIndex
CREATE INDEX "moderation_audits_sharedPathId_createdAt_idx" ON "moderation_audits"("sharedPathId", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_audits_layer_verdict_createdAt_idx" ON "moderation_audits"("layer", "verdict", "createdAt");

-- CreateIndex
CREATE INDEX "moderation_audits_actorId_idx" ON "moderation_audits"("actorId");

-- CreateIndex
CREATE INDEX "path_ratings_sharedPathId_idx" ON "path_ratings"("sharedPathId");

-- CreateIndex
CREATE UNIQUE INDEX "path_ratings_sharedPathId_userId_key" ON "path_ratings"("sharedPathId", "userId");

-- CreateIndex
CREATE INDEX "tickets_status_createdAt_idx" ON "tickets"("status", "createdAt");

-- CreateIndex
CREATE INDEX "tickets_refType_refId_idx" ON "tickets"("refType", "refId");

-- CreateIndex
CREATE INDEX "tickets_assigneeId_status_idx" ON "tickets"("assigneeId", "status");

-- CreateIndex
CREATE INDEX "tickets_type_status_idx" ON "tickets"("type", "status");

-- CreateIndex
CREATE INDEX "study_plans_clonedFromSharedPathId_idx" ON "study_plans"("clonedFromSharedPathId");

-- AddForeignKey
ALTER TABLE "study_plans" ADD CONSTRAINT "study_plans_clonedFromSharedPathId_fkey" FOREIGN KEY ("clonedFromSharedPathId") REFERENCES "shared_paths"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_paths" ADD CONSTRAINT "shared_paths_planId_fkey" FOREIGN KEY ("planId") REFERENCES "study_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shared_paths" ADD CONSTRAINT "shared_paths_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_translations" ADD CONSTRAINT "path_translations_sharedPathId_fkey" FOREIGN KEY ("sharedPathId") REFERENCES "shared_paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_audits" ADD CONSTRAINT "moderation_audits_sharedPathId_fkey" FOREIGN KEY ("sharedPathId") REFERENCES "shared_paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "moderation_audits" ADD CONSTRAINT "moderation_audits_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_ratings" ADD CONSTRAINT "path_ratings_sharedPathId_fkey" FOREIGN KEY ("sharedPathId") REFERENCES "shared_paths"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "path_ratings" ADD CONSTRAINT "path_ratings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Range check on PathRating.value — Prisma doesn't model check constraints,
-- so this is hand-rolled per the P0 spec §3.10 ("1..5; enforced by
-- application + a check constraint at migration time"). The app layer
-- still validates input so the DB only catches programmer error / SQL
-- injected through a missed validator.
ALTER TABLE "path_ratings"
    ADD CONSTRAINT "path_ratings_value_range"
    CHECK ("value" BETWEEN 1 AND 5);
