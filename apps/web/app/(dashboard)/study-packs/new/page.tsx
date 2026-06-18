'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { NMCard } from '@/components/rework/NMCard';
import { ProgressBar } from '@/components/rework/ProgressBar';
import { TopicChip } from '@/components/rework/TopicChip';
import { Button } from '@/components/ui/Button';
import { Mascot } from '@/components/mascot/Mascot';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { usePathGenerationStream } from '@/hooks/usePathGenerationStream';
import VideoMaterialPicker, { type AddedVideo } from '@/components/study-packs/VideoMaterialPicker';
import { readYouTubeDuration } from '@/lib/youtube-duration';

// ── types ─────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;

// A file the user has queued in Step 1. `docId` is filled once it's uploaded on
// Continue, so going back and re-continuing skips already-uploaded files.
interface PendingFile {
  key: string;
  file: File;
  docId?: string;
}

interface WizardState {
  // Step 1 — collected (not yet processed) material.
  files: PendingFile[];
  usingSample: boolean;
  pasteText: string;
  pasteDocId: string | null;
  showPaste: boolean;
  // YouTube videos queued as material; transcribed on Continue.
  youtubeVideos: AddedVideo[];
  // Uploaded/loaded material ids — the handles the backend works from. Filled
  // by the Continue ingest step; topic detection + generation read these.
  materialIds: string[];
  // Existing-pack mode (?packId): skip Step 1, generate into this pack.
  packId: string | null;
  // Step 2
  detecting: boolean;
  detectError: string | null;
  // Step 3
  topics: string[];
  addingTopic: string;
  suggestedTitle: string;
  // Step 4
  examDate: string;
  intensity: 'easy' | 'balanced' | 'intense';
  hasExamDate: boolean;
  ultra: boolean;
  // Step 5
  generating: boolean;
  genError: string | null;
  planId: string | null;
  firstSlotId: string | null;
  notebookId: string | null;
}

// Representative topic chips for the sample material (cell biology). Sample
// stays mock — it skips real upload/detect and seeds these directly.
const SAMPLE_TOPICS = [
  'Cell membrane',
  'Diffusion',
  'Osmosis',
  'Active transport',
  'Facilitated diffusion',
  'Transport proteins',
  'Concentration gradient',
  'Homeostasis',
];

const SAMPLE_FILE_NAME = 'Cell Biology — Transport Mechanisms.pdf';

const TOTAL_STEPS = 5;

// Pace → an explicit brief directive so the generator honours intensity.
const INTENSITY_DIRECTIVE: Record<WizardState['intensity'], string> = {
  easy: 'Keep the pace gentle: fewer, shorter checkpoints.',
  balanced: 'Keep a balanced pace.',
  intense: 'Make it intensive: more checkpoints and deeper coverage.',
};

// ── Step progress header ──────────────────────────────────────────────────────

function WizardHeader({
  step,
  onBack,
  onClose,
  hideBack,
}: {
  step: Step;
  onBack: () => void;
  onClose: () => void;
  // Hidden only once a build is under way — before that, Back stays available on
  // every step (including Step 5's "ready to build" screen) so the user can edit.
  hideBack: boolean;
}) {
  const pct = ((step - 1) / (TOTAL_STEPS - 1)) * 100;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        padding: '16px 20px 0',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Back arrow */}
        <button
          type="button"
          aria-label="Go back"
          aria-hidden={hideBack || undefined}
          tabIndex={hideBack ? -1 : undefined}
          onClick={hideBack ? undefined : onBack}
          style={{ ...iconButtonStyle, visibility: hideBack ? 'hidden' : 'visible' }}
          onMouseEnter={(e) => applyHover(e, true)}
          onMouseLeave={(e) => applyHover(e, false)}
          onFocus={(e) => applyFocus(e, true)}
          onBlur={(e) => applyFocus(e, false)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
            arrow_back
          </span>
        </button>

        {/* Step counter */}
        <span
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-sm)',
            fontWeight: 600,
            color: 'var(--on-surface-variant)',
            letterSpacing: '0.02em',
          }}
        >
          Step {step} of {TOTAL_STEPS}
        </span>

        {/* Close */}
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          style={iconButtonStyle}
          onMouseEnter={(e) => applyHover(e, true)}
          onMouseLeave={(e) => applyHover(e, false)}
          onFocus={(e) => applyFocus(e, true)}
          onBlur={(e) => applyFocus(e, false)}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 22 }}>
            close
          </span>
        </button>
      </div>

      <ProgressBar value={pct} height={4} />
    </div>
  );
}

// ── Step 1 — Upload material ──────────────────────────────────────────────────

// Accepted by the backend extractor (PDF, DOCX, TXT, MD). Other picked types
// are rejected with a terse message rather than failing silently downstream.
const ACCEPTED_UPLOAD_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
];

/** Title of the Inbox section that captionless videos' native notes land in. */
const VIDEO_SECTION_TITLE = 'Video notes';

