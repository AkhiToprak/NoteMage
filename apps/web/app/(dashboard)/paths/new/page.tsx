'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useSession } from 'next-auth/react';
import AppShell from '@/components/app/AppShell';
import ui from '@/components/app/ui.module.css';
import s from './Wizard.module.css';
import { Mascot } from '@/components/mascot/Mascot';
import { useDirectUpload } from '@/hooks/useDirectUpload';
import { usePathGenerationStream } from '@/hooks/usePathGenerationStream';
import VideoMaterialPicker, { type AddedVideo } from '@/components/learn/VideoMaterialPicker';
import { readYouTubeDuration } from '@/lib/youtube-duration';

// ── The redesigned create-path wizard (Figma CP01–06 / WCP01–06). Six screens:
// 1 Add material · 2 Set your goal · 3 Tune the pace · 4 Analyzing · 5 Review ·
// 6 Ready. Wired to the SAME real backend the previous wizard used:
// /api/learn/uploads(+inbox), /api/learn/documents/youtube, video-import,
// /api/learn/paths/detect-topics (Stage A → topics), /api/learn/paths (create),
// and the /generation SSE stream. The Figma sample data is never wired — every
// topic / stat / node comes from the learner's own material.

type Step = 1 | 2 | 3 | 4 | 5 | 6;
const INPUT_STEPS = 3; // steps 1–3 carry the "Step N of 3" indicator

type Goal = 'understand' | 'exam' | 'review' | 'memorize';
type Level = 'beginner' | 'intermediate' | 'advanced';
type Intensity = 'easy' | 'balanced' | 'intense';
type SessionLen = 10 | 15 | 25 | 45;

interface PendingFile {
  key: string;
  file: File;
  docId?: string;
}

interface WizardState {
  // Step 1 — material.
  files: PendingFile[];
  pasteText: string;
  pasteDocId: string | null;
  youtubeVideos: AddedVideo[];
  materialIds: string[];
  coreKey: string | null; // which material leads the path
  packId: string | null;
  // Step 2 — goal.
  pathName: string;
  nameTouched: boolean;
  subject: string;
  goal: Goal;
  level: Level;
  examDate: string;
  hasExamDate: boolean;
  // Step 3 — pace.
  sessionLen: SessionLen;
  intensity: Intensity;
  ultra: boolean;
  focus: string;
  // Step 4/5 — detect + review.
  detecting: boolean;
  detectError: string | null;
  topics: string[];
  starred: string[];
  suggestedTitle: string;
  // Step 6 — build.
  genError: string | null;
  planId: string | null;
  firstSlotId: string | null;
  notebookId: string | null;
}

// ── generation directives — fold the new inputs into the `brief` so they
//    genuinely steer Stage A + Stage B (no schema change needed). ────────────
const GOAL_DIRECTIVE: Record<Goal, string> = {
  understand:
    'The learner wants to deeply understand the material — explain each idea thoroughly with intuition and worked examples before testing.',
  exam: 'The learner is preparing for an exam — prioritise the most testable concepts and include exam-style practice.',
  review:
    'The learner wants a quick refresher — keep explanations concise and focus on consolidating what they likely already know.',
  memorize:
    'The learner wants to memorise key facts — lean on spaced repetition, flashcards and active recall.',
};
const LEVEL_DIRECTIVE: Record<Level, string> = {
  beginner: 'Assume a beginner — start from fundamentals and avoid unexplained jargon.',
  intermediate: 'Assume an intermediate learner — move briskly through basics and go deeper on the core ideas.',
  advanced: 'Assume an advanced learner — skip the basics and focus on nuance, edge cases and depth.',
};
const INTENSITY_DIRECTIVE: Record<Intensity, string> = {
  easy: 'Keep the pace gentle: fewer, shorter checkpoints and light review.',
  balanced: 'Keep a balanced mix of new material and spaced review.',
  intense: 'Make it intensive: more checkpoints, deeper coverage and frequent spaced review.',
};
const sessionDirective = (len: SessionLen) =>
  `Aim for roughly ${len}-minute study sessions — size each checkpoint to fit.`;

const GOALS: { id: Goal; icon: string; title: string; sub: string; help: string }[] = [
  { id: 'understand', icon: 'lightbulb', title: 'Understand', sub: 'Build real intuition', help: 'Mage will explain each idea thoroughly before testing you.' },
  { id: 'exam', icon: 'ads_click', title: 'Exam prep', sub: 'Drill likely questions', help: 'Mage will focus on what’s most likely to be tested.' },
  { id: 'review', icon: 'bolt', title: 'Quick review', sub: 'Refresh the essentials', help: 'Mage will keep it light — a fast refresher of what you know.' },
  { id: 'memorize', icon: 'layers', title: 'Memorise', sub: 'Lock in the facts', help: 'Mage will lean on spaced repetition to lock the facts in.' },
];
const LEVELS: { id: Level; label: string }[] = [
  { id: 'beginner', label: 'Beginner' },
  { id: 'intermediate', label: 'Intermediate' },
  { id: 'advanced', label: 'Advanced' },
];
const SESSIONS: SessionLen[] = [10, 15, 25, 45];
const INTENSITIES: { id: Intensity; title: string; sub: string }[] = [
  { id: 'easy', title: 'Light', sub: 'Mostly new material, a little review' },
  { id: 'balanced', title: 'Balanced', sub: 'A steady mix of learning and review' },
  { id: 'intense', title: 'Heavy', sub: 'Frequent spaced reviews to lock it in' },
];
const SUBJECTS = [
  'Biology', 'Chemistry', 'Physics', 'Mathematics', 'Computer Science',
  'History', 'Geography', 'Economics', 'Psychology', 'Language', 'Literature', 'Other',
];

const ACCEPTED_UPLOAD_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
  'text/markdown',
];
const VIDEO_SECTION_TITLE = 'Video notes';

// ── small helpers ────────────────────────────────────────────────────────────

function MS({ name, size, className }: { name: string; size?: number; className?: string }) {
  return (
    <span
      aria-hidden
      className={`material-symbols-outlined${className ? ' ' + className : ''}`}
      style={size ? { fontSize: size } : undefined}
    >
      {name}
    </span>
  );
}

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function fileExt(name: string): string {
  const m = name.match(/\.([a-z0-9]+)$/i);
  return m ? m[1].toUpperCase() : 'FILE';
}

function stripExt(name: string): string {
  return name.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]+/g, ' ').trim();
}

/** A signal-aware delay; rejects with AbortError the moment the user cancels. */
function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
  });
}

/** A unified row for the MATERIALS list — files, pasted notes and videos. */
interface MaterialItem {
  key: string;
  kind: 'file' | 'notes' | 'video';
  name: string;
  meta: string;
  icon: string;
}

function deriveMaterials(state: WizardState): MaterialItem[] {
  const out: MaterialItem[] = [];
  for (const pf of state.files) {
    out.push({ key: pf.key, kind: 'file', name: pf.file.name, meta: `${fileExt(pf.file.name)} · ${fmtSize(pf.file.size)}`, icon: 'description' });
  }
  if (state.pasteText.trim().length > 0) {
    const words = state.pasteText.trim().split(/\s+/).length;
    out.push({ key: 'paste', kind: 'notes', name: 'Pasted notes', meta: `Notes · ${words} words`, icon: 'edit_note' });
  }
  for (const v of state.youtubeVideos) {
    const min = v.durationSec ? Math.max(1, Math.round(v.durationSec / 60)) : null;
    out.push({ key: v.videoId, kind: 'video', name: v.title, meta: `YouTube${min ? ` · ${min} min` : ''}`, icon: 'play_arrow' });
  }
  return out;
}

// ── Mage guidance bubble (mobile) ────────────────────────────────────────────

