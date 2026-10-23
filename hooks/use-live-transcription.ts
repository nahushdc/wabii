import { useRef, useState } from 'react';
import { useAudioRecorder as useLiveAudioRecorder } from '@siteed/audio-studio';
import { AudioModule } from 'expo-audio';
import { useSharedValue } from 'react-native-reanimated';
import { supabase } from '@/lib/supabase';
import { VoiceStreamManager, VoicePath, VoiceSocket } from '@/lib/voice-stream';
import { playRecordingStoppedAlert } from '@/lib/voice-alert';

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

// Same settings the relay uses. mip_opt_out keeps Deepgram from using anyone's
// voice to improve its own models.
function deepgramUrl(language: string) {
  return `wss://api.deepgram.com/v1/listen?model=nova-3&language=${language}` +
    `&encoding=linear16&sample_rate=16000&channels=1` +
    `&punctuate=true&smart_format=true&interim_results=true&endpointing=100&mip_opt_out=true`;
}

// Opens a live-transcription connection and resolves once it is open.
// 'direct': straight to Deepgram with a one-time key (no 150-second limit).
// 'relay': through our server function, kept as the fallback.
async function openSocket(path: VoicePath, language: string): Promise<VoiceSocket> {
  let socket: WebSocket;
  if (path === 'direct') {
    const { data, error } = await supabase.functions.invoke('deepgram-token');
    if (error || !data?.access_token) throw new Error('Could not start live transcription.');
    socket = new WebSocket(deepgramUrl(language), ['bearer', data.access_token]);
  } else {
    const { data: { session } } = await supabase.auth.getSession();
    const wsUrl = `${process.env.EXPO_PUBLIC_SUPABASE_URL!.replace(/^http/, 'ws')}/functions/v1/transcribe-voice-live?token=${encodeURIComponent(session?.access_token ?? '')}&language=${language}`;
    socket = new WebSocket(wsUrl);
  }
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try { socket.close(); } catch {}
      reject(new Error('Timed out connecting for live transcription.'));
    }, 8000);
    socket.onopen = () => { clearTimeout(timer); resolve(); };
    socket.onerror = () => { clearTimeout(timer); reject(new Error('Could not connect for live transcription.')); };
  });
  return socket as unknown as VoiceSocket;
}

// Loudest 20ms-window RMS in a little-endian PCM16 chunk (16kHz), normalized
// to [0,1]. Taking the loudest short window instead of the whole-chunk average
// keeps syllable onsets sharp — averaging a 100ms chunk smears them flat.
const LEVEL_WINDOW = 320;
function pcmLevel(bytes: Uint8Array): number {
  const sampleCount = bytes.length >> 1;
  let loudest = 0;
  for (let start = 0; start < sampleCount; start += LEVEL_WINDOW) {
    const end = Math.min(start + LEVEL_WINDOW, sampleCount);
    let sumSquares = 0;
    for (let i = start; i < end; i++) {
      let sample = bytes[i * 2] | (bytes[i * 2 + 1] << 8);
      if (sample >= 32768) sample -= 65536;
      sumSquares += sample * sample;
    }
    const rms = Math.sqrt(sumSquares / (end - start)) / 32768;
    if (rms > loudest) loudest = rms;
  }
  return loudest;
}

