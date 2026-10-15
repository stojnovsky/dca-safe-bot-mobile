import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useConfig } from '@/lib/config-store';
import { colors, fonts } from '@/lib/theme';

export { default as ErrorBoundary } from '@/components/RouteErrorBoundary';

export default function TabLayout() {
  const config = useConfig();
  const showLogs = !!config?.showLogsTab;
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      initialRouteName="index"
      safeAreaInsets={{ bottom: 0 }}
      screenOptions={{
        headerShown:      false,
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: Math.max(insets.bottom, 10),
          height: 64,
          borderRadius: 32,
          backgroundColor: colors.tabBarBg,
          borderTopWidth: 0,
          borderWidth: 1,
          borderColor: colors.border,
          paddingTop: 6,
          paddingBottom: 6,
          elevation: 12,
          shadowColor: '#000000',
          shadowOpacity: 0.4,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 10 },
        },
        tabBarActiveTintColor:   colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          letterSpacing: 0.2,
          fontFamily: fonts.sansSemi,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Portfolio',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="wallet-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="simulation"
        options={{
          title: 'Simulation',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="pulse-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="logs"
        // `href: null` hides the tab from the tabbar but keeps the route mounted
        // and reachable via router.push('/logs'). We toggle it from Settings.
        options={{
          title: 'Logs',
          href: showLogs ? '/logs' : null,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="list-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="settings-outline" size={size} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
