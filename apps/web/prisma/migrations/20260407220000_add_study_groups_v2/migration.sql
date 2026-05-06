-- AlterTable: Add type column to study_groups
ALTER TABLE "study_groups" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'study_group';

-- AlterTable: Change description to VARCHAR(500) if needed (safe, expands limit)
-- Note: existing description column may already be TEXT, this is a safe no-op if wider

-- AlterTable: Add status column to study_group_members
ALTER TABLE "study_group_members" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'accepted';

-- CreateIndex on study_groups.type
CREATE INDEX IF NOT EXISTS "study_groups_type_idx" ON "study_groups"("type");

-- CreateIndex on study_group_members (userId, status)
CREATE INDEX IF NOT EXISTS "study_group_members_userId_status_idx" ON "study_group_members"("userId", "status");

-- CreateTable: group_invitations
CREATE TABLE IF NOT EXISTS "group_invitations" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "inviteeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "group_invitations_groupId_inviteeId_key" ON "group_invitations"("groupId", "inviteeId");
CREATE INDEX IF NOT EXISTS "group_invitations_inviteeId_status_idx" ON "group_invitations"("inviteeId", "status");

-- AddForeignKeys for group_invitations
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_inviteeId_fkey" FOREIGN KEY ("inviteeId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: group_messages
CREATE TABLE IF NOT EXISTS "group_messages" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "senderId" TEXT,
    "type" TEXT NOT NULL DEFAULT 'text',
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes for group_messages
CREATE INDEX IF NOT EXISTS "group_messages_groupId_createdAt_idx" ON "group_messages"("groupId", "createdAt");
CREATE INDEX IF NOT EXISTS "group_messages_senderId_idx" ON "group_messages"("senderId");

-- AddForeignKeys for group_messages
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_messages" ADD CONSTRAINT "group_messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable: group_shared_content
CREATE TABLE IF NOT EXISTS "group_shared_content" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "sharedById" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "contentId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "group_shared_content_pkey" PRIMARY KEY ("id")
);

-- CreateIndexes for group_shared_content
CREATE UNIQUE INDEX IF NOT EXISTS "group_shared_content_groupId_contentType_contentId_key" ON "group_shared_content"("groupId", "contentType", "contentId");
CREATE INDEX IF NOT EXISTS "group_shared_content_groupId_createdAt_idx" ON "group_shared_content"("groupId", "createdAt");
CREATE INDEX IF NOT EXISTS "group_shared_content_sharedById_idx" ON "group_shared_content"("sharedById");

-- AddForeignKeys for group_shared_content
ALTER TABLE "group_shared_content" ADD CONSTRAINT "group_shared_content_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "study_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "group_shared_content" ADD CONSTRAINT "group_shared_content_sharedById_fkey" FOREIGN KEY ("sharedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
