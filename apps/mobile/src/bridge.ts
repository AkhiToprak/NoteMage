// Shell-side bridge for the iOS WebView wrapper.
//
// react-native-webview gives us two halves of a duplex channel:
//   * Outgoing (web → native): the WebView fires `onMessage` with whatever
//     `window.ReactNativeWebView.postMessage(string)` was called with. We
//     decode it as a `BridgeMessage`, route requests to Expo APIs, and post
//     a response back via `injectJavaScript`.
//   * Incoming (native → web): we use `injectJavaScript` to call the JS
//     dispatcher set up by `injectedJavaScriptBeforeContentLoaded` (see
//     `INJECTED_BEFORE_CONTENT_LOADED` below). The web side reads those
//     events through `apps/web/src/lib/native-bridge.ts`.
//
// Anything that needs to wire into Expo (haptics, sharing, biometrics, push,
// the Pencil native module, etc.) lands here. Keep the surface area aligned
// with the `NativeBridge` interface in `@notemage/shared` — both sides have
// to agree on method names and payload shapes.

import type { RefObject } from 'react';
import {
  Alert,
  Linking,
  NativeEventEmitter,
  NativeModules,
  Platform,
  Share as RNShare,
} from 'react-native';
import type { WebView } from 'react-native-webview';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Haptics from 'expo-haptics';
import * as WebBrowser from 'expo-web-browser';
import * as AuthSession from 'expo-auth-session';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Notifications from 'expo-notifications';
import * as ExpoLinking from 'expo-linking';
import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import type {
  BridgeEvent,
  BridgeEventType,
  BridgeMessage,
  BridgeRequest,
  BridgeResponse,
  Entitlement,
  GoogleSignInResult,
  HapticStyle,
  Product,
  PurchaseResult,
  PushRegistration,
  RestoreResult,
  ShareContent,
  SignInWithAppleResult,
} from '@notemage/shared';
import Purchases, { type CustomerInfo, type PurchasesPackage } from 'react-native-purchases';
import Constants from 'expo-constants';

// Completes any pending ASWebAuthenticationSession redirect after the Google
// OAuth round-trip re-evaluates the JS bundle. No-op when nothing is pending;
// safe to call once at module scope.
WebBrowser.maybeCompleteAuthSession();

// ─── Pencil native module (custom Swift, registered via the bridging header).
// On non-iOS or when the module isn't installed (e.g. Expo Go) we no-op.
type PencilModule = {
  startObserving: () => void;
  stopObserving: () => void;
};
const PencilInteractionModule: PencilModule | null =
  Platform.OS === 'ios' && (NativeModules as Record<string, unknown>).PencilInteractionModule
    ? ((NativeModules as Record<string, PencilModule>).PencilInteractionModule)
    : null;

// The Swift module emits a single event named "pencilTap" via
// RCTEventEmitter. NativeEventEmitter wraps that as a JS-side event.
const pencilEmitter = PencilInteractionModule
  ? new NativeEventEmitter(NativeModules.PencilInteractionModule as never)
  : null;

