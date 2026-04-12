import { Pressable, StyleSheet, Text, View } from 'react-native';

interface OfflineScreenProps {
  onRetry: () => void;
}

// Native fallback shown above the WebView when NetInfo says we have no
// connectivity. Required for App Store guideline 4.2 — a wrapper that just
// shows the system "no internet" page would be rejected. Plain RN, no
// dependencies, so it works even when the WebView itself can't load.
export function OfflineScreen({ onRetry }: OfflineScreenProps) {
  return (
    <View style={styles.container}>
      <View style={styles.iconBubble}>
        <Text style={styles.icon}>{'\u26A0'}</Text>
      </View>
      <Text style={styles.title}>You're offline</Text>
      <Text style={styles.subtitle}>
        Notemage needs an internet connection to load your notebooks. Reconnect to Wi-Fi or
        cellular and try again.
      </Text>
      <Pressable
        accessibilityRole="button"
        onPress={onRetry}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}
      >
        <Text style={styles.buttonText}>Try again</Text>
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
  icon: { fontSize: 44, color: '#ae89ff' },
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
    marginBottom: 32,
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
