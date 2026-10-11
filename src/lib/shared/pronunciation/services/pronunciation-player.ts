import { getTTSProvider } from "#lib/shared/voice-control/get-tts-provider.js";
import { selectTokenPath } from "../domain/token-selection";
import { parsePronunciationManifest } from "../pronunciation-manifest";
import {
  createPronunciationPlan,
  resolveRecordedCuePaths,
  type AnyPronunciationManifest,
  type PronunciationCue,
} from "../pronunciation-plan";
import type {
  IPronunciationPlayer,
  PronunciationPlaybackResult,
} from "./types";

const DEFAULT_MANIFEST_URL = "/audio/pronunciations/v1/manifest.json";

interface SpeechFallback {
  isSupported(): boolean;
  speak(text: string): Promise<void>;
  cancel(): void;
}

interface PronunciationPlayerOptions {
  manifestUrl?: string;
  speechFallback?: SpeechFallback;
  fetcher?: typeof fetch;
}

type WebKitAudioWindow = Window &
  typeof globalThis & {
    webkitAudioContext?: typeof AudioContext;
  };

/**
 * Plays contextual human recordings when a whole word is covered, then falls
 * back to one Web Speech utterance when the recording set is incomplete.
 */
export class PronunciationPlayer implements IPronunciationPlayer {
  private readonly manifestUrl: string;
  private readonly speechFallback: SpeechFallback;
  private readonly fetcher: typeof fetch;
  private manifestPromise: Promise<AnyPronunciationManifest | null> | null =
    null;
  private audioContext: AudioContext | null = null;
  private readonly bufferPromises = new Map<string, Promise<AudioBuffer>>();
  private readonly activeSources = new Set<AudioBufferSourceNode>();
  private finishRecordedPlayback: (() => void) | null = null;
  private playbackGeneration = 0;

  constructor(options: PronunciationPlayerOptions = {}) {
    this.manifestUrl = options.manifestUrl ?? DEFAULT_MANIFEST_URL;
    this.speechFallback = options.speechFallback ?? getTTSProvider();
    this.fetcher = options.fetcher ?? fetch;
  }

  isSupported(): boolean {
    if (this.speechFallback.isSupported()) return true;
    if (typeof window === "undefined") return false;
    const audioWindow = window as WebKitAudioWindow;
    return Boolean(audioWindow.AudioContext ?? audioWindow.webkitAudioContext);
  }

  async speak(workspaceLabel: string): Promise<PronunciationPlaybackResult> {
    const plan = createPronunciationPlan(workspaceLabel);
    if (!plan) {
      throw new Error(`Cannot pronounce invalid TKA word: ${workspaceLabel}`);
    }

    this.cancel();
    const generation = this.playbackGeneration;

    // Creating/resuming the context inside the user's action preserves the
    // browser's audio unlock while the manifest and clips load asynchronously.
    const context = this.getAudioContext();
    const resumePromise =
      context?.state === "suspended"
        ? context.resume().then(
            () => true,
            (error) => {
              console.warn(
                "[PronunciationPlayer] Web Audio could not resume.",
                error
              );
              return false;
            }
          )
        : Promise.resolve(context !== null);

    const recordedResult = await this.tryRecordedPlayback(
      plan.cues,
      generation,
      context,
      resumePromise
    );
    if (recordedResult) return recordedResult;
    if (generation !== this.playbackGeneration) return { source: "cancelled" };

    if (!this.speechFallback.isSupported()) {
      throw new Error(
        "No recorded pronunciation or speech synthesis is available"
      );
    }

    await this.speechFallback.speak(plan.spokenText);
    return {
      source:
        generation === this.playbackGeneration ? "synthetic" : "cancelled",
    };
  }

  cancel(): void {
    this.playbackGeneration += 1;
    this.speechFallback.cancel();

    for (const source of this.activeSources) {
      try {
        source.stop();
      } catch {
        // A source that has already ended needs no further cleanup.
      }
    }
    this.activeSources.clear();
    this.finishRecordedPlayback?.();
    this.finishRecordedPlayback = null;
  }

