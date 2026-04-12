import { Pressable, StyleSheet, Text, View } from 'react-native';

interface ErrorScreenProps {
  message?: string;
  onReload: () => void;
}

// Shown when the WebView itself errors out (network failure mid-load,
// render-process crash, etc.). Pairs with OfflineScreen — that one is for
// "no internet at all", this one is for "internet works but the page
// blew up". App Store reviewers explicitly look for this kind of native
// fallback when evaluating webview wrappers under guideline 4.2.
export function ErrorScreen({ message, onReload }: ErrorScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconBubble}>
        <Text style={styles.icon}>{'\u00D7'}</Text>
      </View>
      <Text style={styles.title}>Something went wrong</Text>
      <Text style={styles.subtitle}>
        Notemage couldn't load right now. This is usually temporary — give it another try.
      </Text>
      {message ? <Text style={styles.detail}>{message}</Text> : null}
      <Pressable
        accessibilityRole="button"
        onPress={onReload}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>Reload</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0e0d20',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  iconBubble: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#1c1c38',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  icon: { fontSize: 56, color: '#fd6f85', lineHeight: 60 },
  title: {
    color: '#eeecff',
    fontSize: 26,
    fontWeight: '700',
    marginBottom: 12,
    textAlign: 'center',
  },
  subtitle: {
    color: '#c0bed8',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 16,
    maxWidth: 360,
  },
  detail: {
    color: '#8888a8',
    fontSize: 12,
    fontFamily: 'Menlo',
    textAlign: 'center',
    marginBottom: 24,
    maxWidth: 360,
  },
  button: {
    backgroundColor: '#ae89ff',
    paddingHorizontal: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  buttonPressed: { opacity: 0.8, transform: [{ scale: 0.98 }] },
  buttonText: { color: '#10102a', fontSize: 16, fontWeight: '700' },
});