/** A signal-aware delay used while polling a native video job. Rejects with an
 *  AbortError the moment the user cancels, so polling stops promptly. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function Step1Upload({
  state,
  onChange,
  onContinue,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onContinue: () => void;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [showYoutube, setShowYoutube] = React.useState(state.youtubeVideos.length > 0);
  const { upload } = useDirectUpload();

  // ── Processing (Continue) state — nothing is ingested until Continue ────────
  const [processing, setProcessing] = React.useState(false);
  const [progress, setProgress] = React.useState<{ label: string; current: number; total: number }>(
    { label: '', current: 0, total: 0 },
  );
  const [processError, setProcessError] = React.useState<string | null>(null);
  // Set when a captionless video can't be imported because the user's free
  // native video minutes are spent — rendered as a special upsell, not an error.
  const [minutesUpsell, setMinutesUpsell] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const cancelledRef = React.useRef(false);

  const hasMaterial =
    state.files.length > 0 ||
    state.usingSample ||
    state.pasteText.trim().length > 0 ||
    state.youtubeVideos.length > 0;
  const canContinue = !processing && hasMaterial;

  // ── File add/remove (multiple files — PDFs, docs, etc.) ─────────────────────
  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    if (incoming.length === 0) return;
    const existing = new Set(state.files.map((f) => `${f.file.name}:${f.file.size}`));
    const next: PendingFile[] = [...state.files];
    for (const file of incoming) {
      const id = `${file.name}:${file.size}`;
      if (existing.has(id)) continue;
      existing.add(id);
      next.push({ key: id, file });
    }
    // Adding material invalidates any previously-built ids.
    onChange({ files: next, usingSample: false, materialIds: [] });
  }

  function removeFile(key: string) {
    onChange({ files: state.files.filter((f) => f.key !== key), materialIds: [] });
  }

  function resolveInboxId(signal: AbortSignal): Promise<string | null> {
    return fetch('/api/learn/uploads/inbox', { method: 'POST', signal })
      .then((r) => r.json())
      .then((json) => (json?.success ? ((json.data?.id as string) ?? null) : null))
      .catch(() => null);
  }

  // Upload one File to the Inbox as a Document, returning its id.
  async function uploadAsDocument(file: File, signal: AbortSignal): Promise<string> {
    const inboxId = await resolveInboxId(signal);
    if (!inboxId) throw new Error('Could not prepare the upload. Try again.');
    const { storagePath } = await upload(file, 'document', { notebookId: inboxId });
    const res = await fetch('/api/learn/uploads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        storagePath,
        fileName: file.name,
        fileType: file.type || 'text/plain',
      }),
      signal,
    });
    const json = await res.json();
    if (!json?.success || !json.data?.id) throw new Error(json?.error || 'Upload failed');
    return json.data.id as string;
  }

  // Transcribe one YouTube video into a Document, returning its id.
  async function transcribeVideo(url: string, signal: AbortSignal): Promise<string> {
    const res = await fetch('/api/learn/documents/youtube', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal,
    });
    const json = await res.json().catch(() => null);
    if (res.status === 422) {
      // Captionless — the caller falls back to the native pipeline.
      const e = new Error('No captions');
      e.name = 'CaptionsMissing';
      throw e;
    }
    if (!res.ok || !json?.success || !json.data?.document?.id) {
      throw new Error(json?.error || 'Could not transcribe a video.');
    }
    return json.data.document.id as string;
  }

  // Find or create the Inbox "Video notes" section captionless videos land in.
  async function resolveVideoSection(inboxId: string, signal: AbortSignal): Promise<string> {
    const listRes = await fetch(`/api/notebooks/${encodeURIComponent(inboxId)}/sections`, { signal });
    const listJson = await listRes.json().catch(() => null);
    if (listJson?.success && Array.isArray(listJson.data)) {
      const existing = listJson.data.find(
        (s: { id: string; title: string }) => s.title === VIDEO_SECTION_TITLE,
      );
      if (existing) return existing.id as string;
    }
    const createRes = await fetch(`/api/notebooks/${encodeURIComponent(inboxId)}/sections`, {
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

  // Read a captionless video with the native (Gemini) pipeline, returning the id
  // of the Page it produces. Submits a job, then polls to completion; the abort
  // signal cancels both the wait and the in-flight fetches.
  async function ingestVideoNatively(
    v: AddedVideo,
    inboxId: string,
    sectionId: string,
    onPhase: (msg: string) => void,
    signal: AbortSignal,
  ): Promise<string> {
    let durationSec = v.durationSec;
    if (!durationSec || durationSec <= 0) {
      try {
        durationSec = Math.floor(await readYouTubeDuration(v.videoId));
      } catch {
        durationSec = 0;
      }
    }
    if (!durationSec || durationSec <= 0) {
      throw new Error(`Couldn’t read “${v.title}”. Try another video.`);
    }

    const submitRes = await fetch(`/api/notebooks/${encodeURIComponent(inboxId)}/video-import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sectionId,
        fileName: v.title,
        videoUrl: v.url,
        durationSec,
        pageTitle: v.title,
      }),
      signal,
    });
    const submitJson = await submitRes.json().catch(() => null);
    if (submitRes.status === 503) {
      throw new Error('Video notes are temporarily unavailable. Try again later.');
    }
    if (submitRes.status === 402 || submitJson?.code === 'video_minutes_exhausted') {
      // Out of native video minutes — special, server-enforced wall. Tag it so
      // the wizard renders the upsell instead of a generic error.
      const e = new Error(submitJson?.error || 'You’ve used all your free video minutes.');
      e.name = 'VideoMinutesExhausted';
      throw e;
    }
    if (!submitRes.ok || !submitJson?.success || !submitJson.data?.jobId) {
      throw new Error(submitJson?.error || `Couldn’t read “${v.title}”.`);
    }
    const jobId = submitJson.data.jobId as string;

    // Poll the job list for this job until it's ready or failed. The server
    // self-fails stale jobs (~20min); the loop cap is just a backstop.
    for (let attempt = 0; attempt < 240; attempt++) {
      await delay(3000, signal);
      const pollRes = await fetch(`/api/notebooks/${encodeURIComponent(inboxId)}/video-import`, {
        signal,
      });
      const pollJson = await pollRes.json().catch(() => null);
      if (!pollJson?.success || !Array.isArray(pollJson.data)) continue;
      const row = pollJson.data.find((j: { id: string }) => j.id === jobId) as
        | { status: string; progress?: { message?: string }; resultPageId?: string; error?: string }
        | undefined;
      if (!row) continue;
      if (row.status === 'ready' && row.resultPageId) return row.resultPageId;
      if (row.status === 'failed') throw new Error(row.error || `Couldn’t read “${v.title}”.`);
      onPhase(row.progress?.message || `Reading ${v.title}…`);
    }
    throw new Error(`“${v.title}” is taking too long. Try again.`);
  }

  function cancelProcessing() {
    cancelledRef.current = true;
    abortRef.current?.abort();
    setProcessing(false);
    setProgress({ label: '', current: 0, total: 0 });
  }

  // Build all material ids, then advance. Files + videos + paste are processed
  // here (never on add); already-resolved items are skipped so going back and
  // re-continuing is cheap.
  async function handleContinue() {
    setProcessError(null);
    setMinutesUpsell(null);

    // Sample stays mock — seed topics, skip detection, jump straight to Step 3.
    if (state.usingSample) {
      onChange({ topics: SAMPLE_TOPICS, suggestedTitle: 'Cell Biology — Transport', materialIds: [] });
      onContinue();
      return;
    }

    // Validate file types up front.
    const bad = state.files.find((f) => !ACCEPTED_UPLOAD_TYPES.includes(f.file.type));
    if (bad) {
      setProcessError(`Unsupported file: ${bad.file.name}. Use PDF, Word, text, or Markdown.`);
      return;
    }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    cancelledRef.current = false;
    const paste = state.pasteText.trim();
    const total =
      state.files.filter((f) => !f.docId).length +
      state.youtubeVideos.filter((v) => !v.docId).length +
      (paste && !state.pasteDocId ? 1 : 0);
    setProgress({ label: 'Preparing…', current: 0, total });
    setProcessing(true);

    try {
      const ids: string[] = [];
      let done = 0;

      // Files
      const nextFiles = [...state.files];
      for (let i = 0; i < nextFiles.length; i++) {
        if (cancelledRef.current) return;
        const pf = nextFiles[i];
        if (pf.docId) {
          ids.push(pf.docId);
          continue;
        }
        setProgress({ label: `Uploading ${pf.file.name}`, current: done, total });
        const docId = await uploadAsDocument(pf.file, ctrl.signal);
        nextFiles[i] = { ...pf, docId };
        ids.push(docId);
        done += 1;
      }
      if (nextFiles.some((f, i) => f.docId !== state.files[i]?.docId)) onChange({ files: nextFiles });

      // Pasted text
      if (paste) {
        if (state.pasteDocId) {
          ids.push(state.pasteDocId);
        } else {
          if (cancelledRef.current) return;
          setProgress({ label: 'Saving your notes', current: done, total });
          const blob = new File([paste], 'Pasted notes.txt', { type: 'text/plain' });
          const docId = await uploadAsDocument(blob, ctrl.signal);
          onChange({ pasteDocId: docId });
          ids.push(docId);
          done += 1;
        }
      }

      // YouTube videos → transcript first; when a video has no captions, fall
      // back to the native (Gemini) pipeline. The Inbox + its "Video notes"
      // section are resolved once and reused across captionless videos.
      const nextVideos = [...state.youtubeVideos];
      let videoInboxId: string | null = null;
      let videoSectionId: string | null = null;
      for (let i = 0; i < nextVideos.length; i++) {
        if (cancelledRef.current) return;
        const v = nextVideos[i];
        if (v.docId) {
          ids.push(v.docId);
          continue;
        }
        setProgress({ label: `Transcribing ${v.title}`, current: done, total });
        let materialId: string;
        try {
          materialId = await transcribeVideo(v.url, ctrl.signal);
        } catch (err) {
          if (!(err instanceof Error) || err.name !== 'CaptionsMissing') throw err;
          // No captions — read the full video natively instead.
          setProgress({ label: `Reading ${v.title}`, current: done, total });
          if (!videoInboxId) {
            videoInboxId = await resolveInboxId(ctrl.signal);
            if (!videoInboxId) throw new Error('Could not prepare video processing. Try again.');
          }
          if (!videoSectionId) {
            videoSectionId = await resolveVideoSection(videoInboxId, ctrl.signal);
          }
          materialId = await ingestVideoNatively(
            v,
            videoInboxId,
            videoSectionId,
            (msg) => setProgress({ label: msg, current: done, total }),
            ctrl.signal,
          );
        }
        nextVideos[i] = { ...v, docId: materialId };
        ids.push(materialId);
        done += 1;
      }
      if (nextVideos.some((v, i) => v.docId !== state.youtubeVideos[i]?.docId)) {
        onChange({ youtubeVideos: nextVideos });
      }

      if (cancelledRef.current) return;
      onChange({ materialIds: ids });
      setProcessing(false);
      onContinue();
    } catch (err) {
      if (cancelledRef.current || (err instanceof Error && err.name === 'AbortError')) {
        setProcessing(false);
        return;
      }
      if (err instanceof Error && err.name === 'VideoMinutesExhausted') {
        // Special, server-enforced wall — show the upsell, not a generic error.
        setMinutesUpsell(err.message);
        setProcessing(false);
        return;
      }
      setProcessError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setProcessing(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files?.length) addFiles(e.target.files);
    e.target.value = ''; // allow re-picking the same file
  }

  // ── Processing view — shown while Continue ingests, with a real Cancel ──────
  if (processing) {
    return (
      <StepWrapper>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <Mascot pose="thinking" size="lg" idle="float" />
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-2xl)',
            fontWeight: 700,
            color: 'var(--on-surface)',
            margin: 0,
            textAlign: 'center',
            letterSpacing: '-0.02em',
          }}
        >
          Preparing your material…
        </h2>
        <NMCard style={{ padding: 'var(--card-pad)', background: 'var(--surface-container)', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <ProgressBar value={progress.total > 0 ? (progress.current / progress.total) * 100 : 8} height={8} />
          <p aria-live="polite" style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', textAlign: 'center' }}>
            {progress.total > 0 ? `${Math.min(progress.current + 1, progress.total)} of ${progress.total} · ` : ''}
            {progress.label || 'Working…'}
          </p>
        </NMCard>
        <Button variant="ghost" size="md" fullWidth leadingIcon="close" onClick={cancelProcessing}>
          Cancel
        </Button>
      </StepWrapper>
    );
  }

  return (
    <StepWrapper>
      <div style={{ textAlign: 'center', marginBottom: 8 }}>
        <Mascot pose="holding-pen" size="md" idle="bounce" />
      </div>

      <h1
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-3xl)',
          fontWeight: 700,
          color: 'var(--on-surface)',
          margin: 0,
          textAlign: 'center',
          letterSpacing: '-0.02em',
          lineHeight: 'var(--lh-tight)',
        }}
      >
        Create Study Pack
      </h1>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-base)',
          color: 'var(--on-surface-variant)',
          margin: '8px 0 0',
          textAlign: 'center',
          lineHeight: 'var(--lh-relaxed)',
        }}
      >
        Add your material — files, notes, and YouTube videos. Mage builds the path when you’re ready.
      </p>

      {/* Drop zone */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Upload area — click to choose files or drag and drop"
        style={{
          padding: 'var(--card-pad)',
          border: `2px dashed ${dragging ? 'var(--accent-strong)' : 'var(--ink-20)'}`,
          background: dragging ? 'var(--ink-06)' : 'var(--surface-container-low)',
          cursor: 'pointer',
          borderRadius: 'var(--radius-lg)',
          transition: 'border-color var(--dur-fast) var(--ease-spring), background var(--dur-fast) var(--ease-spring)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 12,
          minHeight: 160,
          justifyContent: 'center',
          outline: 'none',
        }}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        onDragOver={(e: React.DragEvent<HTMLDivElement>) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onFocus={(e: React.FocusEvent<HTMLDivElement>) => { e.currentTarget.style.outline = '3px solid var(--accent-strong)'; e.currentTarget.style.outlineOffset = '2px'; }}
        onBlur={(e: React.FocusEvent<HTMLDivElement>) => { e.currentTarget.style.outline = 'none'; }}
      >
        <span
          className="material-symbols-outlined"
          aria-hidden
          style={{
            fontSize: 40,
            color: state.files.length > 0 || state.usingSample ? 'var(--accent-strong)' : 'var(--on-surface-variant)',
            transition: 'color var(--dur-fast) var(--ease-spring)',
          }}
        >
          {state.usingSample ? 'task' : 'upload_file'}
        </span>

        {state.usingSample ? (
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', color: 'var(--on-surface)', fontWeight: 600, textAlign: 'center' }}>
            {SAMPLE_FILE_NAME}
          </span>
        ) : (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-sm)', color: 'var(--on-surface-variant)', margin: 0, textAlign: 'center', lineHeight: 1.5 }}>
            Drop files or click to add
            <br />
            <span style={{ color: 'var(--ink-50)', fontSize: 'var(--fs-xs)' }}>
              PDFs, Word, text, or Markdown — add as many as you like
            </span>
          </p>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc,.txt,.md"
          multiple
          style={{ display: 'none' }}
          onChange={handleFileChange}
          aria-label="Choose files to upload"
        />

        <Button
          variant="secondary"
          size="sm"
          leadingIcon="folder_open"
          onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
        >
          Choose files
        </Button>
      </div>

      {/* Added files list */}
      {state.files.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {state.files.map((pf) => (
            <li
              key={pf.key}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 'var(--radius-md)',
                background: 'var(--surface-container-high)',
                border: '1px solid var(--ink-12, var(--outline-variant))',
              }}
            >
              <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 18, flexShrink: 0, color: 'var(--accent-strong)' }}>
                description
              </span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 'var(--fs-sm)',
                  fontWeight: 600,
                  color: 'var(--on-surface)',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={pf.file.name}
              >
                {pf.file.name}
              </span>
              <button
                type="button"
                onClick={() => removeFile(pf.key)}
                aria-label={`Remove ${pf.file.name}`}
                style={iconButtonStyle}
                onMouseEnter={(e) => applyHover(e, true)}
                onMouseLeave={(e) => applyHover(e, false)}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {/* Paste text panel */}
      {state.showPaste && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea
            placeholder="Paste your notes or text here…"
            value={state.pasteText}
            onChange={(e) => onChange({ pasteText: e.target.value, usingSample: false, pasteDocId: null, materialIds: [] })}
            rows={6}
            style={{
              width: '100%',
              boxSizing: 'border-box',
              padding: '12px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--ink-20)',
              background: 'var(--surface-container)',
              color: 'var(--on-surface)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--fs-sm)',
              lineHeight: 1.6,
              resize: 'vertical',
              outline: 'none',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-strong)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--ink-20)'; }}
          />
        </div>
      )}

      {minutesUpsell && (
        <NMCard
          style={{
            padding: 'var(--card-pad)',
            background: 'var(--surface-container)',
            border: '1px solid var(--accent-strong)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            textAlign: 'center',
          }}
        >
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{ fontSize: 28, color: 'var(--accent-strong)', alignSelf: 'center' }}
          >
            workspace_premium
          </span>
          <p
            role="alert"
            style={{ margin: 0, fontSize: 'var(--fs-base)', fontWeight: 700, color: 'var(--on-surface)' }}
          >
            You’re out of free video minutes
          </p>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--fs-sm)',
              color: 'var(--on-surface-variant)',
              lineHeight: 'var(--lh-relaxed)',
            }}
          >
            That video has no captions, so it needs the full-video reader — and your free minutes are
            spent. Remove it to build with your other material, or go Pro for 1,000 minutes a month.
            Videos with captions are still free.
          </p>
          <Button href="/pricing" variant="primary" size="md" leadingIcon="bolt">
            Upgrade to Pro
          </Button>
        </NMCard>
      )}

      {processError && (
        <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-sm)', color: 'var(--error)', textAlign: 'center' }}>
          {processError}
        </p>
      )}

      {/* Secondary options */}
      <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button
          type="button"
          style={linkButtonStyle}
          onClick={() => onChange({ showPaste: !state.showPaste, usingSample: false })}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit_note</span>
          Paste text
        </button>
        <button
          type="button"
          style={{ ...linkButtonStyle, color: showYoutube ? 'var(--accent-strong)' : linkButtonStyle.color }}
          aria-pressed={showYoutube}
          onClick={() => { setShowYoutube((v) => !v); onChange({ usingSample: false }); }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>smart_display</span>
          Add YouTube
        </button>
        <Link href="/tutorial" style={{ ...linkButtonStyle, textDecoration: 'none' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>science</span>
          Try a guided sample
        </Link>
      </div>

      {/* YouTube material picker — collect only; transcript (with native fallback
          for captionless videos) runs on Continue. */}
      {(showYoutube || state.youtubeVideos.length > 0) && (
        <VideoMaterialPicker
          videos={state.youtubeVideos}
          onChange={(v) => onChange({ youtubeVideos: v, usingSample: false, materialIds: [] })}
        />
      )}

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={!canContinue}
        trailingIcon="arrow_forward"
        onClick={handleContinue}
        haptic="select"
      >
        Continue
      </Button>
    </StepWrapper>
  );
}

// ── Step 2 — Mage reads material → detect topics ──────────────────────────────

function Step2Processing({
  state,
  onChange,
  onDone,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onDone: () => void;
}) {
  // Drive a real request lifecycle. The effect fires the detect call once on
  // mount (and on explicit retry, keyed by `state.detecting` flipping).
  const ran = React.useRef(false);

  const runDetect = React.useCallback(async () => {
    onChange({ detecting: true, detectError: null });
    try {
      const res = await fetch('/api/learn/paths/detect-topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialIds: state.materialIds,
          pasteText: state.materialIds.length === 0 ? state.pasteText.trim() || undefined : undefined,
        }),
      });
      const json = await res.json();
      if (!json?.success || !Array.isArray(json.data?.topics)) {
        onChange({
          detecting: false,
          detectError: json?.error || 'Mage could not read your material.',
        });
        return;
      }
      const topics = (json.data.topics as string[]).filter((t) => t && t.trim());
      onChange({
        detecting: false,
        detectError: null,
        topics: topics.length > 0 ? topics : state.topics,
        suggestedTitle: (json.data.suggestedTitle as string) || state.suggestedTitle,
      });
      onDone();
    } catch {
      onChange({ detecting: false, detectError: 'Network error. Please try again.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.materialIds, state.pasteText]);

  React.useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    void runDetect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasError = state.detectError !== null && !state.detecting;

  return (
    <StepWrapper>
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <Mascot pose={hasError ? 'thinking' : 'thinking'} size="lg" idle={hasError ? 'none' : 'float'} />
      </div>

      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-2xl)',
          fontWeight: 700,
          color: 'var(--on-surface)',
          margin: 0,
          textAlign: 'center',
          letterSpacing: '-0.02em',
        }}
      >
        {hasError ? 'That didn’t work' : 'Mage is reading your material…'}
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-sm)',
          color: 'var(--on-surface-variant)',
          margin: '4px 0 0',
          textAlign: 'center',
          lineHeight: 1.6,
        }}
      >
        {hasError ? state.detectError : 'Finding the topics to build your path around.'}
      </p>

      {!hasError ? (
        <NMCard
          style={{
            padding: 'var(--card-pad)',
            background: 'var(--surface-container)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            minHeight: 96,
          }}
        >
          <span
            aria-hidden
            className="sp-detect-spinner"
            style={{
              width: 28,
              height: 28,
              borderRadius: '50%',
              border: '3px solid var(--ink-12)',
              borderTopColor: 'var(--accent-strong)',
            }}
          />
          <span style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--fs-base)', color: 'var(--on-surface-variant)' }}>
            Working…
          </span>
        </NMCard>
      ) : (
        <Button
          variant="primary"
          size="lg"
          fullWidth
          leadingIcon="refresh"
          onClick={() => {
            ran.current = true;
            void runDetect();
          }}
          haptic="select"
        >
          Try again
        </Button>
      )}

      <style>{`
        @keyframes spDetectSpin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .sp-detect-spinner { animation: spDetectSpin 0.9s linear infinite; }
        @media (prefers-reduced-motion: reduce) { .sp-detect-spinner { animation: none; } }
      `}</style>
    </StepWrapper>
  );
}

