/* eslint-disable @next/next/no-img-element */
'use client';

import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { getOnboardingDraft, patchOnboardingDraft } from '@/lib/onboarding-handoff';
import { getPendingCorpus } from '@/lib/onboarding-file-store';
import { setPreview, clearPreview, getPreviewSnapshot } from '@/lib/onboarding-preview-store';
import TurnstileWidget, { turnstileEnabled } from '@/components/auth/TurnstileWidget';
import styles from './Building.module.css';

/* Figma "W06 Generating" (node 14:742) — the build step. Real-generation P3: on
   entry this kicks the anonymous preview (POST /api/start/preview) for whatever
   material the visitor brought, and the timed checklist + progress bar plays as a
   MASK over the wait. It advances to the path reveal (W07) only once generation
   resolves (so the result is ready), with the animation as a natural min-display
   so a fast result doesn't flash. No material (the sample/demo path), or a failed
   generation, falls straight through to the reveal's static sample (D11). */

const noopSubscribe = () => () => {};

/** Goal id → a short readable brief that steers the preview's tone. */
const GOAL_BRIEF: Record<string, string> = {
  exam: 'prepare for an exam',
  understand: 'understand the material deeply',
  memorize: 'memorize the key facts',
  weak: 'fix weak points',
  homework: 'work through homework',
};

/** idle → (pending → ready|failed) for a real source; sample when there's no
 *  material to generate from. The reveal route waits for a non-pending state. */
type GenState = 'idle' | 'pending' | 'ready' | 'failed' | 'sample';

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

function firstStepLabel(source: string): string {
  if (source === 'link') return 'Reading the video transcript';
  if (source === 'sample') return 'Reading the sample notes';
  return 'Reading your material';
}
const REST_STEPS = ['Finding main topics', 'Extracting key concepts', 'Preparing questions', 'Creating your first session'];

