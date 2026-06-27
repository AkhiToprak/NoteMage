-- Prune dead notebook-subgraph tables. Each was verified to have ZERO live
-- readers/writers (see audit 2026-06-26): community ratings/views/comments +
-- comment votes, page revisions + content audits (old page-editor handler,
-- deleted), document summaries + source regions (doc-summarize removed; source
-- regions never populated), and notebook folders (folders UI orphaned).
--
-- RETAINED (still live): shared_notebooks + notebook_downloads + shared images
-- /tags (community feed + search), documents, sections, pages, page_images
-- (import pipeline + path generation + exam scope + Mage grounding).

-- DropForeignKey
ALTER TABLE "notebook_folders" DROP CONSTRAINT "notebook_folders_userId_fkey";

-- DropForeignKey
ALTER TABLE "notebook_folders" DROP CONSTRAINT "notebook_folders_parentId_fkey";

-- DropForeignKey
ALTER TABLE "notebooks" DROP CONSTRAINT "notebooks_folderId_fkey";

-- DropForeignKey
ALTER TABLE "document_summaries" DROP CONSTRAINT "document_summaries_documentId_fkey";

-- DropForeignKey
ALTER TABLE "source_regions" DROP CONSTRAINT "source_regions_documentId_fkey";

-- DropForeignKey
ALTER TABLE "page_revisions" DROP CONSTRAINT "page_revisions_pageId_fkey";

-- DropForeignKey
ALTER TABLE "page_content_audits" DROP CONSTRAINT "page_content_audits_pageId_fkey";

-- DropForeignKey
ALTER TABLE "notebook_ratings" DROP CONSTRAINT "notebook_ratings_sharedNotebookId_fkey";

-- DropForeignKey
ALTER TABLE "notebook_ratings" DROP CONSTRAINT "notebook_ratings_userId_fkey";

-- DropForeignKey
ALTER TABLE "notebook_views" DROP CONSTRAINT "notebook_views_sharedNotebookId_fkey";

-- DropForeignKey
ALTER TABLE "notebook_views" DROP CONSTRAINT "notebook_views_userId_fkey";

-- DropForeignKey
ALTER TABLE "notebook_comments" DROP CONSTRAINT "notebook_comments_sharedNotebookId_fkey";

-- DropForeignKey
ALTER TABLE "notebook_comments" DROP CONSTRAINT "notebook_comments_authorId_fkey";

-- DropForeignKey
ALTER TABLE "notebook_comments" DROP CONSTRAINT "notebook_comments_parentCommentId_fkey";

-- DropForeignKey
ALTER TABLE "notebook_comment_votes" DROP CONSTRAINT "notebook_comment_votes_commentId_fkey";

-- DropForeignKey
ALTER TABLE "notebook_comment_votes" DROP CONSTRAINT "notebook_comment_votes_userId_fkey";

-- DropIndex
DROP INDEX "notebooks_folderId_idx";

-- AlterTable
ALTER TABLE "notebooks" DROP COLUMN "folderId";

-- DropTable
DROP TABLE "notebook_folders";

-- DropTable
DROP TABLE "document_summaries";

-- DropTable
DROP TABLE "source_regions";

-- DropTable
DROP TABLE "page_revisions";

-- DropTable
DROP TABLE "page_content_audits";

-- DropTable
DROP TABLE "notebook_ratings";

-- DropTable
DROP TABLE "notebook_views";

-- DropTable
DROP TABLE "notebook_comments";

-- DropTable
DROP TABLE "notebook_comment_votes";