// ── Step 3 — Topic confirmation ───────────────────────────────────────────────

function Step3Topics({
  state,
  onChange,
  onContinue,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onContinue: () => void;
}) {
  const inputRef = React.useRef<HTMLInputElement>(null);

  function removeTopic(t: string) {
    onChange({ topics: state.topics.filter((x) => x !== t) });
  }

  function addTopic() {
    const val = state.addingTopic.trim();
    if (val && !state.topics.includes(val)) {
      onChange({ topics: [...state.topics, val], addingTopic: '' });
    } else {
      onChange({ addingTopic: '' });
    }
  }

  return (
    <StepWrapper>
      <div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-2xl)',
            fontWeight: 700,
            color: 'var(--on-surface)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          We found these topics
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-sm)',
            color: 'var(--on-surface-variant)',
            margin: '6px 0 0',
            lineHeight: 1.6,
          }}
        >
          Adjust them before Mage builds your path.
        </p>
      </div>

      <NMCard
        style={{
          padding: 'var(--card-pad)',
          background: 'var(--surface-container)',
          display: 'flex',
          flexDirection: 'column',
          gap: 16,
        }}
      >
        {/* Chip grid */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {state.topics.map((topic) => (
            <TopicChip key={topic} label={topic} onRemove={() => removeTopic(topic)} />
          ))}
        </div>

        {/* Add topic input */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input
            ref={inputRef}
            type="text"
            placeholder="Add topic…"
            value={state.addingTopic}
            onChange={(e) => onChange({ addingTopic: e.target.value })}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { e.preventDefault(); addTopic(); }
            }}
            aria-label="Add a topic"
            style={{
              flex: 1,
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--ink-20)',
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--fs-sm)',
              outline: 'none',
              minHeight: 36,
              transition: 'border-color var(--dur-fast) var(--ease-spring)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-strong)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--ink-20)'; addTopic(); }}
          />
          <Button variant="ghost" size="sm" leadingIcon="add" onClick={addTopic} aria-label="Add topic">
            Add
          </Button>
        </div>
      </NMCard>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        disabled={state.topics.length === 0}
        trailingIcon="arrow_forward"
        onClick={onContinue}
        haptic="select"
      >
        Continue
      </Button>
    </StepWrapper>
  );
}

