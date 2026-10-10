/**
 * StageSceneAdapter (implements ISceneOrchestrator)
 *
 * Interprets compose's TimelineState for multi-performer 3D rendering.
 * Maps timeline concepts to Stage concepts:
 *   - Performer tracks → Character assignments
 *   - Clips on performer tracks → Sequence playback
 *   - Formation track clips → Formation cue triggers
 *   - Camera track clips → Camera keyframe choreography
 *
 * This adapter allows Stage to reuse compose's DAW timeline infrastructure
 * without duplicating playback, UI, or state management code.
 *
 * @example
 * ```typescript
 * // In StageWorld.svelte or any timeline-driven 3D component
 * import { getTimelineState } from "#lib/shared/animation-engine/state/timeline-state.svelte.js";
 *
 * const timelineState = getTimelineState();
 * const adapter = createStageSceneAdapter(timelineState);
 *
 * // In $effect: drive character animations from timeline
 * $effect(() => {
 *   const clips = adapter.getAllActivePerformerClips();
 *   for (const [index, clipInfo] of clips) {
 *     if (clipInfo && performerStates[index]) {
 *       performerStates[index].setSequence(clipInfo.clip.sequence);
 *       performerStates[index].goToStep(clipInfo.stepIndex);
 *     }
 *   }
 * });
 *
 * // Get current formation
 * const formation = $derived(adapter.getActiveFormation());
 *
 * // Get camera state (if camera track exists)
 * const camera = $derived(adapter.getCameraState());
 * ```
 */

import type { TimelineState } from "#lib/shared/animation-engine/state/timeline-state.svelte.js";
import type {
  TimelineTrack,
  TimelineClip,
} from "#lib/shared/animation-engine/domain/timeline-types.js";
import type { FormationPreset } from "@austencloud/scene-3d";

export type TimeSeconds = number;

export interface ActivePerformerClip {
  clipId: string;
  progress: number;
  stepIndex: number;
  stepProgress: number;
  sequenceId: string;
}

