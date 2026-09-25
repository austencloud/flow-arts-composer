import { userProportionsState, type PlaneMode } from "@austencloud/scene-3d";
import { getAnimationVisibilityManager } from "$lib/shared/animation-engine/state/animation-visibility-state.svelte";
import type { CharacterInstanceState } from "../state/character-instance-state.svelte";
import { buildStanceYawTrackForSource } from "../collision/stance-yaw-track";
import {
  buildHardBeatTrack,
  displaceProp,
  NO_HARD_BEAT_DISPLACEMENT,
  sampleHardBeatTrack,
  type HardBeatSample,
  type HardBeatTrack,
} from "../collision/hard-beat-displacement";

/**
 * Tells a seek from playback, so the animator can drop contact history (cached
 * arm retraction, pole and wrist smoothing) that belongs to another point in
 * the score.
 *
 * It has to watch the clock rather than listen for a seek call: both viewers
 * call `goToStep` and `setProgress` every frame (`synchronizePerformerPlayback`),
 * so a counter bumped there would reset every frame. Playback moves forward by
 * a small step; a jump backward, or forward by more than half a step, is a
 * seek. On a looping score the step across the loop seam is measured the short
 * way round, so the seam is playback, not a seek.
 */
export class ScoreSeekDetector {
  private previous: number | null = null;
  private epoch = 0;

  /** The current reset key after observing `scoreTime`. Idempotent at a
   *  repeated time, so several reads in one frame agree. */
  observe(scoreTime: number, stepCount: number, loop: boolean): number {
    if (!Number.isFinite(scoreTime)) return this.epoch;
    if (this.previous !== null) {
      let delta = scoreTime - this.previous;
      if (loop && Number.isFinite(stepCount) && stepCount > 0) {
        delta = delta - stepCount * Math.round(delta / stepCount);
        if (delta <= -stepCount / 2) delta += stepCount;
      }
      if (delta < -1e-4 || delta > 0.5) this.epoch += 1;
    }
    this.previous = scoreTime;
    return this.epoch;
  }

  /** Force a reset, for a change that is not a clock jump (a new sequence). */
  bump(): number {
    this.epoch += 1;
    return this.epoch;
  }

  get resetKey(): number {
    return this.epoch;
  }
}

/** Everything besides the clock that decides where the score puts the props
 *  (`propStatesAtScoreTime`), and the body the track is planned for. */
interface HardBeatTrackKey {
  stepConfigs: CharacterInstanceState["stepConfigs"];
  planeMode: PlaneMode;
  stepCount: number;
  loop: boolean;
  effortId: CharacterInstanceState["effectiveEffortId"];
  effortTimeline: CharacterInstanceState["effortTimeline"];
  pathShape: string;
  motionAwarePaths: boolean;
  heightCm: number;
}

interface CachedHardBeatTrack {
  key: HardBeatTrackKey;
  track: HardBeatTrack | null;
}

function hardBeatTrackKey(
  performer: CharacterInstanceState,
  heightCm: number
): HardBeatTrackKey {
  const paths = getAnimationVisibilityManager().getPathPolicy();
  return {
    stepConfigs: performer.stepConfigs,
    planeMode: performer.planeMode,
    stepCount: performer.motionStepCount,
    loop: performer.loop,
    effortId: performer.effectiveEffortId,
    effortTimeline: performer.effortTimeline,
    pathShape: paths.pathShape,
    motionAwarePaths: paths.motionAwarePaths,
    heightCm,
  };
}

function sameKey(a: HardBeatTrackKey, b: HardBeatTrackKey): boolean {
  return (Object.keys(a) as (keyof HardBeatTrackKey)[]).every(
    (field) => a[field] === b[field]
  );
}

const hardBeatTracks = new WeakMap<
  CharacterInstanceState,
  CachedHardBeatTrack
>();
const seekDetectors = new WeakMap<CharacterInstanceState, ScoreSeekDetector>();

function seekDetectorFor(performer: CharacterInstanceState): ScoreSeekDetector {
  let detector = seekDetectors.get(performer);
  if (!detector) {
    detector = new ScoreSeekDetector();
    seekDetectors.set(performer, detector);
  }
  return detector;
}

/**
 * The performer's hard-beat track, rebuilt only when the score's motion or the
 * body changes: the steps, plane mode, loop, effort and path policy all move
 * the props the track is planned from. Builds its own stance track rather than
 * sharing the stance owner's cache, so this module does not depend on it.
 */
function resolveHardBeatTrack(
  performer: CharacterInstanceState,
  heightCm: number
): HardBeatTrack | null {
  const key = hardBeatTrackKey(performer, heightCm);
  const cached = hardBeatTracks.get(performer);
  if (cached && sameKey(cached.key, key)) return cached.track;

  // A performer without a playable score (or a stand-in without one) keeps its
  // authored props.
  const track =
    key.stepCount > 0
      ? buildHardBeatTrack({
          source: performer,
          stanceTrack: buildStanceYawTrackForSource(performer, key.planeMode),
          heightM: heightCm / 100,
          planeMode: key.planeMode,
        })
      : null;
  // History built against the previous score does not apply to this one.
  if (cached) seekDetectorFor(performer).bump();
  hardBeatTracks.set(performer, { key, track });
  return track;
}

export interface PerformerContactOptions {
  /** Performer height; the body model scales from it. */
  heightCm?: number;
  /** False passes the authored props through, for a host whose stance is
   *  authored by hand rather than planned. */
  displace?: boolean;
}

export interface PerformerContact {
  track: HardBeatTrack | null;
  sample: HardBeatSample;
  /** The props to render: displaced copies, or the live state untouched. */
  leftProp: CharacterInstanceState["leftPropState"];
  rightProp: CharacterInstanceState["rightPropState"];
  /**
   * The props come from the planner, which already keeps the hands apart, so
   * the host turns the animator's legacy pair split off. False when there is
   * no track or displacement was declined; the split then stays on.
   */
  planned: boolean;
  /** Changes on a seek or a new score; the animator resets contact history. */
  resetKey: number;
}

/**
 * One owner for the props both renderers hand to the rig this frame, and the
 * key that tells the animator when its contact history is stale.
 */
export function resolvePerformerContact(
  performer: CharacterInstanceState,
  options: PerformerContactOptions = {}
): PerformerContact {
  const heightCm = options.heightCm ?? userProportionsState.heightCm;
  const track = resolveHardBeatTrack(performer, heightCm);
  // The static start pose plays before beat 1 and again at each loop seam,
  // while the clock already runs 0 to 1. It holds where beat 1 starts, so the
  // step into beat 1 and the seam are playback, and nothing jumps there.
  const scoreTime =
    performer.currentStepIndex < performer.motionStepOffset
      ? 0
      : performer.scoreTime;
  const resetKey = seekDetectorFor(performer).observe(
    scoreTime,
    performer.motionStepCount,
    performer.loop
  );
  if (!track || options.displace === false) {
    return {
      track,
      sample: NO_HARD_BEAT_DISPLACEMENT,
      leftProp: performer.leftPropState,
      rightProp: performer.rightPropState,
      planned: false,
      resetKey,
    };
  }
  const sample = sampleHardBeatTrack(track, scoreTime);
  return {
    track,
    sample,
    leftProp: displaceProp(performer.leftPropState, sample.left),
    rightProp: displaceProp(performer.rightPropState, sample.right),
    planned: true,
    resetKey,
  };
}
