import { Tabs, router, usePathname } from 'expo-router';
import { View, Pressable } from 'react-native';
import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';

const BAR_HEIGHT = 60;
const BAR_WIDTH = 216;
const BOTTOM_OFFSET = 28;

type TabIcon = 'plus' | 'brain' | 'user';

// Icon-only tab. The label is for screen readers.
function TabButton({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: TabIcon;
  label: string;
  onPress: () => void;
}) {
  const color = active ? '#E85D2C' : '#a8a29e';
  return (
    <Pressable
      onPress={() => {
        if (process.env.EXPO_OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      {icon === 'brain'
        ? <MaterialCommunityIcons name="brain" size={26} color={color} />
        : <Feather name={icon} size={icon === 'plus' ? 28 : 24} color={color} />}
    </Pressable>
  );
}

export default function TabLayout() {
  const pathname = usePathname();
  const onSearch = pathname.startsWith('/search');
  const onProfile = pathname.startsWith('/profile');
  // The entry page is a focused, full-screen task — no tab bar or plus button.
  const onNewEntry = pathname.startsWith('/new-entry');

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' },
        }}>
        <Tabs.Screen name="index" />
        <Tabs.Screen name="new-entry" options={{ href: null }} />
        <Tabs.Screen name="search" />
        <Tabs.Screen name="profile" />
      </Tabs>

      {!onNewEntry && (
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 0, right: 0, bottom: BOTTOM_OFFSET, alignItems: 'center' }}>
          <View
            style={{
              width: BAR_WIDTH,
              height: BAR_HEIGHT,
              borderRadius: BAR_HEIGHT / 2,
              backgroundColor: '#ffffff',
              borderWidth: 1,
              borderColor: 'rgba(28, 25, 23, 0.05)',
              flexDirection: 'row',
              shadowColor: '#1c1917',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.12,
              shadowRadius: 16,
              elevation: 8,
            }}>
            <TabButton
              active={!onSearch && !onProfile}
              icon="plus"
              label="Journal"
              onPress={() => router.push('/(tabs)')}
            />
            <TabButton
              active={onSearch}
              icon="brain"
              label="Think"
              onPress={() => router.push('/(tabs)/search')}
            />
            <TabButton
              active={onProfile}
              icon="user"
              label="Profile"
              onPress={() => router.push('/(tabs)/profile')}
            />
          </View>
        </View>
      )}
    </View>
  );
}
