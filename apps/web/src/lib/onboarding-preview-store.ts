'use client';

/* Client cache for the anonymous onboarding PREVIEW result (real-generation P3).
 *
 * `/start/building` POSTs the captured corpus to /api/start/preview, gets back a
 * `{ previewId, structure, lesson, questions }` payload, and stashes it here. The
 * downstream reveal/session/quiz/weak-point screens read it back — so the real
 * generated path renders end-to-end, with the static sample as the no-material
 * fallback (D11).
 *
 * sessionStorage (not IndexedDB) is right for THIS: the generated payload is
 * small and bounded (one short lesson + 2 questions + a ~5-node skeleton — a few
 * KB), and it must survive the soft navigations across `/start/*`. The heavy
 * source bytes live in onboarding-file-store.ts (IndexedDB); only `previewId`
 * also rides the onboarding draft (onboarding-handoff.ts). Until P4 persists a
 * PendingOnboardingPath, this client copy IS the preview — claim re-materializes
 * it server-side from the stored structure.
 *
 * useSyncExternalStore plumbing mirrors sample-run.ts: the snapshot is cached by
 * the raw string so it returns a STABLE reference across renders (re-parsing each
 * call hands back a new object every time and spins React into a render loop). */

import type { GeneratedPathStructure } from './path-generator';
import type { SampleQuestion } from './sample-run';
import type { OnboardingSourceKind } from './onboarding-preview-constants';

/** The slot-1 lesson, structured for the bespoke `/start/session` layout (the
 *  TipTap `body` is dropped server-side — the screen renders these fields). */
export type StoredPreviewLesson = {
  title: string;
  intro: string;
  example: { label: string; text: string } | null;
  keyIdea: string;
  text: string;
};

export type StoredPreview = {
  previewId: string;
  /** Refined path title from Stage A — the reveal headline. */
  title: string;
  sourceKind: OnboardingSourceKind;
  /** Identity of the material this preview was generated from (source kind +
   *  title + length, or the link URL). The building step skips regeneration when
   *  a stored preview's key matches the current material (one-preview-per-session,
   *  P5); a re-pick changes the key, so a new build regenerates instead of
   *  showing the stale preview. */
  materialKey?: string;
  /** Preview-bounded skeleton (~one section, 4–5 nodes). */
  structure: GeneratedPathStructure;
  lesson: StoredPreviewLesson;
  /** Exactly 2 questions in the sample-run shape (`/start/quiz` + weak-point). */
  questions: SampleQuestion[];
};

const KEY = 'nm:onboardingPreview';

function parse(raw: string): StoredPreview | null {
  try {
    const p = JSON.parse(raw) as Partial<StoredPreview>;
    if (
      !p ||
      typeof p.previewId !== 'string' ||
      typeof p.title !== 'string' ||
      typeof p.structure !== 'object' ||
      p.structure === null ||
      !Array.isArray(p.questions) ||
      p.questions.length === 0 ||
      typeof p.lesson !== 'object' ||
      p.lesson === null
    ) {
      return null;
    }
    return p as StoredPreview;
  } catch {
    return null;
  }
}

export function setPreview(preview: StoredPreview): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(preview));
  } catch {
    /* sessionStorage unavailable (private mode / quota) — the screens fall back
       to the static sample, which is harmless. */
  }
}

/** Drop the cached preview — called when a fresh build starts without real
 *  material, or when generation fails, so a stale result can't leak forward. */
export function clearPreview(): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* see setPreview */
  }
}

let snapRaw: string | null | undefined;
let snapValue: StoredPreview | null = null;

export function getPreviewSnapshot(): StoredPreview | null {
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

/** Written once on the building step before navigation, never mutated while a
 *  screen is mounted, so there is nothing to subscribe to. */
export function subscribePreview(): () => void {
  return () => {};
}

export function getPreviewServerSnapshot(): StoredPreview | null {
  return null;
}