// JavaScript that runs *before* the page contents load. Sets up
// `window.NotemageBridge` so the web side can call the bridge synchronously
// during boot — important for the entitlement check that gates the AI tier
// gating routes (see Phase 5).
//
// We keep this string self-contained because react-native-webview injects
// it as raw JS into the page; nothing here can reference outside scope.
export const INJECTED_BEFORE_CONTENT_LOADED = `
(function () {
  if (window.NotemageBridge) return;
  var pendingResponses = Object.create(null);
  var eventListeners = Object.create(null);
  var nextId = 1;

  function send(method, args) {
    var id = String(nextId++);
    return new Promise(function (resolve, reject) {
      pendingResponses[id] = { resolve: resolve, reject: reject };
      try {
        window.ReactNativeWebView.postMessage(
          JSON.stringify({ kind: 'request', id: id, method: method, args: args })
        );
      } catch (e) {
        delete pendingResponses[id];
        reject(e);
      }
    });
  }

  function dispatch(raw) {
    var msg;
    try { msg = typeof raw === 'string' ? JSON.parse(raw) : raw; }
    catch (e) { return; }
    if (!msg || typeof msg !== 'object') return;
    if (msg.kind === 'response') {
      var pending = pendingResponses[msg.id];
      if (!pending) return;
      delete pendingResponses[msg.id];
      if (msg.ok) pending.resolve(msg.result);
      else pending.reject(new Error(msg.error || 'Bridge error'));
      return;
    }
    if (msg.kind === 'event') {
      var listeners = eventListeners[msg.type] || [];
      for (var i = 0; i < listeners.length; i++) {
        try { listeners[i](msg.payload); } catch (e) { /* swallow */ }
      }
    }
  }

  function on(type, cb) {
    var arr = eventListeners[type] || (eventListeners[type] = []);
    arr.push(cb);
    return function () {
      var idx = arr.indexOf(cb);
      if (idx >= 0) arr.splice(idx, 1);
    };
  }

  window.NotemageBridge = {
    isNative: function () { return true; },
    platform: function () { return 'ios'; },

    signInWithApple: function () { return send('signInWithApple'); },
    signInWithGoogle: function () { return send('signInWithGoogle'); },
    getProducts: function () { return send('getProducts'); },
    purchase: function (id) { return send('purchase', { productId: id }); },
    restorePurchases: function () { return send('restorePurchases'); },
    getEntitlement: function () { return send('getEntitlement'); },
    setAppUser: function (userId) { return send('setAppUser', { userId: userId }); },

    haptic: function (style) { send('haptic', { style: style }); },
    share: function (content) { return send('share', content); },
    openExternal: function (url) { send('openExternal', { url: url }); },
    requestBiometricUnlock: function () { return send('requestBiometricUnlock'); },

    registerPush: function () { return send('registerPush'); },

    onPencilTap: function (cb) { return on('pencilTap', cb); },
    onNetworkChange: function (cb) { return on('networkChange', cb); },
    // Generic event subscription used by feature-specific guards (e.g.
    // the biometric re-unlock hook listens for 'appResumed'). Kept off
    // the typed NativeBridge interface so consumers go through the
    // typed helpers when one exists for their event.
    on: on,
  };

  // Expose the dispatcher so the shell can inject events from native code.
  window.__notemageDispatch = dispatch;

  // Tell the shell we're ready so it can flush queued events.
  try {
    window.ReactNativeWebView.postMessage(
      JSON.stringify({ kind: 'request', id: '0', method: 'ready' })
    );
  } catch (e) {}
})();
true;
`;

// Coerce the haptic style strings (which are part of our wire protocol) into
// the Expo enum. Anything unknown falls back to a light tap rather than
// throwing — the shell should never reject UI affordances on a typo.
function toHapticStyle(style: HapticStyle | string | undefined): Haptics.ImpactFeedbackStyle {
  switch (style) {
    case 'heavy':
      return Haptics.ImpactFeedbackStyle.Heavy;
    case 'medium':
      return Haptics.ImpactFeedbackStyle.Medium;
    default:
      return Haptics.ImpactFeedbackStyle.Light;
  }
}

// ─── RevenueCat (in-app purchases) ─────────────────────────────────────────
// The RevenueCat Entitlement id that maps to NoteMage PRO — matches the `pro`
// entitlement in the RevenueCat dashboard and the server webhook's RC_ENTITLEMENT.
const RC_ENTITLEMENT = 'pro';

let rcConfigured = false;

