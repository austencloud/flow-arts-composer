export interface MicrophoneOption {
  deviceId: string;
  label: string;
}

export interface MicrophoneSettings {
  label: string;
  sampleRate?: number;
  sampleSize?: number;
  channelCount?: number;
  /** A browser may report a mode such as "remote-only" instead of a flag. */
  echoCancellation?: boolean | string;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

export interface ConnectedMicrophone {
  stream: MediaStream;
  devices: MicrophoneOption[];
  settings: MicrophoneSettings;
}

/**
 * Device access only. Capture moved to `IAudioRingCapture`: one `MediaStream`
 * now feeds two consumers — the capture ring and the VAD — and the take-based
 * encode/decode path in between was what put a `decodeAudioData` on the gap
 * between two words.
 */
export interface IPronunciationRecorder {
  isSupported(): boolean;
  listMicrophones(): Promise<MicrophoneOption[]>;
  connect(deviceId?: string): Promise<ConnectedMicrophone>;
  dispose(): Promise<void>;
}
