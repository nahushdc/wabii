import { View, Text } from 'react-native';

export default function SearchScreen() {
  return (
    <View className="flex-1 items-center justify-center bg-white">
      <Text className="text-2xl font-bold text-indigo-600 mb-2">Search</Text>
      <Text className="text-gray-400">Find entries by meaning, not just words</Text>
    </View>
  );
}
