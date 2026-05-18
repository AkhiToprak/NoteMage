'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useDirectUpload } from './useDirectUpload';
import { renderPdfToPngs } from '@/lib/pdf-client-render';

// The container-agnostic state machine behind the multi-PDF import flow.
// source → preparing → organize → creating → done. The onboarding finale
// and the /notebooks "Import PDFs" modal both drive this same hook; only
// the surrounding shell and the completion handler differ.

export type ImportPhase = 'source' | 'preparing' | 'organize' | 'creating' | 'done';

export interface PickedFile {
  id: string;
  file: File;
  name: string;
  size: number;
}

export interface ImportGroup {
  id: string;
  name: string;
  subject: string;
  color: string;
  /** PickedFile ids assigned to this notebook. */
  fileIds: string[];
}

export interface ImportJobInfo {
  id: string;
  notebookId: string;
  fileName: string;
  status: string;
  resultPageId: string | null;
  error: string | null;
}

export interface ImportStatus {
  jobs: ImportJobInfo[];
  total: number;
  ready: number;
  failed: number;
  processing: number;
  done: boolean;
}

export interface CommitResult {
  notebookIds: string[];
  firstNotebookId: string | null;
  jobIds: string[];
  skippedFiles: string[];
}

export interface PrepareProgress {
  current: number;
  total: number;
  label: string;
}

interface PreparedFile {
  id: string;
  fileName: string;
  pdfPath: string;
  pageImagePaths: string[];
}

interface UseMultiImportOptions {
  /** Folder the created notebooks land in; null = root level. */
  folderId?: string | null;
}

/** Preset palette — kept in sync with `presets.ts` notebook colors. */
const PALETTE = [
  '#8c52ff',
  '#5170ff',
  '#ffde59',
  '#ff7043',
  '#4ade80',
  '#38bdf8',
  '#f472b6',
  '#a78bfa',
];
const STATUS_POLL_MS = 2000;
const MAX_FILES = 20;

function newId(): string {
  return crypto.randomUUID();
}

