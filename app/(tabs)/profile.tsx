import { View, Text } from 'react-native';

export default function ProfileScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-2xl font-bold text-indigo-600 mb-2">Profile</Text>
      <Text className="text-gray-400">Settings & preferences</Text>
    </View>
  );
}
