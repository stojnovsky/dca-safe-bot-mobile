import 'react-native-get-random-values'; // must be first — polyfills crypto.getRandomValues for viem
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { Stack } from 'expo-router';
import { useEffect } from 'react';
import { registerDcaTask } from '@/tasks/dca-task';
import { migrateKeychainAccessibility } from '@/lib/config-store';

export default function RootLayout() {
  useEffect(() => {
    // App launches in the foreground = device unlocked. Use this window to
    // upgrade the private key's Keychain accessibility so the BG task can
    // read it later while the screen is off.
    migrateKeychainAccessibility()
      .then(() => registerDcaTask())
      .catch(console.error);
  }, []);

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <SafeAreaView style={{ flex: 1, backgroundColor: '#030712' }} edges={['top']}>
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="onboarding"
              options={{ presentation: 'modal', gestureEnabled: false }}
            />
          </Stack>
        </SafeAreaView>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