/** File name with the extension stripped, tidied for a notebook title. */
function stripExt(fileName: string): string {
  const base = fileName
    .replace(/\.[^./\\]+$/, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return base.length > 0 ? base.slice(0, 80) : 'Imported notes';
}

export function useMultiImport(options: UseMultiImportOptions = {}) {
  const { folderId = null } = options;
  const { upload } = useDirectUpload();

  const [phase, setPhase] = useState<ImportPhase>('source');
  const [files, setFiles] = useState<PickedFile[]>([]);
  const [groups, setGroups] = useState<ImportGroup[]>([]);
  const [prepareProgress, setPrepareProgress] = useState<PrepareProgress>({
    current: 0,
    total: 0,
    label: '',
  });
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [result, setResult] = useState<CommitResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const preparedRef = useRef<PreparedFile[]>([]);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Guards prepare()/commit() against a double click firing two runs.
  const busyRef = useRef(false);

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Stop the status poll if the flow unmounts mid-import.
  useEffect(() => stopPolling, [stopPolling]);

  // ── source phase ─────────────────────────────────────────────────────────
  // Accept PDFs by MIME *or* by a `.pdf` extension — some WebView file
  // pickers hand back a file with an empty `type`, and rejecting those by
  // MIME alone would silently drop a perfectly valid PDF.
  const addFiles = useCallback(
    (incoming: File[]) => {
      if (incoming.length === 0) return;

      const seen = new Set(files.map((f) => `${f.name}:${f.size}`));
      const accepted: PickedFile[] = [];
      let rejectedNonPdf = 0;
      for (const file of incoming) {
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (!isPdf) {
          rejectedNonPdf += 1;
          continue;
        }
        const key = `${file.name}:${file.size}`;
        if (seen.has(key)) continue;
        seen.add(key);
        accepted.push({ id: newId(), file, name: file.name, size: file.size });
      }

      const merged = [...files, ...accepted];
      if (accepted.length === 0 && rejectedNonPdf > 0) {
        setError('Only PDF files can be imported.');
      } else if (merged.length > MAX_FILES) {
        setError(`You can import up to ${MAX_FILES} PDFs at once.`);
      } else {
        setError(null);
      }
      setFiles(merged.slice(0, MAX_FILES));
    },
    [files],
  );

  const removeFile = useCallback((id: string) => {
    setError(null);
    setFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // ── preparing phase: render + upload every PDF, then classify ────────────
  const prepare = useCallback(async () => {
    if (busyRef.current || files.length === 0) return;
    busyRef.current = true;
    setError(null);
    setPhase('preparing');

    try {
      const prepared: PreparedFile[] = [];
      const total = files.length;

      for (let i = 0; i < files.length; i++) {
        const picked = files[i];
        setPrepareProgress({ current: i, total, label: `Reading “${picked.name}”…` });

        let pages;
        try {
          pages = await renderPdfToPngs(picked.file);
        } catch {
          throw new Error(
            `“${picked.name}” could not be read — it may be password-protected or damaged. Remove it and try again.`,
          );
        }
        if (pages.length === 0) {
          throw new Error(`“${picked.name}” has no pages. Remove it and try again.`);
        }

        setPrepareProgress({ current: i, total, label: `Uploading “${picked.name}”…` });
        const pdfUpload = await upload(picked.file, 'multi-import');

        const pageImagePaths: string[] = [];
        for (let p = 0; p < pages.length; p++) {
          const pngFile = new File([pages[p].blob], `page-${p + 1}.png`, { type: 'image/png' });
          const pngUpload = await upload(pngFile, 'multi-import');
          pageImagePaths.push(pngUpload.storagePath);
        }

        prepared.push({
          id: picked.id,
          fileName: picked.name,
          pdfPath: pdfUpload.storagePath,
          pageImagePaths,
        });
      }

      setPrepareProgress({ current: total, total, label: 'Detecting subjects…' });
      preparedRef.current = prepared;

      const res = await fetch('/api/import/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: prepared.map((p) => ({ pdfPath: p.pdfPath, fileName: p.fileName })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(json?.error ?? 'We could not analyse your files. Please try again.');
      }

      // Map classify groups (keyed by pdfPath) back to PickedFile ids.
      const idByPath = new Map(prepared.map((p) => [p.pdfPath, p.id]));
      const classifyGroups: {
        name: string;
        subject: string;
        color: string;
        pdfPaths: string[];
      }[] = Array.isArray(json.data?.groups) ? json.data.groups : [];

      const built: ImportGroup[] = classifyGroups
        .map((g, idx) => ({
          id: newId(),
          name: g.name,
          subject: g.subject,
          color: g.color || PALETTE[idx % PALETTE.length],
          fileIds: g.pdfPaths
            .map((path) => idByPath.get(path))
            .filter((id): id is string => Boolean(id)),
        }))
        .filter((g) => g.fileIds.length > 0);

      // Safety net — any file the response missed becomes its own notebook.
      const placed = new Set(built.flatMap((g) => g.fileIds));
      for (const p of prepared) {
        if (placed.has(p.id)) continue;
        built.push({
          id: newId(),
          name: stripExt(p.fileName),
          subject: '',
          color: PALETTE[built.length % PALETTE.length],
          fileIds: [p.id],
        });
      }

      setGroups(built);
      setPhase('organize');
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong while preparing your files.',
      );
      setPhase('source');
    } finally {
      busyRef.current = false;
    }
  }, [files, upload]);

  // ── organize phase: edit the proposed grouping ───────────────────────────
  const renameGroup = useCallback((id: string, name: string) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, name } : g)));
  }, []);

  const setGroupSubject = useCallback((id: string, subject: string) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, subject } : g)));
  }, []);

  const setGroupColor = useCallback((id: string, color: string) => {
    setGroups((prev) => prev.map((g) => (g.id === id ? { ...g, color } : g)));
  }, []);

  const moveFile = useCallback((fileId: string, toGroupId: string) => {
    setGroups((prev) => {
      let sourceId: string | null = null;
      const detached = prev.map((g) => {
        if (g.fileIds.includes(fileId)) sourceId = g.id;
        return { ...g, fileIds: g.fileIds.filter((fid) => fid !== fileId) };
      });
      const withTarget = detached.map((g) =>
        g.id === toGroupId ? { ...g, fileIds: [...g.fileIds, fileId] } : g,
      );
      // Drop the source notebook only if the move emptied it.
      return withTarget.filter((g) => g.id !== sourceId || g.fileIds.length > 0);
    });
  }, []);

  const addGroup = useCallback(() => {
    setGroups((prev) => [
      ...prev,
      {
        id: newId(),
        name: 'New notebook',
        subject: '',
        color: PALETTE[prev.length % PALETTE.length],
        fileIds: [],
      },
    ]);
  }, []);

  const removeGroup = useCallback((id: string) => {
    setGroups((prev) => {
      if (prev.length <= 1) return prev;
      const victim = prev.find((g) => g.id === id);
      if (!victim) return prev;
      const rest = prev.filter((g) => g.id !== id);
      // Re-home any files from the removed notebook into the first remaining one.
      if (victim.fileIds.length > 0) {
        rest[0] = { ...rest[0], fileIds: [...rest[0].fileIds, ...victim.fileIds] };
      }
      return rest;
    });
  }, []);

  const backToSource = useCallback(() => {
    setError(null);
    setPhase('source');
  }, []);

  // ── creating phase: commit, then poll aggregate status ───────────────────
  const startPolling = useCallback(
    (jobIds: string[]) => {
      stopPolling();
      const query = encodeURIComponent(jobIds.join(','));
      const poll = async () => {
        try {
          const res = await fetch(`/api/import/status?jobIds=${query}`);
          const json = await res.json().catch(() => null);
          if (json?.success) {
            const next: ImportStatus = json.data;
            setStatus(next);
            if (next.done) {
              stopPolling();
              setPhase('done');
            }
          }
        } catch {
          // Transient network error — keep polling.
        }
      };
      void poll();
      pollRef.current = setInterval(poll, STATUS_POLL_MS);
    },
    [stopPolling],
  );

  const commit = useCallback(async () => {
    if (busyRef.current) return;

    const prepared = preparedRef.current;
    const payloadGroups = groups
      .map((g) => ({
        name: g.name.trim() || 'Imported notes',
        subject: g.subject.trim(),
        color: g.color,
        files: g.fileIds
          .map((fid) => prepared.find((p) => p.id === fid))
          .filter((p): p is PreparedFile => Boolean(p))
          .map((p) => ({
            pdfPath: p.pdfPath,
            fileName: p.fileName,
            pageImagePaths: p.pageImagePaths,
          })),
      }))
      .filter((g) => g.files.length > 0);

    if (payloadGroups.length === 0) {
      setError('Add at least one PDF before continuing.');
      return;
    }

    busyRef.current = true;
    setError(null);
    setPhase('creating');

    try {
      const res = await fetch('/api/import/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groups: payloadGroups, folderId }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.success) {
        throw new Error(
          json?.error ?? 'We could not create your notebooks. Please try again.',
        );
      }

      const committed: CommitResult = json.data;
      setResult(committed);

      if (committed.jobIds.length === 0) {
        // Every PDF was skipped (budget exhausted) — nothing to poll.
        setPhase('done');
        return;
      }
      startPolling(committed.jobIds);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Something went wrong creating your notebooks.',
      );
      setPhase('organize');
    } finally {
      busyRef.current = false;
    }
  }, [groups, folderId, startPolling]);

  const reset = useCallback(() => {
    stopPolling();
    busyRef.current = false;
    preparedRef.current = [];
    setPhase('source');
    setFiles([]);
    setGroups([]);
    setPrepareProgress({ current: 0, total: 0, label: '' });
    setStatus(null);
    setResult(null);
    setError(null);
  }, [stopPolling]);

  const notebookCount = groups.filter((g) => g.fileIds.length > 0).length;

  return {
    phase,
    files,
    addFiles,
    removeFile,
    prepare,
    prepareProgress,
    groups,
    notebookCount,
    renameGroup,
    setGroupSubject,
    setGroupColor,
    moveFile,
    addGroup,
    removeGroup,
    backToSource,
    commit,
    status,
    result,
    error,
    reset,
    maxFiles: MAX_FILES,
    palette: PALETTE,
  };
}
