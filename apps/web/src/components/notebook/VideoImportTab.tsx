/* Hallmark · component: video-import-tab · genre: modern-minimal · theme: project (Neon Scholar tokens)
 * states: default · hover · focus · active · disabled · loading · error · success
 * contrast: pass (light + dark via semantic tokens)
 */
'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { useImportJobStream } from '@/hooks/useImportJobStream';
import { VIDEO_IMPORT_MAX_BYTES } from '@/lib/file-validation';
import { isVideoJobStale } from '@/lib/video-import/staleness';
import VideoInputMask, {
  captionsUnavailableError,
  type VideoUrlConfirm,
} from '@/components/video/VideoInputMask';
import VideoImportMascot from '@/components/video/VideoImportMascot';
import ImportSectionPicker, {
  type DraftSection,
  type SectionOption,
} from './ImportSectionPicker';

// Video tab of ImportNotebookDialog (Lane 2 — native video notes). PRO-only:
// FREE users see a PRO upsell and cannot submit. A single job per import lands
// one Page of chaptered, timestamped notes.
//
// Flow: pick → preparing (read duration + upload + POST, dialog locked)
// → tracking (one SSE stream, cancel/retry/stale escape hatch). On mount the
// pick phase re-attaches to the most recent unfinished job (GET) so a reload
// mid-import resumes tracking.

type Phase = 'pick' | 'preparing' | 'tracking';

const PROGRESS_URL = (notebookId: string, jobId: string) =>
  `/api/notebooks/${encodeURIComponent(notebookId)}/video-import/${encodeURIComponent(jobId)}/progress`;

/** Hard cap mirrored from VIDEO_INGEST_MAX_DURATION_SEC (60 min). */
const MAX_DURATION_SEC = 3600;

/** Page title from the file name, extension stripped. */
function stripExtension(fileName: string): string {
  const withoutExt = fileName.replace(/\.[^./\\]+$/, '').trim();
  return withoutExt.length > 0 ? withoutExt : 'Video notes';
}

interface VideoImportTabProps {
  notebookId: string;
  onImported: () => void;
  onClose: () => void;
  /** Locks the parent dialog's dismiss controls while client-side
   *  metadata-read / upload work would be lost by closing. */
  onLockChange: (locked: boolean) => void;
}

interface UsageEntry {
  used: number;
  limit: number;
}

interface ActiveJob {
  jobId: string;
  fileName: string;
}

