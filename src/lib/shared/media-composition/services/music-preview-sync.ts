import { POST_FRAME_RATE } from "$lib/shared/media-composition/domain/post-project";
import type {
  PreviewClockMedia,
  PreviewVideoState,
} from "$lib/shared/media-composition/services/post-preview-clock";
import {
  musicSpan,
  trackSecondsAt,
  type MusicPlacement,
} from "$lib/shared/media-composition/domain/music-grid";
import type { PostAudioSegment } from "$lib/shared/media-composition/domain/post-audio-plan";

/**
 * Where the preview's music element should be. While the music sounds it sets
 * the preview clock, the way audible footage does, so the picture follows the
 * beat. These rules only decide when the element itself must seek.
 */

/** How far playing music may stray from its target before it is moved back. */
export const MUSIC_DRIFT_SECONDS = 0.25;
/** A target that moves further than this between two reads is a jump. */
const JUMP_SECONDS = 0.5;

export interface MusicPreviewTarget {
  /** The file's second for this post second, kept inside the trimmed span. */
  seconds: number;
  /** Whether the music sounds at this post second. */
  inside: boolean;
}

export function musicPreviewTarget(
  music: MusicPlacement,
  postSeconds: number
): MusicPreviewTarget {
  const { start, end } = musicSpan(music);
  return {
    seconds: Math.min(
      music.sourceOutSeconds,
      Math.max(music.sourceInSeconds, trackSecondsAt(music, postSeconds))
    ),
    inside: postSeconds >= start && postSeconds < end,
  };
}

/**
 * Whether the music sounds at this post second: inside its planned stretch,
 * which the post's end shortens and a level of 0 removes. The preview's
 * music element plays only then, and only then does it set the clock.
 */
export function musicSoundsAt(
  segment: PostAudioSegment | null,
  postSeconds: number
): boolean {
  return (
    segment !== null &&
    postSeconds >= segment.postStartSeconds &&
    postSeconds < segment.postStartSeconds + segment.durationSeconds
  );
}

export interface MusicSeekState {
  currentTime: number;
  targetTime: number;
  /** The target at the last check; null before the first one. */
  previousTargetTime: number | null;
  /** Playing and not held. */
  playing: boolean;
  seeking: boolean;
  /** Set when the caller knows the playhead jumped. */
  jumped?: boolean;
}

export function shouldSeekMusic(state: MusicSeekState): boolean {
  if (state.seeking) return false;
  const jumped =
    state.jumped === true ||
    state.previousTargetTime === null ||
    Math.abs(state.targetTime - state.previousTargetTime) > JUMP_SECONDS;
  const tolerance =
    state.playing && !jumped ? MUSIC_DRIFT_SECONDS : 1 / POST_FRAME_RATE;
  return Math.abs(state.currentTime - state.targetTime) > tolerance;
}

/**
 * The music's entry in the preview clock's media while it sounds. The canvas
 * puts it first, so the picture keeps to the beat and footage that strays is
 * moved back to it. Null while the music is silent here: then it neither sets
 * the clock nor holds it up, and `read` is not called.
 */
export function musicClockMedia(
  music: MusicPlacement,
  segment: PostAudioSegment | null,
  postSeconds: number,
  read: () => PreviewVideoState
): PreviewClockMedia | null {
  if (!musicSoundsAt(segment, postSeconds)) return null;
  return {
    ...read(),
    targetTime: musicPreviewTarget(music, postSeconds).seconds,
    playbackRate: 1,
  };
}

/**
 * Where the music starts and stops sounding. A clock step stops just past
 * each, as it does at a cut, so the music is waited for from its first
 * instant.
 */
export function musicClockBoundaries(
  segment: PostAudioSegment | null
): number[] {
  return segment
    ? [
        segment.postStartSeconds,
        segment.postStartSeconds + segment.durationSeconds,
      ]
    : [];
}
