import { StatusBar, StyleSheet } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';

// Skip the marketing landing page — the native shell is an authenticated
// client, so boot straight into /auth/login. If the user already has a valid
// NextAuth cookie, /auth/login redirects them to the app root.
const TARGET_URL = 'https://notemage.app/auth/login';

export default function App() {
  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" />
        <WebView
          source={{ uri: TARGET_URL }}
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
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e0d20' },
  webview: { flex: 1, backgroundColor: '#0e0d20' },
});
