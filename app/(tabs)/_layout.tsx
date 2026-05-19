import { Tabs } from 'expo-router';
import { useConfig } from '@/lib/config-store';
import { colors } from '@/lib/theme';

export default function TabLayout() {
  const config = useConfig();
  const showLogs = !!config?.showLogsTab;

  return (
    <Tabs
      initialRouteName="portfolio"
      screenOptions={{
        headerShown:      false,
        tabBarStyle:      { backgroundColor: colors.tabBarBg, borderTopColor: colors.border },
        tabBarActiveTintColor:   colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen name="portfolio" options={{ title: 'Portfolio'  }} />
      <Tabs.Screen name="index"     options={{ title: 'Simulation' }} />
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
