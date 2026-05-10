import { View, Text, Pressable } from 'react-native';

export default function HomeScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-3xl font-bold text-indigo-600 mb-2">Wabii</Text>
      <Text className="text-base text-gray-500 mb-8">Your reflection companion</Text>
      <Pressable className="bg-indigo-600 rounded-xl px-6 py-3">
        <Text className="text-white font-semibold text-base">Start journaling</Text>
      </Pressable>
    </View>
  );
}
