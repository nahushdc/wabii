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
  // No opacity/position entrance — a word finalizing was already on screen a
  // moment earlier as interim (grey) text, occupying the same spot. Popping
  // it in from invisible is what actually read as "chunky"; all that should
  // happen here is a quiet color settle from interim-grey to its confidence
  // color, so text just keeps flowing instead of visibly re-appearing.
  const tone = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(tone, { toValue: 1, duration: 240, useNativeDriver: false }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedColor = tone.interpolate({ inputRange: [0, 1], outputRange: ['#a8a29e', color] });

  return <Animated.Text style={{ color: animatedColor }}>{word}</Animated.Text>;
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
