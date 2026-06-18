-- DropForeignKey
ALTER TABLE "co_work_sessions" DROP CONSTRAINT "co_work_sessions_notebookId_fkey";

-- DropForeignKey
ALTER TABLE "co_work_sessions" DROP CONSTRAINT "co_work_sessions_hostId_fkey";

-- DropForeignKey
ALTER TABLE "co_work_participants" DROP CONSTRAINT "co_work_participants_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "co_work_participants" DROP CONSTRAINT "co_work_participants_userId_fkey";

-- DropForeignKey
ALTER TABLE "page_locks" DROP CONSTRAINT "page_locks_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "page_locks" DROP CONSTRAINT "page_locks_pageId_fkey";

-- DropForeignKey
ALTER TABLE "page_locks" DROP CONSTRAINT "page_locks_lockedById_fkey";

-- DropForeignKey
ALTER TABLE "co_work_messages" DROP CONSTRAINT "co_work_messages_sessionId_fkey";

-- DropForeignKey
ALTER TABLE "co_work_messages" DROP CONSTRAINT "co_work_messages_userId_fkey";

-- DropForeignKey
ALTER TABLE "study_groups" DROP CONSTRAINT "study_groups_ownerId_fkey";

-- DropForeignKey
ALTER TABLE "study_group_members" DROP CONSTRAINT "study_group_members_groupId_fkey";

-- DropForeignKey
ALTER TABLE "study_group_members" DROP CONSTRAINT "study_group_members_userId_fkey";

-- DropForeignKey
ALTER TABLE "study_group_notebooks" DROP CONSTRAINT "study_group_notebooks_groupId_fkey";

-- DropForeignKey
ALTER TABLE "study_group_notebooks" DROP CONSTRAINT "study_group_notebooks_notebookId_fkey";

-- DropForeignKey
ALTER TABLE "group_invitations" DROP CONSTRAINT "group_invitations_groupId_fkey";

-- DropForeignKey
ALTER TABLE "group_invitations" DROP CONSTRAINT "group_invitations_inviterId_fkey";

-- DropForeignKey
ALTER TABLE "group_invitations" DROP CONSTRAINT "group_invitations_inviteeId_fkey";

-- DropForeignKey
ALTER TABLE "group_messages" DROP CONSTRAINT "group_messages_groupId_fkey";

-- DropForeignKey
ALTER TABLE "group_messages" DROP CONSTRAINT "group_messages_senderId_fkey";

-- DropForeignKey
ALTER TABLE "group_shared_content" DROP CONSTRAINT "group_shared_content_groupId_fkey";

-- DropForeignKey
ALTER TABLE "group_shared_content" DROP CONSTRAINT "group_shared_content_sharedById_fkey";

-- DropTable
DROP TABLE "co_work_sessions";

-- DropTable
DROP TABLE "co_work_participants";

-- DropTable
DROP TABLE "page_locks";

-- DropTable
DROP TABLE "co_work_messages";

-- DropTable
DROP TABLE "study_groups";

-- DropTable
DROP TABLE "study_group_members";

-- DropTable
DROP TABLE "study_group_notebooks";

-- DropTable
DROP TABLE "group_invitations";

-- DropTable
DROP TABLE "group_messages";

-- DropTable
DROP TABLE "group_shared_content";

