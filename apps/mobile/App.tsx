import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, StatusBar, StyleSheet, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import type { WebViewErrorEvent, WebViewHttpErrorEvent } from 'react-native-webview/lib/WebViewTypes';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { ShellBridge, INJECTED_BEFORE_CONTENT_LOADED } from './src/bridge';
import { OfflineScreen } from './src/screens/OfflineScreen';
import { ErrorScreen } from './src/screens/ErrorScreen';

// Skip the marketing landing page — the native shell is an authenticated
// client, so boot straight into /auth/login. If the user already has a valid
// NextAuth cookie, /auth/login redirects them to the app root.
const HOME_URL = 'https://notemage.app/auth/login';

// Hold the splash until the WebView has actually painted real content. We
// only call hideAsync once the page reports it's ready (via the bridge's
// `ready` request) — that way the user never sees the white WebView flash.
SplashScreen.preventAutoHideAsync().catch(() => {
  // Splash already hidden — fine, the lifecycle moved on.
});

// Default foreground notification handling: show the banner + play sound.
// Lives at module scope so it's installed exactly once.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function App() {
  const webviewRef = useRef<WebView | null>(null);
  const [currentUrl, setCurrentUrl] = useState(HOME_URL);
  const [online, setOnline] = useState(true);
  const [errorState, setErrorState] = useState<{ message: string } | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const lastBackgroundedAt = useRef<number | null>(null);

  // The bridge needs the same webviewRef the WebView uses, so we memoize one
  // instance per mount. We attach/detach the native event listeners in an
  // effect so React StrictMode double-invocation doesn't double-subscribe.
  const bridge = useMemo(
    () =>
      new ShellBridge({
        webviewRef,
        onWebReady: () => {
          // Page reached interactive state — drop the splash. Wrapped in a
          // try/catch because hideAsync rejects if the splash is already
          // gone (e.g. on a hot reload).
          SplashScreen.hideAsync().catch(() => {});
        },
        onNavigate: (url) => {
          setCurrentUrl(url);
          webviewRef.current?.injectJavaScript(
            `window.location.href = ${JSON.stringify(url)}; true;`
          );
        },
      }),
    []
  );

  useEffect(() => {
    bridge.attach();
    return () => bridge.detach();
  }, [bridge]);

  // Mirror NetInfo into local state so we can switch the rendered tree to
  // the OfflineScreen as soon as connectivity drops. The shell bridge also
  // emits a `networkChange` event into the web app — both can react.
  useEffect(() => {
    const unsub = ShellBridge.subscribeNetwork((isOnline) => {
      setOnline(isOnline);
      // When connectivity comes back and we're sitting on the offline
      // screen, give the WebView a fresh load so it picks up immediately.
      if (isOnline && errorState) setErrorState(null);
    });
    return unsub;
  }, [errorState]);

  // Foreground / background tracking. When the user comes back from
  // background after >30s, fire `appResumed` so the web side can prompt
  // for biometric re-unlock through `apps/web/src/lib/biometric-guard.ts`.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'background' || next === 'inactive') {
        lastBackgroundedAt.current = Date.now();
      } else if (next === 'active') {
        const last = lastBackgroundedAt.current;
        const elapsed = last ? Date.now() - last : 0;
        if (elapsed > 30_000) bridge.emit('appResumed', { elapsedMs: elapsed });
        lastBackgroundedAt.current = null;
      }
    });
    return () => sub.remove();
  }, [bridge]);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      bridge.handleWebMessage(event.nativeEvent.data);
    },
    [bridge]
  );

  const handleError = useCallback((event: WebViewErrorEvent) => {
    const { description, code } = event.nativeEvent;
    setErrorState({ message: `${description} (code ${code})` });
    SplashScreen.hideAsync().catch(() => {});
  }, []);

  const handleHttpError = useCallback((event: WebViewHttpErrorEvent) => {
    const { statusCode, description } = event.nativeEvent;
    // 5xx is the only thing worth bailing the whole webview for. 4xx is
    // usually the page itself doing auth redirects, which we let through.
    if (statusCode >= 500) {
      setErrorState({ message: `${description || 'Server error'} (HTTP ${statusCode})` });
      SplashScreen.hideAsync().catch(() => {});
    }
  }, []);

  const handleRenderProcessGone = useCallback(() => {
    // Android-only event in practice, but iOS WKWebView occasionally fires
    // this for tabs killed by jetsam — handle defensively either way.
    setErrorState({ message: 'The page reloaded unexpectedly.' });
  }, []);

  const handleReload = useCallback(() => {
    setErrorState(null);
    setReloadKey((k) => k + 1);
  }, []);

  // Decide which surface to render: offline screen, error screen, or the
  // WebView itself. We keep the WebView mounted whenever possible so that
  // session cookies (NextAuth) survive transient network blips.
  const showOffline = !online && !errorState;
  const showError = errorState !== null;

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
        <StatusBar barStyle="light-content" />
        {showOffline ? (
          <OfflineScreen onRetry={handleReload} />
        ) : showError ? (
          <ErrorScreen message={errorState?.message} onReload={handleReload} />
        ) : (
          <View style={styles.webviewWrapper}>
            <WebView
              key={reloadKey}
              ref={webviewRef}
              source={{ uri: currentUrl }}
              style={styles.webview}
              sharedCookiesEnabled
              thirdPartyCookiesEnabled
              domStorageEnabled
              javaScriptEnabled
              allowsInlineMediaPlayback
              allowsBackForwardNavigationGestures
              mediaPlaybackRequiresUserAction={false}
              pullToRefreshEnabled
              scalesPageToFit={false}
              decelerationRate="normal"
              setSupportMultipleWindows={false}
              originWhitelist={['https://notemage.app', 'https://*.notemage.app']}
              injectedJavaScriptBeforeContentLoaded={INJECTED_BEFORE_CONTENT_LOADED}
              onMessage={handleMessage}
              onError={handleError}
              onHttpError={handleHttpError}
              onRenderProcessGone={Platform.OS === 'android' ? handleRenderProcessGone : undefined}
              onContentProcessDidTerminate={
                Platform.OS === 'ios' ? handleRenderProcessGone : undefined
              }
            />
          </View>
        )}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e0d20' },
  webviewWrapper: { flex: 1, backgroundColor: '#0e0d20' },
  webview: { flex: 1, backgroundColor: '#0e0d20' },
});
