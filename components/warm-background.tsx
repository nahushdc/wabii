import { ReactNode } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

export const WARM_BG_COLOR = '#F5EFE4';

export function WarmBackground({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  return (
    <View style={[{ flex: 1, backgroundColor: WARM_BG_COLOR }, style]}>
      {children}
    </View>
  );
}
