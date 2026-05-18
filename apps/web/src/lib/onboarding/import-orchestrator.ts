import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { runPdfImportJob } from '@/lib/pdf-import/run-job';

// The server-side commit stage of the multi-PDF import flow: turn the
// user-confirmed grouping into real notebooks, then fan out one detached
// PDF-import worker per PDF. Mirrors the single-PDF route — it only gates
// the page budget via each job's `pageCap`; the worker meters usage on
// success. Both the onboarding finale and the /notebooks modal route here.

export interface OrchestratorFile {
  pdfPath: string;
  fileName: string;
  /** temp-imports/ paths of the rendered page PNGs — one per PDF page. */
  pageImagePaths: string[];
}

export interface OrchestratorGroup {
  name: string;
  subject: string;
  /** Hex color for the notebook. */
  color: string;
  files: OrchestratorFile[];
}

export interface OrchestratorInput {
  userId: string;
  /** Folder the new notebooks land in; null = root level. */
  folderId: string | null;
  groups: OrchestratorGroup[];
  /** Engine name recorded on each ImportJob (e.g. "gemini-flash-lite"). */
  engineName: string;
  /** Remaining `pdf_import` page budget; Infinity for an unlimited tier. */
  pageBudget: number;
}

export interface OrchestratorResult {
  notebookIds: string[];
  firstNotebookId: string | null;
  jobIds: string[];
  /** Names of PDFs skipped because the page budget ran out. */
  skippedFiles: string[];
}

/**
 * Create one notebook (plus an "Imported" section) per group, then one
 * `ImportJob` per PDF, and fire the detached import worker for each. The
 * page budget is spent greedily in order; once it runs out later PDFs are
 * skipped — their notebook is still created, just left empty so the user's
 * grouping is preserved. Returns the created ids for the caller to poll.
 */
export async function runImportOrchestration(
  input: OrchestratorInput,
): Promise<OrchestratorResult> {
  const { userId, folderId, groups, engineName } = input;
  let budget = input.pageBudget;

  const notebookIds: string[] = [];
  const jobIds: string[] = [];
  const skippedFiles: string[] = [];

  for (const group of groups) {
    const notebook = await db.notebook.create({
      data: {
        userId,
        name: group.name,
        subject: group.subject || null,
        color: group.color,
        folderId: folderId || null,
        kind: 'standard',
      },
    });
    notebookIds.push(notebook.id);

    const section = await db.section.create({
      data: { notebookId: notebook.id, title: 'Imported', sortOrder: 0 },
    });

    for (const file of group.files) {
      const pageCap = Math.min(file.pageImagePaths.length, budget);
      // Budget exhausted — keep the notebook, skip this PDF's import.
      if (pageCap < 1) {
        skippedFiles.push(file.fileName);
        continue;
      }

      const job = await db.importJob.create({
        data: {
          notebookId: notebook.id,
          sectionId: section.id,
          userId,
          fileName: file.fileName,
          engine: engineName,
          pageCap,
          status: 'queued',
          pdfPath: file.pdfPath,
          pageImagePaths: file.pageImagePaths as unknown as Prisma.InputJsonValue,
        },
      });
      jobIds.push(job.id);
      budget -= pageCap;

      // Detached, never-throws worker — mirrors the single-PDF route.
      void runPdfImportJob(job.id).catch((err) => {
        console.error(`[multi-import] worker crashed for job ${job.id}`, err);
      });
    }
  }

  return {
    notebookIds,
    firstNotebookId: notebookIds[0] ?? null,
    jobIds,
    skippedFiles,
  };
}
