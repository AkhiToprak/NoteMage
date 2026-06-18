import { readYouTubeDuration } from '@/lib/youtube-duration';

// Material-ingest helpers for adding files / YouTube videos to an existing
// Study Pack (= a Notebook). Mirrors the create-wizard's lanes but targets the
// pack's own notebookId instead of the Inbox:
//   - files      → Document (via the notebook documents endpoint)
//   - captioned  → Document (transcript with [MM:SS] markers)
//   - captionless → Page in a "Video notes" section (native Gemini pipeline)

const VIDEO_SECTION_TITLE = 'Video notes';

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const onAbort = () => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    signal.addEventListener('abort', onAbort);
  });
}

export type UploadFn = (
  file: File,
  purpose: string,
  context?: { notebookId?: string },
) => Promise<{ storagePath: string }>;

/** Upload a File to a notebook as a Document; returns the new document id. */
export async function uploadFileAsDocument(
  notebookId: string,
  file: File,
  upload: UploadFn,
  signal: AbortSignal,
): Promise<string> {
  const { storagePath } = await upload(file, 'document', { notebookId });
  const res = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/documents`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      storagePath,
      fileName: file.name,
      fileType: file.type || 'text/plain',
    }),
    signal,
  });
  const json = await res.json().catch(() => null);
  if (!json?.success || !json.data?.id) throw new Error(json?.error || 'Upload failed');
  return json.data.id as string;
}

export interface YouTubeVideoInput {
  videoId: string;
  url: string;
  title: string;
  durationSec?: number;
}

/**
 * Add a YouTube video to a notebook. Tries the caption lane first (creates a
 * Document); on a captionless video, falls back to the native (Gemini) pipeline
 * (creates a Page in the "Video notes" section). Returns the resulting material.
 * Throws tagged messages (out-of-minutes, disabled, timeout) for the caller to
 * surface.
 */
export async function addYouTubeVideoToNotebook(
  notebookId: string,
  video: YouTubeVideoInput,
  onPhase: (msg: string) => void,
  signal: AbortSignal,
): Promise<{ kind: 'document' | 'page'; id: string }> {
  onPhase(`Reading ${video.title}…`);
  const capRes = await fetch('/api/learn/documents/youtube', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: video.url }),
    signal,
  });
  if (capRes.status !== 422) {
    const capJson = await capRes.json().catch(() => null);
    if (!capRes.ok || !capJson?.success || !capJson.data?.document?.id) {
      throw new Error(capJson?.error || 'Could not add this video.');
    }
    return { kind: 'document', id: capJson.data.document.id as string };
  }

  // Captionless — native pipeline.
  let durationSec = video.durationSec ?? 0;
  if (!durationSec || durationSec <= 0) {
    try {
      durationSec = Math.floor(await readYouTubeDuration(video.videoId));
    } catch {
      durationSec = 0;
    }
  }
  if (!durationSec || durationSec <= 0) {
    throw new Error(`Couldn’t read “${video.title}”. Try another video.`);
  }

  const sectionId = await resolveVideoSection(notebookId, signal);
  const submitRes = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/video-import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sectionId,
      fileName: video.title,
      videoUrl: video.url,
      durationSec,
      pageTitle: video.title,
    }),
    signal,
  });
  const submitJson = await submitRes.json().catch(() => null);
  if (submitRes.status === 503) {
    throw new Error('Video notes are temporarily unavailable. Try again later.');
  }
  if (submitRes.status === 402 || submitJson?.code === 'video_minutes_exhausted') {
    throw new Error(submitJson?.error || 'You’ve used all your video minutes.');
  }
  if (!submitRes.ok || !submitJson?.success || !submitJson.data?.jobId) {
    throw new Error(submitJson?.error || `Couldn’t read “${video.title}”.`);
  }
  const jobId = submitJson.data.jobId as string;

  // Poll the job list until ready/failed. The server self-fails stale jobs.
  for (let attempt = 0; attempt < 240; attempt++) {
    await delay(3000, signal);
    const pollRes = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/video-import`, {
      signal,
    });
    const pollJson = await pollRes.json().catch(() => null);
    if (!pollJson?.success || !Array.isArray(pollJson.data)) continue;
    const row = pollJson.data.find((j: { id: string }) => j.id === jobId) as
      | { status: string; progress?: { message?: string }; resultPageId?: string; error?: string }
      | undefined;
    if (!row) continue;
    if (row.status === 'ready' && row.resultPageId) return { kind: 'page', id: row.resultPageId };
    if (row.status === 'failed') throw new Error(row.error || `Couldn’t read “${video.title}”.`);
    onPhase(row.progress?.message || `Reading ${video.title}…`);
  }
  throw new Error(`“${video.title}” is taking too long. Try again.`);
}

/** Find or create the "Video notes" section captionless videos land in. */
async function resolveVideoSection(notebookId: string, signal: AbortSignal): Promise<string> {
  const listRes = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/sections`, { signal });
  const listJson = await listRes.json().catch(() => null);
  if (listJson?.success && Array.isArray(listJson.data)) {
    const existing = listJson.data.find(
      (s: { id: string; title: string }) => s.title === VIDEO_SECTION_TITLE,
    );
    if (existing) return existing.id as string;
  }
  const createRes = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/sections`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title: VIDEO_SECTION_TITLE }),
    signal,
  });
  const createJson = await createRes.json().catch(() => null);
  if (!createJson?.success || !createJson.data?.id) {
    throw new Error('Could not prepare video processing. Try again.');
  }
  return createJson.data.id as string;
}
