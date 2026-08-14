import { useState } from 'react';
import { View, TextInput, Pressable, TextInputProps, StyleProp, ViewStyle } from 'react-native';
import { Feather } from '@expo/vector-icons';

type Props = Omit<TextInputProps, 'secureTextEntry' | 'style'> & {
  style?: StyleProp<ViewStyle>;
};

export function PasswordInput({ style, ...props }: Props) {
  const [visible, setVisible] = useState(false);

  return (
    <View style={[{ position: 'relative' }, style]}>
      <TextInput
        {...props}
        secureTextEntry={!visible}
        style={{
          backgroundColor: '#ffffff', borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, paddingRight: 48,
          fontFamily: 'Inter_400Regular', fontSize: 16, color: '#1c1917',
          shadowColor: '#1c1917', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
        }}
      />
      <Pressable
        style={{ position: 'absolute', right: 16, top: 0, bottom: 0, justifyContent: 'center' }}
        onPress={() => setVisible(v => !v)}
        hitSlop={8}>
        <Feather name={visible ? 'eye-off' : 'eye'} size={20} color="#c4b9b0" />
      </Pressable>
    </View>
  );
}
