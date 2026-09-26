/**
 * Score-time timing for the performer's torso turn.
 *
 * `upper-body-stance-planner.ts` answers "what yaw does this grip geometry
 * want", once, from this frame alone. That answer has three properties a human
 * turn does not have: it cannot begin until the props are already 10 cm
 * lateral, its speed is set entirely by how fast the props sweep the assist
 * band, and it carries no memory across a step boundary, so a turn that runs
 * through one has nothing to flow out of or into.
 *
 * This module owns the other half: given the whole sequence, how does that yaw
 * evolve over score time. It builds a keyframed curve from the geometry's own
 * samples, moves the *onset* of each transition earlier so the body leads the
 * props, and hands out per-segment samples of one curve read at staggered
 * times so the torso arrives in pieces rather than all at once.
 *
 * Two techniques, both standard, both chosen rather than invented:
 *
 * 1. **Monotone piecewise cubic Hermite interpolation** (Fritsch & Carlson,
 *    "Monotone Piecewise Cubic Interpolation", SIAM J. Numer. Anal. 17(2),
 *    1980 — the same PCHIP that d3's `curveMonotoneX` implements). It is C1,
 *    so angular velocity is continuous everywhere including across step
 *    boundaries, and its tangent at an interior key is a weighted harmonic
 *    mean of the neighbouring secants: a turn that carries on in the same
 *    direction keeps its speed through a key instead of stopping and
 *    restarting. It also cannot overshoot, which matters here because
 *    MAX_STANCE_YAW_RAD sits three degrees short of the 90-degree shoulder
 *    degeneracy — an overshooting Catmull-Rom would ring straight into it.
 *
 * 2. **Overlapping action / successive breaking of joints** (Thomas &
 *    Johnston's principle as game animation states it: parts of the body move
 *    at different rates, overlap follows the primary mass "a few frames
 *    behind", and having every element arrive at the same instant is the
 *    classic tell of a machine-made turn). Implemented as one curve read by
 *    several heads at offset times, so every timing decision lives here and
 *    the animator applies what it is given rather than inventing phase.
 *
 * What this module deliberately does NOT do is filter the delivered yaw. A
 * downstream low-pass was removed from `AvatarAnimator` on purpose: smoothing
 * a signal whose future is unknown buys smoothness with phase lag, and
 * mid-transition lag left the shoulders facing the previous side with an arm
 * through the head. Timing belongs where the future is known, which is here.
 */

import {
  MAX_STANCE_YAW_RAD,
  planUpperBodyStanceDepth,
  planUpperBodyStanceYawTarget,
  stanceLateralMean,
  stanceTargetsForPropStates,
  type GripPropState,
  type UpperBodyStancePlan,
  type UpperBodyStanceTargets,
} from "./upper-body-stance-planner";
import type { PerformerReachMeasurements } from "$lib/shared/3d/domain/performer-reach-measurements";
import type { PlaneMode } from "@austencloud/scene-3d";

/** Geometry samples taken per motion step while building the curve. */
const SAMPLES_PER_STEP = 24;

/**
 * Two yaw samples this close (radians) are the same held facing. Wide enough
 * that the assist band's own numerical wobble does not manufacture keys,
 * narrow enough that a real quarter-degree drift still reads as motion.
 */
const PLATEAU_EPSILON_RAD = (0.25 * Math.PI) / 180;

/**
 * How far ahead of the props the *shoulder line* begins turning, in motion
 * steps.
 *
 * Anticipatory postural adjustment research puts trunk muscle onset roughly
 * 50-120 ms ahead of the focal limb movement it supports, so a motion step of
 * about two thirds of a second makes the whole postural band roughly 0.08-0.18
 * steps wide. The shoulder line takes the conservative end of it, because the
 * shoulder line is the one segment the grip solve hangs the arms from.
 *
 * That is a measured bound, not a stylistic one. Leading the shoulders drives
 * the torso into a shaft the props have not swung clear of yet, and the cost
 * climbs fast on the bulkiest supported rig. Over a 400-frame sweep of the live
 * fixture on ch18, against the memoryless baseline's 11 collision frames at
 * 36.5 mm:
 *
 *     lead 0.22  ->  22 frames, 57.8 mm, reaching `penetrate`
 *     lead 0.10  ->  12 frames, 40.3 mm
 *     lead 0.07  ->   7 frames, 21.9 mm
 *
 * The lower spine carries the rest of the anticipation instead, through
 * `TORSO_STAGGER_STEPS`, which costs the arms nothing because it cannot move
 * the shoulder line at all.
 *
 * The lead moves the *onset* of a transition only. Arrivals stay on the props'
 * own schedule, so the chest is never further round than the geometry asked for
 * at that instant; it merely got started sooner.
 */