// ── Step 4 — Goal + Ultra ─────────────────────────────────────────────────────

const INTENSITIES: { id: WizardState['intensity']; label: string; icon: string }[] = [
  { id: 'easy', label: 'Easy', icon: 'spa' },
  { id: 'balanced', label: 'Balanced', icon: 'balance' },
  { id: 'intense', label: 'Intense', icon: 'local_fire_department' },
];

function Step4Goal({
  state,
  onChange,
  onContinue,
  canUseUltra,
  isAdmin,
  ultraUsage,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onContinue: () => void;
  canUseUltra: boolean;
  isAdmin: boolean;
  ultraUsage: { used: number; limit: number } | null;
}) {
  return (
    <StepWrapper>
      <div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-2xl)',
            fontWeight: 700,
            color: 'var(--on-surface)',
            margin: 0,
            letterSpacing: '-0.02em',
          }}
        >
          Set your goal
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-sm)',
            color: 'var(--on-surface-variant)',
            margin: '6px 0 0',
          }}
        >
          We&apos;ll pace the path around your schedule.
        </p>
      </div>

      {/* Exam date */}
      <NMCard
        style={{
          padding: 'var(--card-pad)',
          background: 'var(--surface-container)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-base)',
            fontWeight: 600,
            color: 'var(--on-surface)',
            margin: 0,
          }}
        >
          Do you have an exam date?
        </h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <SegmentedOption
            active={!state.hasExamDate}
            onClick={() => onChange({ hasExamDate: false, examDate: '' })}
            label="No exam date"
          />
          <SegmentedOption
            active={state.hasExamDate}
            onClick={() => onChange({ hasExamDate: true })}
            label="Pick date"
          />
        </div>

        {state.hasExamDate && (
          <input
            type="date"
            value={state.examDate}
            min={new Date().toISOString().slice(0, 10)}
            onChange={(e) => onChange({ examDate: e.target.value })}
            aria-label="Exam date"
            style={{
              padding: '9px 12px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--ink-20)',
              background: 'var(--surface-container-high)',
              color: 'var(--on-surface)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--fs-sm)',
              outline: 'none',
              colorScheme: 'light dark',
              transition: 'border-color var(--dur-fast) var(--ease-spring)',
            }}
            onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent-strong)'; }}
            onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--ink-20)'; }}
          />
        )}
      </NMCard>

      {/* Intensity */}
      <NMCard
        style={{
          padding: 'var(--card-pad)',
          background: 'var(--surface-container)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-base)',
            fontWeight: 600,
            color: 'var(--on-surface)',
            margin: 0,
          }}
        >
          Choose intensity
        </h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {INTENSITIES.map(({ id, label, icon }) => (
            <IntensityOption
              key={id}
              id={id}
              label={label}
              icon={icon}
              active={state.intensity === id}
              onClick={() => onChange({ intensity: id })}
            />
          ))}
        </div>
      </NMCard>

      {/* Quality — Standard vs Ultra (Pro-gated) */}
      <NMCard
        style={{
          padding: 'var(--card-pad)',
          background: 'var(--surface-container)',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
        }}
      >
        <h3
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-base)',
            fontWeight: 600,
            color: 'var(--on-surface)',
            margin: 0,
          }}
        >
          Choose quality
        </h3>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <QualityOption
            active={!state.ultra}
            label="Standard"
            icon="auto_awesome"
            onClick={() => onChange({ ultra: false })}
          />
          <QualityOption
            active={canUseUltra && state.ultra}
            label="Ultra"
            icon="bolt"
            locked={!canUseUltra}
            onClick={() => {
              if (canUseUltra) onChange({ ultra: !state.ultra });
            }}
          />
        </div>
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-xs)',
            color: 'var(--on-surface-variant)',
            lineHeight: 1.5,
          }}
        >
          {!canUseUltra
            ? 'Ultra builds sharper quizzes with the premium model — part of Pro.'
            : isAdmin
              ? 'Ultra builds sharper quizzes with the premium model. Unlimited (admin).'
              : ultraUsage && ultraUsage.limit > 0
                ? `Ultra builds sharper quizzes. ${Math.max(0, ultraUsage.limit - ultraUsage.used)} of ${ultraUsage.limit} left this month.`
                : 'Ultra builds sharper quizzes with the premium model. Uses one of your monthly Ultra paths.'}
        </p>
      </NMCard>

      <Button
        variant="primary"
        size="lg"
        fullWidth
        trailingIcon="auto_awesome"
        onClick={onContinue}
        haptic="select"
      >
        Generate
      </Button>
    </StepWrapper>
  );
}

