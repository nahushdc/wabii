import { Tabs, router, usePathname } from 'expo-router';
import { View, Pressable, Text } from 'react-native';
import { Feather } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { IconSymbol } from '@/components/ui/icon-symbol';

const BAR_HEIGHT = 66;
const BOTTOM_OFFSET = 28;
const LEFT_OFFSET = 20;
const RIGHT_OFFSET = 20;

function TabButton({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: string;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={() => {
        if (process.env.EXPO_OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={{ flex: 1, alignItems: 'center', justifyContent: 'center', height: '100%' }}>
      <IconSymbol size={20} name={icon as any} color={active ? '#E85D2C' : '#a8a29e'} />
      <Text
        style={{
          fontSize: 10,
          fontWeight: '500',
          marginTop: 2,
          color: active ? '#E85D2C' : '#a8a29e',
        }}>
        {label}
      </Text>
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
        <>
        <View
          style={{
            position: 'absolute',
            left: LEFT_OFFSET,
            bottom: BOTTOM_OFFSET,
            width: 246,
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
            icon="book.fill"
            label="Journal"
            onPress={() => router.push('/(tabs)')}
          />
          <TabButton
            active={onSearch}
            icon="brain.head.profile"
            label="Reflect"
            onPress={() => router.push('/(tabs)/search')}
          />
          <TabButton
            active={onProfile}
            icon="person.crop.circle"
            label="Profile"
            onPress={() => router.push('/(tabs)/profile')}
          />
        </View>

        <Pressable
          onPress={() => router.push('/(tabs)/new-entry')}
          style={{
            position: 'absolute',
            right: RIGHT_OFFSET,
            bottom: BOTTOM_OFFSET,
            width: BAR_HEIGHT,
            height: BAR_HEIGHT,
            borderRadius: BAR_HEIGHT / 2,
            backgroundColor: '#E85D2C',
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: '#1c1917',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.25,
            shadowRadius: 8,
            elevation: 6,
          }}>
          <Feather name="plus" size={26} color="#ffffff" />
        </Pressable>
        </>
      )}
    </View>
  );
}
