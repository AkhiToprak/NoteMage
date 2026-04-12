// Electron main process for the Notemage Windows shell.
//
// Responsibilities:
//   - Single-instance lock (second launches focus the first window)
//   - BrowserWindow creation pointing at https://notemage.app
//   - Window state persistence via electron-window-state
//   - System tray with minimize-to-tray toggle
//   - Native menu bar
//   - electron-updater auto-update check on startup
//   - IPC handlers implementing the NativeBridge protocol
//   - Network online/offline broadcast to the renderer
//
// Security posture:
//   - `contextIsolation: true`, `nodeIntegration: false`, `sandbox: false`
//     (sandbox off so the preload can use ipcRenderer; everything else is
//     locked down by CSP on the web side).
//   - All external navigation (target=_blank, window.open, or in-page link
//     to a non-notemage origin) is routed through shell.openExternal instead
//     of opening inside the app.

import path from 'node:path';
import {
  BrowserWindow,
  Menu,
  Notification,
  Tray,
  app,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  net,
  shell,
} from 'electron';
import windowStateKeeper from 'electron-window-state';
import log from 'electron-log';
import { autoUpdater } from 'electron-updater';
import type {
  Entitlement,
  NetworkState,
  Product,
  PurchaseResult,
  PushRegistration,
  RestoreResult,
  ShareContent,
  SignInWithAppleResult,
} from '@notemage/shared';
import { BRIDGE_EVENT, BRIDGE_INVOKE } from './ipc-channels';

const APP_URL = process.env.NOTEMAGE_APP_URL ?? 'https://notemage.app';
const APP_ORIGIN = new URL(APP_URL).origin;
const IS_DEV = process.argv.includes('--dev') || !app.isPackaged;

// ── Logging ────────────────────────────────────────────────────────────────
log.transports.file.level = 'info';
log.info(`Notemage desktop starting — version ${app.getVersion()}, dev=${IS_DEV}`);

// electron-updater uses the same logger so we get a single consolidated log
// file in %APPDATA%/Notemage/logs/main.log on Windows.
autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

// ── Single-instance lock ───────────────────────────────────────────────────
// If a second copy launches, signal the first one to focus itself and quit
// the new instance immediately.
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false;

app.on('second-instance', () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
});

// ── Network state broadcast ────────────────────────────────────────────────
// Electron's `net.isOnline()` gives us a cheap rechability signal. We poll
// it at a low cadence so the web side can render its own offline banner.
// The iOS shell uses NetInfo for this; the signal shape matches.
let lastNetworkState: NetworkState | null = null;
function broadcastNetworkState(): void {
  const current: NetworkState = net.isOnline() ? 'online' : 'offline';
  if (current === lastNetworkState) return;
  lastNetworkState = current;
  mainWindow?.webContents.send(BRIDGE_EVENT.networkChange, current);
}

