import 'react-native-get-random-values'; // must be first — polyfills crypto.getRandomValues for viem
import { Component, useEffect, type ReactNode } from 'react';
import { Text, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView, initialWindowMetrics } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import {
  DMSans_400Regular,
  DMSans_600SemiBold,
  DMSans_700Bold,
} from '@expo-google-fonts/dm-sans';
import { DMMono_400Regular, DMMono_500Medium } from '@expo-google-fonts/dm-mono';
import { registerDcaTask } from '@/tasks/dca-task';
import { migrateKeychainAccessibility } from '@/lib/config-store';
import AppLockGate from '@/components/AppLockGate';
import { colors } from '@/lib/theme';

/**
 * Release builds turn an uncaught render error into RCTFatal and abort.
 * Catch it here so a startup exception stays on screen instead of killing the process.
 */
class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 }}>
        <Text style={{ color: colors.text, fontSize: 18, fontWeight: '700' }}>
          Medit couldn't finish opening.
        </Text>
        <Text style={{ color: colors.textSecondary, marginTop: 8, fontSize: 13 }}>
          {this.state.error.message}
        </Text>
      </View>
    );
  }
}

export default function RootLayout() {
  return (
    <AppErrorBoundary>
      <RootLayoutInner />
    </AppErrorBoundary>
  );
}

function RootLayoutInner() {
  const router = useRouter();
  // Load fonts without unmounting the navigator. Returning null until they
  // arrive makes Expo Router remove the opening screen; that unmount is what
  // crashed TestFlight builds a fraction of a second after launch.
  useFonts({
    DMSans_400Regular,
    DMSans_600SemiBold,
    DMSans_700Bold,
    DMMono_400Regular,
    DMMono_500Medium,
  });

  useEffect(() => {
    let detach = () => {};
    let alive = true;

    // App launches in the foreground = device unlocked. Use this window to
    // upgrade the private key's Keychain accessibility so the BG task can
    // read it later while the screen is off.
    migrateKeychainAccessibility()
      .then(() => registerDcaTask())
      .catch(console.error);

    // Notifications are loaded lazily so a missing native module rejects this
    // promise instead of throwing while the root layout is evaluating.
    import('@/lib/notifications')
      .then(async (notifications) => {
        await notifications.configureNotificationHandler();
        if (!alive) return;
        detach = notifications.attachNotificationListeners(() => {
          try { router.navigate('/'); } catch (e) { console.error(e); }
        });
      })
      .catch(console.error);

    return () => {
      alive = false;
      detach();
    };
  }, [router]);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
          <StatusBar style="light" />
          <AppLockGate>
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen
                name="onboarding"
                options={{ presentation: 'modal', gestureEnabled: false }}
              />
            </Stack>
          </AppLockGate>
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