function MageBubble({ text }: { text: string }) {
  return (
    <div className={s.bubble}>
      <div className={s.bubbleTile}><Mascot pose="holding-pen" size="sm" idle="none" /></div>
      <p className={s.bubbleText}>{text}</p>
    </div>
  );
}

// ── Step header (steps 1–3) ──────────────────────────────────────────────────

function StepHeader({ step, onBack }: { step: Step; onBack: () => void }) {
  const segs = [1, 2, 3];
  return (
    <>
      <div className={s.mtop}>
        <button type="button" className={s.iconBtn} aria-label="Go back" onClick={onBack}>
          <MS name="arrow_back" className={s.ic} />
        </button>
        <div className={s.segs}>
          {segs.map((n) => <span key={n} className={`${s.seg} ${n <= step ? s.on : ''}`} />)}
        </div>
      </div>
    </>
  );
}

function StepIndicator({ step }: { step: Step }) {
  const segs = [1, 2, 3];
  return (
    <div className={`${s.stepInd} ${s.webOnly}`}>
      <span className={s.stepNum}>Step {step} of {INPUT_STEPS}</span>
      <div className={s.segs}>
        {segs.map((n) => <span key={n} className={`${s.seg} ${n <= step ? s.on : ''}`} />)}
      </div>
    </div>
  );
}

// ── Step 1 — Add material ────────────────────────────────────────────────────

