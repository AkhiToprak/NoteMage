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

/**
 * Copy an existing private-bucket object to a new private-bucket path. Used by
 * path theory generation to SNAPSHOT a source page image into a path-owned
 * `theory-images/` object — so the embedded figure survives deletion of the
 * source page and clones can deep-copy it. Returns the new path + byte size.
 */
export async function copyImage(
  srcPath: string,
  destPath: string
): Promise<{ filePath: string; fileSize: number }> {
  const buffer = await readFile(srcPath);
  const { error } = await supabase.storage
    .from(BUCKET_PRIVATE)
    .upload(destPath, buffer, { upsert: false });

  if (error) throw new Error(`Failed to copy image: ${error.message}`);
  return { filePath: destPath, fileSize: buffer.length };
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

  const { data } = supabase.storage.from(BUCKET_PUBLIC).getPublicUrl(storagePath);

  return { filePath: storagePath, publicUrl: data.publicUrl };
}

/**
 * Mint a short-lived signed read URL for a private-bucket object (source-
 * highlighting feature — lets the client PDF viewer fetch the original file
 * without exposing the service-role key). The caller MUST have already
 * ownership-checked the row that owns `filePath`; this only signs. `expectedPrefix`
 * is validated (defends against a traversal/smuggled path even post-ownership)
 * before signing. TTL is short because the URL is needed only for the immediate
 * viewer fetch. Throws on a rejected path or a signing failure.
 */
export async function getSignedReadUrl(
  filePath: string,
  ttlSec = 300,
  expectedPrefix = 'documents/',
): Promise<string> {
  if (!validateStoragePath(filePath, expectedPrefix)) {
    throw new Error('Invalid storage path');
  }
  const { data, error } = await supabase.storage
    .from(BUCKET_PRIVATE)
    .createSignedUrl(filePath, ttlSec);
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to sign URL: ${error?.message ?? 'unknown error'}`);
  }
  return data.signedUrl;
}

export async function readFile(filePath: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET_PRIVATE).download(filePath);

  if (error || !data) throw new Error(`Failed to download file: ${error?.message}`);
  return Buffer.from(await data.arrayBuffer());
}

export async function deleteFile(filePath: string): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET_PRIVATE).remove([filePath]);

  if (error) console.error(`Failed to delete file: ${error.message}`);
}

export async function deleteDirectory(dirPath: string): Promise<void> {
  const { data: files } = await supabase.storage.from(BUCKET_PRIVATE).list(dirPath);

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
 *
 * The Supabase client uses the service-role key (bypasses RLS), so this
 * prefix check is the only cross-tenant barrier on storage reads/writes.
 * We reject traversal, absolute paths, backslashes, and control chars —
 * both on the raw string and on a single URL-decoded view of it, to defeat
 * percent-encoded `..`/`/` smuggling (e.g. `%2e%2e`, `%2f`, `%00`).
 */
export function validateStoragePath(path: string, expectedPrefix: string): boolean {
  if (!path) return false;

  const candidates = [path];
  try {
    const decoded = decodeURIComponent(path);
    if (decoded !== path) candidates.push(decoded);
  } catch {
    // Malformed percent-encoding — treat as hostile.
    return false;
  }

  for (const candidate of candidates) {
    if (candidate.includes('..')) return false;
    if (candidate.includes('//')) return false;
    if (candidate.includes('\\')) return false;
    if (candidate.startsWith('/')) return false;
    // NUL + other C0/DEL control characters (includes CR, LF, TAB).
    // eslint-disable-next-line no-control-regex
    if (/[\x00-\x1f\x7f]/.test(candidate)) return false;
  }

  return path.startsWith(expectedPrefix);
}
