import {
  AudioModule,
  AudioQuality,
  IOSOutputFormat,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type RecordingOptions,
} from 'expo-audio';
import { useEffect, useRef, useState } from 'react';

export const MIN_SECONDS = 5;
export const MAX_SECONDS = 10;

/**
 * Uncompressed 16-bit PCM in a .caf container, mono, 44.1kHz.
 *
 * Not a quality choice — it is the only kind of file iOS will play as an alarm. AAC in .m4a, which
 * this used to record, is fine for playback inside the app and silently unusable as an alert sound,
 * which is why a recorded voice never actually rang. Ten seconds of this is under a megabyte, and
 * recording it directly means nothing has to convert anything.
 */
const RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  extension: '.caf',
  sampleRate: 44100,
  numberOfChannels: 1,
  bitRate: 128000,
  ios: {
    ...RecordingPresets.HIGH_QUALITY.ios,
    extension: '.caf',
    outputFormat: IOSOutputFormat.LINEARPCM,
    audioQuality: AudioQuality.HIGH,
    sampleRate: 44100,
    linearPCMBitDepth: 16,
    linearPCMIsBigEndian: false,
    linearPCMIsFloat: false,
  },
};

export type VoiceRecorder = {
  isRecording: boolean;
  /** Seconds recorded so far in the current take. */
  elapsed: number;
  /** True once the current take is long enough to keep. */
  reachedMinimum: boolean;
  permissionDenied: boolean;
  /** The finished take, or null while recording or before the first one. */
  recordedUri: string | null;
  recordedMs: number;
  start: () => Promise<void>;
  /** Stops and keeps the take. Returns null — and keeps nothing — if it was too short. */
  stop: () => Promise<{ uri: string; ms: number } | null>;
  discard: () => void;
};

/**
 * Recording a voice, in one place: the format the alarm needs, the microphone permission, the
 * length window, and the auto-stop at the ceiling.
 *
 * Both screens that record — the full record screen and the day screen's inline control — share
 * this, so the length rules and the audio format cannot drift apart between them. Everything about
 * *presenting* a take (waveforms, stickers, buttons) stays with the screens, which look nothing
 * alike.
 */
export function useVoiceRecorder(): VoiceRecorder {
  const recorder = useAudioRecorder(RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 100);
  const [recordedUri, setRecordedUri] = useState<string | null>(null);
  const [recordedMs, setRecordedMs] = useState(0);
  const [permissionDenied, setPermissionDenied] = useState(false);
  const autoStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const status = await AudioModule.requestRecordingPermissionsAsync();
      setPermissionDenied(!status.granted);
      await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: true });
    })();
  }, []);

  useEffect(
    () => () => {
      if (autoStopTimer.current) clearTimeout(autoStopTimer.current);
    },
    []
  );

  const elapsed = recorderState.durationMillis ? recorderState.durationMillis / 1000 : 0;

  async function start() {
    setRecordedUri(null);
    await recorder.prepareToRecordAsync();
    recorder.record();
    // A take that runs long is stopped rather than refused, so nobody loses one to a stuck finger.
    autoStopTimer.current = setTimeout(() => void stop(), MAX_SECONDS * 1000);
  }

  async function stop(): Promise<{ uri: string; ms: number } | null> {
    if (autoStopTimer.current) {
      clearTimeout(autoStopTimer.current);
      autoStopTimer.current = null;
    }
    // Asked of the recorder rather than read off the polled hook state, which can be a tick behind
    // and is a snapshot of whichever render the caller came from. Throwing away a take that was
    // long enough, because the number had not caught up, is the worst outcome this can have.
    const ms = recorder.getStatus().durationMillis || recorderState.durationMillis || 0;
    await recorder.stop();

    if (ms / 1000 < MIN_SECONDS) return null;

    const uri = recorder.uri ?? null;
    if (!uri) return null;
    setRecordedMs(ms);
    setRecordedUri(uri);
    return { uri, ms };
  }

  return {
    isRecording: recorderState.isRecording,
    elapsed,
    reachedMinimum: elapsed >= MIN_SECONDS,
    permissionDenied,
    recordedUri,
    recordedMs,
    start,
    stop,
    discard: () => setRecordedUri(null),
  };
}
