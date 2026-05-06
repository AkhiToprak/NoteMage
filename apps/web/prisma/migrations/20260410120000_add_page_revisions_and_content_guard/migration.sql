-- Page revisions + content-guard audit trail.
--
-- page_revisions:   point-in-time snapshots of a page's content, written on
--                   every successful PUT /pages/[pageId]. Retained at ~50
--                   newest-per-page by an AFTER INSERT trigger so storage
--                   stays bounded.
-- page_content_audits: tamper-evident log written BEFORE the update runs.
--                   Captures every attempted write (accepted + refused) so
--                   rogue/empty overwrites can be traced back to a client.

-- CreateTable: page_revisions
CREATE TABLE "page_revisions" (
    "id"          TEXT NOT NULL,
    "pageId"      TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "content"     JSONB NOT NULL,
    "textContent" TEXT,
    "createdBy"   TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_revisions_pageId_createdAt_idx"
    ON "page_revisions"("pageId", "createdAt");

-- AddForeignKey
ALTER TABLE "page_revisions"
    ADD CONSTRAINT "page_revisions_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "pages"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable: page_content_audits
CREATE TABLE "page_content_audits" (
    "id"              TEXT NOT NULL,
    "pageId"          TEXT NOT NULL,
    "userId"          TEXT,
    "clientIp"        TEXT,
    "userAgent"       TEXT,
    "incomingIsEmpty" BOOLEAN NOT NULL,
    "existingIsEmpty" BOOLEAN NOT NULL,
    "result"          TEXT NOT NULL,
    "errorMessage"    TEXT,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "page_content_audits_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "page_content_audits_pageId_createdAt_idx"
    ON "page_content_audits"("pageId", "createdAt");
CREATE INDEX "page_content_audits_result_createdAt_idx"
    ON "page_content_audits"("result", "createdAt");

-- AddForeignKey
ALTER TABLE "page_content_audits"
    ADD CONSTRAINT "page_content_audits_pageId_fkey"
    FOREIGN KEY ("pageId") REFERENCES "pages"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- Retention trigger: after each new revision, prune older rows for the same
-- page so at most 50 are kept. Runs STATEMENT-level to avoid per-row overhead
-- on batch inserts.
CREATE OR REPLACE FUNCTION trim_page_revisions() RETURNS TRIGGER AS $$
BEGIN
    DELETE FROM "page_revisions"
    WHERE "id" IN (
        SELECT "id"
        FROM (
            SELECT "id",
                   ROW_NUMBER() OVER (
                       PARTITION BY "pageId"
                       ORDER BY "createdAt" DESC, "id" DESC
                   ) AS rn
            FROM "page_revisions"
            WHERE "pageId" IN (SELECT DISTINCT "pageId" FROM inserted_rows)
        ) ranked
        WHERE ranked.rn > 50
    );
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER page_revisions_trim_after_insert
AFTER INSERT ON "page_revisions"
REFERENCING NEW TABLE AS inserted_rows
FOR EACH STATEMENT
EXECUTE FUNCTION trim_page_revisions();
