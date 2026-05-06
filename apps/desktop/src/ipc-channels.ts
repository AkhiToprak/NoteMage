// IPC channel names shared between the main process and the preload script.
// Kept in a single tiny module so both sides can't drift on the string keys.
//
// The preload exposes an `electronBridge` object that implements the
// `NativeBridge` interface from `@notemage/shared`. Every method routes
// through `ipcRenderer.invoke(CHANNEL)` (for request/response) or
// `ipcRenderer.on(CHANNEL)` (for native → web events).

export const BRIDGE_INVOKE = {
  signInWithApple: 'bridge:signInWithApple',
  getProducts: 'bridge:getProducts',
  purchase: 'bridge:purchase',
  restorePurchases: 'bridge:restorePurchases',
  getEntitlement: 'bridge:getEntitlement',
  haptic: 'bridge:haptic',
  share: 'bridge:share',
  openExternal: 'bridge:openExternal',
  requestBiometricUnlock: 'bridge:requestBiometricUnlock',
  registerPush: 'bridge:registerPush',
} as const;

export const BRIDGE_EVENT = {
  pencilTap: 'bridge:event:pencilTap',
  networkChange: 'bridge:event:networkChange',
  pushTokenReceived: 'bridge:event:pushTokenReceived',
  pushNotificationOpened: 'bridge:event:pushNotificationOpened',
  deepLink: 'bridge:event:deepLink',
  appResumed: 'bridge:event:appResumed',
} as const;

export type BridgeInvokeChannel = (typeof BRIDGE_INVOKE)[keyof typeof BRIDGE_INVOKE];
export type BridgeEventChannel = (typeof BRIDGE_EVENT)[keyof typeof BRIDGE_EVENT];