export default function VideoImportTab({
  notebookId,
  onImported,
  onClose,
  onLockChange,
}: VideoImportTabProps) {
  const { data: session } = useSession();
  const { upload } = useDirectUpload();

  // Instant client-side tier read; the server gate is authoritative. Admins
  // bypass like every other PRO surface (mirrors the Study Pack creation wizard).
  const isAdmin = session?.user?.role === 'admin';
  const isPro = session?.user?.tier === 'PRO' || isAdmin;

  const [phase, setPhase] = useState<Phase>('pick');
  const [error, setError] = useState('');
  const [prepLabel, setPrepLabel] = useState('');
  const [activeJob, setActiveJob] = useState<ActiveJob | null>(null);
  // Bumped on retry to remount the tracker — the re-queued job keeps the same
  // id, so the SSE stream must be re-opened by a fresh mount to pick it up.
  const [trackerGeneration, setTrackerGeneration] = useState(0);

  // Remaining video_ingest balance (minutes). null until the usage probe
  // resolves; limit === 0 means FREE / hard-gated.
  const [usage, setUsage] = useState<UsageEntry | null>(null);

  // Section selection — same draft model as PdfImportTab.
  const [sections, setSections] = useState<SectionOption[] | null>(null);
  const [sectionsError, setSectionsError] = useState('');
  const [sectionsAttempt, setSectionsAttempt] = useState(0);
  const [drafts, setDrafts] = useState<DraftSection[]>([]);
  const [sectionId, setSectionId] = useState('');
  const idCounter = useRef(0);

  // Closing mid-prep would abandon a file still uploading in this tab. The
  // queued job runs server-side, so tracking is safe to dismiss.
  useEffect(() => {
    onLockChange(phase === 'preparing');
    return () => onLockChange(false);
  }, [phase, onLockChange]);

  // Re-attach: on mount, resume tracking the most recent unfinished job so a
  // reload mid-import picks up where it left off (mirrors PdfImportTab GET).
  useEffect(() => {
    if (!isPro) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/notebooks/${encodeURIComponent(notebookId)}/video-import`,
        );
        const json = await res.json().catch(() => null);
        if (cancelled || !json?.success || !Array.isArray(json.data)) return;
        const live = json.data.find(
          (j: { status: string }) => j.status === 'queued' || j.status === 'processing',
        );
        if (live) {
          setActiveJob({ jobId: live.id, fileName: live.fileName ?? 'Video' });
          setPhase('tracking');
        }
      } catch {
        /* soft-fail — the pick form still renders */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookId, isPro]);

  // Usage probe — drives the remaining-minutes estimate. Sourced from the
  // existing /api/user/usage endpoint (it already returns every feature).
  const loadUsage = useCallback(() => {
    let cancelled = false;
    fetch('/api/user/usage')
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        const features = j.data?.features as
          | Array<{ featureType: string; used: number; limit: number }>
          | undefined;
        const entry = features?.find((f) => f.featureType === 'video_ingest');
        if (entry) setUsage({ used: entry.used, limit: entry.limit });
      })
      .catch(() => {
        /* soft-fail — the form still renders without the balance line */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isPro) return;
    return loadUsage();
  }, [isPro, loadUsage]);

  // Section list for the destination picker.
  useEffect(() => {
    if (!isPro) return;
    let cancelled = false;
    setSectionsError('');
    (async () => {
      try {
        const res = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/sections`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && Array.isArray(json.data)) {
          setSections(
            json.data.map((s: { id: string; title: string; parentId?: string | null }) => ({
              id: s.id,
              title: s.title,
              parentId: s.parentId ?? null,
            })),
          );
        } else {
          setSectionsError('Could not load this notebook’s sections.');
        }
      } catch {
        if (!cancelled) setSectionsError('Could not load this notebook’s sections.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [notebookId, sectionsAttempt, isPro]);

  // A notebook with no sections still needs a destination — seed a draft.
  useEffect(() => {
    if (sections && sections.length === 0) {
      setDrafts((prev) => (prev.length > 0 ? prev : [{ id: 'draft:imports', title: 'Imports' }]));
    }
  }, [sections]);

  const defaultSectionId =
    sections && sections.length > 0 ? sections[0].id : (drafts[0]?.id ?? '');

  useEffect(() => {
    if (defaultSectionId && !sectionId) setSectionId(defaultSectionId);
  }, [defaultSectionId, sectionId]);

  const createDraft = useCallback((title: string): string => {
    idCounter.current += 1;
    const id = `draft:${idCounter.current}`;
    setDrafts((prev) => [...prev, { id, title }]);
    return id;
  }, []);

  const remaining =
    usage && usage.limit !== -1 ? Math.max(0, usage.limit - usage.used) : null;

  // Resolve the chosen section (creating a draft for real) just before submit,
  // so a failed import leaves the picker consistent.
  const resolveSectionId = useCallback(async (): Promise<string> => {
    const chosen = sectionId || defaultSectionId;
    if (!chosen) throw new Error('Pick a section for this video and try again.');
    if (!chosen.startsWith('draft:')) return chosen;
    const draft = drafts.find((d) => d.id === chosen);
    const title = draft?.title ?? 'Imports';
    setPrepLabel(`Creating section “${title}”…`);
    const res = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/sections`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    const json = await res.json().catch(() => null);
    if (!json?.success || !json?.data?.id) {
      throw new Error(json?.error ?? `Couldn’t create the section “${title}”.`);
    }
    const realId = json.data.id as string;
    setSections((prev) => [...(prev ?? []), { id: realId, title, parentId: null }]);
    setDrafts((prev) => prev.filter((d) => d.id !== chosen));
    setSectionId(realId);
    return realId;
  }, [sectionId, defaultSectionId, drafts, notebookId]);

  // POST the job, hand off to tracking. Shared tail for both source modes.
  const submitJob = useCallback(
    async (body: {
      fileName: string;
      durationSec: number;
      videoPath?: string;
      videoUrl?: string;
      pageTitle: string;
    }) => {
      const resolvedSectionId = await resolveSectionId();
      setPrepLabel('Starting import…');
      const res = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/video-import`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sectionId: resolvedSectionId, ...body }),
      });
      const json = (await res.json().catch(() => null)) as {
        success?: boolean;
        error?: string;
        data?: { jobId?: string };
      } | null;
      if (!res.ok || !json?.success || !json.data?.jobId) {
        throw new Error(json?.error ?? 'We couldn’t start the import. Please try again.');
      }
      setActiveJob({ jobId: json.data.jobId, fileName: body.fileName });
      setPhase('tracking');
    },
    [notebookId, resolveSectionId],
  );

  // ── File-upload lane ──────────────────────────────────────────────────
  const onFilePicked = useCallback(
    async (file: File) => {
      setError('');
      setPhase('preparing');
      try {
        setPrepLabel('Reading video length…');
        let durationSec: number;
        try {
          durationSec = await readVideoDuration(file);
        } catch {
          throw new Error('We couldn’t read this video. Try a different file.');
        }
        if (!Number.isFinite(durationSec) || durationSec <= 0) {
          throw new Error('We couldn’t read this video. Try a different file.');
        }
        if (durationSec > MAX_DURATION_SEC) {
          throw new Error(`This video is too long — ${Math.floor(MAX_DURATION_SEC / 60)} minutes max.`);
        }

        setPrepLabel('Uploading your video…');
        const { storagePath } = await upload(file, 'video-import', { notebookId });

        await submitJob({
          fileName: file.name,
          durationSec: Math.floor(durationSec),
          videoPath: storagePath,
          pageTitle: stripExtension(file.name),
        });
      } catch (err) {
        setPhase('pick');
        setError(err instanceof Error ? err.message : 'Import failed. Please try again.');
      } finally {
        setPrepLabel('');
      }
    },
    [notebookId, upload, submitJob],
  );

  // ── YouTube URL lane ──────────────────────────────────────────────────
  // The mask owns the confirm UX; throwing surfaces an in-card error. We
  // resolve the duration via the IFrame API, then POST with `videoUrl`.
  const onConfirmUrl = useCallback(
    async (confirm: VideoUrlConfirm) => {
      let durationSec: number;
      try {
        durationSec = await readYouTubeDuration(confirm.videoId);
      } catch {
        // Embedding blocked or the player errored — surface in-card.
        throw captionsUnavailableError();
      }
      if (!Number.isFinite(durationSec) || durationSec <= 0) {
        throw captionsUnavailableError();
      }
      if (durationSec > MAX_DURATION_SEC) {
        // The mask only renders a generic or upsell in-card error; surface the
        // specific "too long" copy in the tab banner instead and let the mask
        // reset by resolving (not throwing).
        setError(`This video is too long — ${Math.floor(MAX_DURATION_SEC / 60)} minutes max.`);
        return;
      }

      // The mask is mid-confirm; move the tab into preparing so the section
      // resolve + POST has a visible phase.
      setError('');
      setPhase('preparing');
      try {
        await submitJob({
          fileName: (confirm.title ?? 'YouTube video').slice(0, 200),
          durationSec: Math.floor(durationSec),
          videoUrl: confirm.url,
          pageTitle: confirm.title?.slice(0, 200) || 'Video notes',
        });
      } catch (err) {
        setPhase('pick');
        setError(err instanceof Error ? err.message : 'Import failed. Please try again.');
      } finally {
        setPrepLabel('');
      }
    },
    [submitJob],
  );

  // ── Render ──

  if (!isPro) {
    return <ProUpsell />;
  }

  if (sectionsError) {
    return (
      <div style={centeredCol}>
        <p style={{ margin: 0, fontSize: '13px', color: 'var(--error)', textAlign: 'center' }}>
          {sectionsError}
        </p>
        <button
          type="button"
          onClick={() => setSectionsAttempt((n) => n + 1)}
          className="nm-vidtab-btn nm-vidtab-btn--ghost"
        >
          Retry
        </button>
        <VideoTabStyles />
      </div>
    );
  }

  if (phase === 'preparing') {
    return (
      <div style={{ ...centeredCol, padding: '32px 0' }}>
        <VideoImportMascot />
        <p
          aria-live="polite"
          style={{ margin: 0, fontSize: '13.5px', color: 'var(--on-surface-variant)', textAlign: 'center' }}
        >
          {prepLabel || 'Preparing your import…'}
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--outline)', textAlign: 'center' }}>
          Keep this dialog open while your video uploads.
        </p>
      </div>
    );
  }

  if (phase === 'tracking' && activeJob) {
    return (
      <VideoJobTracker
        key={`${activeJob.jobId}:${trackerGeneration}`}
        notebookId={notebookId}
        job={activeJob}
        onImported={onImported}
        onClose={onClose}
        onRetried={() => setTrackerGeneration((g) => g + 1)}
        onBalanceChanged={loadUsage}
      />
    );
  }

  // phase === 'pick'
  const sectionsReady = sections !== null && defaultSectionId !== '';

  return (
    <div style={{ padding: '8px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '10px',
            background: 'rgba(140,82,255,0.1)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#c4a9ff' }} aria-hidden>
            smart_display
          </span>
        </div>
        <p style={{ fontSize: '14px', fontWeight: 600, color: 'var(--on-surface)', margin: 0 }}>
          Video notes
        </p>
      </div>

      <p style={{ fontSize: '12px', color: 'var(--ink-40)', margin: '0 0 14px', lineHeight: 1.5 }}>
        Paste a YouTube link or upload a video — we’ll turn it into one page of chaptered,
        timestamped notes.
      </p>

      <VideoInputMask
        onConfirmUrl={onConfirmUrl}
        allowFile
        onFilePicked={onFilePicked}
        maxFileBytes={VIDEO_IMPORT_MAX_BYTES}
        placeholder="Paste a YouTube link"
        fileEstimate={
          <EstimateNote remaining={remaining} limit={usage?.limit ?? null} />
        }
      />

      {sectionsReady ? (
        <div style={{ marginTop: '14px' }}>
          <label
            style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: 600,
              color: 'var(--on-surface-variant)',
              marginBottom: '6px',
            }}
          >
            Section
          </label>
          <ImportSectionPicker
            sections={sections}
            drafts={drafts}
            value={sectionId || defaultSectionId}
            onChange={setSectionId}
            onCreateDraft={createDraft}
            ariaLabel="Section for the imported video"
          />
        </div>
      ) : (
        <p style={{ margin: '14px 0 0', fontSize: '12px', color: 'var(--on-surface-variant)' }}>
          Loading sections…
        </p>
      )}

      <ResolutionNote />

      {error && (
        <p
          role="alert"
          style={{
            margin: '14px 0 0',
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: 'rgba(253,111,133,0.12)',
            color: 'var(--error)',
            fontSize: '12.5px',
            lineHeight: 1.5,
          }}
        >
          {error}
        </p>
      )}

      <VideoTabStyles />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Estimated minutes + remaining balance — rendered in the mask's estimate
