/**
 * Migration script: Convert existing Documents into Pages
 *
 * For each notebook that has documents:
 *   1. Create an "Imported Documents" section
 *   2. For each document, create a Page with the extracted text converted to TipTap JSON
 *   3. Set sourceDocId for traceability
 *
 * Run with: npx tsx scripts/migrate-documents-to-pages.ts
 *
 * This script does NOT delete original Documents — they remain intact for rollback safety.
 */

import { PrismaClient } from '@prisma/client';

const db = new PrismaClient();

function textToTipTapJSON(text: string): object {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);
  if (paragraphs.length === 0) {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }
  return {
    type: 'doc',
    content: paragraphs.map((p) => ({
      type: 'paragraph',
      content: [{ type: 'text', text: p.trim() }],
    })),
  };
}

async function main() {
  console.log('Starting document → page migration...\n');

  // Find all notebooks that have at least one document
  const notebooks = await db.notebook.findMany({
    where: {
      documents: { some: {} },
    },
    include: {
      documents: { orderBy: { createdAt: 'asc' } },
    },
  });

  if (notebooks.length === 0) {
    console.log('No notebooks with documents found. Nothing to migrate.');
    return;
  }

  console.log(`Found ${notebooks.length} notebook(s) with documents.\n`);

  let totalMigrated = 0;
  let totalFailed = 0;

  for (const notebook of notebooks) {
    console.log(`📓 Notebook: "${notebook.name}" (${notebook.id})`);
    console.log(`   ${notebook.documents.length} document(s) to migrate`);

    // Check if we already have an "Imported Documents" section (idempotency)
    let section = await db.section.findFirst({
      where: {
        notebookId: notebook.id,
        title: 'Imported Documents',
      },
    });

    if (!section) {
      section = await db.section.create({
        data: {
          notebookId: notebook.id,
          title: 'Imported Documents',
          sortOrder: 9999, // Put at the end
        },
      });
      console.log(`   ✅ Created "Imported Documents" section`);
    } else {
      console.log(`   ℹ️  "Imported Documents" section already exists`);
    }

    for (let i = 0; i < notebook.documents.length; i++) {
      const doc = notebook.documents[i];

      // Check if already migrated (idempotency)
      const existingPage = await db.page.findFirst({
        where: { sourceDocId: doc.id },
      });

      if (existingPage) {
        console.log(`   ⏭️  "${doc.fileName}" — already migrated, skipping`);
        continue;
      }

      try {
        // Strip file extension from name for the page title
        const title = doc.fileName.replace(/\.[^.]+$/, '') || doc.fileName;

        // Convert text to TipTap JSON
        const content = doc.textContent
          ? textToTipTapJSON(doc.textContent)
          : { type: 'doc', content: [{ type: 'paragraph' }] };

        await db.page.create({
          data: {
            sectionId: section.id,
            title,
            content: content as object,
            textContent: doc.textContent,
            sourceDocId: doc.id,
            sortOrder: i,
          },
        });

        totalMigrated++;
        console.log(`   ✅ "${doc.fileName}" → page created`);
      } catch (err) {
        totalFailed++;
        console.error(`   ❌ "${doc.fileName}" — failed:`, err);
      }
    }

    console.log('');
  }

  console.log('─'.repeat(50));
  console.log(`Migration complete: ${totalMigrated} migrated, ${totalFailed} failed`);
  console.log('Original documents are preserved (not deleted).');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
