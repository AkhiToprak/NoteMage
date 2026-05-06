// Electron preload script.
//
// Runs in an isolated context with access to both Node.js APIs and a subset
// of the DOM. We use `contextBridge` to expose a typed `window.electronBridge`
// to the loaded web page. The web side (apps/web/src/lib/native-bridge.ts)
// detects it and routes `NativeBridge` calls through it.
//
// Security posture (mirrored in BrowserWindow config in main.ts):
//   - contextIsolation: true   — preload cannot pollute the page's globals
//   - nodeIntegration: false   — the page has no direct Node access
//   - sandbox: false           — we need ipcRenderer here; the rest of the
//                                hardening (CSP, navigation guards) lives in
//                                main.ts.

import { contextBridge, ipcRenderer } from 'electron';
import type {
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
import { BRIDGE_EVENT, BRIDGE_INVOKE } from './ipc-channels';

type UnsubscribeFn = () => void;

function subscribe<T = unknown>(
  channel: string,
  callback: (payload: T) => void,
): UnsubscribeFn {
  const listener = (_event: Electron.IpcRendererEvent, payload: T) => {
    try {
      callback(payload);
    } catch {
      /* swallow — listeners must not crash the dispatcher */
    }
  };
  ipcRenderer.on(channel, listener);
  return () => {
    ipcRenderer.removeListener(channel, listener);
  };
}

const bridge: NativeBridge = {
  // ── Capability ────────────────────────────────────────────────────────────
  isNative(): boolean {
    return true;
  },
  platform(): NativePlatform {
    return 'windows';
  },

  // ── Auth / account ────────────────────────────────────────────────────────
  signInWithApple(): Promise<SignInWithAppleResult> {
    return ipcRenderer.invoke(BRIDGE_INVOKE.signInWithApple) as Promise<SignInWithAppleResult>;
  },

  // ── In-app purchases (wired in Phase 7) ───────────────────────────────────
  getProducts(): Promise<Product[]> {
    return ipcRenderer.invoke(BRIDGE_INVOKE.getProducts) as Promise<Product[]>;
  },
  purchase(productId: string): Promise<PurchaseResult> {
    return ipcRenderer.invoke(BRIDGE_INVOKE.purchase, { productId }) as Promise<PurchaseResult>;
  },
  restorePurchases(): Promise<RestoreResult> {
    return ipcRenderer.invoke(BRIDGE_INVOKE.restorePurchases) as Promise<RestoreResult>;
  },
  getEntitlement(): Promise<Entitlement> {
    return ipcRenderer.invoke(BRIDGE_INVOKE.getEntitlement) as Promise<Entitlement>;
  },

  // ── UX affordances ────────────────────────────────────────────────────────
  haptic(style: HapticStyle): void {
    // Windows has no universal haptic API — fire-and-forget to main in case
    // a future driver (e.g. game controllers) wants to listen.
    void ipcRenderer.invoke(BRIDGE_INVOKE.haptic, { style });
  },
  share(content: ShareContent): Promise<void> {
    return ipcRenderer.invoke(BRIDGE_INVOKE.share, content) as Promise<void>;
  },
  openExternal(url: string): void {
    void ipcRenderer.invoke(BRIDGE_INVOKE.openExternal, { url });
  },
  requestBiometricUnlock(): Promise<boolean> {
    return ipcRenderer.invoke(BRIDGE_INVOKE.requestBiometricUnlock) as Promise<boolean>;
  },

  // ── Push ──────────────────────────────────────────────────────────────────
  registerPush(): Promise<PushRegistration> {
    return ipcRenderer.invoke(BRIDGE_INVOKE.registerPush) as Promise<PushRegistration>;
  },

  // ── Events ────────────────────────────────────────────────────────────────
  onPencilTap(callback: () => void): UnsubscribeFn {
    // Windows stylus events flow through standard PointerEvents in the
    // WebContents — the canvas already handles them — so the bridge-level
    // pencilTap event is effectively a no-op here. We still return an
    // unsubscribe function for API parity with iOS.
    return subscribe(BRIDGE_EVENT.pencilTap, callback);
  },

  onNetworkChange(callback: (state: NetworkState) => void): UnsubscribeFn {
    return subscribe<NetworkState>(BRIDGE_EVENT.networkChange, callback);
  },
};

// Expose to the renderer. The `contextBridge` clones the object into the
// isolated world, so functions are the only things that survive — no
// prototype chain or imports are leaked to the page.
contextBridge.exposeInMainWorld('electronBridge', bridge);