export default function BuildingPage() {
  const router = useRouter();
  const source = useSyncExternalStore(noopSubscribe, () => getOnboardingDraft().source ?? '', () => '');
  const steps = [firstStepLabel(source), ...REST_STEPS];
  const [step, setStep] = useState(0);
  const [gen, setGen] = useState<GenState>('idle');
  const [turnstileToken, setTurnstileToken] = useState('');
  const startedRef = useRef(false);

  // Kick the real preview once on entry (masked by the checklist). Assembles the
  // POST body from whatever the capture step stashed: upload/notes → the capped
  // corpus in IndexedDB; link → the URL on the draft. No real material → sample.
  // Re-runs when a Turnstile token resolves (P5) so the gated path proceeds.
  useEffect(() => {
    if (startedRef.current) return;
    let cancelled = false;
    void (async () => {
      const draft = getOnboardingDraft();
      const kind = draft.sourceKind;

      // Build the POST body AND a material identity key (source + title + length,
      // or the link URL) so a cached preview can be matched to the current input.
      let body: Record<string, unknown> | null = null;
      let materialKey = '';
      if (kind === 'upload' || kind === 'notes') {
        const corpus = await getPendingCorpus();
        if (corpus?.text) {
          body = { sourceKind: kind, title: corpus.title, cappedText: corpus.text };
          materialKey = `${kind}:${corpus.title}:${corpus.text.length}`;
        }
      } else if (kind === 'link' && draft.sourceUrl) {
        body = { sourceKind: 'link', url: draft.sourceUrl };
        materialKey = `link:${draft.sourceUrl}`;
      }
      if (cancelled) return;

      if (!body) {
        // Demo / no material / private-mode capture miss → the reveal shows the
        // static sample. Clear any stale preview from an earlier run first.
        clearPreview();
        startedRef.current = true;
        setGen('sample');
        return;
      }

      // One-preview-per-session (P5): a cached preview for the SAME material lets
      // re-entry (back-nav, soft reload) skip straight through — never re-billing
      // the model. A re-pick changes materialKey, so it falls through to a fresh
      // generation instead of showing a stale preview.
      const cached = getPreviewSnapshot();
      if (cached?.materialKey && cached.materialKey === materialKey) {
        startedRef.current = true;
        setGen('ready');
        return;
      }

      // Bot gate (P5): when Turnstile is configured, hold generation until a token
      // resolves (the effect re-runs on token change — don't mark started so it
      // re-enters cleanly). Fully dormant until NEXT_PUBLIC_TURNSTILE_SITE_KEY is
      // set, so local/dev runs POST immediately as before.
      if (turnstileEnabled && !turnstileToken) return;

      startedRef.current = true;
      body.goal = GOAL_BRIEF[draft.goal ?? ''] ?? draft.goal ?? undefined;
      body.intensity = draft.intensity != null ? String(draft.intensity) : undefined;
      if (turnstileToken) body.turnstileToken = turnstileToken;
      setGen('pending');
      try {
        const res = await fetch('/api/start/preview', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.ok) throw new Error(typeof data?.reason === 'string' ? data.reason : 'failed');
        if (cancelled) return;
        setPreview({
          previewId: data.previewId,
          title: data.title,
          sourceKind: data.sourceKind,
          structure: data.structure,
          lesson: data.lesson,
          questions: data.questions,
          materialKey,
        });
        patchOnboardingDraft({ previewId: data.previewId });
        setGen('ready');
      } catch {
        // Any miss (rate-limit, Turnstile, model failure) → fall back to sample.
        clearPreview();
        if (!cancelled) setGen('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [turnstileToken]);

  // Don't hang the funnel if Turnstile is configured but never yields a token
  // (adblock, offline, a failed challenge) — fall back to the sample reveal after
  // a grace window. No-op while dormant or once generation has started.
  useEffect(() => {
    if (!turnstileEnabled || turnstileToken || startedRef.current) return;
    const t = setTimeout(() => {
      if (!startedRef.current) {
        clearPreview();
        startedRef.current = true;
        setGen('sample');
      }
    }, 12_000);
    return () => clearTimeout(t);
  }, [turnstileToken]);

  // Drive the checklist; once it finishes, hand off to the reveal — but only after
  // generation has resolved, so the result is in the store before /start/path
  // reads it. A still-`pending` (or not-yet-started) gen holds on the last step.
  useEffect(() => {
    if (step >= steps.length) {
      if (gen === 'idle' || gen === 'pending') return;
      const t = setTimeout(() => router.replace('/start/path'), 400);
      return () => clearTimeout(t);
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = setTimeout(() => setStep((s) => s + 1), step === 0 ? 400 : reduce ? 420 : 1000);
    return () => clearTimeout(t);
  }, [step, steps.length, router, gen]);

  const progressPct = Math.min(100, Math.round((step / steps.length) * 100));

  return (
    <div className={styles.root}>
      <span className={styles.logo} aria-hidden>
        <img src="/landing/notemage-wordmark.png" alt="NoteMage" width={80} height={30} />
      </span>

      <div className={styles.stage}>
        <div className={styles.illo}>
          <span className={styles.blob1} aria-hidden />
          <span className={styles.blob2} aria-hidden />
          <span className={`${styles.paper} ${styles.paperA}`} aria-hidden>
            <span className={styles.paperHead} />
            <span className={`${styles.paperLine} ${styles.pl1}`} />
            <span className={`${styles.paperLine} ${styles.pl2}`} />
            <span className={`${styles.paperLine} ${styles.pl3}`} />
          </span>
          <span className={`${styles.paper} ${styles.paperB}`} aria-hidden>
            <span className={styles.paperHead} />
            <span className={`${styles.paperLine} ${styles.pl1}`} />
            <span className={`${styles.paperLine} ${styles.pl2}`} />
            <span className={`${styles.paperLine} ${styles.pl3}`} />
          </span>
          <img className={styles.illoMascot} src="/landing/mage-wand.png" alt="" aria-hidden />
          <span className={`${styles.illoSpk} ${styles.spkA}`} aria-hidden>{SparkGold}</span>
          <span className={`${styles.illoSpk} ${styles.spkB}`} aria-hidden>{SparkPurple}</span>
          <span className={`${styles.illoSpk} ${styles.spkC}`} aria-hidden>{SparkGold}</span>
          <span className={`${styles.illoSpk} ${styles.spkD}`} aria-hidden>{SparkPurple}</span>
          <span className={styles.dots} aria-hidden>
            <span className={`${styles.dot} ${styles.dotOn}`} />
            <span className={styles.dotBar} />
            <span className={`${styles.dot} ${progressPct >= 50 ? styles.dotOn : ''}`} />
            <span className={styles.dotBar} />
            <span className={`${styles.dot} ${progressPct >= 100 ? styles.dotOn : ''}`} />
          </span>
        </div>

        <h1 className={styles.title}>Building your path…</h1>
        <p className={styles.subtitle}>Mage is turning your material into small study steps.</p>

        <div className={styles.checklist}>
          {steps.map((label, i) => {
            const state = i < step ? 'Done' : i === step ? 'Active' : 'Pending';
            return (
              <div key={label} className={styles.item}>
                {i < steps.length - 1 && <span className={styles.itemLine} aria-hidden />}
                <span className={`${styles.si} ${styles[`si${state}`]}`} aria-hidden>{i < step ? '✓' : ''}</span>
                <span className={`${styles.label} ${styles[`label${state}`]}`}>{label}</span>
              </div>
            );
          })}
        </div>

        <p className={styles.hint}>This usually takes less than a minute</p>
        <div className={styles.progress}>
          <span className={styles.progressFill} style={{ width: `${progressPct}%` }} />
        </div>

        {/* Bot gate (P5) — renders only when Turnstile is configured; the preview
            POST waits for its token. Dormant (nothing shown) otherwise. */}
        {turnstileEnabled && (
          <div style={{ marginTop: 20 }}>
            <TurnstileWidget onToken={setTurnstileToken} theme="light" />
          </div>
        )}
      </div>
    </div>
  );
}
