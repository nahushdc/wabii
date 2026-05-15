import { Tabs } from 'expo-router';
import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarActiveTintColor: '#4f46e5',
        tabBarInactiveTintColor: '#a8a29e',
        tabBarStyle: {
          backgroundColor: '#ffffff',
          borderTopColor: '#f5f0eb',
          borderTopWidth: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Journal',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="book.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="new-entry"
        options={{
          title: 'New Entry',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="plus.circle.fill" color={color} />,
        }}
      />
      <Tabs.Screen
        name="search"
        options={{
          title: 'Search',
          tabBarIcon: ({ color }) => <IconSymbol size={24} name="magnifyingglass" color={color} />,
        }}
      />
    </Tabs>
  );
}
