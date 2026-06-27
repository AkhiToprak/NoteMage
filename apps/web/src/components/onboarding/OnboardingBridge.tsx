/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useRef, useState, useSyncExternalStore, type ChangeEvent, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { isInsideNativeShell } from '@/lib/native-bridge';
import {
  formatBytes,
  fileKindInfo,
  setPendingUpload,
  getPendingUploadSnapshot,
  subscribePendingUpload,
  getPendingUploadServerSnapshot,
  patchOnboardingDraft,
  type PendingUpload,
} from '@/lib/onboarding-handoff';
import { extractCappedCorpus } from '@/lib/onboarding-corpus';
import { putPendingFile, putPendingCorpus } from '@/lib/onboarding-file-store';
import { uploadTooLarge, MAX_UPLOAD_LABEL } from '@/lib/onboarding-preview-constants';
import styles from './OnboardingBridge.module.css';

/* Figma "B1 Link bridge" (10:304) + "B2 Upload bridge" (10:356). One screen,
   parametrised by `kind`. The detected-material preview is REAL: the link bridge
   resolves the pasted YouTube URL (from ?url=) via /api/start/video-preview; the
   upload bridge reads the picked file's metadata from the handoff store. Swapping
   the input happens IN PLACE — "Use a different link" reveals an inline field,
   "Choose a different file" re-opens the picker — never bouncing to the landing.
   "Build my path" → sign-up, where the real importer lives. */

type BridgeKind = 'link' | 'upload';

const subscribeNoop = () => () => {};

const SparkGold = (
  <svg viewBox="0 0 29 29" fill="none" aria-hidden focusable="false">
    <path d="M10.6066 0L17.1889 9.81239L28.9778 10.6066L19.1654 17.1889L18.3712 28.9778L11.7889 19.1655L0 18.3712L9.81237 11.7889L10.6066 0Z" fill="#FFC83D" />
  </svg>
);
const SparkPurple = (
  <svg viewBox="0 0 18 18" fill="none" aria-hidden focusable="false">
    <path d="M9 0L11.291 6.70897L18 9L11.291 11.291L9 18L6.70897 11.291L0 9L6.70897 6.70897L9 0Z" fill="#7C5CFF" />
  </svg>
);

const GOALS = [
  { id: 'exam', label: 'Exam', phrase: 'an exam-focused path' },
  { id: 'understand', label: 'Understand', phrase: 'a deeper-understanding path' },
  { id: 'memorize', label: 'Memorize', phrase: 'a memorization-focused path' },
  { id: 'weak', label: 'Weak points', phrase: 'a weak-point-focused path' },
  { id: 'homework', label: 'Homework', phrase: 'a homework-focused path' },
] as const;

const SESSIONS = [5, 10, 15, 30] as const;

const COPY: Record<
  BridgeKind,
  { bubble: string; defaultGoal: string; source: string; secondary: string; detPill: string }
> = {
  link: {
    bubble: 'Nice! I can build a full study path straight from this video.',
    defaultGoal: 'exam',
    source: 'this video',
    secondary: 'Use a different link',
    detPill: 'Detected from your link',
  },
  upload: {
    bubble: "Got it, I'll read your file and turn it into a study path.",
    defaultGoal: 'understand',
    source: 'your file',
    secondary: 'Choose a different file',
    detPill: 'Detected from your upload',
  },
};

/* Figma sample content, shown when the screen is opened without a real input. */
const MOCK_VIDEO = { title: 'Databases for Beginners: SQL Basics', channel: 'freeCodeCamp', thumbnail: null as string | null, duration: '12:30' as string | null };
const MOCK_FILE = { name: 'biology_notes.pdf', meta: '24 pages  ·  3.2 MB  ·  PDF', note: 'Mage will read all 24 pages to pull out the key ideas.', tag: 'PDF', tagColor: '#ef5350' };

type FetchState =
  | { status: 'video'; title: string; channel: string; thumbnail: string | null; duration: string | null }
  | { status: 'error'; reason: string };

type Detected =
  | { status: 'loading' }
  | { status: 'mock' }
  | { status: 'video'; title: string; channel: string; thumbnail: string | null; duration: string | null }
  | { status: 'file'; name: string; meta: string; note: string; tag: string; tagColor: string }
  | { status: 'error'; reason: string };

