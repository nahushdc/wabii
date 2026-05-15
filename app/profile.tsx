import { View, Text, Pressable } from 'react-native';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';

function MenuItem({ label, icon, onPress }: { label: string; icon: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className="flex-row items-center justify-between rounded-2xl p-4 mb-3"
      style={{ backgroundColor: '#ffffff', shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 }}>
      <View className="flex-row items-center gap-3">
        <Feather name={icon as any} size={18} color="#78716c" />
        <Text className="text-base font-medium" style={{ color: '#1c1917' }}>{label}</Text>
      </View>
      <Feather name="chevron-right" size={16} color="#d4cdc8" />
    </Pressable>
  );
}

export default function ProfileScreen() {
  async function handleSignOut() {
    await supabase.auth.signOut();
  }

  return (
    <View className="flex-1" style={{ backgroundColor: '#fafaf8' }}>
      {/* Header */}
      <View className="flex-row items-center px-6 pt-16 pb-4 border-b border-gray-100">
        <Pressable onPress={() => router.back()} className="p-1 mr-4">
          <Feather name="arrow-left" size={22} color="#374151" />
        </Pressable>
        <Text className="text-xl font-bold" style={{ color: '#1c1917' }}>Profile</Text>
      </View>

      <View className="flex-1 px-6 pt-6">
        <MenuItem label="Summaries" icon="star" onPress={() => router.push('/summaries')} />
        <MenuItem label="Notifications" icon="bell" onPress={() => {}} />
        <MenuItem label="Export data" icon="download" onPress={() => {}} />
      </View>

      {/* Sign out */}
      <View className="px-6 pb-12">
        <Pressable
          className="rounded-2xl py-4 items-center"
          style={{ backgroundColor: '#fff1f0' }}
          onPress={handleSignOut}>
          <Text className="font-semibold" style={{ color: '#ef4444' }}>Sign out</Text>
        </Pressable>
      </View>
    </View>
  );
}
