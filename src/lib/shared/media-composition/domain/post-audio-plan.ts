import type { CompiledPost } from "$lib/shared/media-composition/domain/post-plan-compiler";
import type { CompiledPostProject } from "$lib/shared/media-composition/domain/post-project-compiler";

/**
 * The post's own audio track, mixed once and exported alongside the picture
 * instead of asking the encoder to mux several original tracks at once (it
 * only ever accepts one `originalAudio` source - see
 * `post-audio-track.ts` for why that fits the encoder as-is).
 *
 * Rule: a full-speed act carries its own take's sound, placed at the act's
 * spot in the post and trimmed to the act's own source span. A slowed act's
 * take would play back pitch-shifted and detuned if reused as-is, so it (and
 * a card act, which has no take) stays silent. `audio: "silent"` mutes the
 * whole post - Austen adds music in the app he posts to instead.
 */
export interface PostAudioSegment {
  takeId: string;
  /** Where this segment starts on the post's own clock. */
  postStartSeconds: number;
  /** Where this segment starts inside its take's own media. */
  sourceInSeconds: number;
  /** Always in POST seconds: how long this segment plays in the mixed
   *  output, not how much source media it reads (that's `rate`'s job). */
  durationSeconds: number;
  /** Source seconds consumed per second of post time. The v2 timeline lets a
   *  slowed video item still carry its own take's sound - at that same
   *  slowed rate, tape-style pitch drop included - rather than the v1 rule
   *  below of dropping a slowed act's sound outright. Defaults to 1. */
  rate?: number;
  /** Linear volume multiplier layered under the edge fades, not instead of
   *  them. Defaults to 1. */
  gain?: number;
  /** Duration of the overlap with the adjacent clip on this video track. */
  crossfadeInSeconds?: number;
  crossfadeOutSeconds?: number;
}

export function planPostAudio(
  post: Pick<CompiledPost, "acts">,
  mode: "takes" | "silent"
): PostAudioSegment[] {
  if (mode === "silent") return [];

  const segments: PostAudioSegment[] = [];
  for (const act of post.acts) {
    if (act.kind !== "performance") continue;
    if (!act.takeId) continue;
    // A slowed act's footage no longer matches its take's own clock, so its
    // sound would drift and pitch-shift the moment it played back untouched.
    if (act.speed !== 1) continue;
    const durationSeconds = act.sourceOut - act.sourceIn;
    if (durationSeconds <= 0) continue;
    segments.push({
      takeId: act.takeId,
      postStartSeconds: act.startSeconds,
      sourceInSeconds: act.sourceIn,
      durationSeconds,
    });
  }
  return segments;
}

/**
 * The v2 counterpart to `planPostAudio`, read off a compiled project's own
 * flattened video segments instead of a v1 act list. Every segment already
 * carries the item's own `speed` and `volume`, so they pass straight through
 * as `rate` and `gain` - a slowed item keeps its sound (at that same slowed
 * rate) rather than being dropped, and an item muted to volume 0 simply gets
 * no segment.
 */
export function planProjectAudio(
  post: Pick<CompiledPostProject, "videoSegments">,
  mode: "takes" | "silent"
): PostAudioSegment[] {
  if (mode === "silent") return [];

  const segments: (PostAudioSegment & { trackIndex: number })[] =
    post.videoSegments
      .filter((segment) => segment.volume > 0)
      .map((segment) => ({
        trackIndex: segment.trackIndex,
        takeId: segment.takeId,
        postStartSeconds: segment.startSeconds,
        sourceInSeconds: segment.sourceIn,
        durationSeconds: segment.endSeconds - segment.startSeconds,
        rate: segment.speed,
        gain: segment.volume,
      }));
  for (const trackIndex of new Set(
    segments.map((segment) => segment.trackIndex)
  )) {
    const track = segments
      .filter((segment) => segment.trackIndex === trackIndex)
      .sort((a, b) => a.postStartSeconds - b.postStartSeconds);
    for (let index = 1; index < track.length; index += 1) {
      const previous = track[index - 1]!;
      const next = track[index]!;
      const overlap =
        Math.min(
          previous.postStartSeconds + previous.durationSeconds,
          next.postStartSeconds + next.durationSeconds
        ) - next.postStartSeconds;
      if (overlap <= 0) continue;
      previous.crossfadeOutSeconds = overlap;
      next.crossfadeInSeconds = overlap;
    }
  }
  return segments.map(({ trackIndex: _trackIndex, ...segment }) => segment);
}

// ---------------------------------------------------------------------------
// Mixing
// ---------------------------------------------------------------------------

/** One take's decoded PCM, at whatever rate and channel count it decoded to. */
export interface PostAudioSource {
  sampleRate: number;
  channels: readonly Float32Array[];
}

export interface MixPostAudioInput {
  segments: readonly PostAudioSegment[];
  /** Keyed by `PostAudioSegment.takeId`. A segment with no matching source is
   *  skipped (silent), not an error - see `post-audio-track.ts`. */
  sources: ReadonlyMap<string, PostAudioSource>;
  sampleRate: number;
  durationSeconds: number;
  /** A short linear ramp at each segment's edges so a hard cut into or out of
   *  a take's sound doesn't click. */
  fadeSeconds?: number;
}

const DEFAULT_FADE_SECONDS = 0.008;

/**
 * Mixes every segment into one stereo bed sized to the post's own duration.
 * A mono source is duplicated to both channels; a source at a different
 * sample rate is resampled by linear interpolation as it's read, so nothing
 * upstream needs to pre-resample a whole take just to place a few seconds
 * of it.
 */
