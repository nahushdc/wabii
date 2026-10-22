import { AudioModule, createAudioPlayer } from 'expo-audio';
import * as Haptics from 'expo-haptics';

// Played when a recording stops on its own (the connection was lost and could
// not be recovered), so nobody keeps talking into a recording that has quietly
// ended. A short bell, plus a vibration for phones on silent.
export async function playRecordingStoppedAlert(): Promise<void> {
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  try {
    // The recorder leaves the audio session set up for capture; switch it back
    // so the bell plays, including with the ringer switch on silent.
    await AudioModule.setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
    const player = createAudioPlayer(require('../assets/sounds/ching.wav'));
    player.play();
    setTimeout(() => { try { player.remove(); } catch {} }, 2500);
  } catch {
    // The vibration and the on-screen message still tell them.
  }
}
