/**
 * Central haptics helper for the whole web app.
 *
 * The mobile app is a WebView shell (apps/mobile) wrapping this web UI, so
 * "haptics on taps" lives here, not in React Native. Every component talks to
 * THIS module — never to `nativeBridge.haptic` directly — so the two gates
 * below are enforced in exactly one place:
 *
 *   1. Native-shell only — fires solely inside the iOS WebView / Electron shell
 *      (`isInsideNativeShell()`). Plain desktop and mobile *web* browsers stay
 *      silent; a buzz on every tap in a browser tab is noise, not feedback.
 *   2. User preference — a single on/off setting (default ON), stored
 *      device-locally in localStorage. A haptic motor is a property of the
 *      device, not the account, so the preference is intentionally per-device
 *      (and needs no DB column / API round-trip).
 *
 * Plus a short coalescing window so a single user action that produces both a
 * pointer event and a synthesized mouse event only buzzes once.
 *
 * Usage:
 *
 *   import { haptics } from '@/lib/haptics';
 *   haptics.tap();              // light impact — button presses
 *   haptics.select();           // selection tick — toggles, tabs, options
 *   haptics.success();          // correct answer, checkpoint passed
 *   haptics.error();            // wrong answer
 *   haptics.impact('heavy');    // raw passthrough for celebration timelines
 *
 * SSR-safe: imports are side-effect-free and every `window` access is guarded.
 */

import type { HapticStyle } from '@notemage/shared';
import { isInsideNativeShell, nativeBridge } from './native-bridge';

const STORAGE_KEY = 'notemage:haptics-enabled';

// Coalesce window (ms). A real button press fires `pointerdown` and then a
// synthesized `mousedown`/`click`; without this they'd double-buzz. Distinct
// user actions are always further apart than this.
const COALESCE_MS = 40;

// Cached preference. `null` = not yet read from storage this session.
let enabledCache: boolean | null = null;
let lastFireAt = 0;
let storageListenerAttached = false;

function readStoredEnabled(): boolean {
  if (typeof window === 'undefined') return true; // SSR default: on
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    // Default ON — only an explicit "0" disables.
    return v !== '0';
  } catch {
    return true;
  }
}

// Keep the cache fresh across tabs / other components that flip the setting.
function ensureStorageListener(): void {
  if (storageListenerAttached || typeof window === 'undefined') return;
  storageListenerAttached = true;
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) enabledCache = e.newValue !== '0';
  });
}

/** Whether haptics are enabled in the user's preference (default true). */
export function hapticsEnabled(): boolean {
  ensureStorageListener();
  if (enabledCache === null) enabledCache = readStoredEnabled();
  return enabledCache;
}

/** Persist the on/off preference (device-local) and update the live cache. */
export function setHapticsEnabled(on: boolean): void {
  enabledCache = on;
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, on ? '1' : '0');
  } catch {
    /* ignore blocked storage */
  }
}

// The one gate every public method funnels through.
function fire(style: HapticStyle): void {
  if (typeof window === 'undefined') return;
  if (!isInsideNativeShell()) return; // native app only
  if (!hapticsEnabled()) return; // user setting

  const now =
    typeof performance !== 'undefined' && typeof performance.now === 'function'
      ? performance.now()
      : Date.now();
  if (now - lastFireAt < COALESCE_MS) return;
  lastFireAt = now;

  try {
    nativeBridge.haptic(style);
  } catch {
    /* haptics are always best-effort */
  }
}

export const haptics = {
  /** Light tap — the default for button presses and generic clicks. */
  tap(): void {
    fire('light');
  },
  /** Selection tick — toggles, tabs, segmented controls, pickable options. */
  select(): void {
    fire('selection');
  },
  /** Success notification — correct answer, checkpoint passed, achievement. */
  success(): void {
    fire('success');
  },
  /** Warning notification. */
  warning(): void {
    fire('warning');
  },
  /** Error notification — a wrong answer. */
  error(): void {
    fire('error');
  },
  /** Raw impact passthrough for orchestrated timelines (e.g. the streak takeover). */
  impact(style: 'light' | 'medium' | 'heavy'): void {
    fire(style);
  },
} as const;