export const ANTICIPATION_LEAD_STEPS = 0.07;

/**
 * Score-time spread between the lowest and highest driven torso segment during
 * a turn. The lower spine leads, the chest follows, and at rest they agree.
 *
 * This is where most of the anticipation lives. The two spine offsets are equal
 * and opposite about the shoulder line, so however far apart they are pulled,
 * their sum — the yaw the arms are solved against — is unchanged. That makes
 * the stagger free where the shoulder lead is expensive: raising it from 0.16
 * to 0.24 on ch18 moved nothing in the collision sweep while taking the lower
 * spine's own lead over the props from about 0.09 to 0.13 steps.
 */
export const TORSO_STAGGER_STEPS = 0.24;

/**
 * Extra drag on the head beyond the chest's own lag. The head settles last,
 * which is the whole reason a turned torso reads as a person deciding to look
 * somewhere rather than a mannequin rotating.
 */
export const HEAD_DRAG_STEPS = 0.1;

/**
 * How far the head trails the shoulder line at saturation. Beyond this the drag
 * stops reading as a neck and starts reading as a break. Cervical axial
 * rotation to one side is comfortably inside this.
 *
 * It is approached smoothly rather than clipped: a hard limit gives the head a
 * flat top through the fastest part of a turn and a kink in its velocity at
 * each boundary, which is exactly the machine-made tell this module exists to
 * remove. Real sequences do reach it — the live fixture's fastest reversal
 * turns the chest most of a quarter turn inside half a step.
 */
export const MAX_HEAD_LAG_RAD = (30 * Math.PI) / 180;

/**
 * How far the lower spine may run ahead of its resting share of the shoulder
 * line. Past this the mid-torso stops reading as a spine leading a turn and
 * starts reading as a waist that has come apart from the ribcage.
 *
 * Saturated the same way as the head, for the same reason, and set below the
 * animator's own defensive bound so the shape is decided here rather than by a
 * clamp: the animator's hard limit is a guard against a rogue value, and a
 * guard that routinely fires is not a guard, it is the design.
 */
export const MAX_SPINE_STAGGER_RAD = (22 * Math.PI) / 180;

/**
 * Share of the shoulder line each spine bone carries at rest. Matches the
 * animator's historical blade split, so a held stance is bone-for-bone the
 * pose that shipped before this module existed.
 */
export const SPINE1_SHARE = 0.45;
export const SPINE2_SHARE = 0.55;

/** Two keys may not be pushed closer together than this by the lead. */
const MIN_KEY_GAP_STEPS = 0.04;

export interface StanceYawSegments {
  /** The curve itself: the plan, before any per-segment stagger. */
  planRad: number;
  /** Lower-spine contribution, leading. */
  spine1Rad: number;
  /** Upper-spine contribution, following. */
  spine2Rad: number;
  /** Shoulder-line request: `spine1Rad + spine2Rad`. */
  chestRad: number;
  /** Absolute head facing request. Trails `chestRad` through a turn. */
  headRad: number;
  /** Signed head-minus-chest drag, already clamped. */
  headLagRad: number;
}

export interface StanceYawTrackSample extends StanceYawSegments {
  scoreTime: number;
  /** The memoryless geometric desire at this score time, for comparison. */
  desireRad: number;
  /** Lateral mean of the two grips (metres) at this score time. */
  lateralM: number;
}

export interface StanceYawTrack {
  /** Motion steps covered. Score time is measured in these units. */
  readonly stepCount: number;
  readonly loop: boolean;
  /** Key times after the anticipation lead has been applied. */
  readonly keyTimes: readonly number[];
  readonly keyValues: readonly number[];
  readonly keyTangents: readonly number[];
  /** Raw geometry samples the curve was reduced from, for visualization. */
  readonly rawTimes: readonly number[];
  readonly rawDesire: readonly number[];
  readonly rawLateral: readonly number[];
}