// Shared live-transcription engine (straight to Deepgram, with the server relay
// as a fallback, kept alive by VoiceStreamManager) used by both
// the new-entry voice composer and dictation-into-existing-text (e.g. entry
// editing). `onFinalTranscript` fires with the FULL accumulated transcript
// for the current recording session each time a phrase finalizes — callers
// decide how to merge that into their own text state (replace vs. append).
export function useLiveTranscription({ onFinalTranscript }: { onFinalTranscript: (fullSessionTranscript: string) => void }) {
  const { startRecording: startLiveRecording, stopRecording: stopLiveRecording, isRecording, durationMs } = useLiveAudioRecorder();
  const [connecting, setConnecting] = useState(false);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState('');
  // A Reanimated shared value instead of React state: the native metering
  // callback writes straight to it and the orb reads it on the UI thread, so
  // voice level never triggers a re-render of the screen (or waits behind
  // transcript/WebSocket work on the JS thread).
  const amplitude = useSharedValue(0);
  const peakRef = useRef(0.2);
  const [finalWords, setFinalWords] = useState<TranscriptWord[]>([]);
  const managerRef = useRef<VoiceStreamManager | null>(null);
  const finalTranscriptRef = useRef('');
  const finalWordsRef = useRef<TranscriptWord[]>([]);

  function handleMessage(data: string) {
    try {
      const msg = JSON.parse(data);
      const alt = msg?.channel?.alternatives?.[0];
      const text = alt?.transcript ?? '';
      if (!text) return;

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
  }

  // Every way of keeping the connection going has failed: stop recording and
  // make it unmistakable, so nobody keeps talking to a recording that ended.
  async function giveUp() {
    managerRef.current = null;
    try { await stopLiveRecording(); } catch {}
    setInterimText('');
    amplitude.value = 0;
    setError('Dictation stopped. Your text is saved. Tap the mic to continue.');
    playRecordingStoppedAlert();
  }

  async function start() {
    setError('');
    setInterimText('');
    amplitude.value = 0;
    peakRef.current = 0.2;
    setFinalWords([]);
    finalTranscriptRef.current = '';
    finalWordsRef.current = [];
    try {
      const { granted } = await AudioModule.requestRecordingPermissionsAsync();
      if (!granted) { setError('Microphone access is needed to record.'); return; }

      setConnecting(true);

      const language = getSpeechLanguage();
      const manager = new VoiceStreamManager({
        connect: (path) => openSocket(path, language),
        onMessage: handleMessage,
        // A new connection starts clean: any half-finished phrase is gone.
        onSwitch: () => setInterimText(''),
        onGaveUp: () => { void giveUp(); },
      });
      managerRef.current = manager;
      await manager.start();
      setConnecting(false);

      await startLiveRecording({
        sampleRate: 16000,
        channels: 1,
        encoding: 'pcm_16bit',
        // 100ms chunks. The native metering pipeline (enableProcessing) is
        // deliberately OFF: with it on, chunks arrived ~1s apart despite a
        // 250ms setting, so the orb level is computed from the streamed PCM
        // instead.
        interval: 100,
        output: { primary: { enabled: true, format: 'wav' } },
        onAudioStream: async (event) => {
          if (typeof event.data !== 'string') return;
          const bytes = base64ToBytes(event.data);
          managerRef.current?.send(bytes);

          const level = pcmLevel(bytes);
          // Noise gate: room hiss shouldn't move the waveform.
          const GATE = 0.006;
          if (level < GATE) { amplitude.value = 0; return; }
          // Adaptive normalization against the recent peak so quiet and loud
          // speakers both get the full range. Short decay keeps it adapting
          // quickly; the 0.8 curve preserves the gap between loud and soft
          // syllables (a square root flattens everything toward the middle).
          peakRef.current = Math.max(level, peakRef.current * 0.97, 0.05);
          const normalized = Math.min(1, (level - GATE) / (peakRef.current - GATE));
          amplitude.value = Math.pow(normalized, 0.8);
        },
      });
    } catch (e: any) {
      managerRef.current?.abort();
      managerRef.current = null;
      setConnecting(false);
      setError(e?.message ?? 'Could not start recording.');
    }
  }

  async function stop() {
    try {
      const result = await stopLiveRecording();
      // Lets the last phrase, still unfinalized when you tap stop, come through
      // before the connection closes.
      const manager = managerRef.current;
      managerRef.current = null;
      await manager?.stop();
      setInterimText('');
      amplitude.value = 0;
      return result;
    } catch (e: any) {
      setError(e?.message ?? 'Could not finish that recording.');
      return null;
    }
  }

  return { isRecording, connecting, interimText, error, durationMs, amplitude, finalWords, start, stop };
}
