/* Pre-sign-up handoff between the landing import card and the onboarding bridges.
 * The pasted link rides the URL (?url=, shareable + survives refresh); a picked
 * file can't, and its name is mildly sensitive, so its metadata (name/size/type —
 * NOT the bytes, NOT in the URL) is stashed in sessionStorage and read by the
 * upload bridge. The real file is re-handled by the importer past sign-up; here
 * we only need enough to show "your file". */

import type { OnboardingSourceKind } from './onboarding-preview-constants';

export type PendingUpload = {
  name: string;
  /** bytes */
  size: number;
  /** the File.type MIME (may be '' for some types — fall back to the extension) */
  mime: string;
};

const KEY = 'nm:pendingUpload';

function parse(raw: string): PendingUpload | null {
  try {
    const p = JSON.parse(raw) as Partial<PendingUpload>;
    if (typeof p?.name !== 'string' || typeof p?.size !== 'number') return null;
    return { name: p.name, size: p.size, mime: typeof p.mime === 'string' ? p.mime : '' };
  } catch {
    return null;
  }
}

export function setPendingUpload(u: PendingUpload): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(u));
  } catch {
    /* sessionStorage unavailable (private mode / quota) — the bridge falls back
       to its sample preview, which is harmless. */
  }
}

// useSyncExternalStore plumbing — the canonical SSR-safe way to read client-only
// state without a setState-in-effect. The snapshot is cached by the raw string so
// it returns a STABLE reference across renders (re-parsing each call would hand
// back a new object every time and spin React into an infinite render loop).
let snapRaw: string | null | undefined;
let snapValue: PendingUpload | null = null;

export function getPendingUploadSnapshot(): PendingUpload | null {
  if (typeof window === 'undefined') return null;
  let raw: string | null;
  try {
    raw = window.sessionStorage.getItem(KEY);
  } catch {
    return snapValue;
  }
  if (raw === snapRaw) return snapValue;
  snapRaw = raw;
  snapValue = raw ? parse(raw) : null;
  return snapValue;
}

/** The metadata is written once before navigation and never mutates while the
 *  bridge is mounted, so there's nothing to subscribe to. */
export function subscribePendingUpload(): () => void {
  return () => {};
}

export function getPendingUploadServerSnapshot(): PendingUpload | null {
  return null;
}

/** Human-readable file size, e.g. 812 KB / 3.2 MB. */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export type FileKindInfo = { tag: string; tagColor: string; typeLabel: string };

/** Map a filename / MIME to the tile tag + a human type label. */
export function fileKindInfo(name: string, mime: string): FileKindInfo {
  const ext = name.includes('.') ? name.split('.').pop()!.toLowerCase() : '';
  const is = (...exts: string[]) => exts.includes(ext);
  if (is('pdf') || mime === 'application/pdf') return { tag: 'PDF', tagColor: '#ef5350', typeLabel: 'PDF' };
  if (is('ppt', 'pptx', 'key') || mime.includes('presentation')) return { tag: 'PPT', tagColor: '#e8833a', typeLabel: 'Slides' };
  if (is('doc', 'docx', 'rtf', 'odt') || mime.includes('word')) return { tag: 'DOC', tagColor: '#4178e0', typeLabel: 'Document' };
  if (is('txt', 'md', 'markdown') || mime.startsWith('text/')) return { tag: 'TXT', tagColor: '#6b7280', typeLabel: 'Notes' };
  if (mime.startsWith('image/') || is('png', 'jpg', 'jpeg', 'gif', 'webp', 'heic')) return { tag: 'IMG', tagColor: '#1f9d6b', typeLabel: 'Image' };
  return { tag: 'FILE', tagColor: '#6b7280', typeLabel: ext ? ext.toUpperCase() : 'File' };
}

/* ─────────── onboarding draft ───────────
   The setup wizard (goal → rhythm → build) collects choices across several
   routes; this carries them client-side (sessionStorage), seeded by the bridge
   so a source-user's goal/session pre-fill on W04/W05. Metadata only. */

export type OnboardingDraft = {
  goal?: string;
  /** session length in minutes */
  intensity?: number;
  /** how the user entered: came with a source, or none yet */
  source?: 'link' | 'upload' | 'sample' | null;
  /** the kind of material backing the preview (upload/link/notes/sample) */
  sourceKind?: OnboardingSourceKind;
  /** for a `link` source: the pasted video URL, so the building step can POST it
   *  to /api/start/preview (the URL rode ?url= to the bridge but not past it) */
  sourceUrl?: string;
  /** id of the persisted anonymous preview once /api/start/preview returns it */
  previewId?: string;
};

const DRAFT_KEY = 'nm:onboarding';

export function getOnboardingDraft(): OnboardingDraft {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as OnboardingDraft) : {};
  } catch {
    return {};
  }
}

export function patchOnboardingDraft(patch: Partial<OnboardingDraft>): void {
  if (typeof window === 'undefined') return;
  try {
    const next = { ...getOnboardingDraft(), ...patch };
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(next));
  } catch {
    /* sessionStorage unavailable — later steps fall back to defaults */
  }
}
