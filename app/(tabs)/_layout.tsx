import { Tabs } from 'expo-router';

export default function TabLayout() {
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
      <Tabs.Screen name="settings"  options={{ title: 'Settings'   }} />
    </Tabs>
  );
}