function SegmentedOption({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex: 1,
        minHeight: 44,
        padding: '9px 12px',
        borderRadius: 'var(--radius-md)',
        border: active ? '2px solid var(--accent-strong)' : '1px solid var(--ink-20)',
        background: active ? 'var(--surface-container-high)' : hover ? 'var(--ink-08)' : 'transparent',
        color: active ? 'var(--accent-strong)' : 'var(--on-surface-variant)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--fs-sm)',
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        transition: 'background var(--dur-fast) var(--ease-spring), color var(--dur-fast) var(--ease-spring), border-color var(--dur-fast) var(--ease-spring)',
      }}
    >
      {label}
    </button>
  );
}

function IntensityOption({
  id,
  label,
  icon,
  active,
  onClick,
}: {
  id: string;
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={active}
      style={{
        flex: 1,
        minHeight: 56,
        padding: '10px 8px',
        borderRadius: 'var(--radius-md)',
        border: active ? '2px solid var(--accent-strong)' : '1px solid var(--ink-20)',
        background: active ? 'color-mix(in srgb, var(--accent-strong) 12%, transparent)' : hover ? 'var(--ink-08)' : 'transparent',
        color: active ? 'var(--accent-strong)' : 'var(--on-surface-variant)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--fs-sm)',
        fontWeight: active ? 700 : 500,
        cursor: 'pointer',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        transition: 'background var(--dur-fast) var(--ease-spring), color var(--dur-fast) var(--ease-spring), border-color var(--dur-fast) var(--ease-spring)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span>
      {label}
    </button>
  );
}

function QualityOption({
  active,
  label,
  icon,
  onClick,
  locked,
}: {
  active: boolean;
  label: string;
  icon: string;
  onClick: () => void;
  locked?: boolean;
}) {
  const [hover, setHover] = React.useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={active}
      style={{
        flex: 1,
        minHeight: 56,
        padding: '10px 8px',
        borderRadius: 'var(--radius-md)',
        border: active ? '2px solid var(--accent-strong)' : '1px solid var(--ink-20)',
        background: active ? 'color-mix(in srgb, var(--accent-strong) 12%, transparent)' : hover && !locked ? 'var(--ink-08)' : 'transparent',
        color: active ? 'var(--accent-strong)' : 'var(--on-surface-variant)',
        fontFamily: 'var(--font-sans)',
        fontSize: 'var(--fs-sm)',
        fontWeight: active ? 700 : 500,
        cursor: locked ? 'not-allowed' : 'pointer',
        opacity: locked ? 0.55 : 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        transition: 'background var(--dur-fast) var(--ease-spring), color var(--dur-fast) var(--ease-spring), border-color var(--dur-fast) var(--ease-spring)',
      }}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20 }}>{icon}</span>
        {locked && (
          <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 14, color: 'var(--warning)' }}>
            lock
          </span>
        )}
      </span>
      {label}
    </button>
  );
}

