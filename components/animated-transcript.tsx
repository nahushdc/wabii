import { useEffect, useRef } from 'react';
import { Text, Animated, StyleProp, TextStyle } from 'react-native';
import { TranscriptWord } from '@/hooks/use-live-transcription';

// Below Deepgram's own confidence, word color shifts from full-strength ink
// down to a warm amber — a quiet signal for "you might want to double-check
// this word" without interrupting the flow of reading.
function colorForConfidence(confidence: number): string {
  if (confidence >= 0.85) return '#1c1917';
  if (confidence >= 0.6) return '#57534e';
  return '#c2703d';
}

function AnimatedWord({ word, color }: { word: string; color: string }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(4)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 220, useNativeDriver: true }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
    ]).start();
  }, []);

  return (
    <Animated.Text style={{ opacity, transform: [{ translateY }], color }}>
      {word}
    </Animated.Text>
  );
}

// Renders a live transcript word-by-word, each new word fading + sliding in
// as it finalizes, colored by Deepgram's per-word confidence. Words already
// on screen keep their React key as the array grows, so only newly-appended
// words replay the entrance animation — existing text never re-animates.
export function AnimatedTranscript({
  words,
  interimText,
  style,
  interimStyle,
}: {
  words: TranscriptWord[];
  interimText?: string;
  style?: StyleProp<TextStyle>;
  interimStyle?: StyleProp<TextStyle>;
}) {
  return (
    <Text style={style}>
      {words.map((w, i) => (
        <AnimatedWord key={i} word={i === 0 ? w.word : ` ${w.word}`} color={colorForConfidence(w.confidence)} />
      ))}
      {interimText ? <Text style={interimStyle}>{words.length ? ' ' : ''}{interimText}</Text> : null}
    </Text>
  );
}