function Step1Material({
  state, onChange, onContinue, onCancel,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onContinue: () => void;
  onCancel: () => void;
}) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [tab, setTab] = React.useState<'files' | 'notes' | 'youtube'>('files');
  const [dragging, setDragging] = React.useState(false);
  const { upload } = useDirectUpload();

  const [processing, setProcessing] = React.useState(false);
  const [progress, setProgress] = React.useState<{ label: string; current: number; total: number }>({ label: '', current: 0, total: 0 });
  const [processError, setProcessError] = React.useState<string | null>(null);
  const [minutesUpsell, setMinutesUpsell] = React.useState<string | null>(null);
  const abortRef = React.useRef<AbortController | null>(null);
  const cancelledRef = React.useRef(false);

  const materials = deriveMaterials(state);
  const hasMaterial = materials.length > 0;
  const canContinue = !processing && hasMaterial;

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
    onChange({ files: next, materialIds: [] });
  }

  function removeMaterial(item: MaterialItem) {
    const patch: Partial<WizardState> = { materialIds: [] };
    if (state.coreKey === item.key) patch.coreKey = null;
    if (item.kind === 'file') patch.files = state.files.filter((f) => f.key !== item.key);
    else if (item.kind === 'notes') { patch.pasteText = ''; patch.pasteDocId = null; }
    else patch.youtubeVideos = state.youtubeVideos.filter((v) => v.videoId !== item.key);
    onChange(patch);
  }

  function toggleCore(key: string) {
    onChange({ coreKey: state.coreKey === key ? null : key });
  }

  // ── real ingest (unchanged from the prior wizard) ─────────────────────────
  function resolveInboxId(signal: AbortSignal): Promise<string | null> {
    return fetch('/api/learn/uploads/inbox', { method: 'POST', signal })
      .then((r) => r.json())
      .then((json) => (json?.success ? ((json.data?.id as string) ?? null) : null))
      .catch(() => null);
  }
  async function uploadAsDocument(file: File, signal: AbortSignal): Promise<string> {
    const inboxId = await resolveInboxId(signal);
    if (!inboxId) throw new Error('Could not prepare the upload. Try again.');
    const { storagePath } = await upload(file, 'document', { notebookId: inboxId });
    const res = await fetch('/api/learn/uploads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ storagePath, fileName: file.name, fileType: file.type || 'text/plain' }), signal,
    });
    const json = await res.json();
    if (!json?.success || !json.data?.id) throw new Error(json?.error || 'Upload failed');
    return json.data.id as string;
  }
  async function transcribeVideo(url: string, signal: AbortSignal): Promise<string> {
    const res = await fetch('/api/learn/documents/youtube', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url }), signal,
    });
    const json = await res.json().catch(() => null);
    if (res.status === 422) { const e = new Error('No captions'); e.name = 'CaptionsMissing'; throw e; }
    // A 500 here is the fragile caption scraper failing (e.g. YouTube blocking
    // our datacenter IP), NOT a missing-captions verdict. Flag it so the build
    // step can still drop to the native lane instead of failing the import.
    if (res.status === 500) { const e = new Error('Transcript fetch failed'); e.name = 'TranscriptFailed'; throw e; }
    if (!res.ok || !json?.success || !json.data?.document?.id) throw new Error(json?.error || 'Could not transcribe a video.');
    return json.data.document.id as string;
  }
  async function resolveVideoSection(inboxId: string, signal: AbortSignal): Promise<string> {
    const listRes = await fetch(`/api/material/${encodeURIComponent(inboxId)}/sections`, { signal });
    const listJson = await listRes.json().catch(() => null);
    if (listJson?.success && Array.isArray(listJson.data)) {
      const existing = listJson.data.find((sec: { id: string; title: string }) => sec.title === VIDEO_SECTION_TITLE);
      if (existing) return existing.id as string;
    }
    const createRes = await fetch(`/api/material/${encodeURIComponent(inboxId)}/sections`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title: VIDEO_SECTION_TITLE }), signal,
    });
    const createJson = await createRes.json().catch(() => null);
    if (!createJson?.success || !createJson.data?.id) throw new Error('Could not prepare video processing. Try again.');
    return createJson.data.id as string;
  }
  async function ingestVideoNatively(v: AddedVideo, inboxId: string, sectionId: string, onPhase: (m: string) => void, signal: AbortSignal): Promise<string> {
    let durationSec = v.durationSec;
    if (!durationSec || durationSec <= 0) { try { durationSec = Math.floor(await readYouTubeDuration(v.videoId)); } catch { durationSec = 0; } }
    if (!durationSec || durationSec <= 0) throw new Error(`Couldn’t read “${v.title}”. Try another video.`);
    const submitRes = await fetch(`/api/material/${encodeURIComponent(inboxId)}/video-import`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sectionId, fileName: v.title, videoUrl: v.url, durationSec, pageTitle: v.title }), signal,
    });
    const submitJson = await submitRes.json().catch(() => null);
    if (submitRes.status === 503) throw new Error('Video notes are temporarily unavailable. Try again later.');
    if (submitRes.status === 402 || submitJson?.code === 'video_minutes_exhausted') {
      const e = new Error(submitJson?.error || 'You’ve used all your free video minutes.'); e.name = 'VideoMinutesExhausted'; throw e;
    }
    if (!submitRes.ok || !submitJson?.success || !submitJson.data?.jobId) throw new Error(submitJson?.error || `Couldn’t read “${v.title}”.`);
    const jobId = submitJson.data.jobId as string;
    for (let attempt = 0; attempt < 240; attempt++) {
      await delay(3000, signal);
      const pollRes = await fetch(`/api/material/${encodeURIComponent(inboxId)}/video-import`, { signal });
      const pollJson = await pollRes.json().catch(() => null);
      if (!pollJson?.success || !Array.isArray(pollJson.data)) continue;
      const row = pollJson.data.find((j: { id: string }) => j.id === jobId) as
        | { status: string; progress?: { message?: string }; resultPageId?: string; error?: string } | undefined;
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

  async function handleContinue() {
    setProcessError(null);
    setMinutesUpsell(null);
    const bad = state.files.find((f) => !ACCEPTED_UPLOAD_TYPES.includes(f.file.type));
    if (bad) { setProcessError(`Unsupported file: ${bad.file.name}. Use PDF, Word, text, or Markdown.`); return; }

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    cancelledRef.current = false;
    const paste = state.pasteText.trim();
    const total = state.files.filter((f) => !f.docId).length + state.youtubeVideos.filter((v) => !v.docId).length + (paste && !state.pasteDocId ? 1 : 0);
    setProgress({ label: 'Preparing…', current: 0, total });
    setProcessing(true);

    try {
      const ids: string[] = [];
      let done = 0;
      const nextFiles = [...state.files];
      for (let i = 0; i < nextFiles.length; i++) {
        if (cancelledRef.current) return;
        const pf = nextFiles[i];
        if (pf.docId) { ids.push(pf.docId); continue; }
        setProgress({ label: `Uploading ${pf.file.name}`, current: done, total });
        const docId = await uploadAsDocument(pf.file, ctrl.signal);
        nextFiles[i] = { ...pf, docId };
        ids.push(docId); done += 1;
      }
      if (nextFiles.some((f, i) => f.docId !== state.files[i]?.docId)) onChange({ files: nextFiles });

      if (paste) {
        if (state.pasteDocId) ids.push(state.pasteDocId);
        else {
          if (cancelledRef.current) return;
          setProgress({ label: 'Saving your notes', current: done, total });
          const blob = new File([paste], 'Pasted notes.txt', { type: 'text/plain' });
          const docId = await uploadAsDocument(blob, ctrl.signal);
          onChange({ pasteDocId: docId }); ids.push(docId); done += 1;
        }
      }

      const nextVideos = [...state.youtubeVideos];
      let videoInboxId: string | null = null;
      let videoSectionId: string | null = null;
      for (let i = 0; i < nextVideos.length; i++) {
        if (cancelledRef.current) return;
        const v = nextVideos[i];
        if (v.docId) { ids.push(v.docId); continue; }
        setProgress({ label: `Transcribing ${v.title}`, current: done, total });
        let materialId: string;
        try {
          materialId = await transcribeVideo(v.url, ctrl.signal);
        } catch (err) {
          // Fall through to the native (Gemini) lane both when captions are
          // genuinely absent (422) and when the scraper itself failed (500).
          const fallback = err instanceof Error && (err.name === 'CaptionsMissing' || err.name === 'TranscriptFailed');
          if (!fallback) throw err;
          setProgress({ label: `Reading ${v.title}`, current: done, total });
          if (!videoInboxId) { videoInboxId = await resolveInboxId(ctrl.signal); if (!videoInboxId) throw new Error('Could not prepare video processing. Try again.'); }
          if (!videoSectionId) videoSectionId = await resolveVideoSection(videoInboxId, ctrl.signal);
          materialId = await ingestVideoNatively(v, videoInboxId, videoSectionId, (msg) => setProgress({ label: msg, current: done, total }), ctrl.signal);
        }
        nextVideos[i] = { ...v, docId: materialId };
        ids.push(materialId); done += 1;
      }
      if (nextVideos.some((v, i) => v.docId !== state.youtubeVideos[i]?.docId)) onChange({ youtubeVideos: nextVideos });

      if (cancelledRef.current) return;
      // Auto-name the path from the core material (or the first one) if untouched.
      const core = materials.find((m) => m.key === state.coreKey) ?? materials[0];
      const auto = core ? (core.kind === 'notes' ? 'My notes' : stripExt(core.name)) : '';
      onChange({ materialIds: ids, ...(!state.nameTouched && !state.pathName && auto ? { pathName: auto } : null) });
      setProcessing(false);
      onContinue();
    } catch (err) {
      if (cancelledRef.current || (err instanceof Error && err.name === 'AbortError')) { setProcessing(false); return; }
      if (err instanceof Error && err.name === 'VideoMinutesExhausted') { setMinutesUpsell(err.message); setProcessing(false); return; }
      setProcessError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
      setProcessing(false);
    }
  }

  // ── processing view (real ingest in flight) ───────────────────────────────
  if (processing) {
    return (
      <div className={s.analyze}>
        <div className={s.analyzeOrb}><Mascot pose="thinking" size={64} idle="float" /></div>
        <h2 className={s.analyzeTitle}>Preparing your material…</h2>
        <div className={`${ui.card} ${s.checkCard}`} style={{ gap: 14 }}>
          <div className={ui.track}><div className={ui.fill} style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 8}%` }} /></div>
          <p aria-live="polite" className={s.analyzeSub} style={{ margin: 0 }}>
            {progress.total > 0 ? `${Math.min(progress.current + 1, progress.total)} of ${progress.total} · ` : ''}{progress.label || 'Working…'}
          </p>
        </div>
        <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={cancelProcessing}>
          <MS name="close" className={ui.ic} /> Cancel
        </button>
      </div>
    );
  }

  const tabInput =
    tab === 'files' ? (
      <div
        role="button" tabIndex={0} aria-label="Upload area"
        className={`${s.drop} ${dragging ? s.drag : ''}`}
        onClick={() => fileInputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files); }}
      >
        <div className={s.dropPlus}><MS name="add" className={s.ic} /></div>
        <div className={s.dropTitle}>Drag &amp; drop your material</div>
        <div className={s.dropHint}>or click to browse — PDF, slides, Word, .txt — up to 25&nbsp;MB</div>
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.doc,.txt,.md" multiple style={{ display: 'none' }}
          onChange={(e) => { if (e.target.files?.length) addFiles(e.target.files); e.target.value = ''; }} aria-label="Choose files" />
      </div>
    ) : tab === 'notes' ? (
      <textarea
        className={s.focusArea} style={{ minHeight: 150 }} placeholder="Paste your notes or text here…"
        value={state.pasteText} onChange={(e) => onChange({ pasteText: e.target.value, pasteDocId: null, materialIds: [] })}
        aria-label="Paste notes"
      />
    ) : (
      <div className="nm-rework-cream">
        <VideoMaterialPicker videos={state.youtubeVideos} onChange={(v) => onChange({ youtubeVideos: v, materialIds: [] })} />
      </div>
    );

  const main = (
    <div className={s.main}>
      <div className={s.tabs}>
        {(['files', 'notes', 'youtube'] as const).map((t) => (
          <button key={t} type="button" className={`${s.tab} ${tab === t ? s.on : ''}`} onClick={() => setTab(t)}>
            {t === 'files' ? 'Files' : t === 'notes' ? 'Paste notes' : 'YouTube link'}
          </button>
        ))}
      </div>

      {tabInput}

      {materials.length > 0 && (
        <>
          <div className={s.matHead}>
            <span className={ui.sectionLabel}>Materials</span>
            <span className={s.fieldHint}><MS name="star" size={13} /> Core = Mage builds the path around it first</span>
          </div>
          <ul className={s.matList}>
            {materials.map((m) => {
              const isCore = state.coreKey === m.key;
              return (
                <li key={m.key} className={`${s.matRow} ${isCore ? s.core : ''}`}>
                  <div className={s.matIcon}><MS name={m.icon} size={20} /></div>
                  <div className={s.matBody}>
                    <div className={s.matName} title={m.name}>{m.name}</div>
                    <div className={s.matMeta}>{m.meta}</div>
                  </div>
                  <div className={s.matRight}>
                    <button type="button" className={`${s.coreBtn} ${isCore ? s.on : ''}`} onClick={() => toggleCore(m.key)} aria-pressed={isCore}>
                      <MS name="star" className={s.ic} />{isCore ? 'Core' : 'Mark core'}
                    </button>
                    <button type="button" className={s.removeBtn} aria-label={`Remove ${m.name}`} onClick={() => removeMaterial(m)}>
                      <MS name="close" className={s.ic} />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      {minutesUpsell && (
        <div className={s.amberCard} style={{ flexDirection: 'column', alignItems: 'flex-start', gap: 8 }}>
          <strong style={{ color: 'var(--ink)' }}>You’re out of free video minutes</strong>
          <span>That video has no captions, so it needs the full-video reader — and your free minutes are spent. Remove it to build with your other material, or go Pro for 1,000 minutes a month.</span>
          <Link href="/pricing" className={`${ui.btn} ${ui.primary} ${ui.small}`}><MS name="bolt" className={ui.ic} /> Upgrade to Pro</Link>
        </div>
      )}
      {processError && <p className={s.errorText} role="alert">{processError}</p>}
    </div>
  );

  const aside = (
    <div className={`${s.aside} ${s.webOnly}`}>
      <div className={`${ui.card} ${s.panel}`}>
        <div className={s.panelTitle}>What happens next</div>
        {[
          { icon: 'auto_stories', title: 'Mage reads it all', sub: 'Core material shapes the path first.' },
          { icon: 'route', title: 'Builds your path', sub: 'Topics ordered, first lesson written.' },
          { icon: 'school', title: 'You start learning', sub: 'Theory, flashcards and quizzes.' },
        ].map((r) => (
          <div key={r.title} className={s.panelRow}>
            <div className={ui.tile}><MS name={r.icon} className={s.ic} /></div>
            <div>
              <div className={s.panelRowTitle}>{r.title}</div>
              <div className={s.panelRowSub}>{r.sub}</div>
            </div>
          </div>
        ))}
        <div className={s.amberCard}>
          <MS name="tips_and_updates" className={s.ic} />
          Add an old exam or the syllabus for a sharper path.
        </div>
      </div>
    </div>
  );

  return (
    <>
      <StepHeader step={1} onBack={onCancel} />
      <div className={s.head}>
        <div className={s.titleWrap}>
          <h1 className={ui.h1}>Add your material</h1>
          <p className={ui.sub}>Mage builds your path from whatever you add — notes, slides, a PDF, even a video.</p>
        </div>
        <StepIndicator step={1} />
      </div>
      <MageBubble text="First — show me what you’re studying." />
      <div className={s.grid}>
        {main}
        {aside}
      </div>
      <div className={s.foot}>
        <span className={`${s.footNote} ${s.webOnly}`}>You can add or remove material anytime.</span>
        <div className={s.footBtns}>
          <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={onCancel}>Cancel</button>
          <button type="button" className={`${ui.btn} ${ui.primary} ${s.footGrow}`} disabled={!canContinue} onClick={handleContinue}>
            Continue <MS name="arrow_forward" className={ui.ic} />
          </button>
        </div>
      </div>
    </>
  );
}

// ── Step 2 — Set your goal ───────────────────────────────────────────────────

function Step2Goal({
  state, onChange, onBack, onContinue,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const goalHelp = GOALS.find((g) => g.id === state.goal)?.help ?? '';
  return (
    <>
      <StepHeader step={2} onBack={onBack} />
      <div className={s.head}>
        <div className={s.titleWrap}>
          <h1 className={ui.h1}>Set your goal</h1>
          <p className={ui.sub}>Shapes what Mage emphasises — paths stay self-paced.</p>
        </div>
        <StepIndicator step={2} />
      </div>
      <MageBubble text="What are you aiming for? I’ll prioritise to match." />

      <div className={s.main}>
        {/* Name + subject */}
        <div className={`${ui.card} ${s.fieldCard}`}>
          <div className={s.field}>
            <label className={s.fieldLabel} htmlFor="wz-name">Path name</label>
            <div className={s.nameField}>
              <input
                id="wz-name" className={s.input} value={state.pathName}
                onChange={(e) => onChange({ pathName: e.target.value, nameTouched: true })}
                placeholder="Name your path"
              />
              {!state.nameTouched && state.pathName ? <span className={s.autoBadge}>Auto</span> : null}
            </div>
          </div>
          <div className={s.field}>
            <label className={s.fieldLabel} htmlFor="wz-subject">Subject</label>
            <select id="wz-subject" className={s.select} value={state.subject} onChange={(e) => onChange({ subject: e.target.value })}>
              <option value="">Auto-detect</option>
              {SUBJECTS.map((sub) => <option key={sub} value={sub}>{sub}</option>)}
            </select>
          </div>
        </div>

        {/* Goal */}
        <div className={s.sub2}>What&apos;s it for?</div>
        <div className={s.goalGrid}>
          {GOALS.map((g) => {
            const on = state.goal === g.id;
            return (
              <button key={g.id} type="button" className={`${s.goalCard} ${on ? s.on : ''}`} onClick={() => onChange({ goal: g.id })} aria-pressed={on}>
                <div className={s.goalTop}>
                  <div className={ui.tile}><MS name={g.icon} className={s.ic} /></div>
                  <span className={s.radio}>{on ? <MS name="check" className={s.ic} /> : null}</span>
                </div>
                <div className={s.goalName}>{g.title}</div>
                <div className={s.goalSub}>{g.sub}</div>
              </button>
            );
          })}
        </div>

        <div className={s.helpRow}><MS name="add" className={s.ic} /> {goalHelp}</div>

        {/* Exam date — preserved capability, revealed under Exam prep */}
        {state.goal === 'exam' && (
          <div className={`${ui.card} ${s.fieldCard}`} style={{ gridTemplateColumns: 'auto 1fr', alignItems: 'center' }}>
            <div className={s.field} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <button type="button" className={`${s.segBtn} ${!state.hasExamDate ? s.on : ''}`} onClick={() => onChange({ hasExamDate: false, examDate: '' })}>No date</button>
              <button type="button" className={`${s.segBtn} ${state.hasExamDate ? s.on : ''}`} onClick={() => onChange({ hasExamDate: true })}>Exam date</button>
            </div>
            {state.hasExamDate && (
              <input type="date" className={s.input} value={state.examDate} min={new Date().toISOString().slice(0, 10)}
                onChange={(e) => onChange({ examDate: e.target.value })} aria-label="Exam date" style={{ colorScheme: 'light' }} />
            )}
          </div>
        )}

        {/* Level */}
        <div className={s.sub2}>Your level</div>
        <div className={s.segRow}>
          {LEVELS.map((l) => (
            <button key={l.id} type="button" className={`${s.segBtn} ${state.level === l.id ? s.on : ''}`} onClick={() => onChange({ level: l.id })}>{l.label}</button>
          ))}
        </div>
      </div>

      <div className={s.foot}>
        <span className={`${s.footNote} ${s.webOnly}`}>This can be edited later.</span>
        <div className={s.footBtns}>
          <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={onBack}>Back</button>
          <button type="button" className={`${ui.btn} ${ui.primary} ${s.footGrow}`} onClick={onContinue}>
            Continue <MS name="arrow_forward" className={ui.ic} />
          </button>
        </div>
      </div>
    </>
  );
}

// ── Step 3 — Tune the pace ───────────────────────────────────────────────────

function Step3Pace({
  state, onChange, onBack, onBuild, canUseUltra, isAdmin, ultraUsage,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onBack: () => void;
  onBuild: () => void;
  canUseUltra: boolean;
  isAdmin: boolean;
  ultraUsage: { used: number; limit: number } | null;
}) {
  const ultraNote = !canUseUltra
    ? 'Ultra builds sharper quizzes with the premium model — part of Pro.'
    : isAdmin
      ? 'Mage’s deepest, most capable build. Unlimited (admin).'
      : ultraUsage && ultraUsage.limit > 0
        ? `Mage’s deepest build. ${Math.max(0, ultraUsage.limit - ultraUsage.used)} of ${ultraUsage.limit} left this month.`
        : 'Mage’s deepest, most capable build.';

  return (
    <>
      <StepHeader step={3} onBack={onBack} />
      <div className={s.head}>
        <div className={s.titleWrap}>
          <h1 className={ui.h1}>Tune the pace</h1>
          <p className={ui.sub}>Mage shapes session length, depth and how often you review.</p>
        </div>
        <StepIndicator step={3} />
      </div>
      <MageBubble text="Last thing — how do you like to study?" />

      <div className={s.main}>
        {/* Session length */}
        <div className={s.labelRow}>
          <span className={s.label}>Session length</span>
          <span className={`${s.fieldHint} ${s.webOnly}`}>Lessons split into ~{state.sessionLen}-minute chunks.</span>
        </div>
        <div className={s.lenRow}>
          {SESSIONS.map((len) => (
            <button key={len} type="button" className={`${s.lenBtn} ${state.sessionLen === len ? s.on : ''}`} onClick={() => onChange({ sessionLen: len })}>{len} min</button>
          ))}
        </div>

        {/* Practice intensity */}
        <div className={s.label} style={{ marginTop: 6 }}>Practice intensity</div>
        <div className={s.intList}>
          {INTENSITIES.map((it) => {
            const on = state.intensity === it.id;
            return (
              <button key={it.id} type="button" className={`${s.intCard} ${on ? s.on : ''}`} onClick={() => onChange({ intensity: it.id })} aria-pressed={on}>
                <span className={s.intRadio}>{on ? <MS name="check" className={s.ic} /> : null}</span>
                <span>
                  <span className={s.intName} style={{ display: 'block' }}>{it.title}</span>
                  <span className={s.intSub} style={{ display: 'block' }}>{it.sub}</span>
                </span>
              </button>
            );
          })}
        </div>

        {/* Ultra */}
        <div className={s.ultraCard}>
          <div className={s.ultraTop}>
            <div className={s.ultraTile}><MS name="diamond" size={20} /></div>
            <div className={s.ultraHead}>
              <div className={s.ultraTitleRow}>
                <span className={s.ultraTitle}>Ultra path</span>
                <span className={s.ultraBadge}>ULTRA</span>
              </div>
              <div className={s.ultraSub}>{ultraNote}</div>
            </div>
            <button type="button" className={`${s.toggle} ${canUseUltra && state.ultra ? s.on : ''}`} disabled={!canUseUltra}
              aria-pressed={state.ultra} aria-label="Toggle Ultra" onClick={() => { if (canUseUltra) onChange({ ultra: !state.ultra }); }} />
          </div>
          <div className={s.ultraDivider} />
          <div className={s.ultraFeats}>
            {[
              { icon: 'image', title: 'Source figures', sub: 'pulled from your files' },
              { icon: 'hub', title: 'Diagrams', sub: 'visual explanations' },
              { icon: 'menu_book', title: 'Deeper theory', sub: 'worked examples' },
            ].map((f) => (
              <div key={f.title} className={s.ultraFeat}>
                <div className={ui.tile}><MS name={f.icon} className={s.ic} /></div>
                <div>
                  <div className={s.ultraFeatTitle}>{f.title}</div>
                  <div className={s.ultraFeatSub}>{f.sub}</div>
                </div>
              </div>
            ))}
          </div>
          <div className={s.ultraNote}>Limited to 3 a month</div>
        </div>

        {/* Focus brief */}
        <div className={s.labelRow}>
          <span className={s.label}>Anything to focus on?</span>
          <span className={s.optional}>Optional</span>
        </div>
        <textarea className={s.focusArea} placeholder="e.g. I keep mixing up mitosis and meiosis…"
          value={state.focus} onChange={(e) => onChange({ focus: e.target.value })} aria-label="Anything to focus on" />
        <span className={s.fieldHint}>Mage weaves this into every lesson and quiz.</span>
      </div>

      <div className={s.foot}>
        <span className={`${s.footNote} ${s.webOnly}`}>You&apos;re almost there.</span>
        <div className={s.footBtns}>
          <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={onBack}>Back</button>
          <button type="button" className={`${ui.btn} ${ui.primary} ${s.footGrow}`} onClick={onBuild}>
            <MS name="auto_awesome" className={ui.ic} /> Build my path
          </button>
        </div>
      </div>
    </>
  );
}

// ── shared 5-stage "analyzing/building" view ─────────────────────────────────

const STAGES = [
  'Reading your material',
  'Finding the key topics',
  'Ordering them into a path',
  'Writing your first lesson',
  'Building flashcards & quizzes',
];

function AnalyzeView({
  title, subtitle, activeIndex, percent, footNote,
}: {
  title: string;
  subtitle: string;
  activeIndex: number;  // index currently "Working…"; lower indices are done
  percent: number;
  footNote?: string;
}) {
  return (
    <div className={s.analyze}>
      <div className={s.analyzeOrb}>
        <MS name="auto_awesome" className={s.analyzeStar} />
        <Mascot pose="holding-wand" size={64} idle="float" />
      </div>
      <h2 className={s.analyzeTitle}>{title}</h2>
      <p className={s.analyzeSub}>{subtitle}</p>
      <div className={`${ui.card} ${s.checkCard}`}>
        {STAGES.map((label, i) => {
          const cls = i < activeIndex ? 'done' : i === activeIndex ? 'active' : 'pending';
          return (
            <div key={label} className={s.checkRow}>
              <span className={`${s.checkMark} ${cls === 'done' ? s.done : cls === 'active' ? s.active : s.pending}`}>
                {cls === 'done' ? <MS name="check" className={s.ic} /> : null}
              </span>
              <span className={`${s.checkLabel} ${cls === 'pending' ? s.pending : ''}`}>{label}</span>
              {cls === 'active' ? <span className={s.workingPill}>Working…</span> : null}
            </div>
          );
        })}
      </div>
      <div className={ui.track} style={{ maxWidth: 360 }}><div className={ui.fill} style={{ width: `${percent}%` }} /></div>
      {footNote ? <span className={s.analyzeFootNote}>{footNote}</span> : null}
      <div className={s.analyzeTip}>
        <span className={s.analyzeTipIcon} aria-hidden>
          <MS name="notifications" size={16} />
        </span>
        <span className={s.analyzeTipText}>Keep this open — I’ll ping you the moment it’s ready.</span>
      </div>
    </div>
  );
}

// ── Step 4 — Analyzing (runs detect-topics → topics) ─────────────────────────

function Step4Analyze({
  state, onChange, onDone, onBack,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onDone: () => void;
  onBack: () => void;
}) {
  const ran = React.useRef(false);
  const [stage, setStage] = React.useState(0);

  const runDetect = React.useCallback(async () => {
    onChange({ detecting: true, detectError: null });
    setStage(0);
    // Walk the first three checklist items while Stage A runs.
    const t1 = setTimeout(() => setStage(1), 900);
    const t2 = setTimeout(() => setStage(2), 2200);
    try {
      const res = await fetch('/api/learn/paths/detect-topics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialIds: state.materialIds, pasteText: state.materialIds.length === 0 ? state.pasteText.trim() || undefined : undefined }),
      });
      const json = await res.json();
      clearTimeout(t1); clearTimeout(t2);
      if (!json?.success || !Array.isArray(json.data?.topics)) {
        onChange({ detecting: false, detectError: json?.error || 'Mage could not read your material.' });
        return;
      }
      const topics = (json.data.topics as string[]).filter((t) => t && t.trim());
      const suggested = (json.data.suggestedTitle as string) || state.suggestedTitle;
      onChange({
        detecting: false, detectError: null,
        topics: topics.length > 0 ? topics : state.topics,
        suggestedTitle: suggested,
        // adopt the AI title only if the learner never typed their own
        ...(!state.nameTouched && suggested ? { pathName: suggested } : null),
      });
      onDone();
    } catch {
      clearTimeout(t1); clearTimeout(t2);
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
  if (hasError) {
    return (
      <div className={s.analyze}>
        <div className={s.analyzeOrb}><Mascot pose="thinking" size={64} idle="none" /></div>
        <h2 className={s.analyzeTitle}>That didn&apos;t work</h2>
        <p className={s.analyzeSub}>{state.detectError}</p>
        <div className={s.footBtns} style={{ width: '100%', maxWidth: 360 }}>
          <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={onBack}>Back</button>
          <button type="button" className={`${ui.btn} ${ui.primary}`} style={{ flex: 1 }} onClick={() => { ran.current = true; void runDetect(); }}>
            <MS name="refresh" className={ui.ic} /> Try again
          </button>
        </div>
      </div>
    );
  }

  const sources = state.materialIds.length || deriveMaterials(state).length || 1;
  return (
    <AnalyzeView
      title="Reading your material…"
      subtitle={`Mage is turning your ${sources} ${sources === 1 ? 'source' : 'sources'} into a learning path.`}
      activeIndex={stage}
      percent={[18, 38, 58][Math.min(stage, 2)]}
    />
  );
}

// ── Step 5 — Review what Mage found ──────────────────────────────────────────

function Step5Review({
  state, onChange, onBack, onBuild,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  onBack: () => void;
  onBuild: () => void;
}) {
  const [adding, setAdding] = React.useState(false);
  const [draft, setDraft] = React.useState('');
  const [editKey, setEditKey] = React.useState<string | null>(null);
  const [editVal, setEditVal] = React.useState('');

  const sources = deriveMaterials(state).length || state.materialIds.length || 1;

  function removeTopic(t: string) {
    onChange({ topics: state.topics.filter((x) => x !== t), starred: state.starred.filter((x) => x !== t) });
  }
  function toggleStar(t: string) {
    onChange({ starred: state.starred.includes(t) ? state.starred.filter((x) => x !== t) : [...state.starred, t] });
  }
  function commitAdd() {
    const v = draft.trim();
    if (v && !state.topics.includes(v)) onChange({ topics: [...state.topics, v] });
    setDraft(''); setAdding(false);
  }
  function commitRename(orig: string) {
    const v = editVal.trim();
    if (v && v !== orig && !state.topics.includes(v)) {
      onChange({
        topics: state.topics.map((x) => (x === orig ? v : x)),
        starred: state.starred.map((x) => (x === orig ? v : x)),
      });
    }
    setEditKey(null); setEditVal('');
  }

  const main = (
    <div className={s.main}>
      <span className={ui.sectionLabel}>Topics</span>
      {state.topics.map((t) => {
        const starred = state.starred.includes(t);
        const editing = editKey === t;
        return (
          <div key={t} className={`${s.topicRow} ${starred ? s.starred : ''}`}>
            <div className={s.topicIcon}><MS name={starred ? 'star' : 'book_2'} size={18} /></div>
            {editing ? (
              <input className={s.topicNameInput} autoFocus value={editVal}
                onChange={(e) => setEditVal(e.target.value)}
                onBlur={() => commitRename(t)}
                onKeyDown={(e) => { if (e.key === 'Enter') commitRename(t); if (e.key === 'Escape') { setEditKey(null); setEditVal(''); } }} />
            ) : (
              <button type="button" className={s.topicName} style={{ background: 'none', border: 'none', textAlign: 'left', cursor: 'text', padding: 0, font: 'inherit' }}
                onClick={() => { setEditKey(t); setEditVal(t); }} title="Rename">{t}</button>
            )}
            <button type="button" className={`${s.starBtn} ${starred ? s.on : ''}`} aria-pressed={starred} aria-label={starred ? 'Unstar' : 'Star for extra practice'} onClick={() => toggleStar(t)}>
              <MS name="star" className={s.ic} />
            </button>
            <button type="button" className={s.removeBtn} aria-label={`Remove ${t}`} onClick={() => removeTopic(t)}><MS name="close" className={s.ic} /></button>
          </div>
        );
      })}

      {adding ? (
        <div className={s.addRow}>
          <input className={s.input} autoFocus placeholder="New topic…" value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') commitAdd(); if (e.key === 'Escape') { setAdding(false); setDraft(''); } }} />
          <button type="button" className={`${ui.btn} ${ui.secondary}`} onClick={commitAdd}>Add</button>
        </div>
      ) : (
        <button type="button" className={s.addTopic} onClick={() => setAdding(true)}><MS name="add" className={s.ic} /> Add a topic</button>
      )}
    </div>
  );

  const aside = (
    <div className={`${s.aside} ${s.webOnly}`}>
      <div className={`${ui.card} ${s.summaryPanel}`}>
        <div className={s.panelTitle}>Summary</div>
        <div className={s.summaryRow}>
          <span className={s.summaryLeft}><MS name="list" className={s.ic} /> Topics</span>
          <span className={s.summaryVal}>{state.topics.length}</span>
        </div>
        <div className={s.summaryRow}>
          <span className={s.summaryLeft}><MS name="folder" className={s.ic} /> Sources</span>
          <span className={s.summaryVal}>{sources}</span>
        </div>
        <div className={s.amberCard}>
          <MS name="star" className={s.ic} />
          Starred topics get extra practice and tougher quizzes.
        </div>
      </div>
    </div>
  );

  return (
    <>
      <div className={s.mtop}>
        <button type="button" className={s.iconBtn} aria-label="Go back" onClick={onBack}><MS name="arrow_back" className={s.ic} /></button>
        <div className={s.segs} style={{ justifyContent: 'flex-end' }}><span className={ui.pill + ' ' + ui.pillPurple}>Review</span></div>
      </div>
      <div className={s.head}>
        <div className={s.titleWrap}>
          <h1 className={ui.h1}>Review what Mage found</h1>
          <p className={ui.sub}>Star what matters, rename, or remove. Then I&apos;ll build your path.</p>
        </div>
        <span className={`${ui.pill} ${ui.pillPurple} ${s.webOnly}`} style={{ marginTop: 6 }}>Review</span>
      </div>
      <MageBubble text="Here’s what I understood — fix anything before I build." />

      {/* mobile summary pills */}
      <div className={s.summaryPills} style={{ marginBottom: 16 }}>
        <span className={`${ui.pill} ${ui.pillLilac}`}><MS name="list" className={s.ic} /> {state.topics.length} topics</span>
        <span className={`${ui.pill} ${ui.pillLilac}`}><MS name="folder" className={s.ic} /> {sources} sources</span>
      </div>

      <div className={s.grid}>
        {main}
        {aside}
      </div>

      <div className={s.foot}>
        <span className={`${s.footNote} ${s.webOnly}`}>Mage found {state.topics.length} topics across {sources} {sources === 1 ? 'source' : 'sources'}.</span>
        <div className={s.footBtns}>
          <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={onBack}>Back</button>
          <button type="button" className={`${ui.btn} ${ui.primary} ${s.footGrow}`} disabled={state.topics.length === 0} onClick={onBuild}>
            <MS name="auto_awesome" className={ui.ic} /> Build my path
          </button>
        </div>
      </div>
    </>
  );
}

// ── Step 6 — Build + Ready ───────────────────────────────────────────────────

interface PlanActivity { kind?: string; completed?: boolean }
interface PlanSlot { id: string; title?: string; kind?: string; activities?: PlanActivity[] }
interface PlanPhase { title?: string; slots?: PlanSlot[] }
interface PlanTree { title?: string; phases?: PlanPhase[] }

function countActivities(plan: PlanTree | null): { lessons: number; flashcards: number; quizzes: number } {
  let lessons = 0, flashcards = 0, quizzes = 0;
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

interface PreviewNode { title: string; sub: string; tone: string; icon: string; priority: boolean }

function buildNodes(plan: PlanTree | null, starred: string[]): PreviewNode[] {
  const slots: PlanSlot[] = [];
  for (const phase of plan?.phases ?? []) for (const slot of phase.slots ?? []) slots.push(slot);
  const starredLc = new Set(starred.map((t) => t.toLowerCase()));
  const nodes: PreviewNode[] = [];
  let firstLearning = true;
  for (const slot of slots) {
    if (nodes.length >= 5) break;
    const kind = slot.kind ?? 'learning';
    const title = slot.title ?? 'Checkpoint';
    const priority = starredLc.has(title.toLowerCase());
    if (kind === 'learning') {
      if (firstLearning) { nodes.push({ title, sub: 'Start here · Lesson', tone: s.nodeTilePurple, icon: 'play_arrow', priority }); firstLearning = false; }
      else nodes.push({ title, sub: 'Locked', tone: s.nodeTileLilac, icon: 'lock', priority });
    } else if (kind === 'review') {
      nodes.push({ title: title || 'Review', sub: 'Flashcards + quiz', tone: s.nodeTileGreen, icon: 'autorenew', priority });
    } else if (kind === 'final_exam') {
      nodes.push({ title: title || 'Final exam', sub: 'Unlocks at the end', tone: s.nodeTileGold, icon: 'emoji_events', priority });
    } else {
      nodes.push({ title: title || 'Assessment', sub: 'Locked', tone: s.nodeTileLilac, icon: 'lock', priority });
    }
  }
  // Always cap with a final-exam node if the plan has one and we didn't include it.
  if (!nodes.some((n) => n.icon === 'emoji_events') && (plan?.phases?.length ?? 0) > 0) {
    nodes.push({ title: 'Final exam', sub: 'Unlocks at the end', tone: s.nodeTileGold, icon: 'emoji_events', priority: false });
  }
  return nodes.slice(0, 5);
}

function Step6Build({
  state, onChange, packId, onStart, onViewPath,
}: {
  state: WizardState;
  onChange: (patch: Partial<WizardState>) => void;
  packId: string | null;
  onStart: (planId: string, firstSlotId: string | null) => void;
  onViewPath: (planId: string) => void;
}) {
  const runPathGeneration = React.useCallback(async (notebookId: string) => {
    const starred = state.topics.filter((t) => state.starred.includes(t));
    const brief = [
      state.focus.trim(),
      `Build the path around these topics, in this order: ${state.topics.join('; ')}.`,
      starred.length ? `Give extra practice and tougher quizzes to: ${starred.join('; ')}.` : '',
      GOAL_DIRECTIVE[state.goal],
      LEVEL_DIRECTIVE[state.level],
      INTENSITY_DIRECTIVE[state.intensity],
      sessionDirective(state.sessionLen),
      state.subject ? `Subject area: ${state.subject}.` : '',
    ].filter(Boolean).join(' ');
    try {
      const pathRes = await fetch('/api/learn/paths', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: (state.pathName.trim() || state.suggestedTitle || 'My learning path').slice(0, 200),
          brief,
          primaryNotebookId: notebookId,
          materialIds: state.materialIds,
          ultra: state.ultra,
          language: 'en',
        }),
      });
      const pathJson = await pathRes.json();
      if (!pathJson?.success || !pathJson.data?.planId) {
        onChange({ genError: pathJson?.error || 'Could not start generation.' });
        return;
      }
      onChange({ planId: pathJson.data.planId as string });
    } catch {
      onChange({ genError: 'Network error. Please try again.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.topics, state.starred, state.focus, state.goal, state.level, state.intensity, state.sessionLen, state.subject, state.pathName, state.suggestedTitle, state.materialIds, state.ultra]);

  const startGeneration = React.useCallback(async () => {
    if (state.planId) return;
    try {
      let notebookId = packId ?? state.notebookId;
      if (!notebookId) {
        const name = (state.pathName.trim() || state.suggestedTitle || 'My learning path').slice(0, 100);
        const res = await fetch('/api/material', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
        const json = await res.json();
        if (!json?.success || !json.data?.id) { onChange({ genError: json?.error || 'Could not create your path.' }); return; }
        notebookId = json.data.id as string;
        onChange({ notebookId });
      }
      if (state.hasExamDate && state.examDate) {
        try {
          await fetch('/api/user/exams', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: state.pathName.trim() || state.suggestedTitle || 'Exam', examDate: new Date(state.examDate + 'T00:00:00').toISOString(), notebookId }),
          });
        } catch { /* non-fatal */ }
      }
      await runPathGeneration(notebookId);
    } catch {
      onChange({ genError: 'Network error. Please try again.' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.planId, state.notebookId, state.pathName, state.suggestedTitle, state.hasExamDate, state.examDate, packId, runPathGeneration]);

  // Kick off exactly once on mount (review step already confirmed the build).
  const kicked = React.useRef(false);
  React.useEffect(() => {
    if (kicked.current) return;
    kicked.current = true;
    void startGeneration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stream = usePathGenerationStream(state.planId, Boolean(state.planId));
  const isReady = stream.status === 'ready';
  const failed = state.genError !== null || stream.status === 'failed';

  // Generation interleaves theory + flashcards/quiz per checkpoint, so the raw
  // activity flips back and forth. The 5-stage checklist is a forward-only
  // narrative — track the furthest stage reached so it never jumps backward.
  const maxStageRef = React.useRef(3);

  React.useEffect(() => {
    if (!isReady || !state.planId) return;
    const plan = stream.plan as PlanTree | null;
    const first = plan?.phases?.[0]?.slots?.[0]?.id ?? null;
    if (first !== state.firstSlotId) onChange({ firstSlotId: first });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isReady, state.planId, stream.plan]);

  const plan = stream.plan as PlanTree | null;

  // ── FAILED ──
  if (failed) {
    const retry = () => { onChange({ genError: null }); const nb = packId ?? state.notebookId; if (nb) void runPathGeneration(nb); else void startGeneration(); };
    return (
      <div className={s.analyze}>
        <div className={`${ui.card} ${s.failCard}`}>
          <div className={s.failOrb}>
            <Mascot pose="thinking" size={56} idle="none" />
            <span className={s.failBadge} aria-hidden><MS name="priority_high" /></span>
          </div>
          <h2 className={s.analyzeTitle}>Generation hit a snag</h2>
          <p className={s.failMsg}>{state.genError || stream.errorMessage || 'Something interrupted the build. Your sources are safe — give it another go.'}</p>
          <div className={s.failBtns}>
            <button type="button" className={`${ui.btn} ${ui.primary} ${s.footGrow}`} onClick={retry}>
              <MS name="refresh" className={ui.ic} /> Try again
            </button>
            {state.notebookId && (
              <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={() => onViewPath(state.planId ?? '')}>View path</button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── READY ──
  if (isReady) {
    const counts = countActivities(plan);
    const topics = plan?.phases?.length ?? state.topics.length;
    const nodes = buildNodes(plan, state.starred);
    const sources = state.materialIds.length || deriveMaterials(state).length || 1;
    const goalLabel = GOALS.find((g) => g.id === state.goal)?.title ?? 'Understand';
    const levelLabel = LEVELS.find((l) => l.id === state.level)?.label ?? 'Beginner';
    const title = plan?.title || state.pathName.trim() || state.suggestedTitle || 'My learning path';

    const inside = state.ultra
      ? [
          { icon: 'image', text: 'Source figures pulled from your notes' },
          { icon: 'hub', text: 'Diagrams & visual explanations' },
          { icon: 'menu_book', text: 'Deeper theory & worked examples' },
          { icon: 'autorenew', text: 'Spaced reviews before the final exam' },
        ]
      : [
          { icon: 'menu_book', text: 'Clear theory for every topic' },
          { icon: 'style', text: 'Flashcards to lock in the facts' },
          { icon: 'quiz', text: 'Quizzes that check your understanding' },
          { icon: 'autorenew', text: 'Spaced reviews before the final exam' },
        ];

    return (
      <>
        <div className={s.grid}>
          <div className={s.main}>
            <div className={s.readyHead}>
              {state.ultra && <span className={s.ultraPathBadge}><MS name="diamond" className={s.ic} /> ULTRA PATH</span>}
              <h1 className={s.readyTitle}>Your path is ready</h1>
              <div className={s.readySubtitle}>{title}</div>
              <div className={s.readyBuilt}>Built from your material · {sources} {sources === 1 ? 'source' : 'sources'}</div>
              <div className={s.chipRow}>
                <span className={`${ui.pill} ${ui.pillLilac}`}><MS name="flag" className={s.ic} /> Goal: {goalLabel}</span>
                <span className={`${ui.pill} ${ui.pillPurple}`}>{levelLabel}</span>
                <span className={`${ui.pill} ${ui.pillLilac}`}><MS name="schedule" className={s.ic} /> ~{state.sessionLen} min sessions</span>
              </div>
            </div>

            <div className={`${ui.card} ${s.statsCard}`}>
              {[
                { v: topics, l: 'Topics' },
                { v: counts.lessons, l: 'Lessons' },
                { v: counts.flashcards, l: 'Flashcards' },
                { v: counts.quizzes, l: 'Quizzes' },
              ].map((st) => (
                <div key={st.l} className={s.stat}><span className={s.statVal}>{st.v}</span><span className={s.statLabel}>{st.l}</span></div>
              ))}
            </div>

            <div className={s.sub2}>What&apos;s inside</div>
            <div className={s.insideList}>
              {inside.map((r) => (
                <div key={r.text} className={s.insideRow}>
                  <div className={ui.tile}><MS name={r.icon} className={s.ic} /></div>
                  <span className={s.insideText}>{r.text}</span>
                </div>
              ))}
            </div>
          </div>

          <div className={s.aside}>
            <div className={`${ui.card} ${s.nodePanel}`}>
              <div className={s.nodePanelLabel}>Your path</div>
              <div className={s.nodeList}>
                {nodes.map((n, i) => (
                  <div key={`${n.title}-${i}`} className={s.node}>
                    <div className={s.nodeRail}>
                      <div className={`${s.nodeTile} ${n.tone}`}><MS name={n.icon} className={s.ic} /></div>
                      {i < nodes.length - 1 && <div className={s.nodeLine} />}
                    </div>
                    <div className={s.nodeBody}>
                      <div className={s.nodeTitleRow}>
                        <span className={s.nodeTitle}>{n.title}</span>
                        {n.priority && <span className={s.priorityPill}><MS name="star" className={s.ic} /> Priority</span>}
                      </div>
                      <div className={s.nodeSub}>{n.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={s.foot}>
          <span className={`${s.footNote} ${s.webOnly}`} />
          <div className={s.footBtns}>
            <button type="button" className={`${ui.btn} ${ui.ghost}`} onClick={() => onViewPath(state.planId!)}>View full path</button>
            <button type="button" className={`${ui.btn} ${ui.primary} ${s.footGrow}`} onClick={() => onStart(state.planId!, state.firstSlotId)}>
              <MS name="play_arrow" className={ui.ic} /> Start learning
            </button>
          </div>
        </div>
      </>
    );
  }

  // ── BUILDING ──
  const total = stream.progress?.totalSlots ?? 0;
  const done = stream.progress?.completedSlots ?? 0;
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 6;
  const currentActivity = stream.progress?.currentActivity;
  const rawStage = !currentActivity || currentActivity === 'theory' ? 3 : 4;
  // Monotonic: once flashcards/quizzes start, stay there — never revert to the
  // lesson stage when a later checkpoint writes its theory.
  if (rawStage > maxStageRef.current) maxStageRef.current = rawStage;
  const activeIndex = maxStageRef.current;
  const currentSlot = stream.progress?.currentSlot;
  return (
    <AnalyzeView
      title="Building your path…"
      subtitle={currentSlot ? `Writing ${currentActivity ?? 'content'} for “${currentSlot.title}”…` : 'Designing sections and checkpoints…'}
      activeIndex={activeIndex}
      percent={percent}
      footNote={total > 0 ? `${done} / ${total} checkpoints` : 'You can leave — Mage keeps building in the background.'}
    />
  );
}

// ── Root ─────────────────────────────────────────────────────────────────────

const DEFAULT_STATE: WizardState = {
  files: [],
  pasteText: '',
  pasteDocId: null,
  youtubeVideos: [],
  materialIds: [],
  coreKey: null,
  packId: null,
  pathName: '',
  nameTouched: false,
  subject: '',
  goal: 'understand',
  level: 'intermediate',
  examDate: '',
  hasExamDate: false,
  sessionLen: 15,
  intensity: 'balanced',
  ultra: false,
  focus: '',
  detecting: false,
  detectError: null,
  topics: [],
  starred: [],
  suggestedTitle: '',
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
  const [state, setState] = React.useReducer((s0: WizardState, patch: Partial<WizardState>) => ({ ...s0, ...patch }), DEFAULT_STATE);

  const [ultraUsage, setUltraUsage] = React.useState<{ used: number; limit: number } | null>(null);
  React.useEffect(() => {
    if (!canUseUltra) return;
    let cancelled = false;
    fetch('/api/user/usage').then((r) => r.json()).then((j) => {
      if (cancelled || !j?.success) return;
      const features = j.data?.features as Array<{ featureType: string; used: number; limit: number }> | undefined;
      const entry = features?.find((f) => f.featureType === 'ultra_path');
      if (entry) setUltraUsage({ used: entry.used, limit: entry.limit });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [canUseUltra]);

  // Existing-pack mode (?packId): skip Step 1's upload, load the pack's
  // material, and jump to the goal step. Read from window (not useSearchParams,
  // which would bail the page out of static rendering).
  const initedRef = React.useRef(false);
  React.useEffect(() => {
    if (initedRef.current || typeof window === 'undefined') return;
    initedRef.current = true;
    const packId = new URLSearchParams(window.location.search).get('packId');
    if (!packId) return;
    (async () => {
      try {
        const res = await fetch(`/api/material/${encodeURIComponent(packId)}/inventory`);
        const json = await res.json();
        const inv = json?.data as { pages?: { id: string }[]; flashcardSets?: { id: string }[]; quizSets?: { id: string }[]; documents?: { id: string }[] } | undefined;
        const ids = json?.success && inv ? [...(inv.pages ?? []), ...(inv.flashcardSets ?? []), ...(inv.quizSets ?? []), ...(inv.documents ?? [])].map((m) => m.id) : [];
        setState({ packId, materialIds: ids });
        setStep(2);
      } catch {
        setState({ packId });
      }
    })();
  }, []);

  const buildLocked = step === 6 && (state.planId !== null);

  function goBack() {
    if (buildLocked) return;
    if (step === 1) { router.push('/my-path'); return; }
    setStep((p) => Math.max(1, p - 1) as Step);
  }
  function advance() { setStep((p) => Math.min(6, p + 1) as Step); }
  function goClose() { router.push('/my-path'); }

  let body: React.ReactNode = null;
  if (step === 1) body = <Step1Material state={state} onChange={setState} onContinue={advance} onCancel={goClose} />;
  else if (step === 2) body = <Step2Goal state={state} onChange={setState} onBack={goBack} onContinue={advance} />;
  else if (step === 3) body = <Step3Pace state={state} onChange={setState} onBack={goBack} onBuild={advance} canUseUltra={canUseUltra} isAdmin={isAdmin} ultraUsage={ultraUsage} />;
  else if (step === 4) body = <Step4Analyze state={state} onChange={setState} onDone={advance} onBack={goBack} />;
  else if (step === 5) body = <Step5Review state={state} onChange={setState} onBack={goBack} onBuild={advance} />;
  else body = (
    <Step6Build
      state={state} onChange={setState} packId={state.packId}
      onStart={(planId, firstSlotId) => router.push(firstSlotId ? `/learn/paths/${encodeURIComponent(planId)}?slot=${encodeURIComponent(firstSlotId)}` : `/learn/paths/${encodeURIComponent(planId)}`)}
      onViewPath={(planId) => router.push(planId ? `/learn/paths/${encodeURIComponent(planId)}` : '/my-path')}
    />
  );

  return (
    <AppShell width="wide">
      <div className={s.page}>{body}</div>
    </AppShell>
  );
}