// slot. Minutes math reuses the server's `minutesForDuration` once a file is
// picked; before a pick we show the standing balance.
// ─────────────────────────────────────────────────────────────────────

function EstimateNote({ remaining, limit }: { remaining: number | null; limit: number | null }) {
  if (limit === -1) return null;
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        fontSize: '12px',
        color: 'var(--on-surface-variant)',
        paddingLeft: '4px',
      }}
    >
      <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '15px' }}>
        schedule
      </span>
      {remaining === null ? (
        <span>Metered in minutes.</span>
      ) : (
        <span>
          {remaining} {remaining === 1 ? 'minute' : 'minutes'} left this month
        </span>
      )}
    </div>
  );
}

// Resolution note replaces PDF's fast-mode toggle — V1 is always LOW res.
function ResolutionNote() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginTop: '14px',
        padding: '10px 12px',
        borderRadius: '10px',
        border: '1px solid rgba(174,137,255,0.20)',
        background: 'rgba(140,82,255,0.06)',
      }}
    >
      <span
        className="material-symbols-outlined"
        aria-hidden
        style={{ fontSize: '18px', color: 'rgba(196,169,255,0.6)', flexShrink: 0 }}
      >
        hd
      </span>
      <span style={{ fontSize: '12px', color: 'var(--on-surface-variant)', lineHeight: 1.45 }}>
        Standard resolution. Charged in minutes of video.
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// PRO upsell — shown to FREE users. Intentional surface, not a dead form.
// ─────────────────────────────────────────────────────────────────────

