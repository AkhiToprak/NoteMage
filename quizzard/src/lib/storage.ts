import { supabase, BUCKET_PRIVATE, BUCKET_PUBLIC } from '@/lib/supabase';

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_');
}

export async function saveFile(
  notebookId: string,
  filename: string,
  buffer: Buffer
): Promise<{ filePath: string }> {
  const safeName = `${Date.now()}-${sanitizeFilename(filename)}`;
  const storagePath = `documents/${notebookId}/${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET_PRIVATE)
    .upload(storagePath, buffer, { upsert: false });

  if (error) throw new Error(`Failed to upload file: ${error.message}`);
  return { filePath: storagePath };
}

export async function saveImage(
  pageId: string,
  filename: string,
  buffer: Buffer
): Promise<{ filePath: string }> {
  const safeName = `${Date.now()}-${sanitizeFilename(filename)}`;
  const storagePath = `images/${pageId}/${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET_PRIVATE)
    .upload(storagePath, buffer, { upsert: false });

  if (error) throw new Error(`Failed to upload image: ${error.message}`);
  return { filePath: storagePath };
}

export async function saveFlashcardImage(
  cardId: string,
  filename: string,
  buffer: Buffer
): Promise<{ filePath: string }> {
  const safeName = `${Date.now()}-${sanitizeFilename(filename)}`;
  const storagePath = `flashcard-images/${cardId}/${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET_PRIVATE)
    .upload(storagePath, buffer, { upsert: false });

  if (error) throw new Error(`Failed to upload flashcard image: ${error.message}`);
  return { filePath: storagePath };
}

export async function savePublicFile(
  folder: string,
  filename: string,
  buffer: Buffer
): Promise<{ filePath: string; publicUrl: string }> {
  const safeName = sanitizeFilename(filename);
  const storagePath = `${folder}/${safeName}`;

  const { error } = await supabase.storage
    .from(BUCKET_PUBLIC)
    .upload(storagePath, buffer, { upsert: true });

  if (error) throw new Error(`Failed to upload public file: ${error.message}`);

  const { data } = supabase.storage
    .from(BUCKET_PUBLIC)
    .getPublicUrl(storagePath);

  return { filePath: storagePath, publicUrl: data.publicUrl };
}

export async function readFile(filePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage
    .from(BUCKET_PRIVATE)
    .download(filePath);

  if (error || !data) throw new Error(`Failed to download file: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteFile(filePath: string): Promise<void> {
  const { error } = await supabase.storage
    .from(BUCKET_PRIVATE)
    .remove([filePath]);

  if (error) console.error(`Failed to delete file: ${error.message}`);
}

export async function deleteDirectory(dirPath: string): Promise<void> {
  const { data: files } = await supabase.storage
    .from(BUCKET_PRIVATE)
    .list(dirPath);

  if (files && files.length > 0) {
    const paths = files.map((f) => `${dirPath}/${f.name}`);
    await supabase.storage.from(BUCKET_PRIVATE).remove(paths);
  }
}

export async function deleteNotebookFiles(notebookId: string, pageIds: string[]): Promise<void> {
  await deleteDirectory(`documents/${notebookId}`);
  for (const pageId of pageIds) {
    await deleteDirectory(`images/${pageId}`);
  }
}

export async function deletePageImages(pageId: string): Promise<void> {
  await deleteDirectory(`images/${pageId}`);
}

/**
 * Download a file from Supabase Storage (used after direct client uploads).
 * Defaults to the private bucket.
 */
export async function downloadFromStorage(
  filePath: string,
  bucket: string = BUCKET_PRIVATE
): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(bucket).download(filePath);

  if (error || !data) {
    throw new Error(`Failed to download from storage: ${error?.message}`);
  }
  return Buffer.from(await data.arrayBuffer());
}

/**
 * Validate that a storage path starts with the expected prefix
 * and contains no path traversal sequences.
 */
export function validateStoragePath(
  path: string,
  expectedPrefix: string
): boolean {
  if (!path || path.includes('..') || path.includes('//')) return false;
  return path.startsWith(expectedPrefix);
}
