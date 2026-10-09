import { PlaneMode, userProportionsState } from "@austencloud/scene-3d";
import type { CharacterInstanceState } from "../state/character-instance-state.svelte";
import {
  buildStanceYawTrackForSource,
  type StanceYawTrack,
} from "../collision/stance-yaw-track";
import {
  buildHardBeatTrack,
  displaceProp,
  NO_HARD_BEAT_DISPLACEMENT,
  sampleHardBeatTrack,
  type HardBeatSample,
  type HardBeatTrack,
} from "../collision/hard-beat-displacement";
import {
  buildBodyClearanceTrack,
  NO_BODY_CLEARANCE,
  sampleBodyClearanceTrack,
  type BodyClearanceSample,
  type BodyClearanceTrack,
} from "../collision/body-clearance";
import type { PerformerReachMeasurements } from "./performer-reach-measurements";
import {
  sameScoreMotionKey,
  scoreMotionKey,
  type ScoreMotionKey,
} from "./performer-score-motion-key";
import { performerScoreClock } from "./performer-score-clock";

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

/** The score's prop motion, and the body the track is planned for. */
interface HardBeatTrackKey extends ScoreMotionKey {
  heightCm: number;
  staffLengthM: number;
}

interface CachedHardBeatTrack {
  key: HardBeatTrackKey;
  track: HardBeatTrack | null;
  /** The turn the track was planned against; the body clearance reuses it. */
  stanceTrack: StanceYawTrack | null;
}

function hardBeatTrackKey(
  performer: CharacterInstanceState,
  heightCm: number,
  staffLengthM: number
): HardBeatTrackKey {
  const motion = scoreMotionKey(performer);
  // Only dual-wheel grip anchors depend on staff length. Other modes keep
  // their existing track and contact history when the staff changes size.
  return {
    ...motion,
    heightCm,
    staffLengthM: motion.planeMode === PlaneMode.DUAL_WHEEL ? staffLengthM : 0,
  };
}

const hardBeatTracks = new WeakMap<
  CharacterInstanceState,
  CachedHardBeatTrack
>();

/** The staffs the body clears, and the body that clears them. */
interface BodyClearanceTrackKey {
  hardBeat: CachedHardBeatTrack;
  staffLengthM: number;
  measurements: PerformerReachMeasurements | null;
}

interface CachedBodyClearanceTrack {
  key: BodyClearanceTrackKey;
  track: BodyClearanceTrack | null;
}

const bodyClearanceTracks = new WeakMap<
  CharacterInstanceState,
  CachedBodyClearanceTrack
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
 * sharing the stance owner's cache, so this module does not depend on it. Both
 * caches key on the same score motion, so the two stance tracks replan together.
 */
function resolveHardBeatTrack(
  performer: CharacterInstanceState,
  heightCm: number,
  staffLengthM: number
): CachedHardBeatTrack {
  const key = hardBeatTrackKey(performer, heightCm, staffLengthM);
  const cached = hardBeatTracks.get(performer);
  if (cached && sameScoreMotionKey(cached.key, key)) return cached;

  // A performer without a playable score (or a stand-in without one) keeps its
  // authored props.
  const stanceTrack =
    key.stepCount > 0
      ? buildStanceYawTrackForSource(performer, key.planeMode)
      : null;
  const track =
    key.stepCount > 0
      ? buildHardBeatTrack({
          source: performer,
          stanceTrack,
          heightM: heightCm / 100,
          staffLengthM,
          planeMode: key.planeMode,
        })
      : null;
  // History built against the previous score does not apply to this one.
  if (cached) seekDetectorFor(performer).bump();
  const entry = { key, track, stanceTrack };
  hardBeatTracks.set(performer, entry);
  return entry;
}

/**
 * The body's move off the staffs. It is planned against the displaced
 * staffs and the same turn, so it replans whenever they do, and when the staff
 * or the rig's measurements change.
 */
function resolveBodyClearanceTrack(
  performer: CharacterInstanceState,
  hardBeat: CachedHardBeatTrack,
  staffLengthM: number,
  measurements: PerformerReachMeasurements | null
): BodyClearanceTrack | null {
  const cached = bodyClearanceTracks.get(performer);
  if (
    cached &&
    cached.key.hardBeat === hardBeat &&
    cached.key.staffLengthM === staffLengthM &&
    cached.key.measurements === measurements
  ) {
    return cached.track;
  }
  const track = hardBeat.track
    ? buildBodyClearanceTrack({
        source: performer,
        stanceTrack: hardBeat.stanceTrack,
        hardBeatTrack: hardBeat.track,
        heightM: hardBeat.key.heightCm / 100,
        staffLengthM,
        measurements,
        planeMode: hardBeat.key.planeMode,
      })
    : null;
  // Contact history belongs to where the body stood.
  if (cached) seekDetectorFor(performer).bump();
  bodyClearanceTracks.set(performer, {
    key: { hardBeat, staffLengthM, measurements },
    track,
  });
  return track;
}

export interface PerformerContactOptions {
  /** Performer height; the body model scales from it. */
  heightCm?: number;
  /** False passes the authored props through, for a host whose stance is
   *  authored by hand rather than planned. */
  displace?: boolean;
  /**
   * Plan the body's move off its staffs (step 5 of
   * docs/architecture/performer-grid-styles.md). Off unless a host asks, so
   * every production surface keeps today's pose. It plans against the
   * displaced staffs, so it needs `displace` too.
   */
  clearBody?: boolean;
  /** The staff on screen, tip to tip; the body clears that staff. */
  staffLengthM?: number;
  /** The rig's measurements, as the live stance plans with them; null plans
   *  for the broader rig. */
  measurements?: PerformerReachMeasurements | null;
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
  /** The body's planned move, when a host asked for it. */
  bodyTrack: BodyClearanceTrack | null;
  /** Where the body stands this frame, in the performer frame: its move
   *  off the staffs, or zero. */
  bodyOffset: BodyClearanceSample;
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
  const staffLengthM = options.staffLengthM ?? userProportionsState.staffLength;
  const hardBeat = resolveHardBeatTrack(performer, heightCm, staffLengthM);
  const { track } = hardBeat;
  const bodyTrack =
    track && options.displace !== false && options.clearBody === true
      ? resolveBodyClearanceTrack(
          performer,
          hardBeat,
          staffLengthM,
          options.measurements ?? null
        )
      : null;
  const scoreTime = performerScoreClock(performer);
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
      bodyTrack: null,
      bodyOffset: NO_BODY_CLEARANCE,
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
    bodyTrack,
    bodyOffset: sampleBodyClearanceTrack(bodyTrack, scoreTime),
  };
}