// Configure RevenueCat once, anonymously. The web app reports the signed-in
// NoteMage user id via the `setAppUser` bridge call, which then runs
// Purchases.logIn so a StoreKit purchase binds to that account
// (appUserID = User.id). iOS-only — there's no Android build and we only hold
// an iOS key.
export function configureRevenueCat(): void {
  if (rcConfigured || Platform.OS !== 'ios') return;
  const apiKey =
    process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ??
    (Constants.expoConfig?.extra as { revenueCatIosKey?: string } | undefined)?.revenueCatIosKey;
  if (!apiKey) {
    console.warn('[RevenueCat] iOS API key missing — in-app purchases disabled');
    return;
  }
  Purchases.configure({ apiKey });
  rcConfigured = true;
}

function toProduct(pkg: PurchasesPackage): Product {
  const p = pkg.product;
  return {
    id: p.identifier,
    title: p.title,
    description: p.description,
    priceString: p.priceString,
    priceMicros: Math.round(p.price * 1_000_000),
    currencyCode: p.currencyCode ?? '',
  };
}

function toEntitlement(info: CustomerInfo): Entitlement {
  const active = info.entitlements.active[RC_ENTITLEMENT];
  if (!active) {
    return { tier: 'FREE', source: null, expiresAt: null, inGracePeriod: false };
  }
  return {
    tier: 'PRO',
    source: 'APPLE_IAP',
    expiresAt: active.expirationDate ?? null,
    inGracePeriod: active.billingIssueDetectedAt != null,
  };
}

// ─── Google sign-in (system browser, not the WebView) ──────────────────────
// Google rejects OAuth inside embedded WebViews ("disallowed_useragent"), so
// the shell runs the authorization-code + PKCE flow in ASWebAuthenticationSession
// and exchanges the code for an id_token, which the web side posts to
// /api/auth/native/google. The redirect URI uses the reversed iOS client id
// scheme (Google's iOS-client convention); that scheme must also be registered
// in Info.plist CFBundleURLTypes for the redirect to return to the app.
const GOOGLE_DISCOVERY: AuthSession.DiscoveryDocument = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint: 'https://oauth2.googleapis.com/token',
  revocationEndpoint: 'https://oauth2.googleapis.com/revoke',
};

function googleIosClientId(): string | null {
  return (
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ??
    (Constants.expoConfig?.extra as { googleIosClientId?: string } | undefined)?.googleIosClientId ??
    null
  );
}

export interface ShellBridgeOptions {
  webviewRef: RefObject<WebView | null>;
  // Called when the WebView signals it's ready to receive events. Used by
  // the splash screen to know that the bridge is hooked up so it's safe to
  // dispatch any pre-load events that piled up while the page was booting.
  onWebReady?: () => void;
  // Optional hook for the host App component to react to deep links so the
  // WebView can navigate. We pass an absolute web URL.
  onNavigate?: (webUrl: string) => void;
}

export class ShellBridge {
  private opts: ShellBridgeOptions;
  private netinfoUnsub: (() => void) | null = null;
  private pencilSub: { remove: () => void } | null = null;
  private linkingSub: { remove: () => void } | null = null;
  private notificationSub: Notifications.Subscription | null = null;
  private notificationResponseSub: Notifications.Subscription | null = null;
  private webReady = false;
  private queuedEvents: BridgeEvent[] = [];

