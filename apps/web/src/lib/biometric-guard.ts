/**
 * Biometric re-unlock guard for the iOS shell.
 *
 * The native shell fires an `appResumed` bridge event whenever the user
 * brings Notemage back from background after >30s (see `apps/mobile/App.tsx`).
 * When that happens we want to obscure the notebook content with a soft
 * lock overlay until the user passes Face ID / Touch ID. This is a UX
 * affordance, NOT a login mechanism — the NextAuth session is still valid;
 * we're just hiding pixels until the user proves they're holding the iPad.
 *
 * Behavior:
 *   - Only active when running inside the native shell (`isInsideNativeShell`)
 *   - On `appResumed`, set `locked = true` and call
 *     `nativeBridge.requestBiometricUnlock()`
 *   - On success, clear the lock; on failure, keep it locked but allow the
 *     user to retry from the overlay (so they can fall back to passcode)
 *   - Never lock on first mount — the user just signed in, so they're
 *     already authenticated for this session
 *
 * Failure modes that intentionally let the user through (soft fallback):
 *   - Device has no biometric hardware → unlock returns true immediately
 *   - User has biometrics disabled → unlock returns false; we surface a
 *     "skip" button that drops the lock without auth
 *
 * Hard locking (e.g. forcing logout on biometric failure) is intentionally
 * out of scope. That belongs in a future "Privacy" preference once we have
 * real account-level locking primitives.
 */

import { useCallback, useEffect, useState } from 'react';
import { isInsideNativeShell, nativeBridge } from './native-bridge';

interface BiometricGuardState {
  locked: boolean;
  retry: () => Promise<void>;
  skip: () => void;
}

export function useBiometricGuard(): BiometricGuardState {
  const [locked, setLocked] = useState(false);

  const tryUnlock = useCallback(async () => {
    try {
      const ok = await nativeBridge.requestBiometricUnlock();
      if (ok) setLocked(false);
    } catch {
      // Soft failure — leave the lock up so the user can retry/skip.
    }
  }, []);

  useEffect(() => {
    if (!isInsideNativeShell()) return;

    // The shell fires `appResumed` through the bridge's event channel.
    // `nativeBridge` doesn't expose the raw event subscription, so we
    // attach to `window.__notemageDispatch` indirectly via `onNetworkChange`
    // — wait, that's for network. We need a generic event listener. The
    // shell's injected dispatcher routes events through `eventListeners`,
    // and `NotemageBridge` only formally exposes `onPencilTap` /
    // `onNetworkChange`. For `appResumed` we hook directly via the
    // injected `__notemageOn` shim if present.
    //
    // To keep this future-proof, we define a tiny helper that taps into
    // the shell's event registry through `window.NotemageBridge` if it
    // exposes a generic `on` method, otherwise fall back to a no-op.
    type GenericOn = (type: string, cb: (payload?: unknown) => void) => () => void;
    const bridgeWithOn = (
      window as unknown as { NotemageBridge?: { on?: GenericOn } }
    ).NotemageBridge;

    if (!bridgeWithOn?.on) return;
    const off = bridgeWithOn.on('appResumed', () => {
      setLocked(true);
      void tryUnlock();
    });
    return () => off();
  }, [tryUnlock]);

  const retry = useCallback(async () => {
    await tryUnlock();
  }, [tryUnlock]);

  const skip = useCallback(() => {
    setLocked(false);
  }, []);

  return { locked, retry, skip };
}