/**
 * Anything that can say where the props are at an arbitrary score time.
 * Structural, so `CharacterInstanceState` satisfies it without this module
 * importing a rune-backed factory.
 */
export interface StanceScoreSource {
  readonly motionStepCount: number;
  readonly loop: boolean;
  propStatesAtScoreTime(scoreTime: number): {
    left: GripPropState | null;
    right: GripPropState | null;
  };
}

/**
 * Saturating limit. Small values pass through essentially untouched, large ones
 * approach the bound asymptotically, and the result is smooth everywhere, so
 * neither the value nor its rate jumps at the limit.
 */
function softLimit(value: number, limit: number): number {
  return limit * Math.tanh(value / limit);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Fritsch-Carlson tangents. Secants first, then the three-point difference at
 * interior keys, then the monotonicity rescale: where the tangent pair leaves
 * the circle of radius 3 in (alpha, beta) it is pulled back onto it, which is
 * the paper's sufficient condition for a monotone cubic. Flat where the data
 * turns, so a hold is genuinely a hold.
 */
function monotoneTangents(times: number[], values: number[]): number[] {
  const n = times.length;
  const tangents = new Array<number>(n).fill(0);
  if (n < 2) return tangents;

  const secants = new Array<number>(n - 1);
  for (let i = 0; i < n - 1; i++) {
    const dt = times[i + 1]! - times[i]!;
    secants[i] = dt > 0 ? (values[i + 1]! - values[i]!) / dt : 0;
  }

  tangents[0] = secants[0]!;
  tangents[n - 1] = secants[n - 2]!;
  for (let i = 1; i < n - 1; i++) {
    const a = secants[i - 1]!;
    const b = secants[i]!;
    tangents[i] = a * b <= 0 ? 0 : (a + b) / 2;
  }

  for (let i = 0; i < n - 1; i++) {
    const secant = secants[i]!;
    if (secant === 0) {
      tangents[i] = 0;
      tangents[i + 1] = 0;
      continue;
    }
    const alpha = tangents[i]! / secant;
    const beta = tangents[i + 1]! / secant;
    const magnitude = Math.hypot(alpha, beta);
    if (magnitude > 3) {
      const scale = 3 / magnitude;
      tangents[i] = scale * alpha * secant;
      tangents[i + 1] = scale * beta * secant;
    }
  }
  return tangents;
}

function hermite(
  t0: number,
  v0: number,
  m0: number,
  t1: number,
  v1: number,
  m1: number,
  time: number
): number {
  const h = t1 - t0;
  if (h <= 0) return v0;
  const s = (time - t0) / h;
  const s2 = s * s;
  const s3 = s2 * s;
  return (
    (2 * s3 - 3 * s2 + 1) * v0 +
    (s3 - 2 * s2 + s) * h * m0 +
    (-2 * s3 + 3 * s2) * v1 +
    (s3 - s2) * h * m1
  );
}

function evaluate(track: StanceYawTrack, scoreTime: number): number {
  const { keyTimes, keyValues, keyTangents, stepCount, loop } = track;
  const n = keyTimes.length;
  if (n === 0) return 0;
  if (n === 1) return keyValues[0]!;

  let time = scoreTime;
  if (loop && stepCount > 0) {
    time = ((time % stepCount) + stepCount) % stepCount;
  }
  if (time <= keyTimes[0]!) {
    // A looping sequence wraps into the tail segment rather than flattening at
    // the seam, so a turn that runs across the loop point keeps its velocity.
    if (!loop || stepCount <= 0) return keyValues[0]!;
    const last = n - 1;
    return hermite(
      keyTimes[last]! - stepCount,
      keyValues[last]!,
      keyTangents[last]!,
      keyTimes[0]!,
      keyValues[0]!,
      keyTangents[0]!,
      time
    );
  }
  if (time >= keyTimes[n - 1]!) {
    if (!loop || stepCount <= 0) return keyValues[n - 1]!;
    return hermite(
      keyTimes[n - 1]!,
      keyValues[n - 1]!,
      keyTangents[n - 1]!,
      keyTimes[0]! + stepCount,
      keyValues[0]!,
      keyTangents[0]!,
      time
    );
  }

  let low = 0;
  let high = n - 1;
  while (high - low > 1) {
    const mid = (low + high) >> 1;
    if (keyTimes[mid]! <= time) low = mid;
    else high = mid;
  }
  return hermite(
    keyTimes[low]!,
    keyValues[low]!,
    keyTangents[low]!,
    keyTimes[high]!,
    keyValues[high]!,
    keyTangents[high]!,
    time
  );
}

/**
 * Reduce a dense geometry sampling to the keys that actually describe the
 * turn: the endpoints of each monotone run. A held facing collapses to its
 * first and last sample, and a ramp that continues in one direction across a
 * step boundary produces no key at that boundary at all — which is precisely
 * why such a turn cannot stop and restart there.
 */
function reduceToKeys(
  times: readonly number[],
  values: readonly number[]
): { keyTimes: number[]; keyValues: number[] } {
  const n = values.length;
  if (n === 0) return { keyTimes: [], keyValues: [] };
  if (n === 1) return { keyTimes: [times[0]!], keyValues: [values[0]!] };

  const direction = (index: number): number => {
    const delta = values[index + 1]! - values[index]!;
    if (Math.abs(delta) <= PLATEAU_EPSILON_RAD) return 0;
    return delta > 0 ? 1 : -1;
  };

  const keyTimes: number[] = [times[0]!];
  const keyValues: number[] = [values[0]!];
  let previous = direction(0);
  for (let i = 1; i < n - 1; i++) {
    const current = direction(i);
    if (current !== previous) {
      keyTimes.push(times[i]!);
      keyValues.push(values[i]!);
      previous = current;
    }
  }
  keyTimes.push(times[n - 1]!);
  keyValues.push(values[n - 1]!);
  return { keyTimes, keyValues };
}

/**
 * Pull the onset of every transition earlier. A key whose successor holds a
 * different value is the moment the body commits to moving; that is what
 * leads. Arrivals are untouched, and a lead is never allowed to cross the key
 * before it.
 */
function applyAnticipationLead(
  keyTimes: number[],
  keyValues: number[],
  leadSteps: number
): void {
  if (leadSteps <= 0) return;
  for (let i = keyTimes.length - 2; i >= 0; i--) {
    if (Math.abs(keyValues[i + 1]! - keyValues[i]!) <= PLATEAU_EPSILON_RAD) {
      continue;
    }
    const floor =
      i === 0 ? keyTimes[0]! : keyTimes[i - 1]! + MIN_KEY_GAP_STEPS;
    keyTimes[i] = Math.max(floor, keyTimes[i]! - leadSteps);
  }
}

export interface StanceYawTrackOptions {
  /** Geometric targets at a score time, in the grid frame. */
  targetsAtScoreTime(scoreTime: number): UpperBodyStanceTargets;
  motionStepCount: number;
  loop: boolean;
  samplesPerStep?: number;
  anticipationLeadSteps?: number;
}

export function buildStanceYawTrack(
  options: StanceYawTrackOptions
): StanceYawTrack | null {
  const stepCount = Math.max(0, Math.floor(options.motionStepCount));
  if (stepCount <= 0) return null;
  const perStep = Math.max(4, options.samplesPerStep ?? SAMPLES_PER_STEP);
  const total = stepCount * perStep;

  const rawTimes: number[] = new Array(total);
  const rawDesire: number[] = new Array(total);
  const rawLateral: number[] = new Array(total);
  for (let i = 0; i < total; i++) {
    const scoreTime = i / perStep;
    const targets = options.targetsAtScoreTime(scoreTime);
    rawTimes[i] = scoreTime;
    rawDesire[i] = planUpperBodyStanceYawTarget(targets);
    rawLateral[i] = stanceLateralMean(targets);
  }

  const { keyTimes, keyValues } = reduceToKeys(rawTimes, rawDesire);
  applyAnticipationLead(
    keyTimes,
    keyValues,
    options.anticipationLeadSteps ?? ANTICIPATION_LEAD_STEPS
  );
  const keyTangents = monotoneTangents(keyTimes, keyValues);

  return {
    stepCount,
    loop: options.loop,
    keyTimes,
    keyValues,
    keyTangents,
    rawTimes,
    rawDesire,
    rawLateral,
  };
}

/**
 * Read the one curve at four offset times.
 *
 * The two spine offsets are `+SPINE2_SHARE * stagger` and
 * `-SPINE1_SHARE * stagger`, so their share-weighted mean offset is exactly
 * zero: the shoulder line still arrives when the plan said it would, while the
 * lower spine gets there first and the chest completes the turn. The head
 * reads further back still, so it is the last thing to settle.
 */
export function sampleStanceYawTrack(
  track: StanceYawTrack | null,
  scoreTime: number
): StanceYawSegments {
  if (!track) {
    return {
      planRad: 0,
      spine1Rad: 0,
      spine2Rad: 0,
      chestRad: 0,
      headRad: 0,
      headLagRad: 0,
    };
  }
  const planRad = evaluate(track, scoreTime);
  const leadingSpine =
    SPINE1_SHARE *
    evaluate(track, scoreTime + SPINE2_SHARE * TORSO_STAGGER_STEPS);
  const trailingSpine =
    SPINE2_SHARE *
    evaluate(track, scoreTime - SPINE1_SHARE * TORSO_STAGGER_STEPS);
  const chestRad = clamp(
    leadingSpine + trailingSpine,
    -MAX_STANCE_YAW_RAD,
    MAX_STANCE_YAW_RAD
  );
  // Bound how far the two spine bones may separate, then put the bounded
  // separation back on either side of the same shoulder line. Written as an
  // excess about the resting split rather than as two independent limits, so
  // the sum stays exactly `chestRad` whether or not the bound engaged.
  const staggerRad = softLimit(
    leadingSpine - SPINE1_SHARE * chestRad,
    MAX_SPINE_STAGGER_RAD
  );
  const spine1Rad = SPINE1_SHARE * chestRad + staggerRad;
  const spine2Rad = SPINE2_SHARE * chestRad - staggerRad;
  const headTarget = evaluate(
    track,
    scoreTime - SPINE1_SHARE * TORSO_STAGGER_STEPS - HEAD_DRAG_STEPS
  );
  const headLagRad = softLimit(headTarget - chestRad, MAX_HEAD_LAG_RAD);
  return {
    planRad,
    spine1Rad,
    spine2Rad,
    chestRad,
    headRad: chestRad + headLagRad,
    headLagRad,
  };
}

/** Angular velocity of the shoulder-line request, in radians per motion step. */
export function stanceYawAngularVelocity(
  track: StanceYawTrack | null,
  scoreTime: number,
  h = 1e-4
): number {
  if (!track) return 0;
  const before = sampleStanceYawTrack(track, scoreTime - h).chestRad;
  const after = sampleStanceYawTrack(track, scoreTime + h).chestRad;
  return (after - before) / (2 * h);
}

/** The memoryless desire and prop lateral at a score time, for overlays. */
export function sampleStanceYawTrackDetail(
  track: StanceYawTrack | null,
  scoreTime: number
): StanceYawTrackSample {
  const segments = sampleStanceYawTrack(track, scoreTime);
  if (!track) {
    return { ...segments, scoreTime, desireRad: 0, lateralM: 0 };
  }
  const perStep = track.rawTimes.length / Math.max(1, track.stepCount);
  const wrapped = track.loop
    ? ((scoreTime % track.stepCount) + track.stepCount) % track.stepCount
    : clamp(scoreTime, 0, track.stepCount);
  const index = clamp(
    Math.round(wrapped * perStep),
    0,
    track.rawTimes.length - 1
  );
  return {
    ...segments,
    scoreTime,
    desireRad: track.rawDesire[index] ?? 0,
    lateralM: track.rawLateral[index] ?? 0,
  };
}

export interface TrackedUpperBodyStance extends UpperBodyStancePlan {
  /** Per-segment yaw the animator applies. */
  segments: StanceYawSegments;
  /** True when a score-time curve drove this frame rather than the geometry. */
  tracked: boolean;
}

/**
 * The stance a performer holds this frame.
 *
 * The chest yaw comes from the curve, so it can already be turning before the
 * props are lateral. The hand corridor is then resolved against both that yaw
 * and what the props themselves are asking for, so the corridor is open through
 * the window where the two deliberately disagree. Without a track — no sequence yet, measurements not taken,
 * a single static pose — this falls back to the memoryless plan, so no surface
 * is ever left without a stance.
 */
export function resolveTrackedUpperBodyStance(
  track: StanceYawTrack | null,
  scoreTime: number,
  planeMode: PlaneMode,
  left: GripPropState | null,
  right: GripPropState | null,
  measurements: PerformerReachMeasurements | null = null
): TrackedUpperBodyStance {
  const targets = stanceTargetsForPropStates(planeMode, left, right);
  // What the props in front of us are asking for right now. On the untracked
  // path this is the chest yaw itself; with a curve driving, it is the second
  // half of the corridor decision.
  const desireRad = planUpperBodyStanceYawTarget(targets);
  const segments = track
    ? sampleStanceYawTrack(track, scoreTime)
    : ({
        planRad: desireRad,
        spine1Rad: SPINE1_SHARE * desireRad,
        spine2Rad: SPINE2_SHARE * desireRad,
        chestRad: desireRad,
        headRad: desireRad,
        headLagRad: 0,
      } satisfies StanceYawSegments);
  return {
    ...planUpperBodyStanceDepth(
      segments.chestRad,
      targets,
      measurements,
      desireRad
    ),
    segments,
    tracked: track !== null,
  };
}

/**
 * Build the track for a live performer. `planeMode` and `measurements` are the
 * same inputs the per-frame plan uses, so the curve and the frame agree about
 * geometry and differ only in timing.
 */
export function buildStanceYawTrackForSource(
  source: StanceScoreSource | null,
  planeMode: PlaneMode
): StanceYawTrack | null {
  if (!source) return null;
  return buildStanceYawTrack({
    motionStepCount: source.motionStepCount,
    loop: source.loop,
    targetsAtScoreTime: (scoreTime) => {
      const { left, right } = source.propStatesAtScoreTime(scoreTime);
      return stanceTargetsForPropStates(planeMode, left, right);
    },
  });
}

/** Sampling density for the summary below. Fine enough to time a 0.01-step gap. */
const SUMMARY_SAMPLES_PER_STEP = 64;
/** A trace counts as moving once it passes this share of its own peak. */
const ONSET_FRACTION = 0.02;
/** A trace counts as arrived once it passes this share of its own peak. */
const ARRIVAL_FRACTION = 0.9;

export interface StanceYawTrackSummary {
  /**
   * How far ahead of the memoryless request the delivered shoulder line starts
   * moving, in motion steps. Positive is anticipation. Null when nothing turns.
   */
  onsetLeadSteps: number | null;
  /**
   * The same measurement on the lower spine, which is the first segment to move
   * and carries most of the anticipation because nothing is solved against it.
   */
  spineOnsetLeadSteps: number | null;
  peakChestRad: number;
  peakHeadLagRad: number;
  peakSpineStaggerRad: number;
  /** Score-time span of the largest turn in the score. */
  turnWindow: { start: number; end: number } | null;
  /**
   * When each segment reaches nine tenths of its own travel through that turn.
   * The hips never rotate — the animator leaves them to the feet — so they are
   * reported as null rather than as a fabricated zero.
   */
  arrivals: {
    hips: null;
    spine1: number | null;
    chest: number | null;
    spine2: number | null;
    head: number | null;
  };
}

const EMPTY_SUMMARY: StanceYawTrackSummary = {
  onsetLeadSteps: null,
  spineOnsetLeadSteps: null,
  peakChestRad: 0,
  peakHeadLagRad: 0,
  peakSpineStaggerRad: 0,
  turnWindow: null,
  arrivals: { hips: null, spine1: null, chest: null, spine2: null, head: null },
};

/**
 * The measurements that say whether the turn reads as human: does it lead the
 * props, and does the torso arrive in sequence rather than all at once.
 *
 * This lives with the curve rather than in the lab that draws it, so the
 * displayed numbers and the pose come from one owner and cannot disagree.
 */
export function describeStanceYawTrack(
  track: StanceYawTrack | null
): StanceYawTrackSummary {
  if (!track || track.stepCount <= 0) return EMPTY_SUMMARY;

  const count = track.stepCount * SUMMARY_SAMPLES_PER_STEP;
  const times: number[] = [];
  const chest: number[] = [];
  const spine1: number[] = [];
  const spine2: number[] = [];
  const head: number[] = [];
  const headLag: number[] = [];
  const desire: number[] = [];

  for (let i = 0; i <= count; i += 1) {
    const scoreTime = (i / count) * track.stepCount;
    const sample = sampleStanceYawTrackDetail(track, scoreTime);
    times.push(scoreTime);
    chest.push(sample.chestRad);
    spine1.push(sample.spine1Rad);
    spine2.push(sample.spine2Rad);
    head.push(sample.headRad);
    headLag.push(sample.headLagRad);
    desire.push(sample.desireRad);
  }

  const peakOf = (values: number[]): number =>
    values.reduce((peak, value) => Math.max(peak, Math.abs(value)), 0);

  const peakChestRad = peakOf(chest);
  if (peakChestRad < 1e-4) return EMPTY_SUMMARY;

  let peakSpineStaggerRad = 0;
  for (let i = 0; i < chest.length; i += 1) {
    const chestVal = chest[i];
    const spine1Val = spine1[i];
    if (chestVal === undefined || spine1Val === undefined) continue;
    peakSpineStaggerRad = Math.max(
      peakSpineStaggerRad,
      Math.abs(spine1Val - SPINE1_SHARE * chestVal)
    );
  }

  const firstCrossing = (values: number[], threshold: number): number | null => {
    for (let i = 0; i < values.length; i += 1) {
      const value = values[i];
      if (value === undefined) continue;
      if (Math.abs(value) >= threshold) return times[i] ?? null;
    }
    return null;
  };

  const chestOnset = firstCrossing(chest, ONSET_FRACTION * peakChestRad);
  const peakDesireRad = peakOf(desire);
  const desireOnset =
    peakDesireRad > 1e-4
      ? firstCrossing(desire, ONSET_FRACTION * peakDesireRad)
      : null;
  const onsetLeadSteps =
    chestOnset !== null && desireOnset !== null ? desireOnset - chestOnset : null;
  const spineOnset = firstCrossing(
    spine1,
    ONSET_FRACTION * SPINE1_SHARE * peakChestRad
  );
  const spineOnsetLeadSteps =
    spineOnset !== null && desireOnset !== null ? desireOnset - spineOnset : null;

  // The largest turn in the score: from where the chest leaves square, through
  // its extreme, to where it settles again.
  let peakIndex = 0;
  for (let i = 1; i < chest.length; i += 1) {
    const value = chest[i];
    const peakValue = chest[peakIndex];
    if (value === undefined || peakValue === undefined) continue;
    if (Math.abs(value) > Math.abs(peakValue)) peakIndex = i;
  }
  const floorRad = ONSET_FRACTION * peakChestRad;
  let start = peakIndex;
  while (start > 0) {
    const value = chest[start - 1];
    if (value === undefined || Math.abs(value) < floorRad) break;
    start -= 1;
  }
  let end = peakIndex;
  while (end < chest.length - 1) {
    const value = chest[end + 1];
    if (value === undefined || Math.abs(value) < floorRad) break;
    end += 1;
  }

  const arrivalIn = (values: number[]): number | null => {
    let peak = 0;
    for (let i = start; i <= peakIndex; i += 1) {
      const value = values[i];
      if (value === undefined) continue;
      peak = Math.max(peak, Math.abs(value));
    }
    if (peak < 1e-4) return null;
    const threshold = ARRIVAL_FRACTION * peak;
    for (let i = start; i <= peakIndex; i += 1) {
      const value = values[i];
      if (value === undefined) continue;
      if (Math.abs(value) >= threshold) return times[i] ?? null;
    }
    return null;
  };

  return {
    onsetLeadSteps,
    spineOnsetLeadSteps,
    peakChestRad,
    peakHeadLagRad: peakOf(headLag),
    peakSpineStaggerRad,
    turnWindow: { start: times[start]!, end: times[end]! },
    arrivals: {
      hips: null,
      spine1: arrivalIn(spine1),
      chest: arrivalIn(chest),
      spine2: arrivalIn(spine2),
      head: arrivalIn(head),
    },
  };
}
