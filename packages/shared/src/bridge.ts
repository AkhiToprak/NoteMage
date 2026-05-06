// Native bridge protocol shared by:
//   - apps/web        (the Next.js app, which feature-detects the bridge)
//   - apps/mobile     (Expo + react-native-webview shell, iOS)
//   - apps/desktop    (Electron shell, Windows — added in Phase 3)
//
// The same TypeScript interface is implemented twice:
//   1. apps/mobile/src/bridge.ts injects a `window.NotemageBridge` object into
//      the WebView via injectedJavaScript and routes messages back to Expo APIs
//      using react-native-webview's postMessage protocol.
//   2. apps/web/src/lib/native-bridge.ts is a thin singleton that detects
//      `window.ReactNativeWebView` (iOS) or `window.electronBridge` (Windows)
//      and falls back to no-op / Web Platform equivalents in a plain browser.
//
// Keep this file dependency-free — it must import cleanly into both a React
// Native runtime and a Next.js (server + browser) bundle.

export type NativePlatform = 'ios' | 'windows' | 'web';

export type HapticStyle = 'light' | 'medium' | 'heavy';

export interface AppleUser {
  id: string;
  email: string | null;
  fullName: string | null;
}

export interface SignInWithAppleResult {
  idToken: string;
  user: AppleUser;
}

export type Tier = 'FREE' | 'PRO' | 'PLUS';

export interface Entitlement {
  tier: Tier;
  source: 'APPLE_IAP' | 'PADDLE' | 'LEMON_SQUEEZY' | 'MANUAL' | null;
  expiresAt: string | null; // ISO-8601
  inGracePeriod: boolean;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  priceString: string; // already formatted in the store's currency
  priceMicros: number;
  currencyCode: string;
}

export type PurchaseResult =
  | { status: 'success'; entitlement: Entitlement }
  | { status: 'cancelled' }
  | { status: 'error'; message: string };

export type RestoreResult =
  | { status: 'restored'; entitlement: Entitlement }
  | { status: 'nothing-to-restore' }
  | { status: 'error'; message: string };

export interface ShareContent {
  url: string;
  title: string;
}

export interface PushRegistration {
  token: string;
  // 'apns' on iOS, 'fcm' on Android (Phase 3+ may add windows toast tokens)
  provider: 'apns' | 'fcm' | 'wns';
}

// Network state events broadcast from the shell into the web app so the
// web side can render its own offline banner if it wants to. The shell
// also renders a hard offline screen of its own (App Store 4.2 requires
// a graceful native fallback rather than a default browser error page).
export type NetworkState = 'online' | 'offline';

export interface NativeBridge {
  isNative(): boolean;
  platform(): NativePlatform;

  // ── Auth / account ────────────────────────────────────────────────────
  signInWithApple(): Promise<SignInWithAppleResult>;

  // ── In-app purchases (wired in Phase 6 / Phase 7) ─────────────────────
  getProducts(): Promise<Product[]>;
  purchase(productId: string): Promise<PurchaseResult>;
  restorePurchases(): Promise<RestoreResult>;
  getEntitlement(): Promise<Entitlement>;

  // ── UX affordances ────────────────────────────────────────────────────
  haptic(style: HapticStyle): void;
  share(content: ShareContent): Promise<void>;
  openExternal(url: string): void;
  requestBiometricUnlock(): Promise<boolean>;

  // ── Push notifications ────────────────────────────────────────────────
  registerPush(): Promise<PushRegistration>;

  // ── Apple Pencil gestures (iOS only — no-op elsewhere) ────────────────
  // Returns an unsubscribe function so React effects can tear down cleanly.
  onPencilTap(callback: () => void): () => void;

  // ── Network state events ──────────────────────────────────────────────
  onNetworkChange(callback: (state: NetworkState) => void): () => void;
}

// ─── Wire protocol ─────────────────────────────────────────────────────────
// react-native-webview only allows JSON strings across postMessage, so we
// shape every call as a tagged envelope. The shell handles `BridgeRequest`
// and replies with `BridgeResponse` carrying the same `id`. Events pushed
// from shell → web (e.g. pencil tap, network change, push token) use
// `BridgeEvent`, which has no `id`.

export type BridgeRequestMethod =
  | 'signInWithApple'
  | 'getProducts'
  | 'purchase'
  | 'restorePurchases'
  | 'getEntitlement'
  | 'haptic'
  | 'share'
  | 'openExternal'
  | 'requestBiometricUnlock'
  | 'registerPush'
  | 'ready'; // sent by web → shell once the bridge has hooked up listeners

export interface BridgeRequest {
  kind: 'request';
  id: string;
  method: BridgeRequestMethod;
  args?: unknown;
}

export interface BridgeResponse {
  kind: 'response';
  id: string;
  ok: boolean;
  result?: unknown;
  error?: string;
}

export type BridgeEventType =
  | 'pencilTap'
  | 'networkChange'
  | 'pushTokenReceived'
  | 'pushNotificationOpened'
  | 'deepLink'
  | 'appResumed'; // shell → web when iOS foregrounds the app

export interface BridgeEvent {
  kind: 'event';
  type: BridgeEventType;
  payload?: unknown;
}

export type BridgeMessage = BridgeRequest | BridgeResponse | BridgeEvent;

// Window augmentation so the web side gets typed access to the injected
// objects without having to cast everywhere. Both names are optional
// because in a plain browser neither will exist.
declare global {
  interface Window {
    ReactNativeWebView?: {
      postMessage: (data: string) => void;
    };
    electronBridge?: NativeBridge;
    // Convenience handle the shell sets up via injectedJavaScriptBeforeContentLoaded.
    NotemageBridge?: NativeBridge;
  }
}
