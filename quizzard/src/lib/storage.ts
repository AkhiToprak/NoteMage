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