export interface OrchestratedCameraState {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

export type PlayheadChangeCallback = (position: TimeSeconds) => void;
export type PlayStateChangeCallback = (isPlaying: boolean) => void;
export type FormationCueCallback = (preset: FormationPreset) => void;

export interface ISceneOrchestrator {
  readonly playheadPosition: TimeSeconds;
  readonly isPlaying: boolean;
  readonly bpm: number;
  readonly performerTrackCount: number;
  getActivePerformerClip(performerIndex: number): ActivePerformerClip | null;
  getAllActivePerformerClips(): Map<number, ActivePerformerClip | null>;
  getActiveFormation(): FormationPreset;
  hasFormationTrack(): boolean;
  getCameraState(): OrchestratedCameraState | null;
  hasCameraTrack(): boolean;
  onPlayheadChange(callback: PlayheadChangeCallback): () => void;
  onPlayStateChange(callback: PlayStateChangeCallback): () => void;
  onFormationCue(callback: FormationCueCallback): () => void;
}

// Internal Types

/**
 * Camera keyframe from a camera track clip
 * (stored in clip.label as JSON or parsed from clip metadata)
 */
interface CameraKeyframe {
  position: { x: number; y: number; z: number };
  target: { x: number; y: number; z: number };
}

/**
 * Create an adapter that interprets compose's timeline state for Stage 3D rendering.
 * Implements ISceneOrchestrator for formal DI integration.
 *
 * @param timelineState - The compose timeline state (from getTimelineState())
 * @returns An ISceneOrchestrator implementation
 */
export function createStageSceneAdapter(
  timelineState: TimelineState
): ISceneOrchestrator {
  // Event callback stores
  const playheadCallbacks = new Set<PlayheadChangeCallback>();
  const playStateCallbacks = new Set<PlayStateChangeCallback>();
  const formationCueCallbacks = new Set<FormationCueCallback>();

  // Track previous values for change detection
  let prevPlayhead = -1;
  let prevIsPlaying = false;
  let prevFormation: FormationPreset = "grid-2x2";
  // Performer Track Methods

  /**
   * Get all tracks that are performer tracks (type === "performer")
   */
  function getPerformerTracks(): TimelineTrack[] {
    return timelineState.project.tracks.filter((t) => t.type === "performer");
  }

  /**
   * Get the active clip at current playhead for a specific performer.
   * Returns clip info with progress and step calculations.
   */
  function getActivePerformerClip(
    performerIndex: number
  ): ActivePerformerClip | null {
    const performerTracks = getPerformerTracks();
    const track = performerTracks[performerIndex];
    if (!track) return null;

    const position = timelineState.playhead.position;

    // Find clip that spans the current playhead position
    const activeClip = track.clips.find(
      (clip) =>
        !clip.muted &&
        position >= clip.startTime &&
        position < clip.startTime + clip.duration
    );

    if (!activeClip) return null;

    // Calculate progress within the clip
    const clipProgress =
      (position - activeClip.startTime) / activeClip.duration;

    // Calculate step info from the sequence
    const stepCount = activeClip.sequence.steps.length;
    if (stepCount === 0) {
      return {
        clipId: activeClip.id,
        sequenceId: activeClip.sequence.id,
        progress: clipProgress,
        stepIndex: 0,
        stepProgress: 0,
      };
    }

    // Map progress to steps (accounting for in/out points and playbackRate)
    const effectiveProgress =
      activeClip.inPoint +
      clipProgress * (activeClip.outPoint - activeClip.inPoint);
    const exactStep = effectiveProgress * stepCount;
    const stepIndex = Math.floor(exactStep) % stepCount;
    const stepProgress = exactStep - Math.floor(exactStep);

    return {
      clipId: activeClip.id,
      sequenceId: activeClip.sequence.id,
      progress: clipProgress,
      stepIndex,
      stepProgress,
    };
  }

  /**
   * Get active clips for all performers at current playhead
   */
  function getAllActivePerformerClips(): Map<
    number,
    ActivePerformerClip | null
  > {
    const result = new Map<number, ActivePerformerClip | null>();
    const performerTracks = getPerformerTracks();

    performerTracks.forEach((_, index) => {
      result.set(index, getActivePerformerClip(index));
    });

    return result;
  }

  // Formation Track Methods

  /**
   * Get the formation track (type === "formation")
   */
  function getFormationTrack(): TimelineTrack | null {
    return (
      timelineState.project.tracks.find((t) => t.type === "formation") ?? null
    );
  }

  /**
   * Get the currently active formation preset based on playhead position.
   * Formation cues are "instant" - we find the most recent cue before playhead.
   */
  function getActiveFormation(): FormationPreset {
    const formationTrack = getFormationTrack();
    if (!formationTrack) return "grid-2x2";

    const position = timelineState.playhead.position;

    // Find all formation cues that have started before or at current position
    const pastCues = formationTrack.clips.filter(
      (clip) => !clip.muted && clip.startTime <= position
    );

    if (pastCues.length === 0) return "grid-2x2";

    // Get the most recent cue (highest startTime)
    const latestCue = pastCues.reduce((latest, current) =>
      current.startTime > latest.startTime ? current : latest
    );

    // Formation preset is stored in the clip's label
    // Validate it's a known preset, fallback to default
    const presetValue = latestCue.label as FormationPreset;
    const validPresets: FormationPreset[] = [
      "grid-2x2",
      "line",
      "circle",
      "v-shape",
      "diagonal",
      "custom",
    ];

    if (validPresets.includes(presetValue)) {
      return presetValue;
    }

    return "grid-2x2";
  }

  // Camera Track Methods

  /**
   * Get the camera track (type === "camera")
   */
  function getCameraTrack(): TimelineTrack | null {
    return (
      timelineState.project.tracks.find((t) => t.type === "camera") ?? null
    );
  }

  /**
   * Get interpolated camera state from camera track.
   * Camera clips contain keyframe data; we interpolate between them.
   */
  function getCameraState(): OrchestratedCameraState | null {
    const cameraTrack = getCameraTrack();
    if (!cameraTrack || cameraTrack.clips.length === 0) return null;

    const position = timelineState.playhead.position;

    // Filter unmuted clips and sort by start time
    const validClips = cameraTrack.clips
      .filter((c) => !c.muted)
      .sort((a, b) => a.startTime - b.startTime);

    if (validClips.length === 0) return null;

    // Find surrounding keyframes for interpolation
    let beforeClip: TimelineClip | null = null;
    let afterClip: TimelineClip | null = null;

    for (const clip of validClips) {
      if (clip.startTime <= position) {
        beforeClip = clip;
      } else if (afterClip === null) {
        afterClip = clip;
        break;
      }
    }

    // If no keyframe before, use the first one
    if (!beforeClip) {
      const firstClip = validClips[0];
      if (!firstClip) return null;
      return parseCameraKeyframe(firstClip);
    }

    // If no keyframe after, use the last one (hold)
    if (!afterClip) {
      return parseCameraKeyframe(beforeClip);
    }

    // Interpolate between before and after keyframes
    const t =
      (position - beforeClip.startTime) /
      (afterClip.startTime - beforeClip.startTime);

    const beforeState = parseCameraKeyframe(beforeClip);
    const afterState = parseCameraKeyframe(afterClip);

    if (!beforeState || !afterState) {
      return beforeState ?? afterState;
    }

    // Linear interpolation
    return {
      position: {
        x: lerp(beforeState.position.x, afterState.position.x, t),
        y: lerp(beforeState.position.y, afterState.position.y, t),
        z: lerp(beforeState.position.z, afterState.position.z, t),
      },
      target: {
        x: lerp(beforeState.target.x, afterState.target.x, t),
        y: lerp(beforeState.target.y, afterState.target.y, t),
        z: lerp(beforeState.target.z, afterState.target.z, t),
      },
    };
  }

  /**
   * Parse camera keyframe data from a clip's label (stored as JSON)
   */
  function parseCameraKeyframe(
    clip: TimelineClip
  ): OrchestratedCameraState | null {
    if (!clip.label) return null;

    try {
      const data = JSON.parse(clip.label) as CameraKeyframe;
      // Default camera position in meters
      return {
        position: data.position ?? { x: 0, y: 1.0, z: 2.5 },
        target: data.target ?? { x: 0, y: 0.5, z: 0 },
      };
    } catch {
      // Label is not JSON - might be a simple string
      return null;
    }
  }

  // Helpers

  function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  /**
   * Check if formation track exists
   */
  function hasFormationTrack(): boolean {
    return getFormationTrack() !== null;
  }

  /**
   * Check if camera track exists
   */
  function hasCameraTrack(): boolean {
    return getCameraTrack() !== null;
  }

  // Event Subscriptions

  function onPlayheadChange(callback: PlayheadChangeCallback): () => void {
    playheadCallbacks.add(callback);
    return () => playheadCallbacks.delete(callback);
  }

  function onPlayStateChange(callback: PlayStateChangeCallback): () => void {
    playStateCallbacks.add(callback);
    return () => playStateCallbacks.delete(callback);
  }

  function onFormationCue(callback: FormationCueCallback): () => void {
    formationCueCallbacks.add(callback);
    return () => formationCueCallbacks.delete(callback);
  }

  /**
   * Check for state changes and notify subscribers.
   * Call this from a frame loop or $effect to detect changes.
   */
  function _checkForChanges(): void {
    const currentPlayhead = timelineState.playhead.position;
    const currentIsPlaying = timelineState.playhead.isPlaying;
    const currentFormation = getActiveFormation();

    // Playhead change
    if (currentPlayhead !== prevPlayhead) {
      prevPlayhead = currentPlayhead;
      playheadCallbacks.forEach((cb) => cb(currentPlayhead));
    }

    // Play state change
    if (currentIsPlaying !== prevIsPlaying) {
      prevIsPlaying = currentIsPlaying;
      playStateCallbacks.forEach((cb) => cb(currentIsPlaying));
    }

    // Formation cue change
    if (currentFormation !== prevFormation) {
      prevFormation = currentFormation;
      formationCueCallbacks.forEach((cb) => cb(currentFormation));
    }
  }

  // Return ISceneOrchestrator Implementation

  return {
    // Read-only accessors
    get playheadPosition() {
      return timelineState.playhead.position;
    },
    get isPlaying() {
      return timelineState.playhead.isPlaying;
    },
    get bpm() {
      return timelineState.project.defaultBpm;
    },
    get performerTrackCount() {
      return getPerformerTracks().length;
    },

    // Performer methods
    getActivePerformerClip,
    getAllActivePerformerClips,

    // Formation methods
    getActiveFormation,
    hasFormationTrack,

    // Camera methods
    getCameraState,
    hasCameraTrack,

    // Event subscriptions
    onPlayheadChange,
    onPlayStateChange,
    onFormationCue,
  };
}
