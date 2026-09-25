import {
  encodeWav,
  mixPostAudio,
  planPostAudio,
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
 * Builds the post's whole mixed audio track as one WAV blob, already laid
 * out on the post's own clock from 0. That's what lets it slot straight into
 * `PostStudioExporter`'s existing single-track `originalAudioUrl` /
 * `originalAudioStartSeconds: 0` pair instead of needing the encoder to
 * accept several original-audio sources - see the finding in this file's
 * sibling `post-audio-plan.ts` docblock and the task report for the
 * `UrlSource`/blob-URL check.
 */
export async function buildPostAudioTrack(
  input: BuildPostAudioTrackInput
): Promise<Blob | null> {
  const sampleRate = input.sampleRate ?? DEFAULT_SAMPLE_RATE;
  const segments = planPostAudio(input.post, input.mode);
  if (segments.length === 0) return null;

  const neededTakeIds = [...new Set(segments.map((segment) => segment.takeId))];
  const sources = new Map<string, PostAudioSource>();

  // One fetch+decode per take, not per segment - a take can back more than
  // one act (e.g. reused across full-speed acts) but its audio only needs
  // reading once.
  await Promise.all(
    neededTakeIds.map(async (takeId) => {
      const url = input.takeUrls.get(takeId);
      if (!url) return;
      const source = await decodeTakeAudio(takeId, url, input.signal);
      if (source) sources.set(takeId, source);
    })
  );
  if (input.signal?.aborted) return null;

  const mixed = mixPostAudio({
    segments,
    sources,
    sampleRate,
    durationSeconds: input.post.durationSeconds,
  });

  return encodeWav(mixed, sampleRate);
}

/** Fetches and decodes one take's audio. Failure - a missing file, a codec
 *  the browser can't decode, a network error - is swallowed and logged: the
 *  mix simply plays that segment's span as silence rather than failing the
 *  whole export over one bad take. */
async function decodeTakeAudio(
  takeId: string,
  url: string,
  signal?: AbortSignal
): Promise<PostAudioSource | null> {
  try {
    const response = await fetch(url, { signal });
    if (!response.ok) {
      throw new Error(`Fetch failed with status ${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
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
    if (signal?.aborted) return null;
    console.warn(
      `[post-audio-track] Take "${takeId}" audio could not be decoded; treating it as silent.`,
      error
    );
    return null;
  }
}
