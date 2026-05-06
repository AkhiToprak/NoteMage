/**
 * Web-side native bridge.
 *
 * Same `NativeBridge` shape as the iOS shell (`apps/mobile/src/bridge.ts`)
 * and the future Electron preload (`apps/desktop/src/preload.ts`). When the
 * web app runs inside one of those shells, this module routes calls across
 * the host bridge. When it runs in a plain browser, every method falls back
 * to a sensible web equivalent or a no-op.
 *
 * Usage:
 *
 *   import { nativeBridge } from '@/lib/native-bridge';
 *
 *   if (nativeBridge.isNative()) {
 *     nativeBridge.haptic('light');
 *   }
 *
 *   const off = nativeBridge.onPencilTap(() => toggleEraser());
 *   return () => off();
 *
 * The module is safe to import from server components — it lazily reads
 * `window` only when `ensureClient()` confirms we're in the browser. Every
 * server-side call resolves to the web-fallback path so SSR doesn't crash.
 */

import type {
  AppleUser,
  Entitlement,
  HapticStyle,
  NativeBridge,
  NativePlatform,
  NetworkState,
  Product,
  PurchaseResult,
  PushRegistration,
  RestoreResult,
  ShareContent,
  SignInWithAppleResult,
} from '@notemage/shared';

const isClient = (): boolean => typeof window !== 'undefined';

// Cached platform detection — runs the first time `platform()` is called
// and never re-runs (the host shell can't change underneath us).
let cachedPlatform: NativePlatform | null = null;
function detectPlatform(): NativePlatform {
  if (cachedPlatform) return cachedPlatform;
  if (!isClient()) {
    cachedPlatform = 'web';
    return cachedPlatform;
  }
  if (window.NotemageBridge && typeof window.NotemageBridge.platform === 'function') {
    cachedPlatform = window.NotemageBridge.platform();
    return cachedPlatform;
  }
  if (window.electronBridge) {
    cachedPlatform = 'windows';
    return cachedPlatform;
  }
  if (window.ReactNativeWebView) {
    cachedPlatform = 'ios';
    return cachedPlatform;
  }
  cachedPlatform = 'web';
  return cachedPlatform;
}

class WebFallbackBridge implements NativeBridge {
  // ── Capability ──────────────────────────────────────────────────────────
  isNative(): boolean {
    return false;
  }
  platform(): NativePlatform {
    return 'web';
  }

  // ── Auth / IAP — not supported on web yet ───────────────────────────────
  async signInWithApple(): Promise<SignInWithAppleResult> {
    throw new Error('signInWithApple is unavailable in the browser');
  }
  async getProducts(): Promise<Product[]> {
    return [];
  }
  async purchase(): Promise<PurchaseResult> {
    return { status: 'error', message: 'IAP not available on web' };
  }
  async restorePurchases(): Promise<RestoreResult> {
    return { status: 'nothing-to-restore' };
  }
  async getEntitlement(): Promise<Entitlement> {
    // Web build reads entitlements from `/api/me/entitlement` directly,
    // so this fallback should not normally be hit.
    const res = await fetch('/api/me/entitlement', { cache: 'no-store' });
    if (!res.ok) throw new Error(`Entitlement fetch failed (${res.status})`);
    return (await res.json()) as Entitlement;
  }

  // ── UX affordances ──────────────────────────────────────────────────────
  haptic(style: HapticStyle): void {
    if (!isClient()) return;
    if (typeof navigator.vibrate !== 'function') return;
    const ms = style === 'heavy' ? 30 : style === 'medium' ? 18 : 8;
    navigator.vibrate(ms);
  }

  async share(content: ShareContent): Promise<void> {
    if (!isClient()) return;
    const nav = navigator as Navigator & { share?: (data: ShareContent) => Promise<void> };
    if (typeof nav.share === 'function') {
      await nav.share({ url: content.url, title: content.title });
      return;
    }
    // Fallback: copy to clipboard so the user can paste it themselves.
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(content.url);
    }
  }

  openExternal(url: string): void {
    if (!isClient()) return;
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  async requestBiometricUnlock(): Promise<boolean> {
    // Browsers expose biometrics through WebAuthn, but the user flow is
    // very different (it ties to a credential). For Phase 2 we treat the
    // web fallback as "no biometric, treat the user as unlocked".
    return true;
  }

  async registerPush(): Promise<PushRegistration> {
    throw new Error('registerPush is unavailable in the browser');
  }

  // ── Events that don't exist on web ──────────────────────────────────────
  onPencilTap(): () => void {
    return () => {};
  }

  onNetworkChange(callback: (state: NetworkState) => void): () => void {
    if (!isClient()) return () => {};
    const handleOnline = () => callback('online');
    const handleOffline = () => callback('offline');
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }
}

