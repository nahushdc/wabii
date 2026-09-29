import { useRef, useState } from 'react';
import { useAudioRecorder as useLiveAudioRecorder } from '@siteed/audio-studio';
import { AudioModule } from 'expo-audio';
import { supabase } from '@/lib/supabase';

// English-only (Nova-3 monolingual) for now — the multilingual/code-switching
// model is noticeably slower, and English-only is also more accurate when
// there's no code-switching to actually handle.
function getSpeechLanguage(): 'multi' | 'en' {
  return 'en';
}

// Lookup table (O(1) per char) instead of chars.indexOf() (O(64) per char) —
// this runs on every audio chunk on the streaming hot path (4x/sec), so the
// naive version was slow enough to visibly lag live transcription.
const BASE64_DECODE_TABLE = (() => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < chars.length; i++) table[chars.charCodeAt(i)] = i;
  return table;
})();

function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/]/g, '');
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4));
  let byteIndex = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const e1 = BASE64_DECODE_TABLE[clean.charCodeAt(i)];
    const e2 = BASE64_DECODE_TABLE[clean.charCodeAt(i + 1)];
    const c3 = clean.charCodeAt(i + 2);
    const c4 = clean.charCodeAt(i + 3);
    const e3 = Number.isNaN(c3) ? -1 : BASE64_DECODE_TABLE[c3];
    const e4 = Number.isNaN(c4) ? -1 : BASE64_DECODE_TABLE[c4];
    bytes[byteIndex++] = (e1 << 2) | (e2 >> 4);
    if (e3 >= 0) bytes[byteIndex++] = ((e2 & 15) << 4) | (e3 >> 2);
    if (e4 >= 0) bytes[byteIndex++] = ((e3 & 3) << 6) | e4;
  }
  return bytes.subarray(0, byteIndex);
}

export type TranscriptWord = { word: string; confidence: number };

// Temporary latency instrumentation (remove once we've diagnosed perceived
// voice-mode lag) — rolling averages of two numbers, surfaced in-app since
// this build has no attached Metro/console to read logs from:
//   roundTripMs: last audio chunk SENT -> next transcript message RECEIVED
//                (covers network + Deepgram processing together)
//   chunkGapMs:  actual observed time between successive audio sends
//                (should track the configured 250ms interval — if it's
//                consistently higher, the recorder itself is buffering/
//                stalling before handing us chunks, independent of network)
export type LiveTranscriptionDebugStats = {
  lastRoundTripMs: number;
  avgRoundTripMs: number;
  avgChunkGapMs: number;
  sampleCount: number;
};

function average(samples: number[]): number {
  if (samples.length === 0) return 0;
  return samples.reduce((a, b) => a + b, 0) / samples.length;
}

function pushSample(samples: number[], value: number, max = 20) {
  samples.push(value);
  if (samples.length > max) samples.shift();
}