function ProUpsell() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '14px',
        padding: '36px 0 28px',
        textAlign: 'center',
      }}
    >
      <div
        style={{
          width: '56px',
          height: '56px',
          borderRadius: '14px',
          background: 'rgba(140,82,255,0.12)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <span className="material-symbols-outlined filled" style={{ fontSize: 28, color: '#c4a9ff' }} aria-hidden>
          workspace_premium
        </span>
      </div>
      <div style={{ maxWidth: '320px' }}>
        <p style={{ fontSize: '15px', fontWeight: 700, color: 'var(--on-surface)', margin: '0 0 6px' }}>
          Video notes are a PRO feature.
        </p>
        <p style={{ fontSize: '12.5px', color: 'var(--on-surface-variant)', margin: 0, lineHeight: 1.5 }}>
          Turn any video into chaptered, timestamped study notes. Upgrade to PRO to unlock it.
        </p>
      </div>
      <Link href="/pricing" className="nm-vidtab-btn nm-vidtab-btn--primary" style={{ textDecoration: 'none' }}>
        <span className="material-symbols-outlined" aria-hidden style={{ fontSize: 16 }}>
          bolt
        </span>
        See PRO plans
      </Link>
      <VideoTabStyles />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Single-job tracker — streams one video job over SSE, with cancel, the
// stale escape hatch, retry, and an Open-page link on success.
// ─────────────────────────────────────────────────────────────────────

function VideoJobTracker({
  notebookId,
  job,
  onImported,
  onClose,
  onRetried,
  onBalanceChanged,
}: {
  notebookId: string;
  job: ActiveJob;
  onImported: () => void;
  onClose: () => void;
  onRetried: () => void;
  onBalanceChanged: () => void;
}) {
  const stream = useImportJobStream(
    notebookId,
    job.jobId,
    true,
    PROGRESS_URL(notebookId, job.jobId),
  );
  const [busy, setBusy] = useState<null | 'cancel' | 'retry'>(null);
  const [actionError, setActionError] = useState('');
  const importedFiredRef = useRef(false);

  const isReady = stream.status === 'ready';
  const isFailed = stream.status === 'failed';
  const isLive = !isReady && !isFailed;

  useEffect(() => {
    if (isReady && !importedFiredRef.current) {
      importedFiredRef.current = true;
      onImported();
    }
  }, [isReady, onImported]);

  // Client-side staleness: a job that has streamed `queued`/`processing` but
  // whose server-side updatedAt is past the TTL surfaces the retry/cancel
  // affordance. The SSE route also self-fails stale jobs, so this is the
  // belt-and-braces local hint while still streaming. Reset is a render-phase
  // adjustment keyed on the job id (a retry remounts the stream and re-polls),
  // not a synchronous setState in the effect body.
  const [stale, setStale] = useState(false);
  const [staleKey, setStaleKey] = useState(job.jobId);
  if (staleKey !== job.jobId) {
    setStaleKey(job.jobId);
    setStale(false);
  }
  useEffect(() => {
    if (!isLive) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/notebooks/${encodeURIComponent(notebookId)}/video-import`);
        const json = await res.json().catch(() => null);
        if (cancelled || !json?.success || !Array.isArray(json.data)) return;
        const row = json.data.find((j: { id: string }) => j.id === job.jobId) as
          | { status: string; updatedAt: string }
          | undefined;
        if (row && isVideoJobStale(row.status, new Date(row.updatedAt))) setStale(true);
      } catch {
        /* ignore */
      }
    };
    const interval = setInterval(poll, 30_000);
    void poll();
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [isLive, notebookId, job.jobId]);

  const handleCancel = useCallback(async () => {
    setBusy('cancel');
    setActionError('');
    try {
      const res = await fetch(
        `/api/notebooks/${encodeURIComponent(notebookId)}/video-import/${encodeURIComponent(job.jobId)}/cancel`,
        { method: 'POST' },
      );
      if (res.ok) {
        onBalanceChanged();
        onClose();
        return;
      }
      setActionError('Couldn’t cancel. Please try again.');
    } catch {
      setActionError('Couldn’t cancel. Please try again.');
    }
    setBusy(null);
  }, [notebookId, job.jobId, onBalanceChanged, onClose]);

  const handleRetry = useCallback(async () => {
    setBusy('retry');
    setActionError('');
    try {
      const res = await fetch(
        `/api/notebooks/${encodeURIComponent(notebookId)}/video-import/${encodeURIComponent(job.jobId)}/retry`,
        { method: 'POST' },
      );
      const json = await res.json().catch(() => null);
      if (res.ok && json?.success) {
        importedFiredRef.current = false;
        setStale(false);
        onBalanceChanged();
        onRetried();
        return;
      }
      setActionError(json?.error ?? 'Couldn’t retry. Please try again.');
    } catch {
      setActionError('Couldn’t retry. Please try again.');
    }
    setBusy(null);
  }, [notebookId, job.jobId, onBalanceChanged, onRetried]);

  const phaseMessage = stream.progress?.message || stream.progress?.phase || 'Reading your video…';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '4px 0' }}>
      <header style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 700, color: 'var(--on-surface)' }}>
          Generating video notes
        </h3>
        <p style={{ margin: 0, fontSize: '12px', color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
          This keeps running in the background if you close this dialog.
        </p>
      </header>

      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <VideoImportMascot state={isReady ? 'ready' : isFailed ? 'failed' : 'working'} />
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          padding: '12px',
          borderRadius: 'var(--radius-lg)',
          background: 'var(--surface-container-high)',
          border: '1px solid var(--outline-variant)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            className="material-symbols-outlined"
            aria-hidden
            style={{
              fontSize: '18px',
              flexShrink: 0,
              color: isReady ? '#4ade80' : isFailed ? 'var(--error)' : 'var(--primary)',
              animation: isLive ? 'vidSpin 1s linear infinite' : undefined,
            }}
          >
            {isReady ? 'check_circle' : isFailed ? 'error' : 'progress_activity'}
          </span>
          <span
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: '12.5px',
              fontWeight: 600,
              color: 'var(--on-surface)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {job.fileName}
          </span>
        </div>

        {isLive && (
          <p aria-live="polite" style={{ margin: 0, fontSize: '12px', color: 'var(--on-surface-variant)', lineHeight: 1.45 }}>
            {phaseMessage}
          </p>
        )}

        {isFailed && (
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--error)', lineHeight: 1.45 }}>
            {stream.errorMessage ?? 'Import failed.'}
          </p>
        )}

        {stale && isLive && (
          <p style={{ margin: 0, fontSize: '12px', color: 'var(--on-surface-variant)', lineHeight: 1.45 }}>
            This may have stalled — retry or cancel.
          </p>
        )}

        {isReady && stream.resultPageId && (
          <Link
            href={`/notebooks/${encodeURIComponent(notebookId)}/pages/${encodeURIComponent(stream.resultPageId)}`}
            className="nm-vidtab-openlink"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              alignSelf: 'flex-start',
              fontSize: '12px',
              fontWeight: 700,
              color: 'var(--primary)',
              textDecoration: 'none',
            }}
          >
            Open page
            <span className="material-symbols-outlined" aria-hidden style={{ fontSize: '15px' }}>
              arrow_forward
            </span>
          </Link>
        )}
      </div>

      {actionError && (
        <p role="alert" style={{ margin: 0, fontSize: '12px', color: 'var(--error)', lineHeight: 1.5 }}>
          {actionError}
        </p>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
        {(isFailed || stale) && (
          <button
            type="button"
            onClick={handleRetry}
            disabled={busy !== null}
            className="nm-vidtab-btn nm-vidtab-btn--ghost"
          >
            {busy === 'retry' ? 'Retrying…' : 'Try again'}
          </button>
        )}
        {isLive && (
          <button
            type="button"
            onClick={handleCancel}
            disabled={busy !== null}
            className="nm-vidtab-btn nm-vidtab-btn--ghost"
          >
            {busy === 'cancel' ? 'Cancelling…' : 'Cancel'}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="nm-vidtab-btn nm-vidtab-btn--primary"
        >
          {isReady || isFailed ? 'Done' : 'Close'}
        </button>
      </div>

      <style>{`@keyframes vidSpin { to { transform: rotate(360deg); } }`}</style>
      <VideoTabStyles />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Client-side duration readers.
// ─────────────────────────────────────────────────────────────────────

/** Read an uploaded video's duration via a temporary <video> element. */
function readVideoDuration(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const el = document.createElement('video');
    el.preload = 'metadata';
    const cleanup = () => {
      el.removeAttribute('src');
      el.load();
      URL.revokeObjectURL(url);
    };
    el.onloadedmetadata = () => {
      const d = el.duration;
      cleanup();
      resolve(d);
    };
    el.onerror = () => {
      cleanup();
      reject(new Error('metadata error'));
    };
    el.src = url;
  });
}

// YouTube IFrame Player API — the no-API-key way to read a video's duration
// client-side. A hidden player loads off-screen; onReady → getDuration().
// onError (101/150 = embedding disabled) rejects so the caller surfaces a
// terse inline message rather than guessing. The server reconciles any
// under-report post-hoc, so this client value is acceptable by design.

interface YTPlayer {
  getDuration: () => number;
  destroy: () => void;
}

interface YTNamespace {
  Player: new (
    el: HTMLElement,
    opts: {
      videoId: string;
      height?: string | number;
      width?: string | number;
      playerVars?: Record<string, number>;
      events?: {
        onReady?: (e: { target: YTPlayer }) => void;
        onError?: (e: { data: number }) => void;
      };
    },
  ) => YTPlayer;
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let ytApiPromise: Promise<YTNamespace> | null = null;

function loadYouTubeApi(): Promise<YTNamespace> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'));
  if (window.YT?.Player) return Promise.resolve(window.YT);
  if (ytApiPromise) return ytApiPromise;
  ytApiPromise = new Promise<YTNamespace>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('YT API load timeout')), 10_000);
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prev?.();
      clearTimeout(timeout);
      if (window.YT?.Player) resolve(window.YT);
      else reject(new Error('YT API missing after ready'));
    };
    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.onerror = () => {
      clearTimeout(timeout);
      reject(new Error('YT API script failed'));
    };
    document.head.appendChild(tag);
  });
  return ytApiPromise;
}

function readYouTubeDuration(videoId: string): Promise<number> {
  return new Promise((resolve, reject) => {
    loadYouTubeApi()
      .then((YT) => {
        const host = document.createElement('div');
        host.style.position = 'fixed';
        host.style.left = '-9999px';
        host.style.top = '0';
        host.style.width = '1px';
        host.style.height = '1px';
        document.body.appendChild(host);

        let settled = false;
        let player: YTPlayer | null = null;
        const finish = (fn: () => void) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          try {
            player?.destroy();
          } catch {
            /* ignore */
          }
          host.remove();
          fn();
        };
        const timeout = setTimeout(
          () => finish(() => reject(new Error('YT duration timeout'))),
          12_000,
        );

        player = new YT.Player(host, {
          videoId,
          height: '1',
          width: '1',
          playerVars: { autoplay: 0, controls: 0 },
          events: {
            onReady: (e) => {
              const d = e.target.getDuration();
              finish(() => resolve(d));
            },
            onError: (e) => finish(() => reject(new Error(`YT error ${e.data}`))),
          },
        });
      })
      .catch(reject);
  });
}

// ─────────────────────────────────────────────────────────────────────
// Shared styles + layout tokens.
// ─────────────────────────────────────────────────────────────────────

const centeredCol: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '12px',
  padding: '32px 0',
};

function VideoTabStyles() {
  return (
    <style>{`
      .nm-vidtab-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 7px;
        padding: 10px 18px;
        border-radius: var(--radius-full);
        font-size: 13px;
        font-weight: 700;
        font-family: inherit;
        line-height: 1;
        cursor: pointer;
        border: 1px solid transparent;
        transition: transform 0.16s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.16s ease;
      }
      .nm-vidtab-btn:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .nm-vidtab-btn:active:not(:disabled) {
        transform: scale(0.97);
      }
      .nm-vidtab-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .nm-vidtab-btn--primary {
        background: var(--primary);
        color: var(--on-primary);
      }
      .nm-vidtab-btn--primary:hover:not(:disabled) {
        background: var(--primary-dim);
      }
      .nm-vidtab-btn--ghost {
        background: transparent;
        color: var(--on-surface-variant);
        border-color: var(--outline-variant);
      }
      .nm-vidtab-btn--ghost:hover:not(:disabled) {
        background: var(--surface-container-high);
        color: var(--on-surface);
      }
      .nm-vidtab-openlink:focus-visible {
        outline: 2px solid var(--primary);
        outline-offset: 2px;
      }
      .nm-vidtab-openlink:hover {
        text-decoration: underline;
      }
      @media (prefers-reduced-motion: reduce) {
        .nm-vidtab-btn { transition-duration: 0.05s; }
      }
    `}</style>
  );
}
