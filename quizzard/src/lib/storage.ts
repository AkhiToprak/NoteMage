import fs from 'fs/promises';
import path from 'path';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function saveFile(
  notebookId: string,
  filename: string,
  buffer: Buffer
): Promise<{ filePath: string }> {
  const dir = path.join(process.cwd(), 'uploads', notebookId);
  await fs.mkdir(dir, { recursive: true });

  const safeName = `${Date.now()}-${sanitizeFilename(filename)}`;
  const filePath = path.join(dir, safeName);
  await fs.writeFile(filePath, buffer);

  return { filePath };
}

export async function saveImage(
  pageId: string,
  filename: string,
  buffer: Buffer
): Promise<{ filePath: string }> {
  const dir = path.join(process.cwd(), 'uploads', 'images', pageId);
  await fs.mkdir(dir, { recursive: true });

  const safeName = `${Date.now()}-${sanitizeFilename(filename)}`;
  const filePath = path.join(dir, safeName);
  await fs.writeFile(filePath, buffer);

  return { filePath };
}

export async function deleteFile(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (err: unknown) {
    // Ignore "file not found" errors
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/** Recursively delete a directory and all its contents (e.g. uploads/images/{pageId}) */
export async function deleteDirectory(dirPath: string): Promise<void> {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }
}

/** Delete all uploaded files for a notebook (documents + page images) */
export async function deleteNotebookFiles(notebookId: string, pageIds: string[]): Promise<void> {
  // Delete document uploads directory
  const docDir = path.join(process.cwd(), 'uploads', notebookId);
  await deleteDirectory(docDir);

  // Delete image directories for each page
  for (const pageId of pageIds) {
    const imgDir = path.join(process.cwd(), 'uploads', 'images', pageId);
    await deleteDirectory(imgDir);
  }
}

/** Delete all uploaded images for a page */
export async function deletePageImages(pageId: string): Promise<void> {
  const imgDir = path.join(process.cwd(), 'uploads', 'images', pageId);
  await deleteDirectory(imgDir);
}
