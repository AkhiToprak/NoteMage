# Notemage Desktop (Windows · Electron)

Phase 3 shell of the react-native-mobile-shell plan. Wraps
`https://notemage.app` in an Electron `BrowserWindow`, persists window state,
ships a system tray, and hooks the same `NativeBridge` protocol the iOS
shell uses so the web app can call native features on both platforms with
a single API.

## Layout

```
apps/desktop/
├── package.json        # deps + electron-builder config (appId, NSIS, publish)
├── tsconfig.json       # compiles src/ → dist/ (CommonJS, ES2022)
├── src/
│   ├── main.ts         # Electron main process: window, tray, menu, IPC, updater
│   ├── preload.ts      # contextBridge exposing window.electronBridge
│   └── ipc-channels.ts # channel names shared between main ↔ preload
└── build/
    └── icon.ico        # Windows app icon (NOT checked in — see below)
```

## Icon

`build/icon.ico` is **not** in the repo yet. Generate a multi-resolution
`.ico` from `brand_assets/` logo (16, 24, 32, 48, 64, 128, 256 px) and drop
it at `apps/desktop/build/icon.ico` before running `pnpm --filter desktop dist`.
Without the file the build falls back to Electron's default icon, which is
fine for local dev but wrong for distribution.

## Scripts

```bash
pnpm install                        # from repo root — picks up the new workspace

pnpm --filter desktop build         # tsc → dist/
pnpm --filter desktop start         # build + launch Electron against production notemage.app
pnpm --filter desktop dev           # same, but with DevTools enabled via --dev
pnpm --filter desktop pack          # unpacked build in release/win-unpacked (quick smoke-test)
pnpm --filter desktop dist          # signed NSIS installer in release/ (needs cert in Phase 9)
```

To point the shell at a local web dev server:

```bash
NOTEMAGE_APP_URL=http://localhost:3000 pnpm --filter desktop dev
```

## Bridge protocol

The preload (`src/preload.ts`) exposes `window.electronBridge`, which
implements `@notemage/shared`'s `NativeBridge` interface. Calls are proxied
to the main process via `ipcRenderer.invoke`; events (network state, etc.)
flow the other direction via `webContents.send` + `ipcRenderer.on`.

| Method                    | Windows behaviour                                             |
| ------------------------- | ------------------------------------------------------------- |
| `haptic()`                | No-op                                                         |
| `share()`                 | Copies URL to clipboard + Toast notification                  |
| `openExternal()`          | `shell.openExternal` — default browser                        |
| `requestBiometricUnlock()`| Stub returns `true` (Windows Hello lands later)               |
| `registerPush()`          | Throws — Windows Toast is local, no push token model          |
| `signInWithApple()`       | Throws until Phase 4 wires the OAuth browser flow             |
| `getProducts()` / `purchase()` / `restorePurchases()` / `getEntitlement()` | Throws until Phase 7 wires Paddle / Lemon Squeezy |

## Security posture

- `contextIsolation: true`, `nodeIntegration: false`
- `setWindowOpenHandler` + `will-navigate` reroute all non-notemage URLs to
  the default browser
- Single-instance lock via `app.requestSingleInstanceLock()`
- Auto-update logs go to `%APPDATA%/Notemage/logs/main.log`

## Auto-update

`electron-updater` checks GitHub Releases on startup (and on demand from the
tray menu). Local unsigned builds will fail that check — that's expected; the
real update feed comes online in Phase 9 once the code-signing cert is in
place. Changing cert providers after shipping breaks the update path for
existing installs, so commit to a signing provider before the first public
release.
