'use client';

/* Pre-sign-up byte stash for the anonymous onboarding preview (P1).
 *
 * The uploaded File (PDF / slides) is held in IndexedDB — not sessionStorage —
 * so it survives soft navigations AND a full reload across the /start/* flow and
 * can hold tens of megabytes. Per decision D2 the bytes NEVER hit our servers
 * before auth: only the capped text slice rides the preview POST; the real file
 * is uploaded through the authenticated importer at claim time, then cleared.
 *
 * The capped corpus is parked here too (alongside the file) so the building step
 * can POST it without re-extracting after navigation, and so picking a file is
 * demonstrably end-to-end without any server round-trip.
 *
 * One active onboarding per browser, so a fixed key is enough; an optional `key`
 * keeps the door open for keying by previewId later (P4) without changing
 * callers. Every operation degrades to a no-op / null if IndexedDB is missing
 * (private mode, ancient browser) — the funnel then falls back to sample. */

import type { CappedCorpus } from './onboarding-preview-constants';

const DB_NAME = 'nm-onboarding';
const STORE = 'pending';
const DB_VERSION = 1;
const DEFAULT_KEY = 'current';

const fileSlot = (key: string) => `${key}:file`;
const corpusSlot = (key: string) => `${key}:corpus`;

function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') return resolve(null);
    let req: IDBOpenDBRequest;
    try {
      req = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      return resolve(null);
    }
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) {
        req.result.createObjectStore(STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

async function run<T>(
  mode: IDBTransactionMode,
  op: (store: IDBObjectStore) => IDBRequest,
): Promise<T | null> {
  const db = await openDb();
  if (!db) return null;
  return new Promise<T | null>((resolve) => {
    try {
      const tx = db.transaction(STORE, mode);
      const req = op(tx.objectStore(STORE));
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
      tx.onabort = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/** Stash the raw File bytes client-side (never POSTed pre-auth). */
export function putPendingFile(file: File, key = DEFAULT_KEY): Promise<void> {
  return run('readwrite', (s) => s.put(file, fileSlot(key))).then(() => undefined);
}

/** Read back the stashed File (null if none / IndexedDB unavailable). */
export function getPendingFile(key = DEFAULT_KEY): Promise<File | null> {
  return run<File>('readonly', (s) => s.get(fileSlot(key)));
}

/** Park the capped corpus next to the file for the building step to POST. */
export function putPendingCorpus(corpus: CappedCorpus, key = DEFAULT_KEY): Promise<void> {
  return run('readwrite', (s) => s.put(corpus, corpusSlot(key))).then(() => undefined);
}

/** Read back the parked corpus (null if none). */
export function getPendingCorpus(key = DEFAULT_KEY): Promise<CappedCorpus | null> {
  return run<CappedCorpus>('readonly', (s) => s.get(corpusSlot(key)));
}

/** Drop both the file and corpus for this key — call after a successful claim. */
export async function clearPendingFile(key = DEFAULT_KEY): Promise<void> {
  await run('readwrite', (s) => s.delete(fileSlot(key)));
  await run('readwrite', (s) => s.delete(corpusSlot(key)));
}