// ── Step 5 — Generate + summary ───────────────────────────────────────────────

interface PlanActivity { kind?: string; completed?: boolean }
interface PlanSlot { id: string; activities?: PlanActivity[] }
interface PlanPhase { slots?: PlanSlot[] }
interface PlanTree { title?: string; phases?: PlanPhase[] }

function countActivities(plan: PlanTree | null): { lessons: number; flashcards: number; quizzes: number } {
  let lessons = 0;
  let flashcards = 0;
  let quizzes = 0;
  for (const phase of plan?.phases ?? []) {
    for (const slot of phase.slots ?? []) {
      for (const act of slot.activities ?? []) {
        if (act.kind === 'theory') lessons += 1;
        else if (act.kind === 'flashcards') flashcards += 1;
        else if (act.kind === 'quiz') quizzes += 1;
      }
    }
  }
  return { lessons, flashcards, quizzes };
}

function Step5Generate({
  state,
  onChange,
  onStartLesson,
  onViewPack,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onStartLesson: (planId: string, firstSlotId: string | null) => void;
  onViewPack: (notebookId: string | null) => void;
}) {
  // POST the path itself. Split out so the initial kickoff AND the in-place
  // "Try again" share it — a retry re-runs ONLY generation, never re-creating
  // the Study Pack or re-posting the exam.
  const runPathGeneration = React.useCallback(
    async (notebookId: string) => {
      // Topics steer generation via an explicit brief directive (no
      // structure-override backend).
      const brief = [
        `Build the path around these topics, in this order: ${state.topics.join('; ')}.`,
        INTENSITY_DIRECTIVE[state.intensity],
      ]
        .filter(Boolean)
        .join(' ');
      try {
        const pathRes = await fetch('/api/learn/paths', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: state.suggestedTitle || 'My Study Pack',
            brief,
            primaryNotebookId: notebookId,
            materialIds: state.materialIds,
            ultra: state.ultra,
            language: 'en',
          }),
        });
        const pathJson = await pathRes.json();
        if (!pathJson?.success || !pathJson.data?.planId) {
          onChange({ generating: false, genError: pathJson?.error || 'Could not start generation.' });
          return;
        }
        onChange({ planId: pathJson.data.planId as string });
      } catch {
        onChange({ generating: false, genError: 'Network error. Please try again.' });
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [state.topics, state.intensity, state.suggestedTitle, state.materialIds, state.ultra],
  );

  // Kick off the create chain. Guarded against PARENT state (not just the
  // per-mount ref) so a back→forward remount can never double-create the pack
  // or re-charge the meter: bail if a plan already exists, and reuse any
  // already-created notebook.
  const startGeneration = React.useCallback(async () => {
    if (state.planId) return; // already generating/done — the stream resumes below
    onChange({ generating: true, genError: null });
    try {
      // 1. Host notebook (the Study Pack). Reuse an existing one — packId mode,
      //    or a pack created on a prior attempt — so we never orphan packs.
      let notebookId = state.packId ?? state.notebookId;
      if (!notebookId) {
        const name = (state.suggestedTitle || 'My Study Pack').slice(0, 100);
        const res = await fetch('/api/notebooks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name }),
        });
        const json = await res.json();
        if (!json?.success || !json.data?.id) {
          onChange({ generating: false, genError: json?.error || 'Could not create your Study Pack.' });
          return;
        }
        notebookId = json.data.id as string;
        onChange({ notebookId });
      }

      // 2. Persist the exam date once (best-effort — never blocks generation).
      //    Lives here in startGeneration (the one-time kickoff), NOT in
      //    runPathGeneration, so the in-place "Try again" never re-posts it —
      //    and it runs for existing-pack mode too, not only freshly-made packs.
      if (state.hasExamDate && state.examDate) {
        try {
          await fetch('/api/user/exams', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: state.suggestedTitle || 'Study Pack exam',
              examDate: new Date(state.examDate + 'T00:00:00').toISOString(),
              notebookId,
            }),
          });
        } catch {
          /* non-fatal */
        }
      }

      // 3. Generate the path.
      await runPathGeneration(notebookId);
    } catch {
      onChange({ generating: false, genError: 'Network error. Please try again.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.planId, state.packId, state.notebookId, state.suggestedTitle, state.hasExamDate, state.examDate, runPathGeneration]);

  // In-place retry after a client-side failure (no plan created yet). Reuses the
  // already-created Study Pack and re-runs only path generation — no duplicate
  // pack, no re-posted exam, no extra back→forward round-trip.
  const retry = React.useCallback(() => {
    const notebookId = state.packId ?? state.notebookId;
    if (notebookId) {
      onChange({ generating: true, genError: null });
      void runPathGeneration(notebookId);
    } else {
      void startGeneration();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.packId, state.notebookId, runPathGeneration, startGeneration]);

  // Stream progress once we have a planId.
  const stream = usePathGenerationStream(state.planId, Boolean(state.planId));
  const isReady = stream.status === 'ready';

  // Once ready, capture the first slot id for the "Start Lesson 1" deep-link.
  React.useEffect(() => {
    if (!isReady || !state.planId) return;
    const plan = stream.plan as PlanTree | null;
    const first = plan?.phases?.[0]?.slots?.[0]?.id ?? null;
    if (first !== state.firstSlotId) onChange({ firstSlotId: first });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, state.planId, stream.plan]);

  const failed = state.genError !== null || stream.status === 'failed';
  const total = stream.progress?.totalSlots ?? 0;
  const done = stream.progress?.completedSlots ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const currentSlot = stream.progress?.currentSlot;
  const currentActivity = stream.progress?.currentActivity;

  const plan = stream.plan as PlanTree | null;
  const counts = countActivities(plan);

  // ── IDLE — ready to build. Nothing runs until the user clicks Build; they can
  //    go back to edit anything first.
  if (!state.generating && !state.planId && !failed) {
    return (
      <StepWrapper>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <Mascot pose="holding-wand" size="lg" idle="float" />
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-2xl)',
            fontWeight: 700,
            color: 'var(--on-surface)',
            margin: 0,
            textAlign: 'center',
            letterSpacing: '-0.02em',
          }}
        >
          Ready to build
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-sm)',
            color: 'var(--on-surface-variant)',
            margin: '4px 0 0',
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          Go back to change anything — Mage only builds when you say so.
        </p>

        <NMCard
          style={{
            padding: 'var(--card-pad)',
            background: 'var(--surface-container)',
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--accent-strong)', flexShrink: 0 }}>
              auto_stories
            </span>
            <h3 style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)', fontWeight: 700, color: 'var(--on-surface)', margin: 0, lineHeight: 1.3 }}>
              {state.suggestedTitle || 'My Study Pack'}
            </h3>
          </div>
          <div style={{ height: 1, background: 'var(--ink-12)' }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 16 }}>
            <StatCell icon="topic" label="Topics" value={String(state.topics.length)} />
            <StatCell
              icon={state.intensity === 'easy' ? 'spa' : state.intensity === 'intense' ? 'local_fire_department' : 'balance'}
              label="Pace"
              value={state.intensity[0].toUpperCase() + state.intensity.slice(1)}
            />
          </div>
          {(state.ultra || state.hasExamDate) && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              {state.ultra && (
                <span style={{ fontSize: 'var(--fs-xs)', fontWeight: 700, color: 'var(--accent-strong)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>bolt</span>
                  Ultra
                </span>
              )}
              {state.hasExamDate && state.examDate && (
                <span style={{ fontSize: 'var(--fs-xs)', color: 'var(--on-surface-variant)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 14 }}>event</span>
                  Exam {new Date(state.examDate + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}
                </span>
              )}
            </div>
          )}
        </NMCard>

        <Button
          variant="primary"
          size="lg"
          fullWidth
          leadingIcon="auto_awesome"
          onClick={() => void startGeneration()}
          haptic="success"
        >
          Build my Study Pack
        </Button>
      </StepWrapper>
    );
  }

  // ── READY ──
  if (isReady) {
    return (
      <StepWrapper>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <Mascot pose="graduation" size="lg" idle="bounce" oneShot="cheer-big" />
        </div>

        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-2xl)',
            fontWeight: 700,
            color: 'var(--on-surface)',
            margin: 0,
            textAlign: 'center',
            letterSpacing: '-0.02em',
          }}
        >
          Your Study Pack is ready
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-sm)',
            color: 'var(--on-surface-variant)',
            margin: '4px 0 0',
            textAlign: 'center',
          }}
        >
          Start your first lesson whenever you&apos;re ready.
        </p>

        <NMCard
          style={{
            padding: 'var(--card-pad)',
            background: 'var(--surface-container)',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 28, color: 'var(--accent-strong)', flexShrink: 0 }}
            >
              auto_stories
            </span>
            <h3
              style={{
                fontFamily: 'var(--font-display)',
                fontSize: 'var(--fs-lg)',
                fontWeight: 700,
                color: 'var(--on-surface)',
                margin: 0,
                lineHeight: 1.3,
              }}
            >
              {plan?.title || state.suggestedTitle || 'My Study Pack'}
            </h3>
          </div>

          <div style={{ height: 1, background: 'var(--ink-12)' }} />

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: 16,
            }}
          >
            <StatCell icon="route" label="Lessons" value={String(counts.lessons)} />
            <StatCell icon="style" label="Flashcards" value={String(counts.flashcards)} />
            <StatCell icon="quiz" label="Quizzes" value={String(counts.quizzes)} />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span
              className="material-symbols-outlined"
              style={{ fontSize: 16, color: 'var(--on-surface-variant)' }}
            >
              {state.intensity === 'easy' ? 'spa' : state.intensity === 'intense' ? 'local_fire_department' : 'balance'}
            </span>
            <span
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: 'var(--fs-sm)',
                color: 'var(--on-surface-variant)',
                textTransform: 'capitalize',
              }}
            >
              {state.intensity} pace
              {state.ultra ? ' · Ultra' : ''}
              {state.examDate ? ` · exam ${new Date(state.examDate + 'T00:00:00').toLocaleDateString('en', { month: 'short', day: 'numeric' })}` : ''}
            </span>
          </div>
        </NMCard>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Button
            variant="primary"
            size="lg"
            fullWidth
            leadingIcon="play_arrow"
            onClick={() => onStartLesson(state.planId!, state.firstSlotId)}
            haptic="success"
          >
            Start Lesson 1
          </Button>
          <Button
            variant="ghost"
            size="md"
            fullWidth
            leadingIcon="folder_open"
            onClick={() => onViewPack(state.notebookId)}
          >
            View Study Pack
          </Button>
        </div>
      </StepWrapper>
    );
  }

  // ── FAILED ──
  if (failed) {
    return (
      <StepWrapper>
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <Mascot pose="thinking" size="lg" idle="none" />
        </div>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'var(--fs-2xl)',
            fontWeight: 700,
            color: 'var(--on-surface)',
            margin: 0,
            textAlign: 'center',
            letterSpacing: '-0.02em',
          }}
        >
          Generation hit a snag
        </h2>
        <p
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-sm)',
            color: 'var(--on-surface-variant)',
            margin: '4px 0 0',
            textAlign: 'center',
            lineHeight: 1.6,
          }}
        >
          {state.genError || stream.errorMessage || 'Something went wrong. Try again.'}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Only retry when no plan was created yet — re-running once a planId
              exists would spawn a duplicate path. */}
          {!state.planId && (
            <Button
              variant="primary"
              size="lg"
              fullWidth
              leadingIcon="refresh"
              onClick={retry}
            >
              Try again
            </Button>
          )}
          {state.notebookId && (
            <Button
              variant="ghost"
              size="md"
              fullWidth
              leadingIcon="folder_open"
              onClick={() => onViewPack(state.notebookId)}
            >
              View Study Pack
            </Button>
          )}
        </div>
      </StepWrapper>
    );
  }

  // ── GENERATING ──
  return (
    <StepWrapper>
      <div style={{ textAlign: 'center', marginBottom: 4 }}>
        <Mascot pose="holding-wand" size="lg" idle="sway" />
      </div>

      <h2
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-2xl)',
          fontWeight: 700,
          color: 'var(--on-surface)',
          margin: 0,
          textAlign: 'center',
          letterSpacing: '-0.02em',
        }}
      >
        Building your path…
      </h2>
      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-sm)',
          color: 'var(--on-surface-variant)',
          margin: '4px 0 0',
          textAlign: 'center',
          lineHeight: 1.6,
        }}
      >
        {currentSlot && currentActivity
          ? `Writing ${currentActivity} for “${currentSlot.title}”…`
          : 'Designing sections and checkpoints…'}
      </p>

      <NMCard
        style={{
          padding: 'var(--card-pad)',
          background: 'var(--surface-container)',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        <ProgressBar value={percent} height={8} />
        <p
          style={{
            margin: 0,
            fontFamily: 'var(--font-sans)',
            fontSize: 'var(--fs-xs)',
            color: 'var(--on-surface-variant)',
            textAlign: 'center',
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {total > 0 ? `${done} / ${total} checkpoints` : 'Designing structure…'}
        </p>
      </NMCard>

      <p
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-xs)',
          color: 'var(--ink-40)',
          textAlign: 'center',
          margin: 0,
          lineHeight: 1.5,
        }}
      >
        You can leave — Mage keeps building in the background.
      </p>
    </StepWrapper>
  );
}

