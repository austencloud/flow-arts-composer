import { PlaneMode, userProportionsState } from "@austencloud/scene-3d";
import type { CharacterInstanceState } from "../state/character-instance-state.svelte";
import {
  buildStanceYawTrackForSource,
  resolveTrackedUpperBodyStance,
  type FrontRouteEvent,
  type StanceYawTrack,
} from "../collision/stance-yaw-track";
import {
  buildHardBeatTrack,
  displaceProp,
  hardBeatActualOverreach,
  NO_HARD_BEAT_DISPLACEMENT,
  sampleHardBeatTrack,
  withFrontRouteReport,
  type HardBeatBodyModel,
  type HardBeatSample,
  type HardBeatTrack,
} from "../collision/hard-beat-displacement";
import {
  buildBodyClearanceTrack,
  bodyClearanceNeed,
  defaultBodyClearanceModel,
  NO_BODY_CLEARANCE,
  sampleBodyClearanceTrack,
  type BodyClearanceSample,
  type BodyClearanceTrack,
  type BodyClearanceModel,
  type StaffLine,
} from "../collision/body-clearance";
import {
  buildBodyResponseTrack,
  sampleBodyResponseTrack,
  type BodyResponseSample,
  type BodyResponseTrack,
} from "../collision/body-response";
import { propStateToStaffTarget } from "../services/swept-volume/swept-volume-builder";
import { MAX_STANCE_YAW_RAD } from "../collision/upper-body-stance-planner";
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
  characterId: CharacterInstanceState["characterId"];
  upperArmM: number | null;
  forearmM: number | null;
  shoulderWidthM: number | null;
  reachM: number | null;
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
  staffLengthM: number,
  measurements: PerformerReachMeasurements | null
): HardBeatTrackKey {
  const motion = scoreMotionKey(performer);
  return {
    ...motion,
    heightCm,
    staffLengthM,
    characterId: performer.characterId,
    upperArmM: measurements?.upperArmM ?? null,
    forearmM: measurements?.forearmM ?? null,
    shoulderWidthM: measurements?.shoulderWidthM ?? null,
    reachM: measurements?.reachM ?? null,
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
/** The response's key: the clearance key plus the facing the host wants
 *  and the root turn it plays. */
interface BodyResponseTrackKey extends BodyClearanceTrackKey {
  facingHint: BodyFacingHint | null;
  rootTurn: BodyRootTurn | null;
}

interface CachedBodyResponseTrack {
  key: BodyResponseTrackKey;
  track: BodyResponseTrack | null;
}

const bodyResponseTracks = new WeakMap<
  CharacterInstanceState,
  CachedBodyResponseTrack
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

const FRONT_ROUTE_HALF_WINDOW_STEPS = 0.25;
const FRONT_ROUTE_RAMP_STEPS = 0.15;
// The default hard-beat reach includes 90 mm from hand bone to palm centre
// (the shortest measured calibration rig). Preserve that reference point when
// checking a live rig's arm-chain measurement.
const MIN_PALM_EXTENT_M = 0.09;

/** A brief prop-only side cue may be safer in the front depth lane. */
function frontRouteCandidates(
  performer: CharacterInstanceState,
  stanceTrack: StanceYawTrack
): FrontRouteEvent[] {
  if (!stanceTrack.loop || performer.planeMode !== PlaneMode.WALL) return [];
  const candidates: FrontRouteEvent[] = [];
  for (let index = 0; index < stanceTrack.rawTimes.length; index++) {
    const center = stanceTrack.rawTimes[index]!;
    const pose = (time: number) => {
      const props = performer.propStatesAtScoreTime(time);
      return resolveTrackedUpperBodyStance(
        stanceTrack,
        time,
        PlaneMode.WALL,
        props.left,
        props.right
      );
    };
    const at = pose(center);
    if (
      at.corridorBlend < 0.65 ||
      Math.abs(at.segments.chestRad) >= MAX_STANCE_YAW_RAD * 0.8 ||
      Math.abs(stanceTrack.rawDesire[index]!) <= MAX_STANCE_YAW_RAD * 0.8 ||
      at.corridorBlend -
        Math.max(
          pose(center - 1 / 30).corridorBlend,
          pose(center + 1 / 30).corridorBlend
        ) <
        0.25 ||
      pose(center - FRONT_ROUTE_HALF_WINDOW_STEPS).corridorBlend > 0.02 ||
      pose(center + FRONT_ROUTE_HALF_WINDOW_STEPS).corridorBlend > 0.02
    )
      continue;
    if (
      candidates.some((event) => {
        const priorCenter =
          (event.startStep + FRONT_ROUTE_HALF_WINDOW_STEPS) %
          stanceTrack.stepCount;
        const distance = Math.abs(center - priorCenter);
        return Math.min(distance, stanceTrack.stepCount - distance) < 0.5;
      })
    )
      continue;
    candidates.push({
      startStep:
        (((center - FRONT_ROUTE_HALF_WINDOW_STEPS) % stanceTrack.stepCount) +
          stanceTrack.stepCount) %
        stanceTrack.stepCount,
      durationSteps: FRONT_ROUTE_HALF_WINDOW_STEPS * 2,
      enterRampSteps: FRONT_ROUTE_RAMP_STEPS,
      exitRampSteps: FRONT_ROUTE_RAMP_STEPS,
    });
  }
  return candidates;
}

interface RouteSample {
  contact: boolean;
  overreach: readonly number[];
  targets: readonly ({ x: number; y: number; z: number } | null)[];
}

function routeSample(
  performer: CharacterInstanceState,
  stanceTrack: StanceYawTrack,
  hardBeatTrack: HardBeatTrack,
  time: number,
  staffLengthM: number,
  model: BodyClearanceModel,
  measurements: PerformerReachMeasurements | null,
  measuredReachBody: HardBeatBodyModel | null
): RouteSample {
  const props = performer.propStatesAtScoreTime(time);
  const stance = resolveTrackedUpperBodyStance(
    stanceTrack,
    time,
    PlaneMode.WALL,
    props.left,
    props.right,
    measurements
  );
  const displacement = sampleHardBeatTrack(hardBeatTrack, time);
  const shifted = [
    displaceProp(props.left, displacement.left),
    displaceProp(props.right, displacement.right),
  ] as const;
  const corridors = [
    stance.leftDepthOffsetM,
    stance.rightDepthOffsetM,
  ] as const;
  const lines = shifted.map((prop, index): StaffLine | null => {
    if (!prop) return null;
    const line = propStateToStaffTarget(prop, staffLengthM / 2);
    const depth = corridors[index]!;
    return {
      a: { ...line.tipAWorld, z: line.tipAWorld.z + depth },
      b: { ...line.tipBWorld, z: line.tipBWorld.z + depth },
    };
  });
  const contact =
    bodyClearanceNeed(
      lines,
      {
        chestRad: stance.segments.chestRad,
        spine1Rad: stance.segments.spine1Rad,
      },
      model,
      { x: 0, z: -1 }
    ) > 1e-6;
  return {
    contact,
    overreach: [
      hardBeatActualOverreach(
        hardBeatTrack,
        props.left,
        displacement.left,
        stance.segments.chestRad,
        corridors[0],
        "left"
      ),
      hardBeatActualOverreach(
        hardBeatTrack,
        props.right,
        displacement.right,
        stance.segments.chestRad,
        corridors[1],
        "right"
      ),
      ...(measuredReachBody
        ? ([
            hardBeatActualOverreach(
              hardBeatTrack,
              props.left,
              displacement.left,
              stance.segments.chestRad,
              corridors[0],
              "left",
              measuredReachBody
            ),
            hardBeatActualOverreach(
              hardBeatTrack,
              props.right,
              displacement.right,
              stance.segments.chestRad,
              corridors[1],
              "right",
              measuredReachBody
            ),
          ] as const)
        : []),
    ],
    targets: shifted.map((prop, index) =>
      prop
        ? {
            x: prop.worldPosition.x,
            y: prop.worldPosition.y,
            z: prop.worldPosition.z + corridors[index]!,
          }
        : null
    ),
  };
}

function routeImprovesMotion(
  performer: CharacterInstanceState,
  baseStance: StanceYawTrack,
  baseHardBeat: HardBeatTrack,
  candidateStance: StanceYawTrack,
  candidateHardBeat: HardBeatTrack,
  event: FrontRouteEvent,
  staffLengthM: number,
  heightM: number,
  measurements: PerformerReachMeasurements | null
): boolean {
  const stepCount = baseStance.stepCount;
  const model = defaultBodyClearanceModel({
    heightM,
    shoulderHalfWidthM:
      measurements?.shoulderWidthM != null
        ? measurements.shoulderWidthM / 2
        : null,
  });
  const measuredReachBody = measurements
    ? {
        ...baseHardBeat.body,
        shoulderHalfWidthM: measurements.shoulderWidthM / 2,
        reachM: measurements.reachM + MIN_PALM_EXTENT_M,
      }
    : null;
  const targets: { old: RouteSample[]; next: RouteSample[] } = {
    old: [],
    next: [],
  };
  for (const rate of [48, 30]) {
    const oldSamples: RouteSample[] = [];
    const nextSamples: RouteSample[] = [];
    for (let index = 0; index < stepCount * rate; index++) {
      const time = index / rate;
      const old = routeSample(
        performer,
        baseStance,
        baseHardBeat,
        time,
        staffLengthM,
        model,
        measurements,
        measuredReachBody
      );
      const next = routeSample(
        performer,
        candidateStance,
        candidateHardBeat,
        time,
        staffLengthM,
        model,
        measurements,
        measuredReachBody
      );
      if (next.contact && !old.contact) return false;
      if (
        next.overreach.some(
          (value, side) => value > old.overreach[side]! + 0.001
        )
      )
        return false;
      if (rate === 30) {
        oldSamples.push(old);
        nextSamples.push(next);
      }
    }
    if (rate === 30) {
      targets.old = oldSamples;
      targets.next = nextSamples;
    }
  }
  const center = (event.startStep + FRONT_ROUTE_HALF_WINDOW_STEPS) % stepCount;
  const distance = (time: number) =>
    Math.abs(((time - center + stepCount * 1.5) % stepCount) - stepCount / 2);
  const maxJump = (samples: RouteSample[]) => {
    let largest = 0;
    for (let index = 0; index < samples.length; index++) {
      if (distance(index / 30) > FRONT_ROUTE_HALF_WINDOW_STEPS + 1 / 30)
        continue;
      const next = samples[(index + 1) % samples.length]!;
      for (let side = 0; side < 2; side++) {
        const a = samples[index]!.targets[side],
          b = next.targets[side];
        if (!a || !b) continue;
        largest = Math.max(
          largest,
          Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)
        );
      }
    }
    return largest;
  };
  const baselineJump = maxJump(targets.old);
  return baselineJump > 0.1 && maxJump(targets.next) < baselineJump * 0.7;
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
  staffLengthM: number,
  measurements: PerformerReachMeasurements | null
): CachedHardBeatTrack {
  const key = hardBeatTrackKey(performer, heightCm, staffLengthM, measurements);
  const cached = hardBeatTracks.get(performer);
  if (cached && sameScoreMotionKey(cached.key, key)) return cached;

  // A performer without a playable score (or a stand-in without one) keeps its
  // authored props.
  const baselineStance =
    key.stepCount > 0
      ? buildStanceYawTrackForSource(performer, key.planeMode)
      : null;
  const baselineHardBeat =
    key.stepCount > 0
      ? buildHardBeatTrack({
          source: performer,
          stanceTrack: baselineStance,
          heightM: heightCm / 100,
          staffLengthM,
          planeMode: key.planeMode,
        })
      : null;
  let stanceTrack = baselineStance;
  let track = baselineHardBeat;
  if (
    baselineStance &&
    baselineHardBeat &&
    key.planeMode === PlaneMode.WALL &&
    staffLengthM > 0
  ) {
    const candidates = frontRouteCandidates(performer, baselineStance);
    if (candidates.length) {
      const alternateStance: StanceYawTrack = {
        ...baselineStance,
        frontRouteOnly: true,
      };
      const alternateHardBeat = buildHardBeatTrack({
        source: performer,
        stanceTrack: alternateStance,
        heightM: heightCm / 100,
        staffLengthM,
        planeMode: key.planeMode,
        laneForwardShare: 1,
      });
      if (alternateHardBeat) {
        const accepted: FrontRouteEvent[] = [];
        for (const event of candidates) {
          const nextEvents = [...accepted, event];
          const candidateStance: StanceYawTrack = {
            ...baselineStance,
            frontRouteEvents: nextEvents,
          };
          const candidateHardBeat: HardBeatTrack = {
            ...baselineHardBeat,
            frontRouteOverlay: {
              events: nextEvents,
              alternate: alternateHardBeat,
            },
          };
          if (
            routeImprovesMotion(
              performer,
              stanceTrack!,
              track!,
              candidateStance,
              candidateHardBeat,
              event,
              staffLengthM,
              heightCm / 100,
              measurements
            )
          ) {
            accepted.push(event);
            stanceTrack = candidateStance;
            track = candidateHardBeat;
          }
        }
      }
    }
  }
  if (stanceTrack && track?.frontRouteOverlay) {
    track = withFrontRouteReport(track, performer, stanceTrack, key.planeMode);
  }
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
    cached?.key.hardBeat === hardBeat &&
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
  if (cached?.key.hardBeat === hardBeat) seekDetectorFor(performer).bump();
  bodyClearanceTracks.set(performer, {
    key: { hardBeat, staffLengthM, measurements },
    track,
  });
  return track;
}

/**
 * The body response's move, turn and feet (docs/superpowers/specs/active/
 * 2026-10-23-body-response.md). Planned against the displaced staffs and the
 * same stance as the clearance, so it replans with them, and when the staff,
 * the measurements or the host's facing hint change. Unlike the clearance it
 * plans without a hard-beat track too, against the authored props.
 */
function resolveBodyResponseTrack(
  performer: CharacterInstanceState,
  hardBeat: CachedHardBeatTrack,
  staffLengthM: number,
  measurements: PerformerReachMeasurements | null,
  facingHint: BodyFacingHint | null,
  rootTurn: BodyRootTurn | null
): BodyResponseTrack | null {
  const cached = bodyResponseTracks.get(performer);
  if (
    cached?.key.hardBeat === hardBeat &&
    cached.key.staffLengthM === staffLengthM &&
    cached.key.measurements === measurements &&
    cached.key.facingHint === facingHint &&
    cached.key.rootTurn === rootTurn
  ) {
    return cached.track;
  }
  const track =
    hardBeat.key.stepCount > 0
      ? buildBodyResponseTrack({
          source: performer,
          stanceTrack: hardBeat.stanceTrack,
          hardBeatTrack: hardBeat.track,
          heightM: hardBeat.key.heightCm / 100,
          staffLengthM,
          measurements,
          planeMode: hardBeat.key.planeMode,
          facingHint,
          rootTurn,
        })
      : null;
  // Contact history belongs to where the body stood.
  if (cached?.key.hardBeat === hardBeat) seekDetectorFor(performer).bump();
  bodyResponseTracks.set(performer, {
    key: { hardBeat, staffLengthM, measurements, facingHint, rootTurn },
    track,
  });
  return track;
}

/** A body yaw the host wants at a score time, radians; null for none. Pass
 *  a stable function: a new one each frame replans every frame. */
export type BodyFacingHint = (scoreTime: number) => number | null;

/** How far the host has turned the whole performer, grid and all, at a score
 *  time since the sequence's start, radians in the rig's sense: planted feet
 *  hold still in the world against it. Pass a stable function. */
export type BodyRootTurn = (scoreTime: number) => number;

/**
 * The stance with its twist handed to the body: the chest yaw becomes the
 * residual the body response left on top of its turn, and the spine's
 * shares shrink with it, so body plus chest still makes the planned turn.
 */
function withResidualTwist(
  stance: ReturnType<typeof resolveTrackedUpperBodyStance>,
  chestYawRad: number
): ReturnType<typeof resolveTrackedUpperBodyStance> {
  const stanceChest = stance.segments.chestRad;
  const share = Math.abs(stanceChest) > 1e-9 ? chestYawRad / stanceChest : 0;
  return {
    ...stance,
    yawRad: chestYawRad,
    segments: {
      ...stance.segments,
      planRad: stance.segments.planRad * share,
      spine1Rad: stance.segments.spine1Rad * share,
      spine2Rad: stance.segments.spine2Rad * share,
      chestRad: chestYawRad,
      headRad: stance.segments.headRad * share,
    },
  };
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
  /**
   * Plan the whole body's answer to its staffs: a turn, a floor move, a duck
   * and the steps that carry the feet (body-response.ts). Off unless a host
   * asks; when on it replaces `clearBody`'s move.
   */
  bodyResponse?: boolean;
  /** The facing the body response leans toward; null faces the audience. */
  facingHint?: BodyFacingHint | null;
  /** The root turn the host plays under the body response; null for none. */
  rootTurn?: BodyRootTurn | null;
  /** The staff on screen, tip to tip; the body clears that staff. */
  staffLengthM?: number;
  /** The rig's measurements, as the live stance plans with them; null plans
   *  for the broader rig. */
  measurements?: PerformerReachMeasurements | null;
}

export interface PerformerContact {
  track: HardBeatTrack | null;
  stanceTrack: StanceYawTrack | null;
  stance: ReturnType<typeof resolveTrackedUpperBodyStance>;
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
  /** The body response's plan, when a host asked for it. */
  bodyResponseTrack: BodyResponseTrack | null;
  /** Where each foot stands under the body response, or null. */
  bodyFeet: BodyResponseSample["feet"] | null;
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
  const hardBeat = resolveHardBeatTrack(
    performer,
    heightCm,
    staffLengthM,
    options.measurements ?? null
  );
  const { track } = hardBeat;
  const bodyResponseTrack =
    options.displace !== false && options.bodyResponse === true
      ? resolveBodyResponseTrack(
          performer,
          hardBeat,
          staffLengthM,
          options.measurements ?? null,
          options.facingHint ?? null,
          options.rootTurn ?? null
        )
      : null;
  const bodyTrack =
    track &&
    !bodyResponseTrack &&
    options.displace !== false &&
    options.clearBody === true
      ? resolveBodyClearanceTrack(
          performer,
          hardBeat,
          staffLengthM,
          options.measurements ?? null
        )
      : null;
  const scoreTime = performerScoreClock(performer);
  const stance = resolveTrackedUpperBodyStance(
    hardBeat.stanceTrack,
    scoreTime,
    performer.planeMode ?? PlaneMode.WALL,
    performer.leftPropState,
    performer.rightPropState,
    options.measurements ?? null
  );
  const response = bodyResponseTrack
    ? sampleBodyResponseTrack(bodyResponseTrack, scoreTime)
    : null;
  const resetKey = seekDetectorFor(performer).observe(
    scoreTime,
    performer.motionStepCount,
    performer.loop
  );
  const responseFields = {
    bodyResponseTrack,
    bodyFeet: response?.feet ?? null,
  };
  const renderedStance = response
    ? withResidualTwist(stance, response.chestYawRad)
    : stance;
  if (!track || options.displace === false) {
    return {
      track,
      stanceTrack: hardBeat.stanceTrack,
      stance: renderedStance,
      sample: NO_HARD_BEAT_DISPLACEMENT,
      leftProp: performer.leftPropState,
      rightProp: performer.rightPropState,
      planned: false,
      resetKey,
      bodyTrack: null,
      bodyOffset: response?.offset ?? NO_BODY_CLEARANCE,
      ...responseFields,
    };
  }
  const sample = sampleHardBeatTrack(track, scoreTime);
  return {
    track,
    stanceTrack: hardBeat.stanceTrack,
    stance: renderedStance,
    sample,
    leftProp: displaceProp(performer.leftPropState, sample.left),
    rightProp: displaceProp(performer.rightPropState, sample.right),
    planned: true,
    resetKey,
    bodyTrack,
    bodyOffset: response?.offset ?? sampleBodyClearanceTrack(bodyTrack, scoreTime),
    ...responseFields,
  };
}
