import {
  encodeWav,
  mixPostAudio,
  planPostAudio,
  type PostAudioSegment,
  type PostAudioSource,
} from "$lib/shared/media-composition/domain/post-audio-plan";
import type { CompiledPost } from "$lib/shared/media-composition/domain/post-plan-compiler";

export interface BuildPostAudioTrackInput {
  post: CompiledPost;
  mode: "takes" | "silent";
  /** Fetchable URL for a take's own media, keyed by `PostTake.id`. A take
   *  missing here is treated the same as one that fails to decode: silent,
   *  not a failure. */
  takeUrls: ReadonlyMap<string, string>;
  sampleRate?: number;
  /** Cancelling the render stops the downloads rather than waiting on them. */
  signal?: AbortSignal;
}

const DEFAULT_SAMPLE_RATE = 48_000;
/** Any valid rate works - see the comment on its one use in decodeTakeAudio. */
const DECODE_CONTEXT_SAMPLE_RATE = 44_100;

/**
 * No bytes for this long means the download has stopped, not slowed. Paused
 * preview videos can hold a whole HTTP/2 connection's receive window, and then
 * a take's body never arrives: the render used to sit at "Mixing the sound" 0%
 * for good.
 */
export const AUDIO_DOWNLOAD_STALL_MS = 30_000;

/** A take's file stopped arriving. This fails the render instead of quietly
 *  exporting the post without its sound. */
export class AudioDownloadStalledError extends Error {
  constructor(readonly url: string) {
    super(
      `No audio bytes arrived for ${AUDIO_DOWNLOAD_STALL_MS / 1000}s: ${url}`
    );
    this.name = "AudioDownloadStalledError";
  }
}

export interface BuildMixedAudioTrackInput {
  segments: readonly PostAudioSegment[];
  durationSeconds: number;
  /** Fetchable URL for a take's own media, keyed by `PostTake.id`. A take
   *  missing here is treated the same as one that fails to decode: silent,
   *  not a failure. */
  takeUrls: ReadonlyMap<string, string>;
  sampleRate?: number;
  /** Cancelling the render stops the downloads rather than waiting on them. */
  signal?: AbortSignal;
  /** Share of the takes' bytes downloaded so far, from 0 to 1. Reported once
   *  every download knows its size. */
  onProgress?: (fraction: number) => void;
}

/**
 * Fetches and decodes whatever takes a caller's own segments need, mixes
 * them, and encodes the result as one WAV blob already laid out on the
 * segments' own clock from 0. That's what lets it slot straight into
 * `PostStudioExporter`'s existing single-track `originalAudioUrl` /
 * `originalAudioStartSeconds: 0` pair instead of needing the encoder to
 * accept several original-audio sources - see the finding in this file's
 * sibling `post-audio-plan.ts` docblock and the task report for the
 * `UrlSource`/blob-URL check.
 *
 * This is the shared plumbing behind both `buildPostAudioTrack` (the v1 act
 * list, via `planPostAudio`) and the v2 timeline (via `planProjectAudio`),
 * so a caller with a compiled project's segments in hand can mix them
 * directly without going through a v1 `CompiledPost` at all.
 */
export async function buildMixedAudioTrack(
  input: BuildMixedAudioTrackInput
): Promise<Blob | null> {
  const sampleRate = input.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const segments = input.segments;
  if (segments.length === 0) return null;

  const neededTakeIds = [...new Set(segments.map((segment) => segment.takeId))];
  const sources = new Map<string, PostAudioSource>();
  // A stalled file ends the other downloads too: the render has failed.
  const downloads = new AbortController();
  const stopDownloads = () => downloads.abort();
  input.signal?.addEventListener("abort", stopDownloads, { once: true });
  if (input.signal?.aborted) downloads.abort();
  const progress = downloadProgress(input.onProgress);

  // One fetch+decode per file, not per take or segment - a take can back more
  // than one segment (e.g. reused across full-speed acts, or split across a
  // sequence layer's pieces), and two takes can cut from the same recording,
  // but each file only needs reading once.
  const decodes = new Map<string, Promise<PostAudioSource | null>>();
  for (const takeId of neededTakeIds) {
    const url = input.takeUrls.get(takeId);
    if (url && !decodes.has(url)) {
      decodes.set(
        url,
        decodeTakeAudio(takeId, url, downloads.signal, progress.track(url))
      );
    }
  }
  try {
    await Promise.all(
      neededTakeIds.map(async (takeId) => {
        const url = input.takeUrls.get(takeId);
        const source = url ? await decodes.get(url) : null;
        if (source) sources.set(takeId, source);
      })
    );
  } catch (error) {
    downloads.abort();
    throw error;
  } finally {
    input.signal?.removeEventListener("abort", stopDownloads);
  }
  if (input.signal?.aborted) return null;

  const mixed = mixPostAudio({
    segments,
    sources,
    sampleRate,
    durationSeconds: input.durationSeconds,
  });

  return encodeWav(mixed, sampleRate);
}

