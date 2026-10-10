import type {
  PlaybackMode,
  UnifiedPlaybackContext,
} from "#lib/shared/timeline/unified-playback-context.js";
import type { MediaCompositionState } from "./media-composition-state.svelte";

/**
 * Reads a media composition as the shared transport's playback contract, so
 * Post Studio drives `UnifiedTimeline` instead of carrying a second transport
 * with its own play button, tempo control and scrubber.
 *
 * The two clocks measure different things and this is the whole translation:
 * the composition thinks in seconds along the output video, the transport
 * thinks in 0..1 progress plus step markers. Step boundaries come from the
 * sequence time map's anchors — a mapped performance therefore gets marks at
 * the arrivals someone actually tapped, not at even divisions.
 */
export function createCompositionPlaybackAdapter(
  composition: MediaCompositionState,
): UnifiedPlaybackContext {
  function anchorProgress(): number[] {
    const duration = composition.durationSeconds;
    if (duration <= 0) return [];
    return (composition.sequenceTimeMap?.anchors ?? []).map(
      (anchor) => anchor.mediaTimeSeconds / duration,
    );
  }

  function progressNow(): number {
    const duration = composition.durationSeconds;
    if (duration <= 0) return 0;
    return Math.min(1, Math.max(0, composition.previewSeconds / duration));
  }

  return {
    get overallProgress() {
      return progressNow();
    },
    get currentStep() {
      const marks = anchorProgress();
      if (marks.length === 0) return 0;
      const progress = progressNow();
      let step = 0;
      for (const mark of marks) {
        if (mark > progress + 1e-6) break;
        step += 1;
      }
      return step;
    },
    /**
     * The transport hides itself entirely at zero, so this floors at one
     * whenever there is a composition to scrub at all. A post always has a
     * length even when nothing supplied step marks.
     */
    get totalSteps() {
      if (composition.durationSeconds <= 0) return 0;
      return Math.max(1, anchorProgress().length - 1);
    },
    get isPlaying() {
      return composition.isPlaying;
    },
    /** The composition clock always wraps; no loop button to offer. */
    get isLooping() {
      return undefined;
    },
    get duration() {
      return composition.durationSeconds;
    },
    get elapsed() {
      return composition.previewSeconds;
    },
    get beatMarkerPositions() {
      return anchorProgress().filter((mark) => mark > 0.0001 && mark < 0.9999);
    },
    /**
     * Null means the post's length follows a source clip rather than the
     * sequence tempo, and there is no tempo to change. Undefined is the signal
     * the transport reads to leave the tempo group out.
     */
    get bpm() {
      return composition.tempoBpm ?? undefined;
    },
    get playbackMode() {
      return composition.animationPlaybackMode;
    },
    seek(progress: number) {
      composition.seek(
        Math.min(1, Math.max(0, progress)) * composition.durationSeconds,
      );
    },
    togglePlay() {
      composition.togglePlayback();
    },
    toggleLoop() {},
    onBpmChange(bpm: number) {
      composition.setTempoBpm(bpm);
    },
    onPlaybackModeChange(mode: PlaybackMode) {
      composition.setAnimationPlaybackMode(mode);
    },
  };
}
