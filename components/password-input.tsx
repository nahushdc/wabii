import { useState } from 'react';
import { View, TextInput, Pressable, TextInputProps } from 'react-native';
import { Feather } from '@expo/vector-icons';

type Props = Omit<TextInputProps, 'secureTextEntry'> & {
  className?: string;
};

export function PasswordInput({ className, ...props }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <View className="relative">
      <TextInput
        {...props}
        secureTextEntry={!visible}
        className={`border border-gray-200 rounded-xl px-4 py-3 text-base text-gray-900 pr-12 ${className ?? ''}`}
      />
      <Pressable
        className="absolute right-4 top-0 bottom-0 justify-center"
        onPress={() => setVisible(v => !v)}
        hitSlop={8}>
        <Feather name={visible ? 'eye-off' : 'eye'} size={20} color="#9ca3af" />
      </Pressable>
    </View>
  );
}