function StatCell({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 4,
        padding: '10px 8px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-container-high)',
      }}
    >
      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent-strong)' }}>
        {icon}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-display)',
          fontSize: 'var(--fs-lg)',
          fontWeight: 700,
          color: 'var(--on-surface)',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
      <span
        style={{
          fontFamily: 'var(--font-sans)',
          fontSize: 'var(--fs-xs)',
          color: 'var(--on-surface-variant)',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ── Step wrapper ──────────────────────────────────────────────────────────────

function StepWrapper({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 20,
        width: '100%',
      }}
    >
      {children}
    </div>
  );
}

// ── Shared style helpers ──────────────────────────────────────────────────────

const iconButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 44,
  height: 44,
  borderRadius: 'var(--radius-md)',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
  color: 'var(--on-surface-variant)',
  transition: 'background var(--dur-fast) var(--ease-spring), color var(--dur-fast) var(--ease-spring)',
};

const linkButtonStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 6,
  background: 'none',
  border: 'none',
  padding: '6px 10px',
  minHeight: 44,
  borderRadius: 'var(--radius-md)',
  cursor: 'pointer',
  color: 'var(--on-surface-variant)',
  fontFamily: 'var(--font-sans)',
  fontSize: 'var(--fs-sm)',
  fontWeight: 500,
  transition: 'color var(--dur-fast) var(--ease-spring), background var(--dur-fast) var(--ease-spring)',
};