/** Builds a v1 act-list post's whole mixed audio track. See
 *  `buildMixedAudioTrack` for the shared fetch/decode/mix/encode path. */
export async function buildPostAudioTrack(
  input: BuildPostAudioTrackInput
): Promise<Blob | null> {
  const segments = planPostAudio(input.post, input.mode);
  return buildMixedAudioTrack({
    segments,
    durationSeconds: input.post.durationSeconds,
    takeUrls: input.takeUrls,
    sampleRate: input.sampleRate,
    signal: input.signal,
  });
}

interface DownloadTracker {
  expect(bytes: number): void;
  receive(bytes: number): void;
}

/** Sums every download into one fraction. Until each file's size is known the
 *  total would keep growing, so nothing is reported before then. */
function downloadProgress(onProgress?: (fraction: number) => void): {
  track(url: string): DownloadTracker;
} {
  const expected = new Map<string, number>();
  let tracked = 0;
  let received = 0;
  const report = () => {
    if (!onProgress || expected.size < tracked) return;
    let total = 0;
    for (const bytes of expected.values()) total += bytes;
    if (total > 0) onProgress(Math.min(1, received / total));
  };
  return {
    track(url) {
      tracked++;
      return {
        expect(bytes) {
          expected.set(url, bytes);
          report();
        },
        receive(bytes) {
          received += bytes;
          report();
        },
      };
    },
  };
}

/** Reads a whole body, failing with `AudioDownloadStalledError` once no bytes
 *  have arrived for `AUDIO_DOWNLOAD_STALL_MS`, waiting for headers included. */
async function downloadAudioFile(
  url: string,
  signal: AbortSignal,
  tracker: DownloadTracker
): Promise<ArrayBuffer> {
  const request = new AbortController();
  const cancel = () => request.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) request.abort();
  let stalled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const watch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      stalled = true;
      request.abort();
    }, AUDIO_DOWNLOAD_STALL_MS);
  };
  try {
    watch();
    const response = await fetch(url, { signal: request.signal });
    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }
    const length = Number(response.headers.get("content-length")) || 0;
    tracker.expect(length);
    if (!response.body) return await response.arrayBuffer();
    const reader = response.body.getReader();
    // A known length fills one buffer in place, so a long take is never held
    // twice while its chunks are joined.
    let bytes = new Uint8Array(length);
    let size = 0;
    for (;;) {
      watch();
      const { done, value } = await reader.read();
      if (done) break;
      if (size + value.byteLength > bytes.byteLength) {
        const grown = new Uint8Array(
          Math.max(size + value.byteLength, bytes.byteLength * 2)
        );
        grown.set(bytes.subarray(0, size));
        bytes = grown;
      }
      bytes.set(value, size);
      size += value.byteLength;
      tracker.receive(value.byteLength);
    }
    return size === bytes.byteLength
      ? bytes.buffer
      : bytes.buffer.slice(0, size);
  } catch (error) {
    if (stalled) throw new AudioDownloadStalledError(url);
    throw error;
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}

/** Fetches and decodes one take's audio. Failure - a missing file, a codec
 *  the browser can't decode, a network error - is swallowed and logged: the
 *  mix simply plays that segment's span as silence rather than failing the
 *  whole export over one bad take. A stalled download says nothing about the
 *  take, so it fails the render where it can be seen instead. */
async function decodeTakeAudio(
  takeId: string,
  url: string,
  signal: AbortSignal,
  tracker: DownloadTracker
): Promise<PostAudioSource | null> {
  try {
    const arrayBuffer = await downloadAudioFile(url, signal, tracker);
    // A throwaway OfflineAudioContext is the standard way to reach
    // decodeAudioData without touching the live output device or needing a
    // user gesture to leave "suspended" (a real AudioContext can start
    // suspended in some browsers; decode still works, but this sidesteps
    // that entirely). Its (1, 1, rate) render config is never actually
    // rendered - decodeAudioData returns the source's own native sample rate
    // and channel count regardless of what the context was built with.
    const context = new OfflineAudioContext(1, 1, DECODE_CONTEXT_SAMPLE_RATE);
    const audioBuffer = await context.decodeAudioData(arrayBuffer);
    const channels: Float32Array[] = [];
    for (let channel = 0; channel < audioBuffer.numberOfChannels; channel++) {
      channels.push(audioBuffer.getChannelData(channel));
    }
    return { sampleRate: audioBuffer.sampleRate, channels };
  } catch (error) {
    if (error instanceof AudioDownloadStalledError) throw error;
    if (signal.aborted) return null;
    console.warn(
      `[post-audio-track] Take "${takeId}" audio could not be decoded; treating it as silent.`,
      error
    );
    return null;
  }
}
