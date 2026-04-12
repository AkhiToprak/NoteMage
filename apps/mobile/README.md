# Notemage Mobile (Phase 2)

Expo + react-native-webview shell that wraps the Next.js app at https://notemage.app and exposes the native bridge defined in `@notemage/shared`.

## After bumping deps

The Phase 2 plan added several Expo modules. After pulling these changes:

```bash
pnpm install
cd apps/mobile
npx expo prebuild      # do NOT pass --clean unless you re-apply the patch below
cd ios && pod install
```

## Apple Pencil native module

`PencilInteractionModule.swift`, `PencilInteractionModule.m`, and `Notemage-Bridging-Header.h` are wired up automatically by the local Expo config plugin at `plugins/with-pencil-module.js`. The canonical copies live under `plugins/assets/pencil-module/`; the plugin copies them into `ios/Notemage/` and adds them as members of the Xcode `Notemage` target on every prebuild, so `npx expo prebuild --clean` is safe.

If you need to edit the native module, edit the files under `plugins/assets/pencil-module/` (the copies inside `ios/Notemage/` are regenerated). After editing, re-run `npx expo prebuild` and rebuild the iOS app.

Build to a real iPad — the simulator does not surface Pencil gestures, so verifying double-tap / squeeze requires hardware.

## Universal links

The matching `apple-app-site-association` lives in `apps/web/app/.well-known/apple-app-site-association/route.ts`. Replace the `TEAMID` placeholder with the real Apple Developer Team ID before submitting to TestFlight, otherwise iOS will silently refuse to associate `https://notemage.app/notebook/*` with the app.

## Push notifications

Push registration goes through `nativeBridge.registerPush()` → `Notifications.getDevicePushTokenAsync()`. The token is APNs raw (not Expo Push), and the receiving endpoint is `/api/devices/register-push` (added in Phase 4). Push does **not** work in the iOS simulator — test on a real device.

## Bridge protocol

The contract is in `packages/shared/src/bridge.ts`. Both this shell (`src/bridge.ts`) and the web app (`apps/web/src/lib/native-bridge.ts`) implement it. When you add a new bridge method, update all three files in the same change.
