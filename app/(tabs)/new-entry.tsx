import { View, Text } from 'react-native';

export default function NewEntryScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-2xl font-bold text-indigo-600 mb-2">New Entry</Text>
      <Text className="text-gray-400">Write your thoughts here</Text>
    </View>
  );
}