function deriveDetected(
  kind: BridgeKind,
  url: string,
  file: PendingUpload | null,
  fetchState: FetchState | null,
): Detected {
  if (kind === 'upload') {
    if (!file) return { status: 'mock' };
    const { tag, tagColor, typeLabel } = fileKindInfo(file.name, file.mime);
    return {
      status: 'file',
      name: file.name,
      meta: `${formatBytes(file.size)}  ·  ${typeLabel}`,
      note: 'Mage will read your file to pull out the key ideas.',
      tag,
      tagColor,
    };
  }
  if (!url) return { status: 'mock' };
  if (!fetchState) return { status: 'loading' };
  return fetchState;
}

function VideoCard({ detPill, title, channel, thumbnail, duration }: { detPill: string; title: string; channel: string; thumbnail: string | null; duration: string | null }) {
  const meta = [channel, duration, 'YouTube'].filter(Boolean).join('  ·  ');
  return (
    <>
      <div className={styles.thumb}>
        {thumbnail ? (
          <img className={styles.thumbImg} src={thumbnail} alt="" aria-hidden />
        ) : (
          <>
            <span className={`${styles.thumbSpk} ${styles.thumbSpkA}`}>{SparkGold}</span>
            <span className={`${styles.thumbSpk} ${styles.thumbSpkB}`}>{SparkPurple}</span>
          </>
        )}
        <span className={styles.playBtn}>
          <span className="material-symbols-outlined filled" aria-hidden>play_arrow</span>
        </span>
        {duration && <span className={styles.thumbPill}>{duration}</span>}
      </div>
      <div className={styles.cardBody}>
        <span className={styles.detPill}>{detPill}</span>
        <p className={styles.matTitle}>{title}</p>
        <p className={styles.matMeta}>{meta}</p>
        <p className={styles.matNote}>Mage will use the transcript and key moments to build your path.</p>
      </div>
    </>
  );
}

function FileCard({ detPill, name, meta, note, tag, tagColor }: { detPill: string; name: string; meta: string; note: string; tag: string; tagColor: string }) {
  return (
    <>
      <div className={styles.tile}>
        <span className={styles.fileGlyph}>
          <span className={`${styles.fileLine} ${styles.fileLine1}`} />
          <span className={`${styles.fileLine} ${styles.fileLine2}`} />
          <span className={`${styles.fileLine} ${styles.fileLine3}`} />
          <span className={styles.fileTag} style={{ background: tagColor }}>{tag}</span>
        </span>
      </div>
      <div className={styles.cardBody}>
        <span className={styles.detPill}>{detPill}</span>
        <p className={styles.matTitle}>{name}</p>
        <p className={styles.matMeta}>{meta}</p>
        <p className={styles.matNote}>{note}</p>
      </div>
    </>
  );
}

function SkeletonCard() {
  return (
    <>
      <div className={styles.skelThumb} aria-hidden />
      <div className={styles.cardBody} aria-hidden>
        <div className={styles.skelBar} style={{ width: 150, height: 22 }} />
        <div className={styles.skelBar} style={{ width: '72%', height: 18, marginTop: 14 }} />
        <div className={styles.skelBar} style={{ width: '44%', height: 13, marginTop: 12 }} />
        <div className={styles.skelBar} style={{ width: '86%', height: 12, marginTop: 12 }} />
      </div>
    </>
  );
}

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  unsupported: { title: "That doesn't look like a YouTube link", body: 'Paste a public YouTube URL and I’ll detect the video for you.' },
  invalid: { title: 'No link detected', body: 'Paste a YouTube link below to get started.' },
  unavailable: { title: "I couldn't reach that video", body: 'It might be private or removed — try a different link.' },
};

function ErrorCard({ reason }: { reason: string }) {
  const msg = ERROR_COPY[reason] ?? ERROR_COPY.unavailable;
  return (
    <>
      <div className={styles.errIcon} aria-hidden>
        <span className="material-symbols-outlined">link_off</span>
      </div>
      <div className={styles.cardBody}>
        <p className={styles.matTitle}>{msg.title}</p>
        <p className={styles.matNote}>{msg.body}</p>
      </div>
    </>
  );
}

