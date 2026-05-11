import { Tabs } from 'expo-router';
import { useConfig } from '@/lib/config-store';

export default function TabLayout() {
  const config = useConfig();
  const showLogs = !!config?.showLogsTab;

  return (
    <Tabs
      screenOptions={{
        headerShown:      false,
        tabBarStyle:      { backgroundColor: '#0d1117', borderTopColor: '#1f2937' },
        tabBarActiveTintColor:   '#3b82f6',
        tabBarInactiveTintColor: '#6b7280',
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index"     options={{ title: 'Simulation' }} />
      <Tabs.Screen name="portfolio" options={{ title: 'Portfolio'  }} />
      <Tabs.Screen
        name="logs"
        // `href: null` hides the tab from the tabbar but keeps the route mounted
        // and reachable via router.push('/logs'). We toggle it from Settings.
        options={{ title: 'Logs', href: showLogs ? '/logs' : null }}
      />
      <Tabs.Screen name="settings"  options={{ title: 'Settings'   }} />
    </Tabs>
  );
}