function applyHover(e: React.MouseEvent<HTMLButtonElement>, on: boolean) {
  const el = e.currentTarget;
  el.style.background = on ? 'var(--ink-08)' : 'transparent';
  el.style.color = on ? 'var(--on-surface)' : 'var(--on-surface-variant)';
}

function applyFocus(e: React.FocusEvent<HTMLButtonElement>, on: boolean) {
  const el = e.currentTarget;
  el.style.outline = on ? '3px solid var(--accent-strong)' : 'none';
  el.style.outlineOffset = '2px';
}

// ── Animated step container ───────────────────────────────────────────────────

function AnimatedStep({ step, children }: { step: number; children: React.ReactNode }) {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    const prefersReduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReduced) {
      setVisible(true);
      return;
    }

    setVisible(false);
    const t = window.setTimeout(() => setVisible(true), 30);
    return () => clearTimeout(t);
  }, [step]);

  return (
    <div
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(10px)',
        transition: 'opacity var(--dur-normal) var(--ease-spring), transform var(--dur-normal) var(--ease-spring)',
        width: '100%',
      }}
    >
      {children}
    </div>
  );
}

// ── Root wizard component ─────────────────────────────────────────────────────

const DEFAULT_STATE: WizardState = {
  files: [],
  usingSample: false,
  pasteText: '',
  pasteDocId: null,
  showPaste: false,
  youtubeVideos: [],
  materialIds: [],
  packId: null,
  detecting: false,
  detectError: null,
  topics: [],
  addingTopic: '',
  suggestedTitle: '',
  examDate: '',
  intensity: 'balanced',
  hasExamDate: false,
  ultra: false,
  generating: false,
  genError: null,
  planId: null,
  firstSlotId: null,
  notebookId: null,
};

export default function StudyPackNewPage() {
  const router = useRouter();
  const { data: session } = useSession();

  const isAdmin = session?.user?.role === 'admin';
  const canUseUltra = session?.user?.tier === 'PRO' || isAdmin;

  const [step, setStep] = React.useState<Step>(1);
  const [state, setState] = React.useReducer(
    (s: WizardState, patch: Partial<WizardState>) => ({ ...s, ...patch }),
    DEFAULT_STATE,
  );

  // Live Ultra quota for the quality help text (PRO/admin only).
  const [ultraUsage, setUltraUsage] = React.useState<{ used: number; limit: number } | null>(null);
  React.useEffect(() => {
    if (!canUseUltra) return;
    let cancelled = false;
    fetch('/api/user/usage')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        const features = j.data?.features as
          | Array<{ featureType: string; used: number; limit: number }>
          | undefined;
        const entry = features?.find((f) => f.featureType === 'ultra_path');
        if (entry) setUltraUsage({ used: entry.used, limit: entry.limit });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [canUseUltra]);

  // Existing-pack mode (?packId): read from window (not useSearchParams, which
  // bails the page out of static rendering). When present, skip Step 1's
  // upload, load the pack's material, and jump to topic detection (Step 2).
  const initedRef = React.useRef(false);
  React.useEffect(() => {
    if (initedRef.current || typeof window === 'undefined') return;
    initedRef.current = true;
    const packId = new URLSearchParams(window.location.search).get('packId');
    if (!packId) return;
    (async () => {
      try {
        const res = await fetch(`/api/notebooks/${encodeURIComponent(packId)}/inventory`);
        const json = await res.json();
        const inv = json?.data as
          | {
              pages?: { id: string }[];
              flashcardSets?: { id: string }[];
              quizSets?: { id: string }[];
              documents?: { id: string }[];
            }
          | undefined;
        const ids = json?.success && inv
          ? [
              ...(inv.pages ?? []),
              ...(inv.flashcardSets ?? []),
              ...(inv.quizSets ?? []),
              ...(inv.documents ?? []),
            ].map((m) => m.id)
          : [];
        setState({ packId, materialIds: ids });
        setStep(2);
      } catch {
        // Fall back to the normal upload flow if the pack can't be loaded.
        setState({ packId });
      }
    })();
  }, []);

  function goBack() {
    // On Step 5, Back is allowed until a build starts — then it's locked so a
    // back→forward remount can't double-create the pack / re-charge generation.
    if (step >= TOTAL_STEPS && (state.generating || state.planId !== null)) return;
    if (step === 1) {
      router.push('/study-packs');
    } else if (step === 2 && state.packId) {
      // Existing-pack mode has no upload step to return to.
      router.push(`/study-packs/${state.packId}`);
    } else {
      setStep((prev) => (prev - 1) as Step);
    }
  }

  function goClose() {
    router.push('/study-packs');
  }

  function advance() {
    setStep((prev) => Math.min(prev + 1, TOTAL_STEPS) as Step);
  }

  function renderStep() {
    switch (step) {
      case 1:
        return (
          <Step1Upload
            state={state}
            onChange={(p) => setState(p)}
            onContinue={advance}
          />
        );
      case 2:
        return (
          <Step2Processing
            state={state}
            onChange={(p) => setState(p)}
            onDone={advance}
          />
        );
      case 3:
        return (
          <Step3Topics
            state={state}
            onChange={(p) => setState(p)}
            onContinue={advance}
          />
        );
      case 4:
        return (
          <Step4Goal
            state={state}
            onChange={(p) => setState(p)}
            onContinue={advance}
            canUseUltra={canUseUltra}
            isAdmin={isAdmin}
            ultraUsage={ultraUsage}
          />
        );
      case 5:
        return (
          <Step5Generate
            state={state}
            onChange={(p) => setState(p)}
            onStartLesson={(planId, firstSlotId) =>
              router.push(
                firstSlotId
                  ? `/learn/paths/${encodeURIComponent(planId)}?slot=${encodeURIComponent(firstSlotId)}`
                  : `/learn/paths/${encodeURIComponent(planId)}`,
              )
            }
            onViewPack={(notebookId) =>
              router.push(notebookId ? `/study-packs/${encodeURIComponent(notebookId)}` : '/study-packs')
            }
          />
        );
    }
  }

  return (
    <div
      className="nm-rework"
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--background)',
        overflow: 'hidden',
      }}
    >
      {/* Progress header */}
      <WizardHeader
        step={step}
        onBack={goBack}
        onClose={goClose}
        hideBack={step >= TOTAL_STEPS && (state.generating || state.planId !== null)}
      />

      {/* Scrollable step body */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          padding: '24px 20px 40px',
        }}
      >
        <div
          style={{
            width: '100%',
            maxWidth: 640,
          }}
        >
          <AnimatedStep step={step}>
            {renderStep()}
          </AnimatedStep>
        </div>
      </div>
    </div>
  );
}