export default function OnboardingBridge({ kind }: { kind: BridgeKind }) {
  const router = useRouter();
  const copy = COPY[kind];
  const [goal, setGoal] = useState<string>(copy.defaultGoal);
  const [session, setSession] = useState<number>(15);

  // Native shells (iOS WebView, Electron) boot into the app, never the marketing
  // funnel — bounce any deep link that lands a native user on a bridge.
  useEffect(() => {
    if (isInsideNativeShell()) router.replace('/auth/login');
  }, [router]);

  // Real detected material, read client-side via useSyncExternalStore (SSR-safe,
  // and avoids the useSearchParams prerender bailout). User-event overrides layer
  // on top so the input can be swapped in place. `detected` is DERIVED, so the
  // only setState in an effect is the async video-preview result below.
  const storedUpload = useSyncExternalStore(
    subscribePendingUpload,
    getPendingUploadSnapshot,
    getPendingUploadServerSnapshot,
  );
  const queryUrl = useSyncExternalStore(
    subscribeNoop,
    () => new URLSearchParams(window.location.search).get('url')?.trim() ?? '',
    () => '',
  );

  const [urlOverride, setUrlOverride] = useState<string | null>(null);
  const [uploadOverride, setUploadOverride] = useState<PendingUpload | null>(null);
  const [fetchState, setFetchState] = useState<FetchState | null>(null);
  const [mode, setMode] = useState<'preview' | 'entry'>('preview');
  const [draft, setDraft] = useState('');
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeUrl = urlOverride ?? queryUrl;
  const activeUpload = uploadOverride ?? storedUpload;

  useEffect(() => {
    if (kind !== 'link' || !activeUrl) return;
    let active = true;
    fetch(`/api/start/video-preview?url=${encodeURIComponent(activeUrl)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!active) return;
        if (r.ok && data?.ok) {
          setFetchState({ status: 'video', title: data.title, channel: data.channel, thumbnail: data.thumbnail ?? null, duration: data.duration ?? null });
        } else {
          setFetchState({ status: 'error', reason: typeof data?.reason === 'string' ? data.reason : 'unavailable' });
        }
      })
      .catch(() => {
        if (active) setFetchState({ status: 'error', reason: 'unavailable' });
      });
    return () => {
      active = false;
    };
  }, [kind, activeUrl]);

  const detected = deriveDetected(kind, activeUrl, activeUpload, fetchState);
  const goalPhrase = GOALS.find((g) => g.id === goal)?.phrase ?? 'a study path';
  const isError = detected.status === 'error';
  const isEntry = mode === 'entry';
  const bubble = isEntry
    ? 'Paste a link and I’ll take a look.'
    : isError
      ? "Hmm — I couldn't read that one. Want to try another?"
      : copy.bubble;
  // Goal/session only make sense once there's something to build from.
  const showControls = !isError && !isEntry;

  // Re-detect a freshly pasted link, in place. Clearing fetchState here (a user
  // event, not an effect) makes the derived state fall back to 'loading'.
  const handleDetect = (e: FormEvent) => {
    e.preventDefault();
    const u = draft.trim();
    if (!u) return;
    setUrlOverride(u);
    setFetchState(null);
    setMode('preview');
    // keep the URL bar honest so a refresh re-detects the same link
    window.history.replaceState(null, '', `/start/link?url=${encodeURIComponent(u)}`);
  };

  const onSecondary = () => {
    if (kind === 'link') {
      setDraft('');
      setMode('entry');
    } else {
      fileInputRef.current?.click();
    }
  };

  const onBridgeFilePicked = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the same file be re-picked
    if (!file) return;
    // Client reject (P5): refuse a file too large for the preview before stashing.
    if (uploadTooLarge(file.size)) {
      setUploadError(`That file is over ${MAX_UPLOAD_LABEL}. Try a smaller PDF, slides, or notes.`);
      return;
    }
    setUploadError('');
    const meta: PendingUpload = { name: file.name, size: file.size, mime: file.type };
    setPendingUpload(meta); // persist so a refresh keeps showing it
    setUploadOverride(meta); // swap the preview in place
    // Re-capture: a swapped file must replace the landing's stashed corpus, or the
    // building step would POST the OLD file's text. Bytes stay client-side (D2).
    void putPendingFile(file);
    void extractCappedCorpus(file).then((corpus) => {
      if (corpus.text) void putPendingCorpus(corpus);
    });
  };

  // Into the onboarding wizard at the goal step (step 1, Add material, is done —
  // the bridge supplied the source). Carry the picks so W04/W05 pre-fill and W07
  // shows the real-source ("try a sample?") branch.
  const onBuild = () => {
    patchOnboardingDraft({
      goal,
      intensity: session,
      source: kind,
      sourceKind: kind,
      // The link URL doesn't survive the hop to /start/building, so carry it on
      // the draft for the preview POST. Upload's corpus is already in IndexedDB.
      ...(kind === 'link' ? { sourceUrl: activeUrl } : {}),
    });
    router.push('/start/goal');
  };

  return (
    <div className={styles.root}>
      <Link href="/" className={styles.logo} aria-label="NoteMage — home">
        <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
      </Link>
      <span className={`${styles.spk} ${styles.spkA}`} aria-hidden>{SparkGold}</span>
      <span className={`${styles.spk} ${styles.spkB}`} aria-hidden>{SparkPurple}</span>

      <div className={styles.wrap}>
        {/* Mage avatar + speech bubble */}
        <div className={styles.bubbleRow}>
          <span className={styles.avatar}>
            <img src="/landing/mage-plain.png" alt="" aria-hidden />
          </span>
          <span className={styles.bubble}>{bubble}</span>
        </div>

        {/* In-place link entry, or the detected-material preview */}
        {isEntry ? (
          <form className={styles.entryCard} onSubmit={handleDetect}>
            <input
              className={styles.entryInput}
              type="text"
              inputMode="url"
              autoComplete="off"
              autoFocus
              placeholder="Paste a YouTube link…"
              aria-label="Paste a YouTube link"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button type="submit" className={styles.entryBtn} disabled={!draft.trim()}>
              Detect
            </button>
          </form>
        ) : (
          <div className={styles.card}>
            {detected.status === 'loading' && <SkeletonCard />}
            {detected.status === 'mock' &&
              (kind === 'link' ? (
                <VideoCard detPill={copy.detPill} title={MOCK_VIDEO.title} channel={MOCK_VIDEO.channel} thumbnail={MOCK_VIDEO.thumbnail} duration={MOCK_VIDEO.duration} />
              ) : (
                <FileCard detPill={copy.detPill} name={MOCK_FILE.name} meta={MOCK_FILE.meta} note={MOCK_FILE.note} tag={MOCK_FILE.tag} tagColor={MOCK_FILE.tagColor} />
              ))}
            {detected.status === 'video' && (
              <VideoCard detPill={copy.detPill} title={detected.title} channel={detected.channel} thumbnail={detected.thumbnail} duration={detected.duration} />
            )}
            {detected.status === 'file' && (
              <FileCard detPill={copy.detPill} name={detected.name} meta={detected.meta} note={detected.note} tag={detected.tag} tagColor={detected.tagColor} />
            )}
            {detected.status === 'error' && <ErrorCard reason={detected.reason} />}
          </div>
        )}

        {showControls && (
          <>
            {/* Goal */}
            <div className={styles.group}>
              <p className={styles.qLabel}>What are you preparing for?</p>
              <div className={styles.chips}>
                {GOALS.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={`${styles.chip} ${goal === g.id ? styles.chipActive : ''}`}
                    aria-pressed={goal === g.id}
                    onClick={() => setGoal(g.id)}
                  >
                    {g.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Session length */}
            <div className={styles.group}>
              <p className={styles.qLabel}>Session length</p>
              <div className={styles.chips}>
                {SESSIONS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    className={`${styles.chip} ${session === m ? styles.chipActive : ''}`}
                    aria-pressed={session === m}
                    onClick={() => setSession(m)}
                  >
                    {m} min
                  </button>
                ))}
              </div>
            </div>

            {/* Live confirmation */}
            <div className={styles.banner}>
              <span className={styles.bSpk}>{SparkPurple}</span>
              <span className={styles.bText}>
                Mage will build {goalPhrase} in {session}-minute sessions from {copy.source}.
              </span>
            </div>
          </>
        )}

        {/* Actions */}
        <div className={styles.actions}>
          {isEntry ? (
            <button type="button" className={styles.btnGhost} onClick={() => setMode('preview')}>
              Cancel
            </button>
          ) : (
            <>
              {!isError && (
                <button type="button" className={styles.btnPrimary} onClick={onBuild}>
                  Build my path <span aria-hidden>→</span>
                </button>
              )}
              <button type="button" className={styles.btnGhost} onClick={onSecondary}>
                {copy.secondary}
              </button>
            </>
          )}
        </div>

        {uploadError && (
          <p
            role="alert"
            style={{ marginTop: 12, color: 'var(--error)', fontSize: 13, lineHeight: 1.4, textAlign: 'center' }}
          >
            {uploadError}
          </p>
        )}

        {kind === 'upload' && (
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.ppt,.pptx,.doc,.docx,.txt,.md,.rtf,.odt,image/*"
            hidden
            onChange={onBridgeFilePicked}
          />
        )}

        <p className={styles.note}>No account needed yet — save your progress after.</p>
      </div>
    </div>
  );
}
