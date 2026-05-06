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

The matching `apple-app-site-association` lives in `apps/web/app/.well-known/apple-app-site-association/route.ts` and is pinned to Team ID `ULH58C5SCP`. To rotate the Team ID, update both that file and `apps/mobile/eas.json` → `submit.production.ios.appleTeamId`.

## TestFlight builds

Two paths — pick one.

### Option A: Local Xcode + Transporter

Built locally in Xcode, uploaded with the **Transporter** app from the Mac App Store. No subscription.

```bash
cd apps/mobile
pnpm prebuild           # regenerates ios/Notemage.xcworkspace
open ios/Notemage.xcworkspace
```

### Option B: Xcode Cloud

`apps/mobile/ios/ci_scripts/ci_post_clone.sh` runs prebuild + `pod install` after the CI clone, since `apps/mobile/ios/` is gitignored. Push the branch wired to your Xcode Cloud workflow and the build will resolve `Notemage.xcworkspace` from the regenerated project. If Node is missing on the CI image, prepend `brew install node` to the script.

In Xcode:

1. Select **Any iOS Device (arm64)** in the run-target dropdown.
2. Bump `CFBundleVersion` (build number) in `Notemage/Info.plist` if you've already shipped a build with the current value — App Store Connect rejects duplicates.
3. **Product → Archive**. The Organizer window opens when it finishes.
4. Pick the new archive → **Distribute App** → **App Store Connect** → **Upload** → leave defaults → **Upload**.

Alternative: in the Organizer, **Distribute App** → **Export** → **App Store Connect**, save the `.ipa`, then drag it into Transporter and click **Deliver**.

After upload, App Store Connect needs ~5–15 min to process the build before TestFlight shows it. Add internal testers under TestFlight → Internal Testing → your group → **+**.

Code signing uses Xcode's automatic signing tied to Team ID `ULH58C5SCP` (already set in `Notemage.xcodeproj/project.pbxproj`). For push, the APNs `.p8` key generated in the Apple Developer Portal lives on Apple's side — Xcode/Apple use it server-to-server when delivering pushes; nothing local to wire up.

## Push notifications

Push registration goes through `nativeBridge.registerPush()` → `Notifications.getDevicePushTokenAsync()`. The token is APNs raw (not Expo Push), and the receiving endpoint is `/api/devices/register-push` (added in Phase 4). Push does **not** work in the iOS simulator — test on a real device.

## Bridge protocol

The contract is in `packages/shared/src/bridge.ts`. Both this shell (`src/bridge.ts`) and the web app (`apps/web/src/lib/native-bridge.ts`) implement it. When you add a new bridge method, update all three files in the same change.