// ── Window creation ────────────────────────────────────────────────────────
function createMainWindow(): BrowserWindow {
  const windowState = windowStateKeeper({
    defaultWidth: 1280,
    defaultHeight: 840,
  });

  const win = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 960,
    minHeight: 600,
    show: false,
    backgroundColor: '#111126', // matches --background so there's no white flash
    title: 'Notemage',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webviewTag: false,
      spellcheck: true,
    },
  });

  windowState.manage(win);

  win.once('ready-to-show', () => {
    win.show();
    win.focus();
  });

  // Don't quit on close — minimize to tray instead. The user quits
  // explicitly via the tray menu or the File menu.
  win.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    win.hide();
  });

  win.on('closed', () => {
    mainWindow = null;
  });

  // ── Navigation hardening ────────────────────────────────────────────────
  // Any link to a non-notemage origin opens in the default browser rather
  // than hijacking the shell. Also prevents the user from accidentally
  // navigating away from the web app (e.g. via a misbehaving redirect).
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, url) => {
    try {
      const target = new URL(url);
      if (target.origin !== APP_ORIGIN && target.protocol !== 'about:') {
        event.preventDefault();
        void shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  win.webContents.on('render-process-gone', (_event, details) => {
    log.error('Renderer process gone', details);
    if (details.reason !== 'clean-exit') {
      dialog.showErrorBox(
        'Notemage crashed',
        'The app ran into a problem and needs to restart.',
      );
      win.reload();
    }
  });

  void win.loadURL(APP_URL);

  return win;
}

// ── Tray ───────────────────────────────────────────────────────────────────
function createTray(): void {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.ico');
  const image = nativeImage.createFromPath(iconPath);
  const trayIcon = image.isEmpty() ? nativeImage.createEmpty() : image;
  tray = new Tray(trayIcon);
  tray.setToolTip('Notemage');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open Notemage',
      click: () => {
        if (!mainWindow) {
          mainWindow = createMainWindow();
        } else {
          mainWindow.show();
          mainWindow.focus();
        }
      },
    },
    { type: 'separator' },
    {
      label: 'Check for Updates…',
      click: () => {
        void autoUpdater.checkForUpdates().catch((err) => {
          log.warn('Manual update check failed', err);
        });
      },
    },
    { type: 'separator' },
    {
      label: 'Quit Notemage',
      click: () => {
        isQuitting = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(contextMenu);

  tray.on('click', () => {
    if (!mainWindow) {
      mainWindow = createMainWindow();
      return;
    }
    if (mainWindow.isVisible()) {
      mainWindow.hide();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

// ── Application menu ───────────────────────────────────────────────────────
function buildApplicationMenu(): void {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'New Notebook',
          accelerator: 'CmdOrCtrl+N',
          click: () => {
            mainWindow?.webContents.loadURL(`${APP_URL}/notebooks/new`).catch((err) => {
              log.warn('Failed to navigate to new notebook', err);
            });
          },
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ],
    },
    { role: 'editMenu' },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(IS_DEV ? [{ role: 'toggleDevTools' as const }] : []),
      ],
    },
    { role: 'windowMenu' },
    {
      role: 'help',
      submenu: [
        {
          label: 'Visit notemage.app',
          click: () => {
            void shell.openExternal('https://notemage.app');
          },
        },
        {
          label: 'Check for Updates…',
          click: () => {
            void autoUpdater.checkForUpdates().catch((err) => {
              log.warn('Manual update check failed', err);
            });
          },
        },
      ],
    },
  ];

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ── IPC: NativeBridge handlers ─────────────────────────────────────────────
function registerBridgeHandlers(): void {
  ipcMain.handle(BRIDGE_INVOKE.haptic, () => {
    // No-op on Windows — kept for API parity with iOS.
    return null;
  });

  ipcMain.handle(BRIDGE_INVOKE.openExternal, (_event, args: { url?: string }) => {
    const url = args?.url;
    if (!url) throw new Error('openExternal() requires a url');
    void shell.openExternal(url);
    return null;
  });

  ipcMain.handle(BRIDGE_INVOKE.share, async (_event, content: ShareContent) => {
    // Windows has no universal share sheet from Electron, so we fall back
    // to copying the URL to the clipboard and showing a toast. This matches
    // the web fallback behaviour users already expect from the in-app share.
    if (!content?.url) throw new Error('share() requires a url');
    clipboard.writeText(content.url);
    if (Notification.isSupported()) {
      new Notification({
        title: content.title || 'Link copied',
        body: 'The link has been copied to your clipboard.',
      }).show();
    }
    return;
  });

  ipcMain.handle(BRIDGE_INVOKE.requestBiometricUnlock, async () => {
    // Windows Hello integration lives behind a native module (node-ms-passport
    // or similar). Until Phase 7 wires the native bits, report success so the
    // web side treats the desktop shell as "unlocked by default", matching
    // the web browser fallback.
    return true;
  });

  ipcMain.handle(BRIDGE_INVOKE.registerPush, async (): Promise<PushRegistration> => {
    // Windows Toast notifications don't use push tokens the way APNs/FCM
    // do — notifications are triggered locally via `new Notification(...)`.
    // We throw so the web side knows push registration isn't available on
    // this platform and can gracefully fall back to in-app surfaces.
    throw new Error('registerPush is not available on Windows in Phase 3');
  });

  // ── Not-yet-implemented (wired in later phases) ─────────────────────────
  const notYetImplemented = (method: string) => async (): Promise<never> => {
    throw new Error(`${method} is not implemented in Phase 3`);
  };

  ipcMain.handle(
    BRIDGE_INVOKE.signInWithApple,
    notYetImplemented('signInWithApple') as () => Promise<SignInWithAppleResult>,
  );
  ipcMain.handle(
    BRIDGE_INVOKE.getProducts,
    notYetImplemented('getProducts') as () => Promise<Product[]>,
  );
  ipcMain.handle(
    BRIDGE_INVOKE.purchase,
    notYetImplemented('purchase') as () => Promise<PurchaseResult>,
  );
  ipcMain.handle(
    BRIDGE_INVOKE.restorePurchases,
    notYetImplemented('restorePurchases') as () => Promise<RestoreResult>,
  );
  ipcMain.handle(
    BRIDGE_INVOKE.getEntitlement,
    notYetImplemented('getEntitlement') as () => Promise<Entitlement>,
  );
}

// ── App lifecycle ──────────────────────────────────────────────────────────
app.whenReady().then(() => {
  registerBridgeHandlers();
  buildApplicationMenu();

  mainWindow = createMainWindow();
  createTray();

  // First network snapshot + periodic poll. 10s is plenty for a banner hint.
  broadcastNetworkState();
  setInterval(broadcastNetworkState, 10_000);

  // Fire a one-off update check after the window is ready. We swallow errors
  // because an unsigned local build (which is what most dev machines run)
  // will always fail the GitHub Releases check — that's expected.
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    log.info('Startup update check skipped or failed', err?.message ?? err);
  });
}).catch((err) => {
  log.error('App failed to start', err);
  app.quit();
});

app.on('activate', () => {
  // macOS-only path that's harmless on Windows: recreate the window if the
  // dock icon is clicked while no windows exist.
  if (!mainWindow) {
    mainWindow = createMainWindow();
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});

app.on('window-all-closed', () => {
  // Keep the process alive on Windows so the tray remains active. Users
  // quit explicitly via tray → Quit or File → Quit.
  if (process.platform === 'darwin') {
    app.quit();
  }
});