  constructor(opts: ShellBridgeOptions) {
    this.opts = opts;
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────
  attach(): void {
    // Network state → fire networkChange events.
    this.netinfoUnsub = NetInfo.addEventListener((state: NetInfoState) => {
      this.emit('networkChange', state.isConnected && state.isInternetReachable !== false ? 'online' : 'offline');
    });

    // Apple Pencil double-tap / squeeze → fire pencilTap event.
    if (pencilEmitter && PencilInteractionModule) {
      this.pencilSub = pencilEmitter.addListener('pencilTap', () => {
        this.emit('pencilTap');
      });
      try {
        PencilInteractionModule.startObserving();
      } catch {
        // Module exists but failed to wire — ignore, web fallback handles it.
      }
    }

    // Universal links / `notemage://` deep links.
    this.linkingSub = ExpoLinking.addEventListener('url', ({ url }) => {
      this.handleDeepLink(url);
    });
    void ExpoLinking.getInitialURL().then((url) => {
      if (url) this.handleDeepLink(url);
    });

    // Push notifications opened from the lock/notification center.
    this.notificationResponseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data;
      // A small confirming buzz as the app opens from the notification.
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      this.emit('pushNotificationOpened', data);
      const link = typeof data?.url === 'string' ? (data.url as string) : null;
      if (link) this.handleDeepLink(link);
    });
    this.notificationSub = Notifications.addNotificationReceivedListener((notification) => {
      this.emit('pushTokenReceived', notification.request.content.data);
    });
  }

  detach(): void {
    this.netinfoUnsub?.();
    this.netinfoUnsub = null;
    this.pencilSub?.remove();
    this.pencilSub = null;
    if (PencilInteractionModule) {
      try { PencilInteractionModule.stopObserving(); } catch { /* ignore */ }
    }
    this.linkingSub?.remove();
    this.linkingSub = null;
    this.notificationSub?.remove();
    this.notificationSub = null;
    this.notificationResponseSub?.remove();
    this.notificationResponseSub = null;
  }

  // ── Inbound: messages from the WebView ──────────────────────────────────
  handleWebMessage(rawData: string): void {
    let parsed: BridgeMessage | null = null;
    try {
      parsed = JSON.parse(rawData) as BridgeMessage;
    } catch {
      return;
    }
    if (!parsed || parsed.kind !== 'request') return;

    if (parsed.method === 'ready') {
      this.webReady = true;
      this.opts.onWebReady?.();
      // Flush any events that arrived before the page was ready.
      const queued = this.queuedEvents.splice(0);
      for (const evt of queued) this.postEvent(evt);
      return;
    }

    void this.dispatchRequest(parsed);
  }

  private async dispatchRequest(req: BridgeRequest): Promise<void> {
    try {
      const result = await this.invoke(req);
      this.respond({ kind: 'response', id: req.id, ok: true, result });
    } catch (err) {
      this.respond({
        kind: 'response',
        id: req.id,
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  private async invoke(req: BridgeRequest): Promise<unknown> {
    switch (req.method) {
      case 'haptic': {
        const style = (req.args as { style?: HapticStyle } | undefined)?.style;
        if (style === 'selection') {
          await Haptics.selectionAsync();
        } else if (style === 'success') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (style === 'warning') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else if (style === 'error') {
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        } else {
          // light | medium | heavy → physical impact tap
          await Haptics.impactAsync(toHapticStyle(style));
        }
        return null;
      }
      case 'share': {
        const content = req.args as ShareContent | undefined;
        if (!content?.url) throw new Error('share() requires a url');
        // expo-sharing is for local file URIs only. For arbitrary HTTPS
        // URLs we use React Native's built-in Share API, which routes to
        // the iOS UIActivityViewController (the native share sheet). We
        // still keep `expo-sharing` in the dep list because Phase 4 will
        // need it for exporting notebook PDFs.
        await RNShare.share({
          url: content.url,
          message: content.title,
          title: content.title,
        });
        return null;
      }
      case 'openExternal': {
        const url = (req.args as { url?: string } | undefined)?.url;
        if (!url) throw new Error('openExternal() requires a url');
        await WebBrowser.openBrowserAsync(url);
        return null;
      }
      case 'requestBiometricUnlock': {
        const hasHardware = await LocalAuthentication.hasHardwareAsync();
        const enrolled = await LocalAuthentication.isEnrolledAsync();
        if (!hasHardware || !enrolled) return false;
        const result = await LocalAuthentication.authenticateAsync({
          promptMessage: 'Unlock Notemage',
          fallbackLabel: 'Use passcode',
          disableDeviceFallback: false,
        });
        return result.success;
      }
      case 'registerPush': {
        const registration = await this.registerForPush();
        return registration;
      }
      case 'signInWithApple': {
        const cred = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
        });
        if (!cred.identityToken) {
          throw new Error('Apple did not return an identity token');
        }
        const fullName = cred.fullName
          ? [cred.fullName.givenName, cred.fullName.familyName]
              .filter((part): part is string => Boolean(part))
              .join(' ')
              .trim() || null
          : null;
        const result: SignInWithAppleResult = {
          idToken: cred.identityToken,
          user: { id: cred.user, email: cred.email, fullName },
        };
        return result;
      }
      case 'signInWithGoogle': {
        const clientId = googleIosClientId();
        if (!clientId) {
          throw new Error('GOOGLE_UNAVAILABLE: iOS Google client id not configured');
        }
        // Reversed client id, e.g. 123-abc.apps.googleusercontent.com →
        // com.googleusercontent.apps.123-abc.
        const reversedScheme = clientId.split('.').reverse().join('.');
        const redirectUri = AuthSession.makeRedirectUri({
          native: `${reversedScheme}:/oauth2redirect`,
        });
        const request = new AuthSession.AuthRequest({
          clientId,
          scopes: ['openid', 'email', 'profile'],
          redirectUri,
          responseType: AuthSession.ResponseType.Code,
          usePKCE: true,
        });
        const authResult = await request.promptAsync(GOOGLE_DISCOVERY);
        if (authResult.type !== 'success' || !authResult.params.code) {
          // Dismissed / cancelled — surface a named error the web side ignores,
          // matching the Apple cancel path (no error toast).
          throw new Error('GOOGLE_CANCELLED');
        }
        const tokenResult = await AuthSession.exchangeCodeAsync(
          {
            clientId,
            code: authResult.params.code,
            redirectUri,
            extraParams: request.codeVerifier
              ? { code_verifier: request.codeVerifier }
              : {},
          },
          GOOGLE_DISCOVERY
        );
        if (!tokenResult.idToken) {
          throw new Error('Google did not return an identity token');
        }
        return { idToken: tokenResult.idToken } satisfies GoogleSignInResult;
      }
      case 'setAppUser': {
        const userId = (req.args as { userId?: string } | undefined)?.userId;
        if (!userId) throw new Error('setAppUser() requires a userId');
        configureRevenueCat();
        await Purchases.logIn(userId);
        return null;
      }
      case 'getProducts': {
        configureRevenueCat();
        if (!rcConfigured) {
          // No API key, or running where the StoreKit native module isn't
          // available (e.g. Expo Go). Throw a named error so the web sheet's
          // catch logs something actionable instead of an opaque RC message.
          throw new Error('IAP_UNAVAILABLE: RevenueCat is not configured on this build.');
        }
        const offerings = await Purchases.getOfferings();
        return (offerings.current?.availablePackages ?? []).map(toProduct);
      }
      case 'purchase': {
        configureRevenueCat();
        const productId = (req.args as { productId?: string } | undefined)?.productId;
        if (!productId) throw new Error('purchase() requires a productId');
        const offerings = await Purchases.getOfferings();
        const pkg = (offerings.current?.availablePackages ?? []).find(
          (p) => p.product.identifier === productId
        );
        if (!pkg) {
          return { status: 'error', message: 'Product not available' } satisfies PurchaseResult;
        }
        try {
          const { customerInfo } = await Purchases.purchasePackage(pkg);
          return {
            status: 'success',
            entitlement: toEntitlement(customerInfo),
          } satisfies PurchaseResult;
        } catch (e) {
          const err = e as { userCancelled?: boolean; message?: string };
          return (
            err.userCancelled
              ? { status: 'cancelled' }
              : { status: 'error', message: err.message ?? 'Purchase failed' }
          ) satisfies PurchaseResult;
        }
      }
      case 'restorePurchases': {
        configureRevenueCat();
        const info = await Purchases.restorePurchases();
        const ent = toEntitlement(info);
        return (
          ent.tier === 'PRO'
            ? { status: 'restored', entitlement: ent }
            : { status: 'nothing-to-restore' }
        ) satisfies RestoreResult;
      }
      case 'getEntitlement': {
        configureRevenueCat();
        const info = await Purchases.getCustomerInfo();
        return toEntitlement(info);
      }
      default:
        throw new Error(`Unknown bridge method: ${String((req as BridgeRequest).method)}`);
    }
  }

  private async registerForPush(): Promise<PushRegistration> {
    if (Platform.OS !== 'ios') {
      throw new Error('Push registration is iOS-only in Phase 2');
    }
    const settings = await Notifications.getPermissionsAsync();
    let granted =
      settings.granted ||
      settings.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    if (!granted) {
      const req = await Notifications.requestPermissionsAsync({
        ios: { allowAlert: true, allowBadge: true, allowSound: true },
      });
      granted = req.granted || req.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL;
    }
    if (!granted) throw new Error('Push permission denied');

    const tokenResp = await Notifications.getDevicePushTokenAsync();
    return { token: tokenResp.data as string, provider: 'apns' };
  }

  // ── Outbound: events from native → web ──────────────────────────────────
  emit(type: BridgeEventType, payload?: unknown): void {
    const evt: BridgeEvent = { kind: 'event', type, payload };
    if (!this.webReady) {
      this.queuedEvents.push(evt);
      return;
    }
    this.postEvent(evt);
  }

  private postEvent(evt: BridgeEvent): void {
    const json = JSON.stringify(evt);
    // Encode as a JS literal so embedded quotes don't break the script.
    const literal = JSON.stringify(json);
    this.opts.webviewRef.current?.injectJavaScript(
      `window.__notemageDispatch && window.__notemageDispatch(${literal}); true;`
    );
  }

  private respond(msg: BridgeResponse): void {
    const json = JSON.stringify(msg);
    const literal = JSON.stringify(json);
    this.opts.webviewRef.current?.injectJavaScript(
      `window.__notemageDispatch && window.__notemageDispatch(${literal}); true;`
    );
  }

  // ── Deep links ──────────────────────────────────────────────────────────
  private handleDeepLink(url: string): void {
    // Convert `notemage://notebook/abc` and `https://notemage.app/notebook/abc`
    // alike into a canonical web URL the WebView can navigate to.
    let webUrl: string | null = null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'notemage:') {
        const path = `${parsed.host || ''}${parsed.pathname || ''}`.replace(/^\/+/, '/');
        webUrl = `https://notemage.app${path.startsWith('/') ? path : `/${path}`}${parsed.search}`;
      } else if (parsed.hostname === 'notemage.app') {
        webUrl = parsed.toString();
      }
    } catch {
      return;
    }
    if (!webUrl) return;
    this.emit('deepLink', { url: webUrl });
    this.opts.onNavigate?.(webUrl);
  }

  // ── External helpers used by App.tsx ────────────────────────────────────
  // The shell renders its own offline screen above the WebView, so we expose
  // a tiny helper for App.tsx to subscribe to NetInfo without setting up its
  // own listener.
  static subscribeNetwork(cb: (online: boolean) => void): () => void {
    const unsub = NetInfo.addEventListener((state) => {
      cb(state.isConnected !== false && state.isInternetReachable !== false);
    });
    return unsub;
  }

  // One-shot connectivity probe. NetInfo's listener only fires on *change*,
  // so a transient drop while the app is backgrounded can leave the cached
  // state stale with no event to correct it. App.tsx calls this on resume and
  // on the offline-screen retry to reconcile against the device's real state.
  static async refreshNetwork(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return state.isConnected !== false && state.isInternetReachable !== false;
  }
}

// A small helper used by the WebView crash fallback. Surfaces an Alert when
// `Linking.openURL` rejects (e.g. malformed deep links during testing).
export async function safeOpenExternal(url: string): Promise<void> {
  try {
    await Linking.openURL(url);
  } catch {
    Alert.alert('Could not open link', url);
  }
}