class IOSWebViewBridge implements NativeBridge {
  // The shell injects `window.NotemageBridge` *and* exposes a dispatch
  // function (`window.__notemageDispatch`) for native → web events.
  // We delegate to it directly — both the request/response routing and
  // the event registry already live in the injected JS, so this class
  // is a thin typed facade rather than a second message-pump.
  private readonly shellBridge: NativeBridge;

  constructor() {
    if (!isClient() || !window.NotemageBridge) {
      throw new Error('IOSWebViewBridge requires window.NotemageBridge');
    }
    this.shellBridge = window.NotemageBridge;
  }

  isNative(): boolean {
    return true;
  }
  platform(): NativePlatform {
    return this.shellBridge.platform();
  }

  signInWithApple(): Promise<SignInWithAppleResult> {
    return this.shellBridge.signInWithApple();
  }
  getProducts(): Promise<Product[]> {
    return this.shellBridge.getProducts();
  }
  purchase(productId: string): Promise<PurchaseResult> {
    return this.shellBridge.purchase(productId);
  }
  restorePurchases(): Promise<RestoreResult> {
    return this.shellBridge.restorePurchases();
  }
  getEntitlement(): Promise<Entitlement> {
    return this.shellBridge.getEntitlement();
  }

  haptic(style: HapticStyle): void {
    this.shellBridge.haptic(style);
  }
  share(content: ShareContent): Promise<void> {
    return this.shellBridge.share(content);
  }
  openExternal(url: string): void {
    this.shellBridge.openExternal(url);
  }
  requestBiometricUnlock(): Promise<boolean> {
    return this.shellBridge.requestBiometricUnlock();
  }
  registerPush(): Promise<PushRegistration> {
    return this.shellBridge.registerPush();
  }

  onPencilTap(callback: () => void): () => void {
    return this.shellBridge.onPencilTap(callback);
  }
  onNetworkChange(callback: (state: NetworkState) => void): () => void {
    return this.shellBridge.onNetworkChange(callback);
  }
}

// Pick an implementation once and cache the singleton. We deliberately
// instantiate lazily so that SSR doesn't try to read `window`.
let cached: NativeBridge | null = null;

function getBridge(): NativeBridge {
  if (cached) return cached;
  const platform = detectPlatform();
  if (platform === 'ios' && isClient() && window.NotemageBridge) {
    cached = new IOSWebViewBridge();
  } else if (platform === 'windows' && isClient() && window.electronBridge) {
    cached = window.electronBridge;
  } else {
    cached = new WebFallbackBridge();
  }
  return cached;
}

// Public API: a Proxy so the singleton is created on first access. This
// means importing this module on the server is free, and the first call
// from a client component lazily wires things up.
export const nativeBridge: NativeBridge = new Proxy({} as NativeBridge, {
  get(_target, prop) {
    const bridge = getBridge();
    const value = (bridge as unknown as Record<string, unknown>)[prop as string];
    if (typeof value === 'function') return value.bind(bridge);
    return value;
  },
});

// Convenience hooks consumers will reach for. Both unsubscribe on cleanup
// so they're safe to use directly inside `useEffect`.
export function isInsideNativeShell(): boolean {
  return getBridge().isNative();
}

export function getNativePlatform(): NativePlatform {
  return getBridge().platform();
}

// Re-export shared types so consumers don't have to add a second import.
export type {
  AppleUser,
  Entitlement,
  HapticStyle,
  NativeBridge,
  NativePlatform,
  NetworkState,
  Product,
  PurchaseResult,
  PushRegistration,
  RestoreResult,
  ShareContent,
  SignInWithAppleResult,
};
