/**
 * Video Playhead Context
 *
 * One playhead shared by a performance video and the notation beside it.
 *
 * The video pane sits three prop layers below the shell (shell →
 * ViewerSplitPane → ViewerCompanionSurface → SequenceVideos) and also renders
 * outside the viewer altogether - the Create module's videos panel and the
 * /test/sequence-videos route. Threading the wiring down that chain would put
 * viewer-specific plumbing in every layer between, including the ones that
 * have no viewer. A context skips them: the shell sets it, the video pane
 * consumes it, and everywhere else `tryGet` returns null and the pane behaves
 * exactly as it did.
 *
 * See docs/superpowers/specs/2026-08-16-video-notation-shared-playhead-design.md
 */

import { getContext, setContext } from "svelte";
import type { StepMap } from "$lib/shared/video-collaboration/domain/collaborative-video";
import { seekTimeForStep } from "$lib/shared/video-collaboration/utils/step-map-utils";
import type { HandLabeling } from "$lib/shared/video-collaboration/domain/hand-labeling";

const KEY = Symbol("sequence-viewer-video-playhead");

export interface VideoPlayheadBridge {
  /**
   * The performance on screen changed. `map` is null when it carries no
   * timing; `handLabeling` is null when no performance is on screen at all.
   */
  attach(map: StepMap | null, handLabeling: HandLabeling | null): void;
  /** The footage moved. */
  reportTime(seconds: number): void;
  /** The player a step click should drive. Null when none is mounted. */
  registerSeek(seek: ((seconds: number) => void) | null): void;
  /**
   * Drive the footage to a step. False when there is nothing mapped to drive,
   * which is the caller's signal to fall back to seeking the animation.
   */
  seekToStep(stepIndex: number): boolean;
}

interface BridgeHost {
  setPlaybackSource(source: "animation" | "video"): void;
  setActiveStepMap(map: StepMap | null): void;
  setActiveHandLabeling(labeling: HandLabeling | null): void;
  onVideoTimeUpdate(seconds: number): void;
}

export function createVideoPlayheadBridge(
  host: BridgeHost
): VideoPlayheadBridge {
  let map: StepMap | null = null;
  let seek: ((seconds: number) => void) | null = null;
  let time = 0;

  return {
    attach(next, handLabeling) {
      // A video without timing cannot drive anything, so it hands the playhead
      // back to the animation rather than freezing the notation on whatever
      // step the previous one left behind.
      const usable = next && next.beatTimestamps.length > 0 ? next : null;
      map = usable;
      time = 0;
      host.setActiveStepMap(usable);
      host.setActiveHandLabeling(handLabeling);
      host.setPlaybackSource(usable ? "video" : "animation");
    },
    reportTime(seconds) {
      time = seconds;
      host.onVideoTimeUpdate(seconds);
    },
    registerSeek(next) {
      seek = next;
    },
    seekToStep(stepIndex) {
      if (!map || !seek) return false;
      const at = seekTimeForStep(stepIndex, time, map);
      if (at === null) return false;
      seek(at);
      time = at;
      host.onVideoTimeUpdate(at);
      return true;
    },
  };
}

export function setVideoPlayheadContext(bridge: VideoPlayheadBridge): void {
  setContext(KEY, bridge);
}

/**
 * The bridge, or null outside the viewer. Callers must handle null - the same
 * component renders in Create and in test routes, where there is no notation
 * to keep in step.
 */
export function tryGetVideoPlayheadContext(): VideoPlayheadBridge | null {
  try {
    return getContext<VideoPlayheadBridge | undefined>(KEY) ?? null;
  } catch {
    return null;
  }
}