export function mixPostAudio(input: MixPostAudioInput): Float32Array[] {
  const { segments, sources, sampleRate, durationSeconds } = input;
  const fadeSeconds = input.fadeSeconds ?? DEFAULT_FADE_SECONDS;
  const totalSamples = Math.max(0, Math.round(durationSeconds * sampleRate));
  const outLeft = new Float32Array(totalSamples);
  const outRight = new Float32Array(totalSamples);

  for (const segment of segments) {
    const source = sources.get(segment.takeId);
    if (!source || source.channels.length === 0) continue;
    mixSegmentInto(outLeft, outRight, source, segment, sampleRate, fadeSeconds);
  }

  return [outLeft, outRight];
}

function sourceChannelPair(
  source: PostAudioSource
): [Float32Array, Float32Array] {
  const [first, second] = source.channels;
  // Mono: duplicate the one channel across both output channels.
  return [first!, second ?? first!];
}

/** A linearly interpolated sample at a fractional index; silence past the
 *  channel's own bounds rather than throwing. */
function sampleAt(channel: Float32Array, position: number): number {
  if (position < 0 || position >= channel.length) return 0;
  const lower = Math.floor(position);
  const upper = Math.min(channel.length - 1, lower + 1);
  const frac = position - lower;
  const a = channel[lower] ?? 0;
  const b = channel[upper] ?? 0;
  return a + (b - a) * frac;
}

function mixSegmentInto(
  outLeft: Float32Array,
  outRight: Float32Array,
  source: PostAudioSource,
  segment: PostAudioSegment,
  outSampleRate: number,
  fadeSeconds: number
): void {
  const [srcLeft, srcRight] = sourceChannelPair(source);
  const outStart = Math.round(segment.postStartSeconds * outSampleRate);
  const outCount = Math.max(
    0,
    Math.round(segment.durationSeconds * outSampleRate)
  );
  if (outCount <= 0) return;
  // Never let the two edge fades overlap in the middle of a very short clip.
  const fadeSamples = Math.min(
    Math.round(fadeSeconds * outSampleRate),
    Math.floor(outCount / 2)
  );
  const rate = segment.rate ?? 1;
  const gain = segment.gain ?? 1;
  const crossfadeInSamples = Math.round(
    (segment.crossfadeInSeconds ?? 0) * outSampleRate
  );
  const crossfadeOutSamples = Math.round(
    (segment.crossfadeOutSeconds ?? 0) * outSampleRate
  );

  for (let i = 0; i < outCount; i++) {
    const outIndex = outStart + i;
    if (outIndex < 0 || outIndex >= outLeft.length) continue;

    // Read position lives in source SECONDS, converted to that source's own
    // sample rate right here - this is what makes a 44.1kHz take mix cleanly
    // into a 48kHz bed without a separate resampling pass. `rate` scales how
    // much source time each output sample advances, so a slowed segment
    // reads its take that same amount slower instead of at the take's own
    // native speed.
    const sourceSeconds = segment.sourceInSeconds + (i / outSampleRate) * rate;
    const sourcePosition = sourceSeconds * source.sampleRate;
    const left = sampleAt(srcLeft, sourcePosition);
    const right = sampleAt(srcRight, sourcePosition);

    let fadeGain = 1;
    if (fadeSamples > 0) {
      if (i < fadeSamples && crossfadeInSamples === 0)
        fadeGain = i / fadeSamples;
      else if (i >= outCount - fadeSamples && crossfadeOutSamples === 0)
        fadeGain = (outCount - 1 - i) / fadeSamples;
    }
    if (crossfadeInSamples > 0 && i < crossfadeInSamples) {
      fadeGain = Math.min(fadeGain, i / crossfadeInSamples);
    }
    if (crossfadeOutSamples > 0 && i >= outCount - crossfadeOutSamples) {
      fadeGain = Math.min(fadeGain, (outCount - i) / crossfadeOutSamples);
    }

    outLeft[outIndex]! += left * fadeGain * gain;
    outRight[outIndex]! += right * fadeGain * gain;
  }
}

// ---------------------------------------------------------------------------
// WAV encoding
// ---------------------------------------------------------------------------

/** Encodes planar float channels as a 16-bit PCM WAV `Blob`. mediabunny's
 *  `UrlSource` (the encoder's own audio reader - see `background-video-
 *  encoder.ts`) demuxes WAV natively, and 16-bit PCM needs no separate
 *  codec/license to decode. */
export function encodeWav(
  channels: readonly Float32Array[],
  sampleRate: number
): Blob {
  const numChannels = Math.max(1, channels.length);
  const numSamples = channels[0]?.length ?? 0;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true); // fmt chunk size (PCM)
  view.setUint16(20, 1, true); // audio format: 1 = PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bytesPerSample * 8, true); // bits per sample
  writeAscii(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    for (let ch = 0; ch < numChannels; ch++) {
      const sample = Math.max(-1, Math.min(1, channels[ch]?.[i] ?? 0));
      view.setInt16(
        offset,
        Math.round(sample * (sample < 0 ? 0x8000 : 0x7fff)),
        true
      );
      offset += 2;
    }
  }

  return new Blob([buffer], { type: "audio/wav" });
}

function writeAscii(view: DataView, offset: number, text: string): void {
  for (let i = 0; i < text.length; i++) {
    view.setUint8(offset + i, text.charCodeAt(i));
  }
}
