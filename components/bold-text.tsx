import { Text, TextStyle, StyleProp } from 'react-native';

// Journal/reflection prose sometimes comes back from the model with markdown
// **bold** spans. RN's Text doesn't parse markdown, so without this it shows
// literal asterisks. Splits on **...** and renders those spans bold inline,
// everything else with the base style.
export function BoldText({ text, style, boldStyle }: { text: string; style?: StyleProp<TextStyle>; boldStyle?: StyleProp<TextStyle> }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return (
    <Text style={style}>
      {parts.map((part, i) => {
        const isBold = part.startsWith('**') && part.endsWith('**');
        return (
          <Text key={i} style={isBold ? [{ fontFamily: 'Inter_700Bold' }, boldStyle] : undefined}>
            {isBold ? part.slice(2, -2) : part}
          </Text>
        );
      })}
    </Text>
  );
}