// Shared live-transcription engine (WebSocket relay -> Deepgram) used by both
// the new-entry voice composer and dictation-into-existing-text (e.g. entry
// editing). `onFinalTranscript` fires with the FULL accumulated transcript
// for the current recording session each time a phrase finalizes — callers
// decide how to merge that into their own text state (replace vs. append).
export function useLiveTranscription({ onFinalTranscript }: { onFinalTranscript: (fullSessionTranscript: string) => void }) {
  const { startRecording: startLiveRecording, stopRecording: stopLiveRecording, isRecording, durationMs } = useLiveAudioRecorder();
  const [connecting, setConnecting] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState('');
  const [amplitude, setAmplitude] = useState(0);
  const [finalWords, setFinalWords] = useState<TranscriptWord[]>([]);
  const [debugStats, setDebugStats] = useState<LiveTranscriptionDebugStats | null>(null);
  const socketRef = useRef<WebSocket | null>(null);
  const finalTranscriptRef = useRef('');
  const finalWordsRef = useRef<TranscriptWord[]>([]);
  const lastChunkSentAtRef = useRef<number | null>(null);
  const roundTripSamplesRef = useRef<number[]>([]);
  const chunkGapSamplesRef = useRef<number[]>([]);

  async function start() {
    setError('');
    setInterimText('');
    setAmplitude(0);
    setFinalWords([]);
    setDebugStats(null);
    finalTranscriptRef.current = '';
    finalWordsRef.current = [];
    lastChunkSentAtRef.current = null;
    roundTripSamplesRef.current = [];
    chunkGapSamplesRef.current = [];
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) { setError('Microphone access is needed to record.'); return; }

      setConnecting(true);

      const { data: { session } } = await supabase.auth.getSession();
      const language = getSpeechLanguage();
      const wsUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL!.replace(/^http/, 'ws')}/functions/v1/transcribe-voice-live?token=${encodeURIComponent(session?.access_token ?? '')}&language=${language}`;
      const socket = new WebSocket(wsUrl);
      socketRef.current = socket;

      socket.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          const alt = msg?.channel?.alternatives?.[0];
          const text = alt?.transcript ?? '';
          if (!text) return;

          if (lastChunkSentAtRef.current != null) {
            const roundTripMs = Date.now() - lastChunkSentAtRef.current;
            pushSample(roundTripSamplesRef.current, roundTripMs);
            setDebugStats({
              lastRoundTripMs: roundTripMs,
              avgRoundTripMs: Math.round(average(roundTripSamplesRef.current)),
              avgChunkGapMs: Math.round(average(chunkGapSamplesRef.current)),
              sampleCount: roundTripSamplesRef.current.length,
            });
          }

          if (msg.is_final) {
            finalTranscriptRef.current = `${finalTranscriptRef.current} ${text}`.trim();
            onFinalTranscript(finalTranscriptRef.current);
            const words: TranscriptWord[] = (alt?.words ?? []).map((w: any) => ({
              word: w.punctuated_word ?? w.word,
              confidence: typeof w.confidence === 'number' ? w.confidence : 1,
            }));
            finalWordsRef.current = [...finalWordsRef.current, ...words];
            setFinalWords(finalWordsRef.current);
            setInterimText('');
          } else {
            setInterimText(text);
          }
        } catch {
          // non-JSON / control frames — ignore
        }
      };
      socket.onerror = () => setError('Live transcription connection had trouble — your recording is still being saved.');

      await new Promise<void>((resolve, reject) => {
        socket.onopen = () => resolve();
        socket.onerror = () => reject(new Error('Could not connect for live transcription.'));
        setTimeout(() => reject(new Error('Timed out connecting for live transcription.')), 8000);
      });
      setConnecting(false);

      await startLiveRecording({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 250,
        output: { primary: { enabled: true, format: 'wav' } },
        onAudioStream: async (event) => {
          if (typeof event.data !== 'string') return;
          const bytes = base64ToBytes(event.data);
          const now = Date.now();
          if (lastChunkSentAtRef.current != null) {
            pushSample(chunkGapSamplesRef.current, now - lastChunkSentAtRef.current);
          }
          lastChunkSentAtRef.current = now;
          if (socketRef.current?.readyState === WebSocket.OPEN) socketRef.current.send(bytes);
        },
        // Native audio metering for the pulse orb, instead of hand-rolling RMS
        // from the streamed PCM on the JS thread — computed on the native side
        // at a much higher rate (intervalAnalysis) than the 4x/sec transcription
        // chunking needs, so the orb actually tracks voice modulation.
        enableProcessing: true,
        intervalAnalysis: 60,
        keepFullAnalysis: false,
        onAudioAnalysis: async (event) => {
          const points = event.dataPoints;
          const latest = points?.[points.length - 1];
          if (!latest) return;
          // rms is already normalized to ~[0,1]; sqrt gives it a perceptual
          // (log-ish) boost so quiet-to-loud speech reads as a visible swing
          // instead of a barely-moving linear meter.
          const level = Math.max(0, Math.min(1, Math.sqrt(latest.rms ?? 0) * 1.3));
          setAmplitude(level);
        },
      });
    } catch (e: any) {
      setConnecting(false);
      setError(e?.message ?? 'Could not start recording.');
    }
  }

  async function stop() {
    try {
      const result = await stopLiveRecording();
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'CloseStream' }));
        socketRef.current.close();
      }
      socketRef.current = null;
      setInterimText('');
      setAmplitude(0);
      return result;
    } catch (e: any) {
      setError(e?.message ?? 'Could not finish that recording.');
      return null;
    }
  }

  return { isRecording, connecting, interimText, error, durationMs, amplitude, finalWords, debugStats, start, stop };
}
