-- Add pageType column to pages table
ALTER TABLE "pages" ADD COLUMN "pageType" TEXT NOT NULL DEFAULT 'text';