  private async tryRecordedPlayback(
    cues: PronunciationCue[],
    generation: number,
    context: AudioContext | null,
    resumePromise: Promise<boolean>
  ): Promise<PronunciationPlaybackResult | null> {
    const manifest = await this.loadManifest();
    if (!manifest || !context) return null;

    const paths =
      manifest.version === 2
        ? (selectTokenPath(cues, manifest)?.map((token) => token.path) ?? null)
        : resolveRecordedCuePaths(cues, manifest);
    if (!paths) return null;

    try {
      const manifestBase = new URL(
        ".",
        new URL(this.manifestUrl, window.location.href)
      );
      const buffers = await Promise.all(
        paths.map((path) =>
          this.loadBuffer(new URL(path, manifestBase).toString(), context)
        )
      );
      const resumed = await resumePromise;
      if (!resumed) return null;

      if (generation !== this.playbackGeneration) {
        return { source: "cancelled" };
      }

      await this.playBuffers(context, buffers, cues);
      return {
        source:
          generation === this.playbackGeneration ? "recorded" : "cancelled",
      };
    } catch (error) {
      console.warn(
        "[PronunciationPlayer] Recorded pronunciation failed; using speech synthesis.",
        error
      );
      return null;
    }
  }

  private loadManifest(): Promise<AnyPronunciationManifest | null> {
    if (this.manifestPromise) return this.manifestPromise;

    this.manifestPromise = this.fetcher(this.manifestUrl)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Manifest request failed with ${response.status}`);
        }
        const value: unknown = await response.json();
        const manifest = parsePronunciationManifest(value);
        if (!manifest) {
          throw new Error("Pronunciation manifest has an invalid shape");
        }
        return manifest;
      })
      .catch((error) => {
        console.warn(
          "[PronunciationPlayer] Pronunciation manifest unavailable; using speech synthesis.",
          error
        );
        return null;
      });

    return this.manifestPromise;
  }

  private getAudioContext(): AudioContext | null {
    if (this.audioContext) return this.audioContext;
    if (typeof window === "undefined") return null;

    const audioWindow = window as WebKitAudioWindow;
    const AudioContextConstructor =
      audioWindow.AudioContext ?? audioWindow.webkitAudioContext;
    if (!AudioContextConstructor) return null;

    try {
      this.audioContext = new AudioContextConstructor();
      return this.audioContext;
    } catch (error) {
      console.warn("[PronunciationPlayer] Web Audio could not start.", error);
      return null;
    }
  }

  private loadBuffer(url: string, context: AudioContext): Promise<AudioBuffer> {
    const cached = this.bufferPromises.get(url);
    if (cached) return cached;

    const pending = this.fetcher(url)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(
            `Recording request failed with ${response.status}: ${url}`
          );
        }
        return response.arrayBuffer();
      })
      .then((bytes) => context.decodeAudioData(bytes))
      .catch((error) => {
        this.bufferPromises.delete(url);
        throw error;
      });

    this.bufferPromises.set(url, pending);
    return pending;
  }

  private playBuffers(
    context: AudioContext,
    buffers: AudioBuffer[],
    cues: PronunciationCue[]
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let offsetSeconds = 0;
      const startAt = context.currentTime + 0.025;
      const finish = () => {
        if (this.finishRecordedPlayback === finish) {
          this.finishRecordedPlayback = null;
        }
        resolve();
      };
      this.finishRecordedPlayback = finish;

      try {
        buffers.forEach((buffer, index) => {
          const source = context.createBufferSource();
          source.buffer = buffer;
          source.connect(context.destination);
          this.activeSources.add(source);
          source.onended = () => {
            this.activeSources.delete(source);
            if (index === buffers.length - 1) finish();
          };
          source.start(startAt + offsetSeconds);
          offsetSeconds += buffer.duration + cues[index]!.pauseAfterMs / 1000;
        });
      } catch (error) {
        this.finishRecordedPlayback = null;
        for (const source of this.activeSources) {
          try {
            source.stop();
          } catch {
            // Ignore a source that failed before it started.
          }
        }
        this.activeSources.clear();
        reject(error);
      }
    });
  }
}
